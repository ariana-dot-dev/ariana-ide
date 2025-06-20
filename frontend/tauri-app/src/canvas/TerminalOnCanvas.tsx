import React, { useState, useEffect, useRef } from 'react';
import { motion, PanInfo } from 'framer-motion';
import { Terminal as XTerm } from '@xterm/xterm';
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

    const xterm = new XTerm({
      theme: {
        background: '#7dd3fc00',    // Tailwind's sky-300 (or lightBlue-300)
        foreground: '#1e293b',    // Tailwind's slate-800 (or blueGray-800)
        cursor: '#ec4899',        // Tailwind's pink-500
        selectionBackground: '#94a3b8',      // Tailwind's slate-400 (or blueGray-400)
        selectionForeground: '#1e293b',    // Tailwind's slate-800 (or blueGray-800)
        black: '#334155',        // Tailwind's slate-700 (or blueGray-700)
        red: '#ef4444',          // Tailwind's red-500
        green: '#22c55e',        // Tailwind's green-500
        yellow: '#f59e0b',        // Tailwind's amber-500
        blue: '#3b82f6',          // Tailwind's blue-500
        magenta: '#d946ef',      // Tailwind's fuchsia-500
        cyan: '#06b6d4',          // Tailwind's cyan-500
        white: '#e2e8f0',        // Tailwind's slate-200 (or blueGray-200)
        brightBlack: '#64748b',    // Tailwind's slate-500 (or blueGray-500)
        brightRed: '#f87171',      // Tailwind's red-400
        brightGreen: '#4ade80',    // Tailwind's green-400
        brightYellow: '#fbbf24',    // Tailwind's amber-400
        brightBlue: '#60a5fa',      // Tailwind's blue-400
        brightMagenta: '#e879f9',  // Tailwind's fuchsia-400
        brightCyan: '#22d3ee',      // Tailwind's cyan-400
        brightWhite: '#f8fafc',      // Tailwind's slate-50 (or blueGray-50)
      },
      fontSize: terminal.config.fontSize || 14,
      fontFamily: `"${terminal.config.fontFamily}"` || 'Monaco, Menlo, "Ubuntu Mono", monospace',
      cursorBlink: true,
      allowTransparency: true,
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.loadAddon(searchAddon);

    xterm.open(terminalRef.current);
    
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Connect to terminal service
    connectTerminal();

    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, []);

  // Fit terminal when size changes
  useEffect(() => {
    if (fitAddonRef.current && !dragging) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 100);
    }
  }, [cell.width, cell.height, dragging]);

  const connectTerminal = async () => {
    if (!xtermRef.current) return;

    try {
      const connectionId = await TerminalService.createConnection(terminal.config);
      terminal.setConnection(connectionId, true);
      setIsConnected(true);

      // Set up data handlers
      xtermRef.current.onData(data => {
        TerminalService.sendData(connectionId, data);
      });

      // Listen for data from backend
      const handleData = (data: string) => {
        xtermRef.current?.write(data);
      };

      const handleDisconnect = () => {
        terminal.setConnection('', false);
        setIsConnected(false);
        xtermRef.current?.write('\r\n\x1b[31mConnection lost\x1b[0m\r\n');
      };

      TerminalService.onData(connectionId, handleData);
      TerminalService.onDisconnect(connectionId, handleDisconnect);

      // Show connection info
      xtermRef.current.write(`\x1b[32mConnected to ${terminal.getConnectionString()}\x1b[0m\r\n`);

    } catch (error) {
      console.error('Failed to connect terminal:', error);
      xtermRef.current?.write(`\x1b[31mFailed to connect: ${error}\x1b[0m\r\n`);
    }
  };

  const handleDragStartInternal = () => {
    propOnDragStart(element);
  };

  const handleDragEndInternal = () => {
    propOnDragEnd(element);
  };

  return (
    <motion.div
      className={cn(
        `absolute p-1 cursor-move select-none overflow-hidden`,
        isDragging ? 'z-30' : 'z-10'
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
        className="w-full h-full rounded-md bg-blue-100/100 backdrop-blur-md relative"
      >
        {/* Connection status indicator */}
        {/* <div className="absolute top-2 right-2 z-10">
          <div className={cn(
            "w-2 h-2 rounded-full",
            isConnected ? "bg-green-400" : "bg-red-400"
          )} />
        </div> */}

        {/* Terminal type badge */}
        {/* <div className="absolute top-2 left-2 z-10">
          <span className="text-xs px-2 py-1 bg-black bg-opacity-50 text-white rounded">
            {terminal.getTerminalType().toUpperCase()}
          </span>
        </div> */}

        {/* Terminal container */}
        <div 
          ref={terminalRef}
          className="w-full h-full p-2 pt-8"
          style={{ 
            width: '100%', 
            height: '100%',
            // Prevent terminal from interfering with drag
            pointerEvents: 'auto'
          }}
        />
      </div>
    </motion.div>
  );
};

export default TerminalOnCanvas;
