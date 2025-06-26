import { TerminalSpec, TerminalEvent, LineItem } from "./CustomTerminalAPI";
import { headlessTerminalAPI } from "./HeadlessTerminalAPI";
import { EventEmitter } from "../utils/EventEmitter";

export interface ClaudeCodeTaskResult {
	elapsed: number;
	tokens?: number;
	diff: {
		file_changes: Array<{
			absolute_path: string;
			name_and_extension: string;
			original_content: string;
			final_content: string;
			git_style_diff: string;
		}>;
	};
}

export interface TuiLine {
	content: string;
	timestamp: number;
}

export interface KeyboardKey {
	type: 'char' | 'ctrl' | 'alt' | 'special';
	value: string;
}

/**
 * Claude Code Agent that manages interaction with the Claude Code CLI tool
 * through the custom terminal system. This provides a bridge between the 
 * text area UI and the headless CLI agents library.
 */
export class ClaudeCodeAgent extends EventEmitter {
	private terminalId: string | null = null;
	private isRunning = false;
	private currentTask: string | null = null;
	private screenLines: LineItem[][] = [];
	private startTime: number = 0;
	
	constructor() {
		super();
	}
	
	/**
	 * Start a new Claude Code task
	 */
	async startTask(
		prompt: string, 
		terminalSpec: TerminalSpec,
		onTerminalReady?: (terminalId: string) => void
	): Promise<void> {
		if (this.isRunning) {
			throw new Error("Claude Code task is already running");
		}
		
		this.isRunning = true;
		this.currentTask = prompt;
		this.startTime = Date.now();
		this.screenLines = [];
		
		try {
			// Create headless terminal session
			this.terminalId = await headlessTerminalAPI.createSession(terminalSpec);
			
			// Set up event listeners
			this.setupTerminalListeners();
			
			// Notify that terminal is ready
			onTerminalReady?.(this.terminalId);
			
			// Wait a bit for terminal to be fully ready
			await this.delay(1000);
			
			// Check if Claude Code is installed and start the process
			await this.initializeClaudeCode(prompt);
			
		} catch (error) {
			this.isRunning = false;
			this.emit('taskError', error instanceof Error ? error.message : String(error));
			throw error;
		}
	}
	
	/**
	 * Stop the current Claude Code task
	 */
	async stopTask(): Promise<void> {
		if (!this.isRunning || !this.terminalId) return;
		
		try {
			// Send Ctrl+C to interrupt
			await headlessTerminalAPI.sendKeySequence(this.terminalId, ['Ctrl+C']);
			
			// Wait a bit then clean up
			await this.delay(500);
			
			await this.cleanup();
			
		} catch (error) {
			console.error("Error stopping Claude Code task:", error);
		} finally {
			this.isRunning = false;
			this.emit('taskStopped');
		}
	}
	
	/**
	 * Send keyboard input to the terminal
	 */
	async sendKeys(keys: KeyboardKey[]): Promise<void> {
		if (!this.terminalId) return;
		
		for (const key of keys) {
			await this.sendSingleKey(key);
		}
	}
	
	/**
	 * Get the current screen lines (last N lines where N is terminal height)
	 */
	getCurrentTuiLines(terminalHeight: number = 24): TuiLine[] {
		if (!this.terminalId) return [];
		
		try {
			const screenText = headlessTerminalAPI.getCurrentScreenText(this.terminalId);
			return screenText.map((line, index) => ({
				content: line,
				timestamp: Date.now() - (screenText.length - index) * 100 // Approximate timestamps
			}));
		} catch (error) {
			return this.screenLines.slice(-terminalHeight).map((line, index) => ({
				content: line.map(item => item.lexeme).join(''),
				timestamp: Date.now() - (this.screenLines.slice(-terminalHeight).length - index) * 100
			}));
		}
	}
	
	/**
	 * Check if task is currently running
	 */
	isTaskRunning(): boolean {
		return this.isRunning;
	}
	
	/**
	 * Get current task information
	 */
	getCurrentTask(): { prompt: string; elapsed: number } | null {
		if (!this.currentTask) return null;
		
		return {
			prompt: this.currentTask,
			elapsed: Date.now() - this.startTime
		};
	}
	
