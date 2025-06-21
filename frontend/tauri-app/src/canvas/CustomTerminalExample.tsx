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
      <div className={cn("p-4 rounded-lg h-fit")}>
        {/* Terminal Type Selection */}
        <div className={cn("mb-4")}>
          <label className={cn("block text-sm font-medium text-[var(--fg-300)] mb-2")}>
            Terminal Type
          </label>
          <select
            value={terminalType}
            onChange={(e) => setTerminalType(e.target.value as any)}
            className={cn("w-full px-3 py-2 bg-[var(--bg-800)] border border-[var(--bg-600)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--fg-500)]")}
            disabled={isConnected}
          >
            <option value="git-bash">Git Bash (Windows)</option>
            <option value="wsl">WSL (Windows)</option>
            <option value="ssh">SSH</option>
          </select>
        </div>

        {/* Configuration based on terminal type */}
        {terminalType === 'ssh' && (
          <div className={cn("space-y-3 mb-4")}>
            <div>
              <label className={cn("block text-sm font-medium text-[var(--fg-300)] mb-1")}>
                Host
              </label>
              <input
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="example.com"
                className={cn("w-full px-3 py-2 bg-[var(--bg-800)] border border-[var(--bg-600)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--fg-500)]")}
                disabled={isConnected}
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-[var(--fg-300)] mb-1")}>
                Username
              </label>
              <input
                type="text"
                value={sshUsername}
                onChange={(e) => setSshUsername(e.target.value)}
                placeholder="user"
                className={cn("w-full px-3 py-2 bg-[var(--bg-800)] border border-[var(--bg-600)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--fg-500)]")}
                disabled={isConnected}
              />
            </div>
            <div>
              <label className={cn("block text-sm font-medium text-[var(--fg-300)] mb-1")}>
                Port
              </label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(parseInt(e.target.value) || 22)}
                placeholder="22"
                className={cn("w-full px-3 py-2 bg-[var(--bg-800)] border border-[var(--bg-600)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--fg-500)]")}
                disabled={isConnected}
              />
            </div>
          </div>
        )}

        {terminalType === 'wsl' && (
          <div className={cn("mb-4")}>
            <label className={cn("block text-sm font-medium text-[var(--fg-300)] mb-1")}>
              Distribution (optional)
            </label>
            <input
              type="text"
              value={wslDistribution}
              onChange={(e) => setWslDistribution(e.target.value)}
              placeholder="Ubuntu"
              className={cn("w-full px-3 py-2 bg-[var(--bg-800)] border border-[var(--bg-600)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--fg-500)]")}
              disabled={isConnected}
            />
          </div>
        )}

        {(terminalType === 'git-bash' || terminalType === 'wsl') && (
          <div className={cn("mb-4")}>
            <label className={cn("block text-sm font-medium text-[var(--fg-300)] mb-1")}>
              Working Directory (optional)
            </label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/directory"
              className={cn("w-full px-3 py-2 bg-[var(--bg-800)] border border-[var(--bg-600)] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-[var(--fg-500)]")}
              disabled={isConnected}
            />
          </div>
        )}

        {/* Connection Controls */}
        <div className={cn("flex space-x-3 mb-4")}>
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className={cn("px-4 py-2 bg-[var(--fg-600)] text-white rounded-md hover:bg-[var(--fg-700)] disabled:bg-[var(--bg-600)] disabled:cursor-not-allowed")}
          >
            Connect
          </button>
          <button
            onClick={handleDisconnect}
            disabled={!isConnected}
            className={cn("px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-[var(--bg-600)] disabled:cursor-not-allowed")}
          >
            Disconnect
          </button>
        </div>

        {/* Status */}
        <div className={cn("text-sm")}>
          <span className={cn("text-[var(--fg-300)]")}>Status: </span>
          <span className={cn(isConnected ? 'text-green-400' : 'text-red-400')}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          {terminalId && (
            <span className={cn("text-[var(--fg-400)] ml-2")}>
              (ID: {terminalId.slice(0, 8)}...)
            </span>
          )}
        </div>

        {error && (
          <div className={cn("mt-2 p-2 bg-red-900/20 border border-red-500 rounded text-red-400 text-sm")}>
            Error: {error}
          </div>
        )}
      </div>

      {/* Terminal Renderer */}
      {terminalSpec && (
        <div className={cn("p-4 rounded-lg h-full flex flex-col")}>
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
