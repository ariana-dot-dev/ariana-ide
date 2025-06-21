# Custom Terminal API

A fully custom terminal implementation for Tauri applications that provides complete control over terminal UI rendering and interactions, replacing xterm.js dependencies.

## Overview

This API provides a comprehensive set of tools for building custom terminal UIs with:

- **Complete UI Control**: Build any terminal UI you want without xterm.js constraints
- **Rich Text Styling**: Detailed styling information (bold, italic, underline, colors)
- **ANSI Code Support**: Handles essential ANSI escape sequences for cursor and display control
- **Multiple Connection Types**: SSH, Git Bash, and WSL support
- **Event-Driven Architecture**: Real-time updates through structured events

## Architecture

```
Frontend (TypeScript)     Backend (Rust)
┌─────────────────────┐   ┌──────────────────────┐
│ CustomTerminalAPI   │◄──┤ CustomTerminalManager│
│                     │   │                      │
│ TerminalRenderer    │   │ AnsiParser           │
│                     │   │                      │
│ Event Handlers      │   │ PTY Connections      │
└─────────────────────┘   └──────────────────────┘
```

## Core Features

### 1. Terminal Connection Management

```typescript
// Connect to different terminal types
const gitBashSpec = TerminalSpecs.gitBash('/path/to/project', {
  lines: 30,
  cols: 100
});

const sshSpec = TerminalSpecs.ssh('example.com', 'username', 22, {
  lines: 24,
  cols: 80
});

const wslSpec = TerminalSpecs.wsl('Ubuntu', '/home/user', {
  lines: 40,
  cols: 120
});

// Connect and get terminal ID
const terminalId = await customTerminalAPI.connectTerminal(gitBashSpec);
```

### 2. Input Handling

```typescript
// Send single or multi-line commands
await customTerminalAPI.sendInputLines(terminalId, [
  'echo "Hello World"',
  'ls -la'
]);

// Send control signals
await customTerminalAPI.sendCtrlC(terminalId);
await customTerminalAPI.sendCtrlD(terminalId);

// Send scroll commands
await customTerminalAPI.sendScrollUp(terminalId);
await customTerminalAPI.sendScrollDown(terminalId);
```

### 3. Event-Driven Output

```typescript
await customTerminalAPI.onTerminalEvent(terminalId, (event) => {
  switch (event.type) {
    case 'newLines':
      // Handle new terminal output lines
      event.lines?.forEach(line => {
        line.forEach(item => {
          console.log('Text:', item.lexeme);
          console.log('Styling:', {
            bold: item.is_bold,
            italic: item.is_italic,
            underline: item.is_underline,
            fg: item.foreground_color,
            bg: item.background_color
          });
        });
      });
      break;
      
    case 'patch':
      // Handle localized text updates
      console.log(`Update at line ${event.line}, col ${event.col}`);
      break;
      
    case 'cursorMove':
      // Handle cursor position changes
      console.log(`Cursor moved to ${event.line}, ${event.col}`);
      break;
      
    case 'scroll':
      // Handle scroll events
      console.log(`Scroll ${event.direction} by ${event.amount}`);
      break;
  }
});
```

## API Reference

### Types

#### TerminalSpec
```typescript
interface TerminalSpec {
  kind: TerminalKind;
  workingDir?: string;
  shellCommand?: string;
  environment?: Record<string, string>;
  lines: number;  // Terminal height
  cols: number;   // Terminal width
}
```

#### LineItem
```typescript
interface LineItem {
  lexeme: string;           // The text content
  width: number;            // Width in monospaced characters
  is_underline: boolean;    // Underline styling
  is_bold: boolean;         // Bold styling
  is_italic: boolean;       // Italic styling
  background_color?: Color; // Background color
  foreground_color?: Color; // Text color
}
```

#### Color System
```typescript
// Standard colors
Colors.Black, Colors.Red, Colors.Green, Colors.Yellow
Colors.Blue, Colors.Magenta, Colors.Cyan, Colors.White

// Bright colors
Colors.BrightBlack, Colors.BrightRed, Colors.BrightGreen
Colors.BrightYellow, Colors.BrightBlue, Colors.BrightMagenta
Colors.BrightCyan, Colors.BrightWhite

// 256-color support
Colors.Extended(colorIndex) // 0-255
```

### Core Methods

#### Connection Management
```typescript
// Connect to terminal
connectTerminal(spec: TerminalSpec): Promise<string>

// Reconnect to existing terminal
reconnectTerminal(id: string): Promise<void>

// Kill terminal connection
killTerminal(id: string): Promise<void>

// Resize terminal
resizeTerminal(id: string, lines: number, cols: number): Promise<void>
```

