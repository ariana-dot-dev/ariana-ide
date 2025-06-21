import React, { useState, useEffect, useRef, useCallback } from 'react';
import { customTerminalAPI, TerminalEvent, TerminalSpec, LineItem, Colors } from '../services/CustomTerminalAPI';
import { cn } from '../utils';
import FloatingTerminalInput from './FloatingTerminalInput';

interface CustomTerminalRendererProps {
  spec: TerminalSpec;
  className?: string;
  onTerminalReady?: (terminalId: string) => void;
  onTerminalError?: (error: string) => void;
}

interface TerminalLine {
  items: LineItem[];
}



export const CustomTerminalRenderer: React.FC<CustomTerminalRendererProps> = ({
  spec,
  className,
  onTerminalReady,
  onTerminalError,
}) => {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ line: 0, col: 0 }); // Start at origin
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
      case 'newLines':
        if (event.lines) {
          setLines(prevLines => {
            const newLines = [
              ...prevLines,
              ...event.lines!.map(items => ({ items }))
            ];
            
            // Update cursor position to end of last line
            const lastLine = newLines[newLines.length - 1];
            if (lastLine && lastLine.items.length > 0) {
              const lastItem = lastLine.items[lastLine.items.length - 1];
              const totalWidth = lastLine.items.reduce((sum, item) => sum + item.width, 0);
              setCursorPosition({ 
                line: newLines.length - 1, 
                col: totalWidth 
              });
            } else {
              // Empty line, cursor at start of new line
              setCursorPosition({ 
                line: newLines.length, 
                col: 0 
              });
            }
            
            return newLines;
          });
        }
        break;

      case 'patch':
        if (event.line !== undefined && event.col !== undefined && event.items) {
          setLines(prevLines => {
            const newLines = [...prevLines];
            const lineIndex = event.line!;
            
            // Ensure we have enough lines
            while (newLines.length <= lineIndex) {
              newLines.push({ items: [] });
            }
            
            // Create a new line with the patched items
            const line = newLines[lineIndex];
            const newItems = [...line.items];
            
            // Replace items starting at the specified column
            for (let i = 0; i < event.items!.length; i++) {
              newItems[event.col! + i] = event.items![i];
            }
            
            newLines[lineIndex] = { items: newItems };
            
            // Update cursor position after patch
            const totalWidth = newItems.reduce((sum, item) => sum + item.width, 0);
            setCursorPosition({ line: lineIndex, col: totalWidth });
            
            return newLines;
          });
        }
        break;

      case 'cursorMove':
        // Update cursor position for floating input
        if (event.line !== undefined && event.col !== undefined) {
          console.log('ANSI Cursor moved to:', event.line, event.col);
          setCursorPosition({ line: event.line, col: event.col });
        }
        break;

      case 'scroll':
        // Handle scroll events - for now just log them
        console.log('Scroll event:', event.direction, event.amount);
        break;
    }
  }, []);

  const handleTerminalDisconnect = useCallback(() => {
    setIsConnected(false);
    setTerminalId(null);
  }, []);



  // Prevent default key handling since we're using floating input
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    // Don't interfere with floating input
    return;
  }, []);

  const handleResize = useCallback(async () => {
    if (!terminalId || !terminalRef.current) return;

    const { width, height } = terminalRef.current.getBoundingClientRect();
    const charWidth = 8; // Approximate character width in pixels
    const charHeight = 16; // Approximate character height in pixels
    
    const cols = Math.floor(width / charWidth);
    const lines = Math.floor(height / charHeight);

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
    };

    return (
      <span key={index} style={style}>
        {item.lexeme}
      </span>
    );
  };

  const renderLine = (line: TerminalLine, lineIndex: number) => {
    // Handle line wrapping
    const maxCols = spec.cols || 80;
    const wrappedLines: LineItem[][] = [];
    let currentLine: LineItem[] = [];
    let currentWidth = 0;
    
    for (const item of line.items) {
      if (currentWidth + item.width > maxCols && currentLine.length > 0) {
        wrappedLines.push(currentLine);
        currentLine = [];
        currentWidth = 0;
      }
      currentLine.push(item);
      currentWidth += item.width;
    }
    
    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }
    
    return (
      <div key={lineIndex} className="font-mono text-xs leading-4">
        {wrappedLines.map((wrappedLine, wrapIndex) => (
          <div key={wrapIndex} className="whitespace-pre">
            {wrappedLine.map((item, itemIndex) => renderLineItem(item, itemIndex))}
          </div>
        ))}
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
        "bg-black text-white font-mono text-xs p-4 overflow-auto focus:outline-none relative",
        className
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-2 text-xs text-gray-400">
        Status: {isConnected ? 'Connected' : 'Disconnected'} 
        {terminalId && ` | ID: ${terminalId.slice(0, 8)}...`}
      </div>
      
      <div className="terminal-content">
        {lines.map((line, index) => renderLine(line, index))}
      </div>

      {/* Floating input that follows cursor */}
      <FloatingTerminalInput
        terminalId={terminalId}
        isConnected={isConnected}
        cursorPosition={cursorPosition}
      />
    </div>
  );
};

export default CustomTerminalRenderer;
