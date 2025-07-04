import {
	TerminalSpec,
	TerminalEvent,
	LineItem,
	CustomTerminalAPI,
} from "./CustomTerminalAPI";
import { EventEmitter } from "../utils/EventEmitter";
import { OsSession } from "../bindings/os";

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
	type: "char" | "ctrl" | "alt" | "special";
	value: string;
}

/**
 * Claude Code Agent that manages interaction with the Claude Code CLI tool
 * through the custom terminal system. This provides a bridge between the
 * text area UI and the headless CLI agents library.
 */
export class ClaudeCodeAgent extends CustomTerminalAPI {
	private eventEmitter: EventEmitter;
	private isRunning = false;
	private currentTask: string | null = null;
	private currentPrompt: string | null = null;
	private screenLines: LineItem[][] = [];
	private startTime: number = 0;
	private logPrefix: string;
	private hasSeenTryPrompt = false;
	private hasSeenTrustPrompt = false;
	private isProcessingEvents = false;
	private eventQueue: TerminalEvent[][] = [];
	private lastActivityTime: number = 0;
	private completionTimeoutId: NodeJS.Timeout | null = null;
	
	// New state variables for session reuse
	private isClaudeRunning = false;
	private isWaitingForPrompt = false;
	private sessionStartTime: number = 0;

	constructor() {
		super();
		this.eventEmitter = new EventEmitter();
		this.logPrefix = `[ClaudeCodeAgent-${Date.now().toString(36)}]`;
		console.log(this.logPrefix, "Created new ClaudeCodeAgent instance");
		console.log(
			this.logPrefix,
			"resizeTerminal method:",
			this.resizeTerminal.toString(),
		);
	}

	// EventEmitter methods delegation
	on(event: string, listener: (...args: any[]) => void): void {
		this.eventEmitter.on(event, listener);
	}

	off(event: string, listener: (...args: any[]) => void): void {
		this.eventEmitter.off(event, listener);
	}

	emit(event: string, ...args: any[]): void {
		this.eventEmitter.emit(event, ...args);
	}

	removeAllListeners(): void {
		this.eventEmitter.removeAllListeners();
	}

	/**
	 * Override resizeTerminal to enforce 24x80 size
	 */
	async resizeTerminal(id: string, lines: number, cols: number): Promise<void> {
		await super.resizeTerminal(id, 24, 80);
	}

	/**
	 * Start a new Claude Code task
	 */
	async startTask(
		osSession: OsSession,
		prompt: string,
		onTerminalReady?: (terminalId: string) => void,
	): Promise<void> {
		console.log(
			this.logPrefix,
			"Starting Claude Code task with prompt:",
			prompt,
		);

		if (this.isRunning) {
			const error = "Claude Code task is already running";
			console.error(this.logPrefix, "❌", error);
			throw new Error(error);
		}

		// Check if Claude session is already running and waiting for prompt
		if (this.isClaudeRunning && this.isWaitingForPrompt && this.terminalId) {
			console.log(this.logPrefix, "🔄 Reusing existing Claude session");
			return this.submitNewTaskToExistingSession(prompt, onTerminalReady);
		}

		this.isRunning = true;
		this.currentTask = prompt;
		this.currentPrompt = prompt;
		this.startTime = Date.now();
		this.screenLines = [];
		this.hasSeenTryPrompt = false;

		try {
			console.log(this.logPrefix, "Connecting terminal...");
			await this.connectTerminal(osSession);
			console.log(
				this.logPrefix,
				"Terminal connected with ID:",
				this.terminalId,
			);

			// Set up event listeners
			console.log(this.logPrefix, "Setting up terminal listeners...");
			this.setupTerminalListeners();

			// Notify that terminal is ready
			console.log(this.logPrefix, "Notifying terminal ready callback...");
			onTerminalReady?.(this.terminalId!);

			// Wait a bit for terminal to be fully ready
			console.log(this.logPrefix, "Waiting 1000ms for terminal to be ready...");
			await this.delay(1000);

			// Check if Claude Code is installed and start the process
			console.log(this.logPrefix, "Initializing Claude Code...");
			await this.initializeClaudeCode();
		} catch (error) {
			console.error(this.logPrefix, "Error starting task:", error);
			this.isRunning = false;
			this.cleanup();
			this.emit(
				"taskError",
				error instanceof Error ? error.message : String(error),
			);
			throw error;
		}
	}

