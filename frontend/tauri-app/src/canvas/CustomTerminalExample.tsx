import React, { useState, useEffect } from 'react';
import CustomTerminalRenderer from './CustomTerminalRenderer';
import { TerminalSpecs, TerminalSpec } from '../services/CustomTerminalAPI';
import { cn } from '../utils';

interface CustomTerminalExampleProps {
  className?: string;
}

export const CustomTerminalExample: React.FC<CustomTerminalExampleProps> = ({ className }) => {
  const [terminalType, setTerminalType] = useState<'git-bash' | 'wsl' | 'ssh'>('git-bash');
  const [terminalSpec, setTerminalSpec] = useState<TerminalSpec | null>(null);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // SSH connection details
  const [sshHost, setSshHost] = useState('');
  const [sshUsername, setSshUsername] = useState('');
  const [sshPort, setSshPort] = useState(22);

  // WSL details
  const [wslDistribution, setWslDistribution] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');

  const handleConnect = () => {
    let spec: TerminalSpec;

    switch (terminalType) {
      case 'git-bash':
        spec = TerminalSpecs.gitBash(workingDirectory || undefined, {
          lines: 24,
          cols: 80,
        });
        break;
      
      case 'wsl':
        spec = TerminalSpecs.wsl(
          wslDistribution || undefined,
          workingDirectory || undefined,
          {
            lines: 24,
            cols: 80,
          }
        );
        break;
      
      case 'ssh':
        if (!sshHost || !sshUsername) {
          setError('SSH host and username are required');
          return;
        }
        spec = TerminalSpecs.ssh(sshHost, sshUsername, sshPort, {
          lines: 24,
          cols: 80,
        });
        break;
      
      default:
        setError('Invalid terminal type');
        return;
    }

    setTerminalSpec(spec);
    setError(null);
  };

  const handleDisconnect = () => {
    setTerminalSpec(null);
    setTerminalId(null);
    setIsConnected(false);
  };

  const handleTerminalReady = (id: string) => {
    setTerminalId(id);
    setIsConnected(true);
  };

  const handleTerminalError = (errorMessage: string) => {
    setError(errorMessage);
    setIsConnected(false);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="bg-gray-900 p-4 rounded-lg">
        {/* Terminal Type Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Terminal Type
          </label>
          <select
            value={terminalType}
            onChange={(e) => setTerminalType(e.target.value as any)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isConnected}
          >
            <option value="git-bash">Git Bash (Windows)</option>
            <option value="wsl">WSL (Windows)</option>
            <option value="ssh">SSH</option>
          </select>
        </div>

        {/* Configuration based on terminal type */}
        {terminalType === 'ssh' && (
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Host
              </label>
              <input
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={sshUsername}
                onChange={(e) => setSshUsername(e.target.value)}
                placeholder="user"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Port
              </label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                placeholder="22"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              />
            </div>
          </div>
        )}

        {terminalType === 'wsl' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Distribution (optional)
            </label>
            <input
              type="text"
              value={wslDistribution}
              onChange={(e) => setWslDistribution(e.target.value)}
              placeholder="Ubuntu"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            />
          </div>
        )}

        {(terminalType === 'git-bash' || terminalType === 'wsl') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Working Directory (optional)
            </label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/directory"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            />
          </div>
        )}

        {/* Connection Controls */}
        <div className="flex space-x-3 mb-4">
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Connect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={!isConnected}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Disconnect
          </button>
        </div>

        {/* Status */}
        <div className="text-sm">
          <span className="text-gray-300">Status: </span>
          <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {terminalId && (
            <span className="text-gray-400 ml-2">
              (ID: {terminalId.slice(0, 8)}...)
            </span>
          )}
        </div>

        {error && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-500 rounded text-red-400 text-sm">
            Error: {error}
          </div>
        )}
      </div>

      {/* Terminal Renderer */}
      {terminalSpec && (
        <div className="bg-gray-900 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-2">Terminal Output</h3>
          <div className="border border-gray-600 rounded-md overflow-hidden">
            <CustomTerminalRenderer
              spec={terminalSpec}
              onTerminalReady={handleTerminalReady}
              onTerminalError={handleTerminalError}
              className="h-96 w-full"
            />
          </div>
          <div className="mt-2 text-xs text-gray-400">
            <p>• Use keyboard to interact with the terminal</p>
            <p>• Ctrl+C to send interrupt signal</p>
            <p>• Ctrl+D to send EOF signal</p>
            <p>• Arrow keys for scrolling</p>
            <p>• Enter to execute commands</p>
          </div>
        </div>
      )}

      {/* API Usage Example
      <div className="bg-gray-900 p-4 rounded-lg">
        <h3 className="text-lg font-semibold text-white mb-2">API Usage Example</h3>
        <pre className="bg-gray-800 p-3 rounded text-sm text-gray-300 overflow-x-auto">
{`import { customTerminalAPI, TerminalSpecs } from '../services/CustomTerminalAPI';

// Connect to Git Bash
const spec = TerminalSpecs.gitBash('/path/to/project', {
  lines: 30,
  cols: 100
});

const terminalId = await customTerminalAPI.connectTerminal(spec);

// Listen for terminal events
await customTerminalAPI.onTerminalEvent(terminalId, (event) => {
  switch (event.type) {
    case 'newLines':
      console.log('New lines:', event.lines);
      break;
    case 'cursorMove':
      console.log('Cursor moved to:', event.line, event.col);
      break;
    case 'scroll':
      console.log('Scroll:', event.direction, event.amount);
      break;
  }
});

// Send commands
await customTerminalAPI.sendInputLines(terminalId, [
  'echo "Hello World"',
  'ls -la'
]);

// Send control signals
await customTerminalAPI.sendCtrlC(terminalId);
await customTerminalAPI.sendCtrlD(terminalId);

// Resize terminal
await customTerminalAPI.resizeTerminal(terminalId, 40, 120);

// Cleanup
await customTerminalAPI.killTerminal(terminalId);`}
        </pre>
      </div> */}
    </div>
  );
};

export default CustomTerminalExample;
