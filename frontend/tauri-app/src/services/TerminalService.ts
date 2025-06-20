import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { TerminalConfig } from '../canvas/Terminal';

interface TerminalConnection {
  id: string;
  config: TerminalConfig;
  onData?: (data: string) => void;
  onDisconnect?: () => void;
}

class TerminalServiceImpl {
  private connections: Map<string, TerminalConnection> = new Map();
  private listeners: Map<string, () => void> = new Map();

  async createConnection(config: TerminalConfig): Promise<string> {
    try {
      // Create connection through Tauri backend
      const connectionId = await invoke<string>('create_terminal_connection', { config });
      
      const connection: TerminalConnection = {
        id: connectionId,
        config,
      };

      this.connections.set(connectionId, connection);

      // Set up event listeners for this connection
      await this.setupEventListeners(connectionId);

      return connectionId;
    } catch (error) {
      console.error('Failed to create terminal connection:', error);
      throw error;
    }
  }

  async closeConnection(connectionId: string): Promise<void> {
    try {
      await invoke('close_terminal_connection', { connectionId });
      
      // Clean up listeners
      const unlistenFn = this.listeners.get(connectionId);
      if (unlistenFn) {
        unlistenFn();
        this.listeners.delete(connectionId);
      }

      this.connections.delete(connectionId);
    } catch (error) {
      console.error('Failed to close terminal connection:', error);
    }
  }

  async sendData(connectionId: string, data: string): Promise<void> {
    try {
      await invoke('send_terminal_data', { connectionId, data });
    } catch (error) {
      console.error('Failed to send terminal data:', error);
    }
  }

  async resizeTerminal(connectionId: string, cols: number, rows: number): Promise<void> {
    try {
      await invoke('resize_terminal', { connectionId, cols, rows });
    } catch (error) {
      console.error('Failed to resize terminal:', error);
    }
  }

  onData(connectionId: string, callback: (data: string) => void): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.onData = callback;
    }
  }

  onDisconnect(connectionId: string, callback: () => void): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.onDisconnect = callback;
    }
  }

  private async setupEventListeners(connectionId: string): Promise<void> {
    // Listen for terminal data events
    const unlistenData = await listen(`terminal-data-${connectionId}`, (event) => {
      const connection = this.connections.get(connectionId);
      if (connection && connection.onData) {
        connection.onData(event.payload as string);
      }
    });

    // Listen for terminal disconnect events
    const unlistenDisconnect = await listen(`terminal-disconnect-${connectionId}`, () => {
      const connection = this.connections.get(connectionId);
      if (connection && connection.onDisconnect) {
        connection.onDisconnect();
      }
    });

    // Store unlisten functions
    this.listeners.set(connectionId, () => {
      unlistenData();
      unlistenDisconnect();
    });
  }

  // Utility methods for detecting available terminal types
  async getAvailableTerminalTypes(): Promise<string[]> {
    try {
      return await invoke<string[]>('get_available_terminal_types');
    } catch (error) {
      console.error('Failed to get available terminal types:', error);
      return ['ssh']; // Fallback to SSH only
    }
  }

  async validateTerminalConfig(config: TerminalConfig): Promise<boolean> {
    try {
      return await invoke<boolean>('validate_terminal_config', { config });
    } catch (error) {
      console.error('Failed to validate terminal config:', error);
      return false;
    }
  }
}

export const TerminalService = new TerminalServiceImpl();