	/**
	 * Submit a new task to an existing Claude session
	 */
	private async submitNewTaskToExistingSession(
		prompt: string,
		onTerminalReady?: (terminalId: string) => void,
	): Promise<void> {
		console.log(this.logPrefix, "Submitting new task to existing Claude session");
		
		this.isRunning = true;
		this.currentTask = prompt;
		this.currentPrompt = prompt;
		this.startTime = Date.now();
		this.isWaitingForPrompt = false;
		this.hasSeenTryPrompt = false; // Reset for new task

		// Notify that terminal is ready (reusing existing terminal)
		onTerminalReady?.(this.terminalId!);

		// Send the prompt directly since Claude is already at Try prompt
		console.log(this.logPrefix, "Sending new prompt to existing session:", prompt);
		
		// Send the prompt key by key, simulating typing
		for (const char of prompt) {
			if (char === "\n") {
				await this.sendRawInput(this.terminalId!, "\\");
				await this.delay(Math.random() * 50 + 50);
				await this.sendRawInput(this.terminalId!, "\r");
			} else {
				await this.sendRawInput(this.terminalId!, char);
			}
			await this.delay(Math.random() * 50 + 50);
		}
		await this.delay(Math.random() * 500 + 500);
		await this.sendRawInput(this.terminalId!, "\r");

		this.emit("taskStarted", {
			prompt: this.currentPrompt,
			terminalId: this.terminalId,
		});
	}

	/**
	 * Stop the current Claude Code task
	 */
	async stopTask(): Promise<void> {
		if (!this.isRunning || !this.terminalId) return;

		try {
			// Send Ctrl+C to interrupt the current task
			await this.sendCtrlC(this.terminalId);

			// Wait a bit for the interruption to take effect
			await this.delay(500);

			// Don't kill the terminal - keep Claude session alive
			// await this.killTerminal(this.terminalId);
		} catch (error) {
			console.error("Error stopping Claude Code task:", error);
		} finally {
			// Mark current task as finished but keep session alive
			this.isRunning = false;
			this.currentTask = null;
			this.currentPrompt = null;
			// Don't reset screenLines - keep terminal display
			// this.screenLines = [];
			
			// Session is still running, just waiting for next prompt
			this.isWaitingForPrompt = true;
			
			this.emit("taskStopped");
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

		return this.screenLines.slice(-terminalHeight).map((line, index) => ({
			content: line.map((item) => item.lexeme).join(""),
			timestamp:
				Date.now() -
				(this.screenLines.slice(-terminalHeight).length - index) * 100,
		}));
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
			elapsed: Date.now() - this.startTime,
		};
	}

	/**
	 * Check if Claude session is ready for reuse
	 */
	isSessionReady(): boolean {
		return this.isClaudeRunning && this.isWaitingForPrompt && !this.isRunning;
	}

	/**
	 * Get session information
	 */
	getSessionInfo(): { isRunning: boolean; isWaitingForPrompt: boolean; sessionElapsed: number } | null {
		if (!this.isClaudeRunning) return null;

		return {
			isRunning: this.isClaudeRunning,
			isWaitingForPrompt: this.isWaitingForPrompt,
			sessionElapsed: this.sessionStartTime ? Date.now() - this.sessionStartTime : 0,
		};
	}

	/**
	 * Clean up resources
	 */
	async cleanup(forceTerminalKill: boolean = false): Promise<void> {
		// Only kill terminal if explicitly requested or if session is not reusable
		if (forceTerminalKill || !this.isClaudeRunning) {
			if (this.terminalId) {
				try {
					await this.killTerminal(this.terminalId);
				} catch (error) {
					console.error("Error killing terminal:", error);
				}
			}
			super.cleanup();
			this.isClaudeRunning = false;
			this.isWaitingForPrompt = false;
			this.sessionStartTime = 0;
		}

		// Always clean up task-specific state
		this.isRunning = false;
		this.currentTask = null;
		this.currentPrompt = null;
		this.hasSeenTryPrompt = false;
		this.hasSeenTrustPrompt = false;
		this.isProcessingEvents = false;
		this.eventQueue = [];
		this.lastActivityTime = 0;
		if (this.completionTimeoutId) {
			clearTimeout(this.completionTimeoutId);
			this.completionTimeoutId = null;
		}
		
		// Only remove all listeners if we're doing a full cleanup
		if (forceTerminalKill) {
			this.removeAllListeners();
		}
	}

	// Private methods

