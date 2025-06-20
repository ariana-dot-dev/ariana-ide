# Terminal Element Examples

## Corrected Implementation

The Terminal element now uses proper discriminated union types and hardcoded targets.

### Terminal Structure

```typescript
// All terminals have the same hardcoded targets
const targets = {
  size: 'medium',
  aspectRatio: 1/2,
  area: 'bottom'
};

// Terminal types use discriminated unions
type TerminalKind = 
  | { $type: 'ssh'; host: string; username: string; port?: number }
  | { $type: 'git-bash'; workingDirectory?: string }
  | { $type: 'wsl'; distribution?: string; workingDirectory?: string };
```

### Usage Examples

#### SSH Terminal
```typescript
import { Terminal } from './canvas/Terminal';

const sshTerminal = new Terminal({
  kind: {
    $type: 'ssh',
    host: 'server.example.com',
    username: 'dev',
    port: 22 // optional, defaults to 22
  },
  // Optional shared config
  fontSize: 14,
  fontFamily: 'Monaco, monospace',
  colorScheme: 'dark',
  environment: {
    'TERM': 'xterm-256color'
  }
});
```

#### Git Bash Terminal (Windows only)
```typescript
const gitBashTerminal = new Terminal({
  kind: {
    $type: 'git-bash',
    workingDirectory: 'C:\\Users\\dev\\project' // optional
  },
  fontSize: 12,
  environment: {
    'PATH': '/usr/bin:/bin'
  }
});
```

#### WSL Terminal (Windows only)
```typescript
const wslTerminal = new Terminal({
  kind: {
    $type: 'wsl',
    distribution: 'Ubuntu',           // optional, uses default if not specified
    workingDirectory: '/home/dev'     // optional
  }
});
```

### Canvas Integration

```typescript
import Canvas from './canvas/Canvas';
import { Rectangle } from './canvas/Rectangle';
import { Terminal } from './canvas/Terminal';
import { CanvasElement } from './canvas/types';

const createElements = (): CanvasElement[] => {
  return [
    // Rectangle element
    new Rectangle({ 
      size: 'large', 
      aspectRatio: 16/9, 
      area: 'center' 
    }),
    
    // SSH terminal
    new Terminal({
      kind: {
        $type: 'ssh',
        host: 'prod.example.com',
        username: 'admin'
      }
    }),
    
    // Local Git Bash terminal
    new Terminal({
      kind: {
        $type: 'git-bash',
        workingDirectory: 'C:\\dev\\my-project'
      }
    })
  ];
};

function MyCanvas() {
  const [elements, setElements] = useState<CanvasElement[]>(createElements);

  return (
    <Canvas 
      elements={elements}
      onElementsChange={setElements}
    />
  );
}
```

### Type Safety Benefits

With discriminated unions, TypeScript ensures type safety:

```typescript
function handleTerminal(config: TerminalConfig) {
  switch (config.kind.$type) {
    case 'ssh':
      // TypeScript knows these fields exist and are not null
      console.log(`Connecting to ${config.kind.username}@${config.kind.host}`);
      break;
    case 'git-bash':
      // TypeScript knows workingDirectory might be undefined
      const dir = config.kind.workingDirectory || 'default';
      break;
    case 'wsl':
      // TypeScript knows both fields might be undefined
      const dist = config.kind.distribution || 'Default';
      break;
  }
}
```

### Terminal Methods

```typescript
const terminal = new Terminal({
  kind: { $type: 'ssh', host: 'example.com', username: 'user' }
});

// Hardcoded targets (read-only behavior)
console.log(terminal.targets()); // { size: 'medium', aspectRatio: 1/2, area: 'bottom' }

// Configuration access
console.log(terminal.config.kind.$type); // 'ssh'
console.log(terminal.getTerminalType()); // 'ssh'
console.log(terminal.getConnectionString()); // 'user@example.com:22'

// Update configuration
terminal.updateConfig({
  fontSize: 16,
  colorScheme: 'light'
});

// Connection status
if (terminal.isConnected) {
  console.log(`Connected with ID: ${terminal.connectionId}`);
}
```
