# Terminal Double Input Fix

## Problem Description

Users experienced double input in terminals where:
- Typing "ls" displayed as "llss" 
- Pressing Enter executed twice (empty command + actual command)
- Every character appeared duplicated

## Root Cause

The issue was caused by **multiple event handlers** being attached to the same xterm.js instance:

1. **Multiple `onData` handlers**: Each time `connectTerminal()` was called, a new `onData` handler was added without removing the previous one
2. **No handler cleanup**: When terminals reconnected or re-rendered, old handlers persisted
3. **Race conditions**: Multiple handlers would send the same input data to the backend simultaneously

## The Fix

### 1. **Proper Handler Management**
```typescript
// Before (problematic)
xtermRef.current.onData(data => {
  TerminalService.sendData(connectionId, data);
});

// After (fixed)
const dataDisposable = xtermRef.current.onData(data => {
  if (terminal.isConnected) {
    TerminalService.sendData(connectionId, data);
  }
});
```

### 2. **Handler Cleanup**
```typescript
const handleDisconnect = () => {
  terminal.setConnection('', false);
  setIsConnected(false);
  dataDisposable.dispose(); // Clean up the data handler
  // ...
};
```

### 3. **Connection State Management**
```typescript
// Prevent multiple connections
if (!xtermRef.current || terminal.isConnected) return;

// Check connection state before sending data
if (terminal.isConnected) {
  TerminalService.sendData(connectionId, data);
}
```

### 4. **Single Connection Setup**
- Moved `connectTerminal` function inside the `useEffect` 
- Ensures it's only called once per terminal instance
- Proper cleanup on component unmount

## Technical Details

### Event Handler Lifecycle
1. **Creation**: Handler created when terminal connects
2. **Usage**: Handler sends user input to backend 
3. **Disposal**: Handler properly disposed when terminal disconnects
4. **Cleanup**: All handlers cleaned up on component unmount

### State Synchronization
- Frontend connection state (`isConnected`) synced with backend
- Prevents sending data to disconnected terminals
- Guards against multiple connection attempts

### Resource Management
- Proper disposal of xterm.js disposables
- Cleanup of dead connections
- Prevention of memory leaks

## Testing

To verify the fix works:

1. **Type test**: Type "ls" - should appear only once as "ls"
2. **Enter test**: Press Enter - should execute only once
3. **Reconnection test**: Disconnect and reconnect - no duplicate handlers
4. **Multiple terminals**: Create several terminals - each should work independently

## Code Changes

### Files Modified
- `TerminalOnCanvas.tsx`: Fixed handler management and connection logic
- `terminal.rs`: Enhanced resource cleanup and connection limits
- `TerminalService.ts`: Added cleanup methods

### Key Improvements
- ✅ Single event handler per terminal
- ✅ Proper handler disposal 
- ✅ Connection state validation
- ✅ Resource cleanup on unmount
- ✅ Dead connection cleanup
- ✅ Connection limits to prevent resource exhaustion

This fix ensures that terminal input behaves exactly like a native terminal without any character duplication or command repetition.