	private setupTerminalListeners(): void {
		if (!this.terminalId) return;

		this.onTerminalEvent(this.terminalId, (events: TerminalEvent[]) => {
			this.queueEventBatch(events);
		});
	}

	private queueEventBatch(events: TerminalEvent[]): void {
		this.eventQueue.push(events);
		this.processEventQueue();
	}

	private async processEventQueue(): Promise<void> {
		if (this.isProcessingEvents || this.eventQueue.length === 0) {
			return;
		}

		this.isProcessingEvents = true;

		try {
			while (this.eventQueue.length > 0) {
				const events = this.eventQueue.shift()!;
				await this.handleTerminalEvents(events);
			}
		} catch (error) {
			console.error(this.logPrefix, "Error processing event queue:", error);
		} finally {
			this.isProcessingEvents = false;
		}
	}

	private async handleTerminalEvents(events: TerminalEvent[]): Promise<void> {
		// console.log(this.logPrefix, "Received", events.length, "terminal events");

		for (const event of events) {
			// console.log(this.logPrefix, "Processing event:", event.type);

			switch (event.type) {
				case "screenUpdate":
					if (event.screen) {
						// console.log(
						// 	this.logPrefix,
						// 	"Screen update - new screen has",
						// 	event.screen.length,
						// 	"lines",
						// );
						this.screenLines = [...event.screen];

						// Log current screen content for debugging
						// const screenText = event.screen.map((line) =>
						// 	line.map((item) => item.lexeme).join(""),
						// );
						// console.log(this.logPrefix, "Current screen content:");
						// screenText.forEach((line, i) => {
						// 	if (line.trim()) {
						// 		console.log(
						// 			this.logPrefix,
						// 			`  Line ${i}:`,
						// 			JSON.stringify(line),
						// 		);
						// 	}
						// });
					}
					break;

				case "newLines":
					if (event.lines) {
						// console.log(this.logPrefix, "New lines added:", event.lines.length);
						this.screenLines.push(...event.lines);

						// Log new lines content
						event.lines.forEach((line, i) => {
							const lineText = line.map((item) => item.lexeme).join("");
							if (lineText.trim()) {
								// console.log(
								// 	this.logPrefix,
								// 	`  New line ${i}:`,
								// 	JSON.stringify(lineText),
								// );
							}
						});
					}
					break;

				case "patch":
					if (event.line !== undefined && event.items) {
						// console.log(
						// 	this.logPrefix,
						// 	"Patching line",
						// 	event.line,
						// 	"with",
						// 	event.items.length,
						// 	"items",
						// );
						// Ensure we have enough lines
						while (this.screenLines.length <= event.line) {
							this.screenLines.push([]);
						}
						this.screenLines[event.line] = [...event.items];

						// Log patched line content
						const lineText = event.items.map((item) => item.lexeme).join("");
						// console.log(
						// 	this.logPrefix,
						// 	`  Patched line ${event.line}:`,
						// 	JSON.stringify(lineText),
						// );
					}
					break;
			}
		}

		// Update last activity time
		this.lastActivityTime = Date.now();
		this.resetCompletionTimeout();

		// Get current TUI lines for CLI agents library
		const tuiLines = this.getCurrentTuiLines();
		// Emit screen update event
		this.emit("screenUpdate", tuiLines);

		// Process TUI interactions based on new lines
		await this.processTuiInteraction(tuiLines);
	}

	private async initializeClaudeCode(): Promise<void> {
		console.log(this.logPrefix, "initializeClaudeCode() method called");
		
		if (!this.terminalId) {
			console.error(
				this.logPrefix,
				"No terminal ID available for Claude Code initialization",
			);
			return;
		}

		console.log(this.logPrefix, "Terminal ID confirmed:", this.terminalId);

		try {
			console.log(this.logPrefix, "Checking if Claude Code is available...");
			// Check if claude is available
			await this.sendInputLines(this.terminalId, ["which claude"]);
			console.log(this.logPrefix, "Successfully sent 'which claude', waiting 1000ms...");
			await this.delay(1000);

			console.log(this.logPrefix, "Getting current working directory...");
			// Get the current working directory
			await this.sendInputLines(this.terminalId, ["pwd"]);
			console.log(this.logPrefix, "Successfully sent 'pwd', waiting 500ms...");
			await this.delay(500);

			// Start Claude Code without prompt initially
			const claudeCommand = "claude";
			console.log(
				this.logPrefix,
				"Starting Claude Code with command:",
				claudeCommand,
			);
			await this.sendInputLines(this.terminalId, [claudeCommand]);
			console.log(this.logPrefix, "Successfully sent claude command, waiting for terminal events...");
			
			// Mark Claude session as started
			this.isClaudeRunning = true;
			this.sessionStartTime = Date.now();
			
			console.log(this.logPrefix, "Emitting taskStarted event...");
			this.emit("taskStarted", {
				prompt: this.currentPrompt,
				terminalId: this.terminalId,
			});
			console.log(this.logPrefix, "taskStarted event emitted successfully");
			
			// Start a periodic check to see if we're getting ANY terminal events
			this.startPeriodicEventCheck();
		} catch (error) {
			console.error(this.logPrefix, "Error during Claude Code initialization:", error);
			throw error;
		}
	}

