import React, { useState, useRef, useEffect, useCallback } from 'react';
import { customTerminalAPI } from '../services/CustomTerminalAPI';
import { cn } from '../utils';

interface FloatingTerminalInputProps {
  terminalId: string | null;
  isConnected: boolean;
  cursorPosition: { line: number; col: number };
  onInputFocus?: () => void;
  onInputBlur?: () => void;
}

type InputMode = 'shell' | 'interactive';

export const FloatingTerminalInput: React.FC<FloatingTerminalInputProps> = ({
  terminalId,
  isConnected,
  cursorPosition,
  onInputFocus,
  onInputBlur,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isVisible, setIsVisible] = useState(true); // Always visible for now
  const [inputMode, setInputMode] = useState<InputMode>('shell');
  const [fakeCursorOffset, setFakeCursorOffset] = useState(0); // Offset from real cursor due to typing
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate input position based on cursor + fake offset (relative to terminal container)
  const getInputPosition = useCallback(() => {
    const charWidth = 7; // Approximate character width in pixels
    const lineHeight = 16; // Approximate line height in pixels
    
    // In shell mode, show cursor at real position + typed characters
    const effectiveCol = inputMode === 'shell' ? 
      cursorPosition.col + fakeCursorOffset : 
      cursorPosition.col;
    
    const left = effectiveCol * charWidth;
    const top = cursorPosition.line * lineHeight;

    return {
      left: Math.max(0, left),
      top: Math.max(0, top)
    };
  }, [cursorPosition, fakeCursorOffset, inputMode]);

  const position = getInputPosition();
  
  console.log('FloatingTerminalInput - cursorPosition:', cursorPosition, 'position:', position, 'isConnected:', isConnected, 'mode:', inputMode);

  // TODO: Add automatic interactive mode detection based on terminal output

  // Reset to shell mode when we see a new prompt
  useEffect(() => {
    // Simple heuristic: if cursor is at column 0 or we see $ prompt, probably back to shell
    if (cursorPosition.col === 0) {
      setInputMode('shell');
      setFakeCursorOffset(0);
      setInputValue('');
    }
  }, [cursorPosition]);

  const handleKeyDown = useCallback(async (event: React.KeyboardEvent) => {
    if (!terminalId || !isConnected) return;

    try {
      // Interactive mode: send keystrokes immediately
      if (inputMode === 'interactive') {
        let inputToSend = '';
        
        if (event.ctrlKey) {
          if (event.key === 'c') {
            await customTerminalAPI.sendCtrlC(terminalId);
            return;
          }
          if (event.key === 'd') {
            await customTerminalAPI.sendCtrlD(terminalId);
            return;
          }
        }

        if (event.key === 'Enter') {
          inputToSend = '\r';
        } else if (event.key === 'Backspace') {
          inputToSend = '\b';
        } else if (event.key === 'Tab') {
          inputToSend = '\t';
        } else if (event.key === 'Escape') {
          inputToSend = '\x1b';
        } else if (event.key === 'ArrowUp') {
          inputToSend = '\x1b[A';
        } else if (event.key === 'ArrowDown') {
          inputToSend = '\x1b[B';
        } else if (event.key === 'ArrowLeft') {
          inputToSend = '\x1b[D';
        } else if (event.key === 'ArrowRight') {
          inputToSend = '\x1b[C';
        } else if (event.key.length === 1) {
          inputToSend = event.key;
        }

        if (inputToSend) {
          await customTerminalAPI.sendInputLines(terminalId, [inputToSend]);
        }
        event.preventDefault();
        return;
      }

      // Shell mode: collect input until Enter
      let shouldPreventDefault = true;

      if (event.ctrlKey) {
        if (event.key === 'c') {
          await customTerminalAPI.sendCtrlC(terminalId);
          setInputValue('');
          setFakeCursorOffset(0);
          return;
        }
        if (event.key === 'd') {
          await customTerminalAPI.sendCtrlD(terminalId);
          setInputValue('');
          setFakeCursorOffset(0);
          return;
        }
        if (event.key === 'v') {
          // Allow paste
          shouldPreventDefault = false;
          return;
        }
      }

      if (event.key === 'Enter') {
        // Send complete command
        if (inputValue.trim()) {
          await customTerminalAPI.sendInputLines(terminalId, [inputValue + '\r']);
        } else {
          await customTerminalAPI.sendInputLines(terminalId, ['\r']);
        }
        setInputValue('');
        setFakeCursorOffset(0);
      } else if (event.key === 'Escape') {
        // Cancel input
        setInputValue('');
        setFakeCursorOffset(0);
      } else if (event.key === 'Tab') {
        // Send tab completion
        await customTerminalAPI.sendInputLines(terminalId, [inputValue + '\t']);
        setInputValue('');
        setFakeCursorOffset(0);
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        // Send history navigation
        const arrow = event.key === 'ArrowUp' ? '\x1b[A' : '\x1b[B';
        await customTerminalAPI.sendInputLines(terminalId, [arrow]);
      } else if (event.key === 'Backspace') {
        if (inputValue.length === 0) {
          // Send backspace to terminal if input is empty
          await customTerminalAPI.sendInputLines(terminalId, ['\b']);
        } else {
          // Handle backspace in local input
          shouldPreventDefault = false;
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        // Allow normal text editing
        shouldPreventDefault = false;
      } else if (event.key.length === 1) {
        // Regular character - allow input editing
        shouldPreventDefault = false;
      }

      if (shouldPreventDefault) {
        event.preventDefault();
      }
    } catch (err) {
      console.error('Error handling key event:', err);
    }
  }, [terminalId, isConnected, inputValue, inputMode]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    
    // Update fake cursor offset in shell mode
    if (inputMode === 'shell') {
      setFakeCursorOffset(newValue.length);
    }
    
    // Auto-show input when typing
    if (newValue.length > 0 && !isVisible) {
      setIsVisible(true);
    }
  }, [isVisible, inputMode]);

  const handleFocus = useCallback(() => {
    setIsVisible(true);
    onInputFocus?.();
  }, [onInputFocus]);

  const handleBlur = useCallback(() => {
    // Only hide if input is empty
    if (inputValue.length === 0) {
      setIsVisible(false);
    }
    onInputBlur?.();
  }, [inputValue, onInputBlur]);

  // Auto-focus input when terminal is ready and keep it focused
  useEffect(() => {
    if (isConnected && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isConnected]);

  // Keep focus on the input
  useEffect(() => {
    const interval = setInterval(() => {
      if (inputRef.current && document.activeElement !== inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Handle paste
  const handlePaste = useCallback(async (event: React.ClipboardEvent) => {
    if (!terminalId || !isConnected) return;

    event.preventDefault();
    const pastedText = event.clipboardData.getData('text');
    
    try {
      // Send pasted text directly to terminal
      await customTerminalAPI.sendInputLines(terminalId, [pastedText]);
    } catch (err) {
      console.error('Error pasting:', err);
    }
  }, [terminalId, isConnected]);

  if (!isConnected) {
    return null;
  }

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: position.left,
        top: position.top,
        zIndex: 1000,
      }}
    >
      {/* Visual cursor indicator */}
      <div 
        className={cn(
          "absolute w-2 h-4 opacity-75 animate-pulse",
          inputMode === 'interactive' ? "bg-red-400" : "bg-white",
          isVisible && inputValue.length > 0 && inputMode === 'shell' ? "hidden" : "block"
        )}
        style={{ left: 0, top: 0 }}
        title={inputMode === 'interactive' ? 'Interactive Mode' : 'Shell Mode'}
      />

      {/* Inline input area - positioned at cursor */}
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onPaste={handlePaste}
        className={cn(
          "pointer-events-auto border-none outline-none bg-transparent",
          "text-white font-mono text-xs",
          inputMode === 'shell' ? "block" : "hidden"
        )}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: Math.max(10, inputValue.length * 7 + 10),
          height: 16,
          zIndex: 1001,
        }}
        placeholder=""
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      {/* Mode indicator - small and unobtrusive */}
      <div 
        className={cn(
          "absolute text-xs px-1 rounded",
          inputMode === 'interactive' ? "bg-red-500 text-white" : "bg-blue-500 text-white"
        )}
        style={{ left: -15, top: -15, fontSize: '8px' }}
      >
        {inputMode === 'interactive' ? 'L' : 'E'}
      </div>
    </div>
  );
};

export default FloatingTerminalInput;
