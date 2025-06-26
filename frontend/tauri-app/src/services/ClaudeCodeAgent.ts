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
	private logPrefix: string;
	
	constructor() {
		super();
		this.logPrefix = `[ClaudeCodeAgent-${Date.now().toString(36)}]`;
		console.log(this.logPrefix, "Created new ClaudeCodeAgent instance");
	}
	
	/**
	 * Start a new Claude Code task
	 */
	async startTask(
		prompt: string, 
		terminalSpec: TerminalSpec,
		onTerminalReady?: (terminalId: string) => void
	): Promise<void> {
		console.log(this.logPrefix, "Starting Claude Code task with prompt:", prompt);
		console.log(this.logPrefix, "Terminal spec:", JSON.stringify(terminalSpec, null, 2));
		
		if (this.isRunning) {
			const error = "Claude Code task is already running";
			console.error(this.logPrefix, "❌", error);
			throw new Error(error);
		}
		
		this.isRunning = true;
		this.currentTask = prompt;
		this.startTime = Date.now();
		this.screenLines = [];
		
		try {
			console.log(this.logPrefix, "Creating headless terminal session...");
			// Create headless terminal session
			this.terminalId = await headlessTerminalAPI.createSession(terminalSpec);
			console.log(this.logPrefix, "Terminal session created with ID:", this.terminalId);
			
			// Set up event listeners
			console.log(this.logPrefix, "Setting up terminal listeners...");
			this.setupTerminalListeners();
			
			// Notify that terminal is ready
			console.log(this.logPrefix, "Notifying terminal ready callback...");
			onTerminalReady?.(this.terminalId);
			
			// Wait a bit for terminal to be fully ready
			console.log(this.logPrefix, "Waiting 1000ms for terminal to be ready...");
			await this.delay(1000);
			
			// Check if Claude Code is installed and start the process
			console.log(this.logPrefix, "Initializing Claude Code...");
			await this.initializeClaudeCode(prompt);
			
		} catch (error) {
			console.error(this.logPrefix, "Error starting task:", error);
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
		console.log(this.logPrefix, "Received", events.length, "terminal events");
		
		for (const event of events) {
			console.log(this.logPrefix, "Processing event:", event.type);
			
			switch (event.type) {
				case 'screenUpdate':
					if (event.screen) {
						console.log(this.logPrefix, "Screen update - new screen has", event.screen.length, "lines");
						this.screenLines = [...event.screen];
						
						// Log current screen content for debugging
						const screenText = event.screen.map(line => 
							line.map(item => item.lexeme).join('')
						);
						console.log(this.logPrefix, "Current screen content:");
						screenText.forEach((line, i) => {
							if (line.trim()) {
								console.log(this.logPrefix, `  Line ${i}:`, JSON.stringify(line));
							}
						});
					}
					break;
					
				case 'newLines':
					if (event.lines) {
						console.log(this.logPrefix, "New lines added:", event.lines.length);
						this.screenLines.push(...event.lines);
						
						// Log new lines content
						event.lines.forEach((line, i) => {
							const lineText = line.map(item => item.lexeme).join('');
							if (lineText.trim()) {
								console.log(this.logPrefix, `  New line ${i}:`, JSON.stringify(lineText));
							}
						});
					}
					break;
					
				case 'patch':
					if (event.line !== undefined && event.items) {
						console.log(this.logPrefix, "Patching line", event.line, "with", event.items.length, "items");
						// Ensure we have enough lines
						while (this.screenLines.length <= event.line) {
							this.screenLines.push([]);
						}
						this.screenLines[event.line] = [...event.items];
						
						// Log patched line content
						const lineText = event.items.map(item => item.lexeme).join('');
						console.log(this.logPrefix, `  Patched line ${event.line}:`, JSON.stringify(lineText));
					}
					break;
			}
		}
		
		// Get current TUI lines for CLI agents library
		const tuiLines = this.getCurrentTuiLines();
		console.log(this.logPrefix, "Extracted", tuiLines.length, "TUI lines for CLI agents:");
		tuiLines.forEach((line, i) => {
			if (line.content.trim()) {
				console.log(this.logPrefix, `  TUI[${i}]:`, JSON.stringify(line.content));
			}
		});
		
		// Emit screen update event
		this.emit('screenUpdate', tuiLines);
		
		// Check for task completion patterns
		this.checkForTaskCompletion();
	}
	
	private async initializeClaudeCode(prompt: string): Promise<void> {
		if (!this.terminalId) {
			console.error(this.logPrefix, "No terminal ID available for Claude Code initialization");
			return;
		}
		
		console.log(this.logPrefix, "Checking if Claude Code is available...");
		// Check if claude is available
		await headlessTerminalAPI.sendCommand(this.terminalId, "which claude");
		await this.delay(1000);
		
		console.log(this.logPrefix, "Getting current working directory...");
		// Get the current working directory
		await headlessTerminalAPI.sendCommand(this.terminalId, "pwd");
		await this.delay(500);
		
		// Start Claude Code with the prompt
		const claudeCommand = `claude "${prompt.replace(/"/g, '\\"')}"`;
		console.log(this.logPrefix, "Starting Claude Code with command:", claudeCommand);
		await headlessTerminalAPI.sendCommand(this.terminalId, claudeCommand);
		
		console.log(this.logPrefix, "Claude Code command sent, emitting taskStarted event");
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