	private startPeriodicEventCheck(): void {
		console.log(this.logPrefix, "Starting periodic event check...");
		let checkCount = 0;
		const maxChecks = 20; // Check for 20 seconds
		
		const checkInterval = setInterval(async () => {
			checkCount++;
			console.log(this.logPrefix, `Event check ${checkCount}/${maxChecks}: screenLines length = ${this.screenLines.length}`);
			
			if (this.screenLines.length > 0) {
				console.log(this.logPrefix, "📺 Current screen content:");
				this.screenLines.slice(-5).forEach((line, i) => {
					const lineText = line.map(item => item.lexeme).join("");
					if (lineText.trim()) {
						console.log(this.logPrefix, `  Line ${i}:`, JSON.stringify(lineText));
					}
				});
				// Events are working, stop checking
				clearInterval(checkInterval);
				return;
			} else {
				console.log(this.logPrefix, "📺 No screen content yet");
				
				// Mac workaround: Try sending a harmless command to force terminal activity
				if (checkCount === 3 && this.terminalId) {
					console.log(this.logPrefix, "🔧 Mac workaround: Sending harmless command to wake up terminal...");
					try {
						await this.sendRawInput(this.terminalId, " "); // Just a space
						await this.delay(100);
						await this.sendRawInput(this.terminalId, "\b"); // Backspace to remove it
					} catch (error) {
						console.log(this.logPrefix, "Failed to send wake-up command:", error);
					}
				}
				
				// Try pressing Enter after 5 seconds to trigger any waiting prompts
				if (checkCount === 5 && this.terminalId) {
					console.log(this.logPrefix, "🔧 Mac workaround: Sending Enter to trigger any waiting prompts...");
					try {
						await this.sendRawInput(this.terminalId, "\r");
					} catch (error) {
						console.log(this.logPrefix, "Failed to send Enter:", error);
					}
				}
			}
			
			if (checkCount >= maxChecks) {
				console.log(this.logPrefix, "❌ Event check timeout - no terminal events received after 20 seconds");
				console.log(this.logPrefix, "This appears to be a Mac-specific terminal event system issue");
				clearInterval(checkInterval);
			}
		}, 1000);
	}

	private async sendSingleKey(key: KeyboardKey): Promise<void> {
		if (!this.terminalId) return;

		let keyData: string;

		switch (key.type) {
			case "char":
				keyData = key.value;
				break;
			case "ctrl":
				if (key.value.toLowerCase() === "c") {
					await this.sendCtrlC(this.terminalId);
					return;
				} else if (key.value.toLowerCase() === "d") {
					await this.sendCtrlD(this.terminalId);
					return;
				}
				keyData = String.fromCharCode(
					key.value.toUpperCase().charCodeAt(0) - 64,
				);
				break;
			case "special":
				switch (key.value) {
					case "Enter":
						keyData = "\r";
						break;
					case "Backspace":
						keyData = "\b";
						break;
					case "Tab":
						keyData = "\t";
						break;
					case "Escape":
						keyData = "\x1b";
						break;
					case "ArrowUp":
						keyData = "\x1b[A";
						break;
					case "ArrowDown":
						keyData = "\x1b[B";
						break;
					case "ArrowLeft":
						keyData = "\x1b[D";
						break;
					case "ArrowRight":
						keyData = "\x1b[C";
						break;
					default:
						keyData = key.value;
				}
				break;
			default:
				keyData = key.value;
		}

		await this.sendRawInput(this.terminalId, keyData);
	}

	private resetCompletionTimeout(): void {
		if (this.completionTimeoutId) {
			clearTimeout(this.completionTimeoutId);
		}

		// Only set timeout if we've seen the Try prompt (task has started)
		if (this.hasSeenTryPrompt) {
			this.completionTimeoutId = setTimeout(() => {
				this.handleTaskCompletion();
			}, 5000); // 5 seconds of inactivity
		}
	}

