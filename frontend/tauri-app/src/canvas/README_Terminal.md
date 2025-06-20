# Terminal Element for Canvas

## Overview

The Terminal element is a fully-featured terminal emulator that can be used alongside Rectangle elements on the canvas. It provides:

- **ANSI Support**: Full ANSI escape sequence support for colors, cursor movement, and text formatting
- **Multiple Terminal Types**: SSH, Git Bash (Windows), and WSL (Windows) support
- **Tailwind Integration**: Colors are mapped to Tailwind color classes with transparency support
- **Visual Customization**: Easy styling through Tailwind CSS classes
- **Advanced TUI Support**: Handles complex terminal applications like vim, htop, etc.

## Architecture

### Frontend Components

1. **Terminal.ts** - Core Terminal class extending `CanvasElement`
2. **TerminalOnCanvas.tsx** - React component rendering the terminal with xterm.js
3. **TerminalService.ts** - Service layer handling communication with Tauri backend

### Backend Components

1. **terminal.rs** - Rust backend using `portable-pty` for cross-platform terminal support
2. **main.rs** - Tauri command handlers for terminal operations

## Usage

### Creating Terminal Elements

```typescript
import { Terminal } from './canvas/Terminal';

// SSH Terminal
const sshTerminal = new Terminal({
  size: 'medium',
  aspectRatio: 4/3,
  area: 'left',
  terminalConfig: {
    type: 'ssh',
    host: 'example.com',
    username: 'user',
    port: 22,
    colorScheme: 'dark',
    fontSize: 14,
    fontFamily: 'Monaco, monospace'
  }
});

// Git Bash Terminal (Windows only)
const gitBashTerminal = new Terminal({
  size: 'large',
  aspectRatio: 16/9,
  area: 'center',
  terminalConfig: {
    type: 'git-bash',
    workingDirectory: 'C:\\Users\\username\\project',
    environment: {
      'PATH': '/usr/bin:/bin'
    }
  }
});

// WSL Terminal (Windows only)
const wslTerminal = new Terminal({
  size: 'medium',
  aspectRatio: 4/3,
  area: 'right',
  terminalConfig: {
    type: 'wsl',
    distribution: 'Ubuntu',
    workingDirectory: '/home/user/project'
  }
});
```

### Canvas Integration

```typescript
import Canvas from './canvas/Canvas';
import { CanvasElement } from './canvas/types';

const elements: CanvasElement[] = [
  rectangleElement,
  sshTerminal,
  gitBashTerminal,
  wslTerminal
];

<Canvas 
  elements={elements}
  onElementsChange={setElements}
/>
```

## Features

### ANSI Support

The terminal fully supports ANSI escape sequences including:
- Colors (16-color, 256-color, and RGB)
- Text formatting (bold, italic, underline)
- Cursor movement and positioning
- Screen clearing and scrolling
- Complex TUI applications

### Color Mapping

Terminal colors are automatically mapped to Tailwind color classes:

```typescript
const terminalTheme = {
  black: '#1f2937',     // gray-800
  red: '#ef4444',       // red-500
  green: '#10b981',     // emerald-500
  yellow: '#f59e0b',    // amber-500
  blue: '#3b82f6',      // blue-500
  magenta: '#a855f7',   // violet-500
  cyan: '#06b6d4',      // cyan-500
  white: '#f3f4f6',     // gray-100
  // ... bright variants
};
```

### Visual Customization

Terminal appearance can be customized through:
- Background color with transparency
- Font family and size
- Color scheme selection
- Border and shadow effects via Tailwind

### Drag and Drop

Terminals inherit the same drag-and-drop behavior as Rectangle elements:
- Draggable around the canvas
- Swappable positions with other elements
- Resize automatically based on grid layout

## Backend Architecture

### Connection Management

Each terminal creates a PTY (pseudo-terminal) connection managed by the Rust backend:

```rust
pub struct TerminalConnection {
    pub id: String,
    pub config: TerminalConfig,
    pub pty_pair: PtyPair,
    pub child: Box<dyn Child + Send + Sync>,
    pub app_handle: AppHandle,
}
```

### Platform Support

- **SSH**: Cross-platform support using standard SSH client
- **Git Bash**: Windows-only, automatically detects Git installation
- **WSL**: Windows-only, supports multiple distributions

### Event System

Real-time communication between frontend and backend:
- `terminal-data-{id}`: Data from terminal to frontend
- `terminal-disconnect-{id}`: Connection closed event
- Tauri commands for sending data and resizing

## Dependencies

### Frontend
- `@xterm/xterm`: Terminal emulator library
- `@xterm/addon-fit`: Automatic terminal sizing
- `@xterm/addon-web-links`: Clickable links support
- `@xterm/addon-search`: Terminal search functionality

### Backend
- `portable-pty`: Cross-platform PTY support
- `tokio`: Async runtime
- `uuid`: Connection ID generation
- `anyhow`: Error handling

## Advanced Usage

### Custom Terminal Types

Extend the system by adding new terminal types:

1. Add to `TerminalType` enum in `Terminal.ts`
2. Update `build_command` in `terminal.rs`
3. Add validation logic in `validate_config`

### Complex TUI Applications

The terminal supports complex applications like:
- Vim/Neovim editors
- Htop system monitor
- Git interactive rebase
- SSH sessions with nested terminals

### Performance Considerations

- Terminal data is buffered and sent in chunks
- Resize events are debounced to prevent excessive backend calls
- Inactive terminals can be disconnected to save resources
