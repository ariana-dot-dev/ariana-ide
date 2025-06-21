import React, { useState, useEffect } from 'react';
import CustomTerminalRenderer from './CustomTerminalRenderer';
import { TerminalSpecs, TerminalSpec } from '../services/CustomTerminalAPI';
import { cn } from '../utils';

interface CustomTerminalExampleProps {
}

export const CustomTerminalExample: React.FC<CustomTerminalExampleProps> = ({ }) => {
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
    <div className={cn("h-full flex flex-col gap-2")}>
      <div className="p-4 rounded-lg h-fit">
        {/* Terminal Type Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-sky-300 mb-2">
            Terminal Type
          </label>
          <select
            value={terminalType}
            onChange={(e) => setTerminalType(e.target.value as any)}
            className="w-full px-3 py-2 bg-sky-800 border border-sky-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              <label className="block text-sm font-medium text-sky-300 mb-1">
                Host
              </label>
              <input
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="example.com"
                className="w-full px-3 py-2 bg-sky-800 border border-sky-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-sky-300 mb-1">
                Username
              </label>
              <input
                type="text"
                value={sshUsername}
                onChange={(e) => setSshUsername(e.target.value)}
                placeholder="user"
                className="w-full px-3 py-2 bg-sky-800 border border-sky-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-sky-300 mb-1">
                Port
              </label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                placeholder="22"
                className="w-full px-3 py-2 bg-sky-800 border border-sky-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isConnected}
              />
            </div>
          </div>
        )}

        {terminalType === 'wsl' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-sky-300 mb-1">
              Distribution (optional)
            </label>
            <input
              type="text"
              value={wslDistribution}
              onChange={(e) => setWslDistribution(e.target.value)}
              placeholder="Ubuntu"
              className="w-full px-3 py-2 bg-sky-800 border border-sky-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            />
          </div>
        )}

        {(terminalType === 'git-bash' || terminalType === 'wsl') && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-sky-300 mb-1">
              Working Directory (optional)
            </label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/directory"
              className="w-full px-3 py-2 bg-sky-800 border border-sky-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isConnected}
            />
          </div>
        )}

        {/* Connection Controls */}
        <div className="flex space-x-3 mb-4">
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-sky-600 disabled:cursor-not-allowed"
          >
            Connect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={!isConnected}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-sky-600 disabled:cursor-not-allowed"
          >
            Disconnect
          </button>
        </div>

        {/* Status */}
        <div className="text-sm">
          <span className="text-sky-300">Status: </span>
          <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {terminalId && (
            <span className="text-sky-400 ml-2">
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
        <div className="p-4 rounded-lg h-full flex flex-col">
          <CustomTerminalRenderer
            spec={terminalSpec}
            onTerminalReady={handleTerminalReady}
            onTerminalError={handleTerminalError}
          />
        </div>
      )}
    </div>
  );
};

export default CustomTerminalExample;