	/**
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		if (this.terminalId) {
			try {
				await headlessTerminalAPI.closeSession(this.terminalId);
			} catch (error) {
				console.error("Error closing terminal session:", error);
			}
			this.terminalId = null;
		}
		
		this.isRunning = false;
		this.currentTask = null;
		this.screenLines = [];
		this.removeAllListeners();
	}
	
	// Private methods
	
	private setupTerminalListeners(): void {
		if (!this.terminalId) return;
		
		headlessTerminalAPI.onTerminalEvents(this.terminalId, (events: TerminalEvent[]) => {
			this.handleTerminalEvents(events);
		});
	}
	
	private handleTerminalEvents(events: TerminalEvent[]): void {
		for (const event of events) {
			switch (event.type) {
				case 'screenUpdate':
					if (event.screen) {
						this.screenLines = [...event.screen];
					}
					break;
					
				case 'newLines':
					if (event.lines) {
						this.screenLines.push(...event.lines);
					}
					break;
					
				case 'patch':
					if (event.line !== undefined && event.items) {
						// Ensure we have enough lines
						while (this.screenLines.length <= event.line) {
							this.screenLines.push([]);
						}
						this.screenLines[event.line] = [...event.items];
					}
					break;
			}
		}
		
		// Emit screen update event
		this.emit('screenUpdate', this.getCurrentTuiLines());
		
		// Check for task completion patterns
		this.checkForTaskCompletion();
	}
	
	private async initializeClaudeCode(prompt: string): Promise<void> {
		if (!this.terminalId) return;
		
		// Check if claude is available
		await headlessTerminalAPI.sendCommand(this.terminalId, "which claude");
		await this.delay(1000);
		
		// Get the current working directory
		await headlessTerminalAPI.sendCommand(this.terminalId, "pwd");
		await this.delay(500);
		
		// Start Claude Code with the prompt
		const claudeCommand = `claude "${prompt.replace(/"/g, '\\"')}"`;
		await headlessTerminalAPI.sendCommand(this.terminalId, claudeCommand);
		
		this.emit('taskStarted', { prompt, terminalId: this.terminalId });
	}
	
	private async sendSingleKey(key: KeyboardKey): Promise<void> {
		if (!this.terminalId) return;
		
		let keySequence: string;
		
		switch (key.type) {
			case 'char':
				keySequence = key.value;
				break;
			case 'ctrl':
				keySequence = `Ctrl+${key.value.toUpperCase()}`;
				break;
			case 'special':
				keySequence = key.value;
				break;
			default:
				keySequence = key.value;
		}
		
		await headlessTerminalAPI.sendKeySequence(this.terminalId, [keySequence]);
	}
	
	private checkForTaskCompletion(): void {
		if (!this.terminalId) return;
		
		try {
			const recentLines = headlessTerminalAPI.getCurrentScreenText(this.terminalId).slice(-5);
			const recentText = recentLines.join('\n').toLowerCase();
		
			// Look for common completion patterns
			if (recentText.includes('task completed') || 
				recentText.includes('✓') ||
				recentText.includes('finished') ||
				recentText.includes('done') ||
				(recentText.includes('$') && !this.hasRecentActivity())) {
				
				// Task likely completed
				setTimeout(() => {
					this.handleTaskCompletion();
				}, 2000); // Wait a bit to ensure it's really done
			}
		} catch (error) {
			console.error("Error checking for task completion:", error);
		}
	}
	
	private hasRecentActivity(): boolean {
		// Simple heuristic: if we've seen new content in the last few seconds
		// This is a placeholder - in practice you'd want more sophisticated detection
		return false;
	}
	
	private async handleTaskCompletion(): Promise<void> {
		const elapsed = Date.now() - this.startTime;
		
		// Create a simple result object
		const result: ClaudeCodeTaskResult = {
			elapsed,
			tokens: undefined, // Would need to parse from Claude output
			diff: {
				file_changes: [] // Would need to compute actual file changes
			}
		};
		
		this.isRunning = false;
		this.emit('taskComplete', result);
	}
	
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}