#### Input/Output
```typescript
// Send input
sendInputLines(id: string, lines: string[]): Promise<void>

// Control signals
sendCtrlC(id: string): Promise<void>
sendCtrlD(id: string): Promise<void>

// Scroll control
sendScrollUp(id: string): Promise<void>
sendScrollDown(id: string): Promise<void>

// Event listeners
onTerminalEvent(id: string, callback: (event: TerminalEvent) => void): Promise<void>
onTerminalDisconnect(id: string, callback: () => void): Promise<void>
```

## ANSI Code Support

The parser handles these essential ANSI escape sequences:

| Code | Description | Event Generated |
|------|-------------|-----------------|
| CUU  | Cursor Up | cursorMove |
| CUD  | Cursor Down | cursorMove |
| CUF  | Cursor Forward | cursorMove |
| CUB  | Cursor Back | cursorMove |
| CNL  | Cursor Next Line | cursorMove |
| CPL  | Cursor Previous Line | cursorMove |
| CHA  | Cursor Horizontal Absolute | cursorMove |
| CUP  | Cursor Position | cursorMove |
| ED   | Erase Display | newLines |
| EL   | Erase Line | patch |
| SU   | Scroll Up | scroll |
| SD   | Scroll Down | scroll |
| SGR  | Select Graphic Rendition | styling |

## Usage Examples

### Basic Terminal Component

```tsx
import { CustomTerminalRenderer, TerminalSpecs } from '../services/CustomTerminalAPI';

function MyTerminal() {
  const spec = TerminalSpecs.gitBash('/my/project', {
    lines: 30,
    cols: 100
  });

  return (
    <CustomTerminalRenderer
      spec={spec}
      onTerminalReady={(id) => console.log('Terminal ready:', id)}
      onTerminalError={(error) => console.error('Terminal error:', error)}
      className="h-96 w-full"
    />
  );
}
```

### Advanced Custom Renderer

```tsx
function CustomTerminalUI() {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [lines, setLines] = useState<LineItem[][]>([]);
  const [cursor, setCursor] = useState({ line: 0, col: 0 });

  useEffect(() => {
    const initTerminal = async () => {
      const spec = TerminalSpecs.ssh('my-server.com', 'user');
      const id = await customTerminalAPI.connectTerminal(spec);
      setTerminalId(id);

      await customTerminalAPI.onTerminalEvent(id, (event) => {
        switch (event.type) {
          case 'newLines':
            setLines(prev => [...prev, ...event.lines!]);
            break;
          case 'cursorMove':
            setCursor({ line: event.line!, col: event.col! });
            break;
        }
      });
    };

    initTerminal();
  }, []);

  return (
    <div className="terminal-container">
      {lines.map((line, lineIndex) => (
        <div key={lineIndex} className="terminal-line">
          {line.map((item, itemIndex) => (
            <span
              key={itemIndex}
              style={{
                fontWeight: item.is_bold ? 'bold' : 'normal',
                fontStyle: item.is_italic ? 'italic' : 'normal',
                textDecoration: item.is_underline ? 'underline' : 'none',
                color: colorToCSS(item.foreground_color),
                backgroundColor: colorToCSS(item.background_color),
              }}
            >
              {item.lexeme}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
```

## Benefits Over xterm.js

1. **Complete UI Control**: Build any terminal interface design
2. **Framework Agnostic**: Works with any frontend framework
3. **Rich Styling Data**: Access to detailed text formatting information
4. **Event-Driven**: Structured events instead of raw terminal data
5. **Performance**: Optimized for your specific use case
6. **Customization**: Full control over rendering and interactions

## File Structure

```
tauri-app/
├── src-tauri/src/
│   ├── custom_terminal.rs          # Core Rust implementation
│   ├── custom_terminal_commands.rs # Tauri command handlers
│   └── main.rs                     # Integration with main app
└── src/
    ├── services/
    │   └── CustomTerminalAPI.ts     # TypeScript API layer
    └── canvas/
        ├── CustomTerminalRenderer.tsx # React renderer component
        └── CustomTerminalExample.tsx  # Usage example
```

## Getting Started

1. **Install Dependencies**: Ensure you have the `portable-pty` crate in your Rust dependencies
2. **Import Modules**: Add the custom terminal modules to your main.rs
3. **Use the API**: Import `CustomTerminalAPI` in your TypeScript/React code
4. **Build Your UI**: Use the provided components or build your own custom renderer

This API gives you complete freedom to create the terminal experience you want while handling all the complex PTY management and ANSI parsing under the hood.
