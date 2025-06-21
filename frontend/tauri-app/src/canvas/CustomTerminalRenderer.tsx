import React, { useState, useEffect, useRef, useCallback } from 'react';
import { customTerminalAPI, TerminalEvent, TerminalSpec, LineItem, Colors } from '../services/CustomTerminalAPI';
import { cn } from '../utils';

interface CustomTerminalRendererProps {
  spec: TerminalSpec;
  onTerminalReady?: (terminalId: string) => void;
  onTerminalError?: (error: string) => void;
}

export const CustomTerminalRenderer: React.FC<CustomTerminalRendererProps> = ({
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

  // Initialize terminal connection
  useEffect(() => {
    let mounted = true;

    const connectTerminal = async () => {
      console.log("Connecting to terminal... : ", spec);

      try {
        const id = await customTerminalAPI.connectTerminal(spec);
        if (!mounted) return;

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
      if (terminalId) {
        customTerminalAPI.killTerminal(terminalId).catch(console.error);
      }
    };
  }, [spec]);

  const handleTerminalEvent = useCallback((event: TerminalEvent) => {
    switch (event.type) {
      case 'screenUpdate':
        if (event.screen && event.cursor_line !== undefined && event.cursor_col !== undefined) {
          setScreen(event.screen);

          // print size of screen
          console.log("Screen size: ", event.screen.length, event.screen[0].length);
          
          setCursorPosition({ line: event.cursor_line, col: event.cursor_col });
        }
        break;
    }
  }, []);

  const handleTerminalDisconnect = useCallback(() => {
    setIsConnected(false);
    setTerminalId(null);
  }, []);

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

    // Use Page Up/Down for better scrolling behavior
    const lines = Math.ceil(Math.abs(event.deltaY) / 120); // Adjust sensitivity
    try {
      if (event.deltaY > 0) {
        // Scroll down - send Page Down
        for (let i = 0; i < lines; i++) {
          await sendRawInput('\x1b[6~'); // Page Down
        }
      } else {
        // Scroll up - send Page Up
        for (let i = 0; i < lines; i++) {
          await sendRawInput('\x1b[5~'); // Page Up
        }
      }
    } catch (err) {
      console.error('Error handling scroll:', err);
    }

    event.preventDefault();
  }, [terminalId, isConnected, sendRawInput]);

  const handleResize = useCallback(async () => {
    if (!terminalId || !terminalInnerRef.current) return;

    const containerRect = terminalInnerRef.current.getBoundingClientRect();

    const charWidth = 8.2;
    const charHeight = 17;

    const cols = Math.max(1, Math.floor(containerRect.width / charWidth));
    const lines = Math.max(1, Math.floor(containerRect.height / charHeight));

    console.log(`Terminal resize: ${cols}x${lines} (container: ${containerRect.width}x${containerRect.height})`);

    // Update our tracked dimensions
    setTerminalDimensions({ rows: lines, cols });

    try {
      await customTerminalAPI.resizeTerminal(terminalId, lines, cols);
    } catch (err) {
      console.error('Error resizing terminal:', err);
    }
  }, [terminalId]);

  // Handle window resize
  useEffect(() => {
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  // Auto-focus the terminal and set initial size
  useEffect(() => {
    if (terminalRef.current && isConnected) {
      terminalRef.current.focus();
      // Set initial terminal size
      setTimeout(() => {
        handleResize();
      }, 500);
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
            onClick={() => sendRawInput('\x1b[5~')}
            className={cn("px-2 py-1 bg-[var(--bg-700)] hover:bg-[var(--bg-600)] rounded text-xs")}
            title="Scroll Up (Page Up)"
          >
            ↑
          </button>
          <button
            onClick={() => sendRawInput('\x1b[6~')}
            className={cn("px-2 py-1 bg-[var(--bg-700)] hover:bg-[var(--bg-600)] rounded text-xs")}
            title="Scroll Down (Page Down)"
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

      <div ref={terminalInnerRef} className={cn("terminal-screen relative border border-[var(--bg-700)] rounded bg-[var(--blackest)] overflow-hidden max-h-full h-full font-mono")}>
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
