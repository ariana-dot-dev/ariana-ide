import { ProcessState } from "../types/GitProject";

/**
 * Global process manager that survives React component unmount/remount cycles
 * Maps processId -> active process instances
 */
export class ProcessManager {
	private static activeProcesses = new Map<string, any>(); // processId -> actual process instance
	private static terminalConnections = new Map<string, string>(); // elementId -> terminalId

	/**
	 * Register a running process (e.g., ClaudeCodeAgent instance)
	 */
	static registerProcess(processId: string, processInstance: any): void {
		this.activeProcesses.set(processId, processInstance);
	}

	/**
	 * Get a running process instance by ID
	 */
	static getProcess(processId: string): any {
		return this.activeProcesses.get(processId);
	}

	/**
	 * Remove a process when it completes
	 */
	static unregisterProcess(processId: string): void {
		this.activeProcesses.delete(processId);
	}

	/**
	 * Check if a process is actually still running
	 */
	static isProcessRunning(processId: string): boolean {
		const process = this.activeProcesses.get(processId);
		if (!process) return false;
		
		// Check if it's a ClaudeCodeAgent with isRunning property
		if (process.isRunning !== undefined) {
			return process.isRunning;
		}
		
		// For other process types, assume it's running if registered
		return true;
	}

	/**
	 * Associate a terminal connection with an element
	 */
	static setTerminalConnection(elementId: string, terminalId: string): void {
		this.terminalConnections.set(elementId, terminalId);
	}

	/**
	 * Get terminal ID for an element
	 */
	static getTerminalConnection(elementId: string): string | undefined {
		return this.terminalConnections.get(elementId);
	}

	/**
	 * Remove terminal connection
	 */
	static removeTerminalConnection(elementId: string): void {
		this.terminalConnections.delete(elementId);
	}

	/**
	 * Get all active process IDs
	 */
	static getActiveProcessIds(): string[] {
		return Array.from(this.activeProcesses.keys());
	}

	/**
	 * Cleanup completed/dead processes
	 */
	static cleanup(): void {
		const toRemove: string[] = [];
		
		for (const [processId, process] of this.activeProcesses.entries()) {
			if (!this.isProcessRunning(processId)) {
				toRemove.push(processId);
			}
		}
		
		toRemove.forEach(processId => {
			this.unregisterProcess(processId);
		});
	}
}