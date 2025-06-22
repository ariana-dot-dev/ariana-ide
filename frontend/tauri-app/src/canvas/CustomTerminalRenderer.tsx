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

      // Use more precise character measurements for monospace fonts
      const charWidth = 8.5;  // Slightly wider for better accuracy
      const charHeight = 17;  // Better line height

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
        // Standard ANSI colors - better terminal-appropriate colors
        case 'Default': return '#d4d4d4'; // Light gray for default text
        case 'Black': return '#0c0c0c';   // True black
        case 'Red': return '#cd3131';     // Proper red
        case 'Green': return '#0dbc79';   // Proper green  
        case 'Yellow': return '#e5e510';  // Proper yellow
        case 'Blue': return '#2472c8';    // Proper blue
        case 'Magenta': return '#bc3fbc'; // Proper magenta
        case 'Cyan': return '#11a8cd';    // Proper cyan
        case 'White': return '#e5e5e5';   // Light gray
        
        // Bright/Bold ANSI colors - more vivid versions
        case 'BrightBlack': return '#666666';   // Gray
        case 'BrightRed': return '#f14c4c';     // Bright red
        case 'BrightGreen': return '#23d18b';   // Bright green
        case 'BrightYellow': return '#f5f543';  // Bright yellow
        case 'BrightBlue': return '#3b8eea';    // Bright blue
        case 'BrightMagenta': return '#d670d6'; // Bright magenta
        case 'BrightCyan': return '#29b8db';    // Bright cyan
        case 'BrightWhite': return '#ffffff';   // Pure white
        
        default: return '#ff00ff'; // Magenta for unknown colors (debug)
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

    return '#d4d4d4'; // Default to light gray instead of arbitrary color
  };

  // Convert ANSI 256-color codes to hex - improved accuracy
  const ansi256ToHex = (colorCode: number): string => {
    if (colorCode < 16) {
      // Standard colors (0-15) - use same colors as our string mapping for consistency
      const colors = [
        '#0c0c0c',   // 0: Black
        '#cd3131',   // 1: Red
        '#0dbc79',   // 2: Green  
        '#e5e510',   // 3: Yellow
        '#2472c8',   // 4: Blue
        '#bc3fbc',   // 5: Magenta
        '#11a8cd',   // 6: Cyan
        '#e5e5e5',   // 7: White
        '#666666',   // 8: Bright Black (Gray)
        '#f14c4c',   // 9: Bright Red
        '#23d18b',   // 10: Bright Green
        '#f5f543',   // 11: Bright Yellow
        '#3b8eea',   // 12: Bright Blue
        '#d670d6',   // 13: Bright Magenta
        '#29b8db',   // 14: Bright Cyan
        '#ffffff'    // 15: Bright White
      ];
      return colors[colorCode] || '#d4d4d4';
    } else if (colorCode < 232) {
      // 216-color cube (16-231) - more accurate color cube
      const n = colorCode - 16;
      const r = Math.floor(n / 36);
      const g = Math.floor((n % 36) / 6);
      const b = n % 6;

      // More accurate ANSI color cube values
      const convert = (val: number) => {
        const values = [0, 95, 135, 175, 215, 255];
        return values[val] || 0;
      };
      
      const red = convert(r);
      const green = convert(g);
      const blue = convert(b);
      
      return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
    } else {
      // Grayscale (232-255) - improved grayscale ramp
      const level = colorCode - 232;
      const gray = 8 + level * 10;
      const clampedGray = Math.min(238, gray); // Cap at 238 for better contrast
      const hex = clampedGray.toString(16).padStart(2, '0');
      return `#${hex}${hex}${hex}`;
    }
  };

  const renderScreenLine = (line: LineItem[], lineIndex: number, totalCols: number) => {
    const lineBeforeCursor: React.ReactNode[] = [];
    const lineAfterCursor: React.ReactNode[] = [];
    
    // Helper function to check if two items have the same styling
    const haveSameStyle = (item1: LineItem, item2: LineItem) => {
      return (
        colorToCSS(item1.foreground_color) === colorToCSS(item2.foreground_color) &&
        colorToCSS(item1.background_color) === colorToCSS(item2.background_color) &&
        item1.is_bold === item2.is_bold &&
        item1.is_italic === item2.is_italic &&
        item1.is_underline === item2.is_underline
      );
    };

    // Helper function to create optimized spans for a section
    const createOptimizedSpans = (items: LineItem[], startCol: number, targetArray: React.ReactNode[], isCursorSection: boolean) => {
      let i = 0;
      let colOffset = startCol;

      while (i < items.length) {
        const currentItem = items[i];
        let combinedText = currentItem.lexeme;
        let combinedWidth = currentItem.width || 1;
        let spanStartCol = colOffset;
        
        // Look ahead to combine consecutive items with same styling
        let j = i + 1;
        while (j < items.length && haveSameStyle(currentItem, items[j])) {
          combinedText += items[j].lexeme;
          combinedWidth += items[j].width || 1;
          j++;
        }

        const spanEndCol = spanStartCol + combinedWidth;
        const hasCursor = isCursorSection && 
          lineIndex === cursorPosition.line && 
          spanStartCol <= cursorPosition.col && 
          cursorPosition.col < spanEndCol;

        if (hasCursor && combinedWidth > 1) {
          // Split the span at cursor position
          const cursorRelativePos = cursorPosition.col - spanStartCol;
          const textBeforeCursor = combinedText.slice(0, cursorRelativePos);
          const textAtCursor = combinedText.slice(cursorRelativePos, cursorRelativePos + 1);
          const textAfterCursor = combinedText.slice(cursorRelativePos + 1);

          // Span before cursor (if any)
          if (textBeforeCursor.length > 0) {
            targetArray.push(
              <div
                key={`${spanStartCol}-before`}
                className="flex"
                style={{
                  color: colorToCSS(currentItem.foreground_color),
                  backgroundColor: colorToCSS(currentItem.background_color),
                  fontWeight: currentItem.is_bold ? 'bold' : 'normal',
                  fontStyle: currentItem.is_italic ? 'italic' : 'normal',
                  textDecoration: currentItem.is_underline ? 'underline' : 'none',
                  whiteSpace: 'pre',
                  // width: `${textBeforeCursor.length * 7.45}px`,
                  overflow: 'hidden',
                  boxShadow: `inset -1px 0 0 var(--fg-800-30)`,
                }}
              >
                {textBeforeCursor.split('').map((char, index) => (
                  <div key={index} style={{ width: '7.45px' }}>{char}</div>
                ))}
              </div>
            );
          }

          // Span at cursor position
          targetArray.push(
            <div
              key={`${spanStartCol}-cursor`}
              className="flex"
              style={{
                color: colorToCSS(currentItem.foreground_color),
                backgroundColor: 'var(--whitest)',
                fontWeight: currentItem.is_bold ? 'bold' : 'normal',
                fontStyle: currentItem.is_italic ? 'italic' : 'normal',
                textDecoration: currentItem.is_underline ? 'underline' : 'none',
                whiteSpace: 'pre',
                overflow: 'hidden',
                boxShadow: 'inset -1px 0 0 var(--fg-800-30)',
              }}
            >
              {textAtCursor.split('').map((char, index) => (
                <div key={index} style={{ width: '7.45px' }}>{char}</div>
              ))}
            </div>
          );

          // Span after cursor (if any)
          if (textAfterCursor.length > 0) {
            targetArray.push(
              <div
                key={`${spanStartCol}-after`}
                className="flex"
                style={{
                  color: colorToCSS(currentItem.foreground_color),
                  backgroundColor: colorToCSS(currentItem.background_color),
                  fontWeight: currentItem.is_bold ? 'bold' : 'normal',
                  fontStyle: currentItem.is_italic ? 'italic' : 'normal',
                  textDecoration: currentItem.is_underline ? 'underline' : 'none',
                  whiteSpace: 'pre',
                  overflow: 'hidden',
                  boxShadow: `inset -1px 0 0 var(--fg-800-30)`,
                }}
              >
                {textAfterCursor.split('').map((char, index) => (
                  <div key={index} style={{ width: '7.45px' }}>{char}</div>
                ))}
              </div>
            );
          }
        } else {
          targetArray.push(
            <div
              key={spanStartCol}
              className="flex"
              style={{
                color: colorToCSS(currentItem.foreground_color),
                backgroundColor: hasCursor ? 'var(--whitest)' : colorToCSS(currentItem.background_color),
                fontWeight: currentItem.is_bold ? 'bold' : 'normal',
                fontStyle: currentItem.is_italic ? 'italic' : 'normal',
                textDecoration: currentItem.is_underline ? 'underline' : 'none',
                whiteSpace: 'pre',
                overflow: 'hidden',
                boxShadow: `inset -1px 0 0 var(--fg-800-30)`,
              }}
            >
              {combinedText.split('').map((char, index) => (
                <div key={index} style={{ width: '7.45px' }}>{char}</div>
              ))}
            </div>
          );
        }

        i = j;
        colOffset += combinedWidth;
      }
    };

    // Split line items before and after cursor
    let currentCol = 0;
    const itemsBeforeCursor: LineItem[] = [];
    const itemsAfterCursor: LineItem[] = [];

    for (const item of line) {
      if (currentCol < cursorPosition.col) {
        itemsBeforeCursor.push(item);
      } else {
        itemsAfterCursor.push(item);
      }
      currentCol += item.width || 1;
    }

    // Create optimized spans for each section
    createOptimizedSpans(itemsBeforeCursor, 0, lineBeforeCursor, false);
    createOptimizedSpans(itemsAfterCursor, itemsBeforeCursor.reduce((acc, item) => acc + (item.width || 1), 0), lineAfterCursor, true);

    // Add cursor at end of line if needed
    if (lineIndex === cursorPosition.line && currentCol <= cursorPosition.col) {
      const styleSource = line.length > 0 ? line[line.length - 1] : { foreground_color: null, is_bold: false, is_italic: false, is_underline: false };
      lineAfterCursor.push(
        <div
          key={currentCol}
          style={{
            color: colorToCSS(styleSource.foreground_color),
            backgroundColor: 'var(--whitest)',
            fontWeight: styleSource.is_bold ? 'bold' : 'normal',
            fontStyle: styleSource.is_italic ? 'italic' : 'normal',
            textDecoration: styleSource.is_underline ? 'underline' : 'none',
            whiteSpace: 'pre',
            width: '7.45px',
            boxShadow: 'inset -1px 0 0 var(--fg-800-30)',
          }}
        >
          {' '}
        </div>
      );
    }

    const isAtCursorLine = lineIndex === cursorPosition.line;
    
    // Handle empty lines or lines with no content
    if (lineBeforeCursor.length === 0 && lineAfterCursor.length === 0) {
      return (
        <div key={lineIndex} className={cn("font-mono text-xs leading-4 whitespace-nowrap min-h-4 flex")}
          style={{ 
            width: `fit`,
            height: '16px',
            boxShadow: `inset 0 -0.5px 0 var(--fg-800-30)`,
          }}>
          {isAtCursorLine && (
            <div
              style={{
                backgroundColor: 'var(--whitest)',
                width: '7.45px',
                height: '16px',
                boxShadow: 'inset -1px 0 0 var(--fg-800-30)',
              }}
            >
              {' '}
            </div>
          )}
        </div>
      );
    }
    
    return (
      <div key={lineIndex} className={cn("font-mono text-xs leading-4 whitespace-nowrap min-h-4 flex")}
        style={{ 
          width: `fit`,
          height: '16px',
          boxShadow: `inset 0 -0.5px 0 var(--fg-800-30)`,
        }}>
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

      <div ref={terminalInnerRef} className={cn("terminal-screen relative rounded bg-[var(--blackest)] overflow-hidden max-h-full h-full font-mono cursor-text select-text")}>
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
