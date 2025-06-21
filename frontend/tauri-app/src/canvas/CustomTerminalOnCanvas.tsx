import React, { useState, useEffect, useRef } from 'react';
import { resolveColor } from '../utils/colors';
import { motion, PanInfo } from 'framer-motion';
import { Terminal as XTerm } from '@xterm/xterm';
import type { IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { CanvasElement, ElementLayout } from './types';
import { Terminal, TerminalConfig } from './Terminal';
import { cn } from '../utils';
import { TerminalService } from '../services/TerminalService';

interface TerminalOnCanvasProps {
  layout: ElementLayout;
  onDragStart: (element: CanvasElement) => void;
  onDragEnd: (element: CanvasElement) => void;
  onDrag: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
  onTerminalUpdate: (element: Terminal, newConfig: TerminalConfig) => void;
  isDragTarget: boolean;
  isDragging: boolean;
}

const TerminalOnCanvas: React.FC<TerminalOnCanvasProps> = ({
  layout,
  onDragStart: propOnDragStart,
  onDragEnd: propOnDragEnd,
  onDrag: propOnDrag,
  onTerminalUpdate,
  isDragTarget,
  isDragging
}) => {
  const { cell, element } = layout;
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const dataDisposableRef = useRef<IDisposable | null>(null);
  const clipboardHandlerRef = useRef<IDisposable | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  if (!("terminal" in element.kind)) {
    throw new Error("Invalid kind");
  }

  const terminal = element.kind.terminal;

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;
    
    // Prevent multiple terminals for the same ID
    const existingTerminal = document.querySelector(`[data-terminal-id="${element.id}"]`);
    if (existingTerminal && existingTerminal !== terminalRef.current) {
      console.warn(`Terminal ${element.id} already exists, skipping duplicate`);
      return;
    }

    // Resolve CSS variables -> solid colors for xterm (it cannot understand CSS vars)
    const cssVars = getComputedStyle(document.documentElement);
    const theme = {
      background: resolveColor('--bg-500', cssVars),
      foreground: resolveColor('--fg-500', cssVars),
      cursor: resolveColor('--fg-900', cssVars),
      selectionBackground: resolveColor('--fg-900', cssVars),
      selectionForeground: resolveColor('--fg-200', cssVars),
      black: resolveColor('--blackest', cssVars),
      red: resolveColor('--negative-500', cssVars),
      green: resolveColor('--positive-500', cssVars),
      yellow: resolveColor('--fg-600', cssVars),
      blue: resolveColor('--fg-600', cssVars),
      magenta: resolveColor('--fg-600', cssVars),
      cyan: resolveColor('--fg-600', cssVars),
      white: resolveColor('--whitest', cssVars),
      brightBlack: resolveColor('--fg-800', cssVars),
      brightRed: resolveColor('--negative-500', cssVars),
      brightGreen: resolveColor('--positive-500', cssVars),
      brightYellow: resolveColor('--fg-200', cssVars),
      brightBlue: resolveColor('--fg-200', cssVars),
      brightMagenta: resolveColor('--fg-200', cssVars),
      brightCyan: resolveColor('--fg-200', cssVars),
      brightWhite: resolveColor('--fg-100', cssVars),
    } as const;

    const xterm = new XTerm({
      theme,
      fontSize: terminal.config.fontSize || 14,
      fontFamily: terminal.config.fontFamily ? `"${terminal.config.fontFamily}"` : 'Monaco, Menlo, "Ubuntu Mono", monospace',
      cursorBlink: true,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(searchAddon);

    xterm.open(terminalRef.current);

    // Clipboard integration using xterm's custom key handler
    const clipboardHandler = xterm.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      if (!ev.ctrlKey || ev.altKey || ev.metaKey) {
        return true; // let xterm handle
      }
      const key = ev.key.toLowerCase();
      if (key === 'c') {
        const sel = xterm.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
        }
        // don't cancel; allow normal copy as well but avoid ^C char
        return false;
      }
      if (key === 'v') {
        ev.preventDefault();
        navigator.clipboard.readText().then(text => {
          if (text) {
            xterm.paste(text);
          }
        });
        return false;
      }
      return true;
    });
    
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Connect to terminal service
    const connectTerminal = async () => {
      if (!xtermRef.current) return;

      // Reuse existing backend connection if still alive, otherwise create a new one
      let connectionId = terminal.connectionId;
      try {
        if (!terminal.isConnected || !connectionId) {
          connectionId = await TerminalService.createConnection(terminal.config, element.id);
          terminal.setConnection(connectionId, true);
        }

        setIsConnected(true);

        // Ensure we do not attach duplicate data handler if component remounts quickly
        dataDisposableRef.current?.dispose();
        const dataDisposable = xtermRef.current.onData(data => {
          if (terminal.isConnected) {
            if (connectionId) {
              TerminalService.sendData(connectionId, data);
            }
          }
        });
        dataDisposableRef.current = dataDisposable;

        // Keep backend size in sync when xterm itself resizes (e.g., font change)
        xtermRef.current.onResize(({ cols, rows }) => {
          if (terminal.isConnected && terminal.connectionId) {
            console.log('Resizing terminal:', cols, rows);
            TerminalService.resizeTerminal(terminal.connectionId, cols, rows);
          }
        });

        // Listen for data from backend
        const handleData = (data: string) => {
          console.log('Received data from backend:', JSON.stringify(data));
          xtermRef.current?.write(data);
        };

        const handleDisconnect = () => {
          terminal.setConnection('', false);
          setIsConnected(false);
          xtermRef.current?.write('\r\n\x1b[31mConnection lost\x1b[0m\r\n');
          dataDisposableRef.current?.dispose(); // Clean up the data handler
          
          // Cleanup dead connections when this one disconnects
          setTimeout(() => {
            TerminalService.cleanupDeadConnections();
          }, 1000);
        };

        // Re-register backend listeners (safe even if they already exist)
        TerminalService.onData(connectionId, handleData);
        TerminalService.onDisconnect(connectionId, handleDisconnect);

        // Show connection info
        xtermRef.current.write(`\x1b[32mConnected to ${terminal.getConnectionString()}\x1b[0m\r\n`);

      } catch (error) {
        console.error('Failed to set up terminal:', error);
        xtermRef.current?.write(`\x1b[31mTerminal error: ${error}\x1b[0m\r\n`);
      }
    };

    connectTerminal();

    return () => {
      // Dispose xterm instance
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      // Dispose data listener if still active
      dataDisposableRef.current?.dispose();
      dataDisposableRef.current = null;

      // We intentionally keep the PTY alive to avoid connection loss on drag swaps
    };
  }, []);

  // Fit terminal when size changes
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        // Inform backend of new size
        if (terminal.isConnected && terminal.connectionId && xtermRef.current) {
          TerminalService.resizeTerminal(terminal.connectionId, xtermRef.current.cols, xtermRef.current.rows);
        }
      }, 500);
    }
  }, [cell.width, cell.height]);



  const handleDragStartInternal = () => {
    propOnDragStart(element);
  };

  const handleDragEndInternal = () => {
    propOnDragEnd(element);
  };

  return (
    <motion.div
      className={cn(
        "absolute p-1 cursor-move select-none overflow-hidden",
        isDragging ? "z-30" : "z-10"
      )}
      initial={{
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      }}
      animate={!dragging ? {
        x: cell.x,
        y: cell.y,
        width: cell.width,
        height: cell.height,
      } : undefined}
      transition={{
        type: "tween",
        duration: 0.2,
      }}
      layout
      // drag
      // dragMomentum={false}
      // onMouseDown={() => {
      //   if (!dragging) {
      //     setDragging(true);
      //   }
      // }}
      // onDragStart={() => {
      //   setDragging(true);
      //   handleDragStartInternal();
      // }}
      // onDragEnd={() => {
      //   setDragging(false);
      //   handleDragEndInternal();
      // }}
      // onDrag={(event, info) => {
      //   if (typeof propOnDrag === 'function') {
      //     propOnDrag(event, info);
      //   }
      // }}
      // onMouseEnter={() => setIsHovered(true)}
      // onMouseLeave={() => {
      //   setIsHovered(false);
      // }}
    >
      <div 
        className={cn(
          "w-full h-full rounded-md bg-gradient-to-b from-bg-[var(--fg-900)]/30 to-bg-[var(--bg-600)]/30 backdrop-blur-md relative p-4 pt-2.5"
        )}
      >
        {/* Connection status indicator */}
        {/* <div className="absolute top-2 right-2 z-10">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-[var(--positive-400)]" : "bg-[var(--negative-400)]"
          )} />
        </div> */}

        {/* Terminal type badge */}
        {/* <div className="absolute top-2 left-2 z-10">
          <span className={cn(
            "text-xs px-2 py-1 bg-[var(--blackest)] bg-opacity-50 text-[var(--whitest)] rounded"
          )}>
            {terminal.getTerminalType().toUpperCase()}
          </span>
        </div> */}

        {/* Terminal container */}
        <div 
          ref={terminalRef}
          data-terminal-id={element.id}
          className={cn("w-full h-full pointer-events-auto")}
        />
      </div>
    </motion.div>
  );
};

export default TerminalOnCanvas;
