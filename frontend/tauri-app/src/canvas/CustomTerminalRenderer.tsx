import React, { useState, useEffect, useRef, useCallback } from 'react';
import { customTerminalAPI, TerminalEvent, TerminalSpec, LineItem, Colors } from '../services/CustomTerminalAPI';
import { cn } from '../utils';

interface CustomTerminalRendererProps {
  spec: TerminalSpec;
  className?: string;
  onTerminalReady?: (terminalId: string) => void;
  onTerminalError?: (error: string) => void;
}

export const CustomTerminalRenderer: React.FC<CustomTerminalRendererProps> = ({
  spec,
  className,
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
          setCursorPosition({ line: event.cursor_line, col: event.cursor_col });
        }
        break;

      case 'newLines':
      case 'patch':
      case 'cursorMove':
      case 'scroll':
        // These are now handled by screenUpdate
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

    // Send scroll sequences to terminal
    const lines = Math.ceil(Math.abs(event.deltaY) / 50); // Adjust sensitivity
    try {
      if (event.deltaY > 0) {
        // Scroll down
        for (let i = 0; i < lines; i++) {
          await sendRawInput('\x1b[B'); // Down arrow
        }
      } else {
        // Scroll up  
        for (let i = 0; i < lines; i++) {
          await sendRawInput('\x1b[A'); // Up arrow
        }
      }
    } catch (err) {
      console.error('Error handling scroll:', err);
    }

    event.preventDefault();
  }, [terminalId, isConnected, sendRawInput]);

  const handleResize = useCallback(async () => {
    if (!terminalId || !terminalRef.current) return;

    const containerRect = terminalRef.current.getBoundingClientRect();
    
    const paddingHorizontal = 32 + 12; 
    const paddingVertical = 32 + 12; 
    const statusBarHeight = 24;
    
    const availableWidth = containerRect.width - paddingHorizontal;
    const availableHeight = containerRect.height - paddingVertical - statusBarHeight;

    const charWidth = 10; 
    const charHeight = 16; 
    
    const cols = Math.max(1, Math.floor(availableWidth / charWidth));
    const lines = Math.max(1, Math.floor(availableHeight / charHeight));

    console.log(`Terminal resize: ${cols}x${lines} (container: ${containerRect.width}x${containerRect.height}, available: ${availableWidth}x${availableHeight})`);

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
        case 'Black': return '#000000';
        case 'Red': return '#cc0000';
        case 'Green': return '#00cc00';
        case 'Yellow': return '#cccc00';
        case 'Blue': return '#0000cc';
        case 'Magenta': return '#cc00cc';
        case 'Cyan': return '#00cccc';
        case 'White': return '#cccccc';
        case 'BrightBlack': return '#555555';
        case 'BrightRed': return '#ff5555';
        case 'BrightGreen': return '#55ff55';
        case 'BrightYellow': return '#ffff55';
        case 'BrightBlue': return '#5555ff';
        case 'BrightMagenta': return '#ff55ff';
        case 'BrightCyan': return '#55ffff';
        case 'BrightWhite': return '#ffffff';
        default: return '#cccccc';
      }
    }
    
    if (color.Extended !== undefined) {
      // Handle 256-color palette
      return `#${color.Extended.toString(16).padStart(6, '0')}`;
    }
    
    return '#cccccc';
  };

  const renderLineItem = (item: LineItem, index: number) => {
    const style: React.CSSProperties = {
      color: colorToCSS(item.foreground_color) || '#cccccc',
      backgroundColor: colorToCSS(item.background_color) || 'transparent',
      fontWeight: item.is_bold ? 'bold' : 'normal',
      fontStyle: item.is_italic ? 'italic' : 'normal',
      textDecoration: item.is_underline ? 'underline' : 'none',
      width: `${item.width * 10}px`,
      maxWidth: `${item.width * 10}px`,
      minWidth: `${item.width * 10}px`
    };

    return (
      <span key={index} style={style}>
        {item.lexeme || ' '}
      </span>
    );
  };

  const renderScreenLine = (line: LineItem[], lineIndex: number, totalCols: number) => {
    const isCursorLine = lineIndex === cursorPosition.line;
    
    // Create a grid mapping for this line
    const grid: (LineItem | null)[] = new Array(totalCols).fill(null);
    
    // Fill the grid with LineItems, accounting for multi-width characters
    let currentCol = 0;
    for (const item of line) {
      if (currentCol < totalCols) {
        grid[currentCol] = item;
        // Skip additional columns for multi-width characters
        for (let i = 1; i < item.width && currentCol + i < totalCols; i++) {
          grid[currentCol + i] = 'skip' as any; // Mark as occupied by previous character
        }
        currentCol += item.width;
      }
    }
    
    return (
      <div key={lineIndex} className="font-mono text-xs leading-4" style={{ lineHeight: '16px', minHeight: '16px' }}>
        {Array.from({ length: totalCols }, (_, colIndex) => {
          const isCursorPosition = isCursorLine && colIndex === cursorPosition.col;
          const gridItem = grid[colIndex];
          
          if (gridItem === 'skip') {
            // This column is part of a multi-width character, don't render anything
            return null;
          } else if (gridItem) {
            // Render the actual character
            return (
              <span 
                key={colIndex} 
                className={isCursorPosition ? 'bg-white text-black' : ''}
                style={{
                  color: isCursorPosition ? '#000000' : (colorToCSS(gridItem.foreground_color) || '#cccccc'),
                  backgroundColor: isCursorPosition ? '#ffffff' : (colorToCSS(gridItem.background_color) || 'transparent'),
                  fontWeight: gridItem.is_bold ? 'bold' : 'normal',
                  fontStyle: gridItem.is_italic ? 'italic' : 'normal',
                  textDecoration: gridItem.is_underline ? 'underline' : 'none',
                }}
              >
                {gridItem.lexeme || ' '}
              </span>
            );
          } else {
            // Empty cell
            return (
              <span 
                key={colIndex} 
                className={isCursorPosition ? 'bg-white text-black' : ''}
              >
                {' '}
              </span>
            );
          }
        })}
      </div>
    );
  };

  if (error) {
    return (
      <div className={cn("p-4 bg-red-900/20 border border-red-500 rounded-md", className)}>
        <div className="text-red-400 font-mono text-sm">
          Terminal Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={terminalRef}
      className={cn(
        "bg-black text-white font-mono text-xs p-4 focus:outline-none relative overflow-hidden h-full max-h-full",
        className
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      onClick={() => terminalRef.current?.focus()}
    >
      <div className="mb-2 text-xs text-gray-400">
        Status: {isConnected ? 'Connected' : 'Disconnected'} 
        {terminalId && ` | ID: ${terminalId.slice(0, 8)}...`}
        {isConnected && ` | Cursor: ${cursorPosition.line},${cursorPosition.col}`}
      </div>
      
      <div className="terminal-screen border border-gray-700 rounded p-1" style={{ minHeight: '400px' }}>
        {Array.from({ length: terminalDimensions.rows }, (_, rowIndex) => {
          const line = screen[rowIndex] || []; // Use empty array if line doesn't exist
          return renderScreenLine(line, rowIndex, terminalDimensions.cols);
        })}
      </div>
    </div>
  );
};

export default CustomTerminalRenderer;