	private async handleTaskCompletion(): Promise<void> {
		if (!this.terminalId || !this.hasSeenTryPrompt) return;

		console.log(
			this.logPrefix,
			"Task appears to be complete after 5 seconds of inactivity, sending Ctrl+D twice...",
		);

		try {
			await this.sendCtrlD(this.terminalId);
			await this.delay(Math.random() * 500 + 500);
			await this.sendCtrlD(this.terminalId);

			const elapsed = Date.now() - this.startTime;
			this.emit("taskCompleted", {
				prompt: this.currentPrompt,
				elapsed,
			});
			
			// Mark task as finished but keep session alive
			this.isRunning = false;
			this.currentTask = null;
			this.currentPrompt = null;
			this.hasSeenTryPrompt = false;
			
			// Session is now waiting for next prompt
			this.isWaitingForPrompt = true;
		} catch (error) {
			console.error(
				this.logPrefix,
				"Error sending completion sequence:",
				error,
			);
		}
	}

	private async processTuiInteraction(tuiLines: TuiLine[]): Promise<void> {
		if (!this.terminalId) return;

		// Extract all new line content from the events
		let newLines: string[] = tuiLines.map((tuiLine) => tuiLine.content);

		newLines = newLines.map((line) => line.replaceAll(" ", " "));

		// console.log(this.logPrefix, "Analyzing new lines for TUI interactions:");
		// newLines.forEach((line, i) => {
		// 	if (line.trim()) {
		// 		console.log(this.logPrefix, `  Line ${i}:`, JSON.stringify(line));
		// 	}
		// });

		// Check for trust folder confirmation
		const hasEnterToConfirm = newLines.some((line) =>
			line.includes("Enter to confirm"),
		);
		const hasTrustQuestion = newLines.some((line) =>
			line.includes("Do you trust the files in this folder?"),
		);

		if (hasEnterToConfirm && hasTrustQuestion && !this.hasSeenTrustPrompt) {
			console.log(
				this.logPrefix,
				"Found trust confirmation prompt, sending Enter...",
			);
			await this.delay(Math.random() * 500 + 500);
			await this.sendRawInput(this.terminalId, "\r");
			this.hasSeenTrustPrompt = true;
			return;
		}

		// Check for "Yes, and don't ask again this session (shift+tab)"
		const hasShiftTabOption = newLines.some((line) =>
			line.includes("Yes, and don't ask again this session (shift+tab)"),
		);
		if (hasShiftTabOption) {
			console.log(
				this.logPrefix,
				"Found 'don't ask again' option, sending Shift+Tab...",
			);
			await this.sendRawInput(this.terminalId, "\x1b[Z"); // Shift+Tab sequence
			return;
		}

		// Check for "│ > Try" prompt (first time only)
		const hasTryPrompt = newLines.some((line) => line.includes("│ > Try"));
		if (hasTryPrompt && !this.hasSeenTryPrompt && this.currentPrompt) {
			console.log(
				this.logPrefix,
				"Found 'Try' prompt, sending task prompt:",
				this.currentPrompt,
			);
			this.hasSeenTryPrompt = true;
			// Send the prompt key by key, simulating typing
			for (const char of this.currentPrompt) {
				if (char === "\n") {
					await this.sendRawInput(this.terminalId, "\\");
					await this.delay(Math.random() * 50 + 50);
					await this.sendRawInput(this.terminalId, "\r");
				} else {
					await this.sendRawInput(this.terminalId, char);
				}
				await this.delay(Math.random() * 50 + 50);
			}
			await this.delay(Math.random() * 500 + 500);
			await this.sendRawInput(this.terminalId, "\r");
			return;
		}

		// Check if Claude has returned to Try prompt after task completion (session reuse)
		if (hasTryPrompt && this.isWaitingForPrompt && !this.isRunning) {
			console.log(
				this.logPrefix,
				"Claude has returned to Try prompt - session ready for next task",
			);
			this.emit("sessionReady");
			return;
		}

		// Check for "esc to interrupt" - do nothing
		const hasEscToInterrupt = newLines.some((line) =>
			line.includes("esc to interrupt"),
		);
		if (hasEscToInterrupt) {
			// console.log(this.logPrefix, "Found 'esc to interrupt', waiting...");
			return;
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
