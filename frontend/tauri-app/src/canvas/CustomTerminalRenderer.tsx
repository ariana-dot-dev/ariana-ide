import React, { useState, useEffect, useRef, useCallback } from 'react';
import { customTerminalAPI, TerminalEvent, TerminalSpec, LineItem, Colors } from '../services/CustomTerminalAPI';
import { cn } from '../utils';

interface CustomTerminalRendererProps {
  elementId: string;
  spec: TerminalSpec;
  onTerminalReady?: (terminalId: string) => void;
  onTerminalError?: (error: string) => void;
}

// Simple connection manager to reuse connections
class TerminalConnectionManager {
  private static connections = new Map<string, string>(); // elementId -> terminalId
  
  static getConnection(elementId: string): string | undefined {
    return this.connections.get(elementId);
  }
  
  static setConnection(elementId: string, terminalId: string): void {
    this.connections.set(elementId, terminalId);
  }
  
  static removeConnection(elementId: string): void {
    this.connections.delete(elementId);
  }
  
  static hasConnection(elementId: string): boolean {
    return this.connections.has(elementId);
  }
}

export const CustomTerminalRenderer: React.FC<CustomTerminalRendererProps> = ({
  elementId,
  spec,
  onTerminalReady,
  onTerminalError,
}) => {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [screen, setScreen] = useState<LineItem[][]>([]);
  const [cursorPosition, setCursorPosition] = useState({ line: 0, col: 0 });
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [terminalDimensions, setTerminalDimensions] = useState({ rows: 24, cols: 80 });
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInnerRef = useRef<HTMLDivElement>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isResizingRef = useRef<boolean>(false);

  // Initialize terminal connection
  useEffect(() => {
    let mounted = true;

    const connectTerminal = async () => {
      // Check if we already have a connection for this element
      const existingTerminalId = TerminalConnectionManager.getConnection(elementId);
      
      if (existingTerminalId && !terminalId) {
        console.log(`Reusing existing terminal connection ${existingTerminalId} for element ${elementId}`);
        setTerminalId(existingTerminalId);
        setIsConnected(true);
        setError(null);

        // Set up event listeners for existing connection
        await customTerminalAPI.onTerminalEvent(existingTerminalId, handleTerminalEvent);
        await customTerminalAPI.onTerminalDisconnect(existingTerminalId, handleTerminalDisconnect);

        onTerminalReady?.(existingTerminalId);
        return;
      }

      // Don't create new connection if we already have one
      if (terminalId && isConnected) {
        console.log("Terminal already connected, skipping reconnection");
        return;
      }

      console.log(`Creating new terminal connection for element ${elementId}:`, spec);

      try {
        const id = await customTerminalAPI.connectTerminal(spec);
        if (!mounted) return;

        // Store the connection mapping
        TerminalConnectionManager.setConnection(elementId, id);
        
        setTerminalId(id);
        setIsConnected(true);
        setError(null);

        // Set up event listeners
        await customTerminalAPI.onTerminalEvent(id, handleTerminalEvent);
        await customTerminalAPI.onTerminalDisconnect(id, handleTerminalDisconnect);

        onTerminalReady?.(id);
      } catch (err) {
        if (!mounted) return;
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        onTerminalError?.(errorMessage);
      }
    };

    connectTerminal();

    return () => {
      mounted = false;
      // Don't kill terminals on unmount - keep connections alive for reuse
    };
  }, [elementId]);

  // Cleanup on unmount (when component is actually destroyed)
  useEffect(() => {
    return () => {
      // This runs when the component is actually unmounted
      // We keep the terminal connection alive for potential reuse
      console.log(`CustomTerminalRenderer unmounting for element ${elementId}`);
    };
  }, []);

  const handleTerminalEvent = useCallback((event: TerminalEvent) => {
    switch (event.type) {
      case 'screenUpdate':
        if (event.screen && event.cursor_line !== undefined && event.cursor_col !== undefined) {
          setScreen(event.screen);
          setCursorPosition({ line: event.cursor_line, col: event.cursor_col });
        }
        break;
    }
  }, []);

  const handleTerminalDisconnect = useCallback(() => {
    console.log(`Terminal disconnected for element ${elementId}`);
    TerminalConnectionManager.removeConnection(elementId);
    setIsConnected(false);
    setTerminalId(null);
  }, [elementId]);

  // Send raw input directly
  const sendRawInput = useCallback(async (input: string) => {
    if (!terminalId || !isConnected) return;

    try {
      console.log('Sending raw input:', JSON.stringify(input));
      await customTerminalAPI.sendRawInput(terminalId, input);
    } catch (err) {
      console.error('Error sending input:', err);
    }
  }, [terminalId, isConnected]);

  // Handle keyboard input - send each character immediately
  const handleKeyDown = useCallback(async (event: React.KeyboardEvent) => {
    if (!terminalId || !isConnected) return;

    try {
      if (event.ctrlKey) {
        if (event.key === 'c') {
          await customTerminalAPI.sendCtrlC(terminalId);
          event.preventDefault();
          return;
        }
        if (event.key === 'd') {
          await customTerminalAPI.sendCtrlD(terminalId);
          event.preventDefault();
          return;
        }
      }

      if (event.key === 'Enter') {
        await sendRawInput('\r');
        event.preventDefault();
        return;
      } else if (event.key === 'Backspace') {
        await sendRawInput('\b');
        event.preventDefault();
        return;
      } else if (event.key === 'Tab') {
        await sendRawInput('\t');
        event.preventDefault();
        return;
      } else if (event.key === 'Escape') {
        await sendRawInput('\x1b');
        event.preventDefault();
        return;
      } else if (event.key === 'ArrowUp') {
        await sendRawInput('\x1b[A');
        event.preventDefault();
        return;
      } else if (event.key === 'ArrowDown') {
        await sendRawInput('\x1b[B');
        event.preventDefault();
        return;
      } else if (event.key === 'ArrowLeft') {
        await sendRawInput('\x1b[D');
        event.preventDefault();
        return;
      } else if (event.key === 'ArrowRight') {
        await sendRawInput('\x1b[C');
        event.preventDefault();
        return;
      } else if (event.key === 'PageUp') {
        await sendRawInput('\x1b[5~');
        event.preventDefault();
        return;
      } else if (event.key === 'PageDown') {
        await sendRawInput('\x1b[6~');
        event.preventDefault();
        return;
      } else if (event.key === 'Home') {
        await sendRawInput('\x1b[H');
        event.preventDefault();
        return;
      } else if (event.key === 'End') {
        await sendRawInput('\x1b[F');
        event.preventDefault();
        return;
      } else if (event.key === 'Insert') {
        await sendRawInput('\x1b[2~');
        event.preventDefault();
        return;
      } else if (event.key === 'Delete') {
        await sendRawInput('\x1b[3~');
        event.preventDefault();
        return;
      } else if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // Send regular characters immediately
        await sendRawInput(event.key);
        event.preventDefault();
        return;
      }
    } catch (err) {
      console.error('Error handling key event:', err);
    }
  }, [terminalId, isConnected, sendRawInput]);

  // Handle wheel events for scrolling
  const handleWheel = useCallback(async (event: React.WheelEvent) => {
    if (!terminalId || !isConnected) return;

    // Use proper scroll API methods
    const lines = Math.ceil(Math.abs(event.deltaY) / 120); // Adjust sensitivity
    try {
      if (event.deltaY > 0) {
        // Scroll down
        for (let i = 0; i < lines; i++) {
          await customTerminalAPI.sendScrollDown(terminalId);
        }
      } else {
        // Scroll up
        for (let i = 0; i < lines; i++) {
          await customTerminalAPI.sendScrollUp(terminalId);
        }
      }
    } catch (err) {
      console.error('Error handling scroll:', err);
    }

    event.preventDefault();
  }, [terminalId, isConnected]);

  const debouncedResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(async () => {
      if (!terminalId || !terminalInnerRef.current || !isConnected) return;
      
      // Prevent concurrent resizes
      if (isResizingRef.current) {
        console.log('Resize skipped: already resizing');
        return;
      }

      const containerRect = terminalInnerRef.current.getBoundingClientRect();

      // Don't resize if container doesn't have proper dimensions yet
      if (containerRect.width < 100 || containerRect.height < 80) {
        console.log('Terminal resize skipped: container too small', containerRect);
        return;
      }

      const charWidth = 8.2;
      const charHeight = 17;

      const cols = Math.max(20, Math.floor(containerRect.width / charWidth));
      const lines = Math.max(5, Math.floor(containerRect.height / charHeight));

      // Only resize if dimensions actually changed
      if (terminalDimensions.cols === cols && terminalDimensions.rows === lines) {
        return;
      }

      console.log(`Terminal resize: ${cols}x${lines} (container: ${containerRect.width}x${containerRect.height})`);

      isResizingRef.current = true;
      try {
        await customTerminalAPI.resizeTerminal(terminalId, lines, cols);
        // Update our tracked dimensions only after successful resize
        setTerminalDimensions({ rows: lines, cols });
        console.log(`Terminal resize successful: ${cols}x${lines}`);
      } catch (err) {
        console.error('Error resizing terminal:', err);
        // Don't update dimensions on error
      } finally {
        isResizingRef.current = false;
      }
    }, 150); // 150ms debounce
  }, [terminalId, terminalDimensions.cols, terminalDimensions.rows, isConnected]);

  const handleResize = debouncedResize;

  // Handle container and window resize
  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    
    // Watch for container size changes
    if (terminalInnerRef.current) {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(terminalInnerRef.current);
    }
    
    // Also listen for window resize
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize, isConnected]);

  // Auto-focus the terminal and set initial size
  useEffect(() => {
    if (terminalRef.current && isConnected) {
      terminalRef.current.focus();
      // Set initial terminal size with multiple attempts
      const scheduleResize = () => {
        handleResize();
        // Additional resize after a bit more time in case layout is still settling
        setTimeout(handleResize, 200);
      };
      
      // Immediate resize attempt
      scheduleResize();
      // Fallback resize after layout should be settled
      setTimeout(scheduleResize, 500);
    }
  }, [isConnected, handleResize]);

  const colorToCSS = (color?: any): string => {
    if (!color) return '';

    if (typeof color === 'string') {
      switch (color) {
        case 'Default': return 'var(--fg-500)';
        case 'Black': return 'var(--fg-800)';
        case 'Red': return 'var(--negative-500)';
        case 'Green': return 'var(--positive-500)';
        case 'Yellow': return 'var(--fg-600)';
        case 'Blue': return 'var(--fg-600)';
        case 'Magenta': return 'var(--fg-600)';
        case 'Cyan': return 'var(--fg-600)';
        case 'White': return 'var(--fg-300)';
        case 'BrightBlack': return 'var(--fg-400)';
        case 'BrightRed': return 'var(--fg-400)';
        case 'BrightGreen': return 'var(--fg-400)';
        case 'BrightYellow': return 'var(--fg-400)';
        case 'BrightBlue': return 'var(--fg-400)';
        case 'BrightMagenta': return 'var(--fg-400)';
        case 'BrightCyan': return 'var(--fg-400)';
        case 'BrightWhite': return 'var(--fg-400)';
        default: return '#ff00ff';
      }
    }

    if (color.Extended !== undefined) {
      // Handle 256-color palette properly
      return ansi256ToHex(color.Extended);
    }

    if (color.Rgb !== undefined) {
      // Handle RGB colors
      const [r, g, b] = color.Rgb;
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    return '#cccccc';
  };

  // Convert ANSI 256-color codes to hex
  const ansi256ToHex = (colorCode: number): string => {
    if (colorCode < 16) {
      // Standard colors (0-15)
      const colors = [
        '#000000', '#800000', '#008000', '#808000',
        '#000080', '#800080', '#008080', '#c0c0c0',
        '#808080', '#ff0000', '#00ff00', '#ffff00',
        '#0000ff', '#ff00ff', '#00ffff', '#ffffff'
      ];
      return colors[colorCode] || '#cccccc';
    } else if (colorCode < 232) {
      // 216-color cube (16-231)
      const n = colorCode - 16;
      const r = Math.floor(n / 36);
      const g = Math.floor((n % 36) / 6);
      const b = n % 6;

      const convert = (val: number) => val === 0 ? 0 : 55 + val * 40;
      return `#${convert(r).toString(16).padStart(2, '0')}${convert(g).toString(16).padStart(2, '0')}${convert(b).toString(16).padStart(2, '0')}`;
    } else {
      // Grayscale (232-255)
      const gray = 8 + (colorCode - 232) * 10;
      const hex = gray.toString(16).padStart(2, '0');
      return `#${hex}${hex}${hex}`;
    }
  };

  const renderScreenLine = (line: LineItem[], lineIndex: number, totalCols: number) => {
    let lineBeforeCursor: React.ReactNode[] = []
    let lineAfterCursor: React.ReactNode[] = []
    let currentCol = 0
    line.forEach((item, index, array) => {
      if (currentCol < cursorPosition.col) {
        lineBeforeCursor.push((
          <span key={currentCol} className={cn('border-r border-[var(--fg-300)]/20')} style={{
            color: colorToCSS(item.foreground_color),
            backgroundColor: colorToCSS(item.background_color),
            fontWeight: item.is_bold ? 'bold' : 'normal',
            fontStyle: item.is_italic ? 'italic' : 'normal',
            textDecoration: item.is_underline ? 'underline' : 'none',
            whiteSpace: 'pre',
          }}>{item.lexeme}</span>
        ))
      } else {
        lineAfterCursor.push((
          <span key={currentCol} className={cn('border-r border-[var(--fg-300)]/20')} style={{
            color: colorToCSS(item.foreground_color),
            backgroundColor: currentCol == cursorPosition.col && lineIndex == cursorPosition.line ? 'var(--whitest)' : colorToCSS(item.background_color),
            fontWeight: item.is_bold ? 'bold' : 'normal',
            fontStyle: item.is_italic ? 'italic' : 'normal',
            textDecoration: item.is_underline ? 'underline' : 'none',
            whiteSpace: 'pre',
          }}>{item.lexeme}</span>
        ))
      }
      let isLast = array.length - 1 == index;
      if (isLast && lineIndex == cursorPosition.line && currentCol < cursorPosition.col) {
        lineAfterCursor.push((
          <span key={currentCol} className={cn('border-r border-[var(--fg-300)]/20')} style={{
            color: colorToCSS(item.foreground_color),
            backgroundColor: 'var(--whitest)',
            fontWeight: item.is_bold ? 'bold' : 'normal',
            fontStyle: item.is_italic ? 'italic' : 'normal',
            textDecoration: item.is_underline ? 'underline' : 'none',
            whiteSpace: 'pre',
          }}> </span>
        ))
      }

      currentCol += item.width || 1;
    })

    return (
      <div key={lineIndex} className={cn("font-mono text-xs leading-4 whitespace-nowrap border-b border-[var(--fg-400)]/20 min-h-4")}
        style={{ width: `${totalCols * 8}px` }}>
        {lineBeforeCursor}
        {lineAfterCursor}
      </div>
    );
  };

  if (error) {
    return (
      <div className={cn("p-4 bg-[var(--bg-900)]/20 border border-[var(--bg-500)] rounded-md")}>
        <div className={cn("text-[var(--bg-400)] font-mono text-sm")}>
          Terminal Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={terminalRef}
      className={cn(
        "bg-[var(--bg-900)] rounded-lg text-[var(--fg-50)] font-mono text-xs p-4 focus:outline-none relative overflow-hidden h-full max-h-full flex flex-col"
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onClick={() => terminalRef.current?.focus()}
    >
      <div className={cn("mb-2 text-xs text-[var(--fg-400)] flex justify-between items-center")}>
        <div>
          Status: {isConnected ? 'Connected' : 'Disconnected'}
          {terminalId && ` | ID: ${terminalId.slice(0, 8)}...`}
          {isConnected && ` | Cursor: ${cursorPosition.line},${cursorPosition.col}`}
          {` | Size: ${terminalDimensions.cols}x${terminalDimensions.rows}`}
        </div>

        <div className={cn("flex gap-1")}>
          <button
            onClick={() => customTerminalAPI.sendScrollUp(terminalId!)}
            className={cn("px-2 py-1 bg-[var(--bg-700)] hover:bg-[var(--bg-600)] rounded text-xs")}
            title="Scroll Up"
          >
            ↑
          </button>
          <button
            onClick={() => customTerminalAPI.sendScrollDown(terminalId!)}
            className={cn("px-2 py-1 bg-[var(--bg-700)] hover:bg-[var(--bg-600)] rounded text-xs")}
            title="Scroll Down"
          >
            ↓
          </button>
          <button
            onClick={() => sendRawInput('\x0C')}
            className={cn("px-2 py-1 bg-[var(--bg-700)] hover:bg-[var(--bg-600)] rounded text-xs")}
            title="Clear Screen (Ctrl+L)"
          >
            Clear
          </button>
        </div>
      </div>

      <div ref={terminalInnerRef} className={cn("terminal-screen relative rounded bg-[var(--blackest)] overflow-hidden max-h-full h-full font-mono")}>
        <div className={cn("absolute top-0 left-0 w-full h-fit p-2")}>
          {Array.from({ length: terminalDimensions.rows }, (_, rowIndex) => {
            const line = screen[rowIndex] || []; // Use empty array if line doesn't exist
            return renderScreenLine(line, rowIndex, terminalDimensions.cols);
          })}
        </div>
      </div>
    </div>
  );
};

export default CustomTerminalRenderer;
