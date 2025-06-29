import {
	TerminalSpec,
	TerminalEvent,
	LineItem,
	CustomTerminalAPI,
} from "./CustomTerminalAPI";
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
		prompt: string,
		terminalSpec: TerminalSpec,
		onTerminalReady?: (terminalId: string) => void,
	): Promise<void> {
		console.log(
			this.logPrefix,
			"Starting Claude Code task with prompt:",
			prompt,
		);
		console.log(
			this.logPrefix,
			"Terminal spec:",
			JSON.stringify(terminalSpec, null, 2),
		);

		if (this.isRunning) {
			const error = "Claude Code task is already running";
			console.error(this.logPrefix, "❌", error);
			throw new Error(error);
		}

		this.isRunning = true;
		this.currentTask = prompt;
		this.currentPrompt = prompt;
		this.startTime = Date.now();
		this.screenLines = [];
		this.hasSeenTryPrompt = false;

		try {
			console.log(this.logPrefix, "Connecting terminal with spec...");
			// Connect terminal using inherited method with fixed size
			const fixedSpec = { ...terminalSpec, lines: 24, cols: 60 };
			await this.connectTerminal(fixedSpec);
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
	 * Stop the current Claude Code task
	 */
	async stopTask(): Promise<void> {
		if (!this.isRunning || !this.terminalId) return;

		try {
			// Send Ctrl+C to interrupt
			await this.sendCtrlC(this.terminalId);

			// Wait a bit then clean up
			await this.delay(500);

			await this.killTerminal(this.terminalId);
		} catch (error) {
			console.error("Error stopping Claude Code task:", error);
		} finally {
			this.isRunning = false;
			this.currentTask = null;
			this.screenLines = [];
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
	 * Clean up resources
	 */
	async cleanup(): Promise<void> {
		if (this.terminalId) {
			try {
				await this.killTerminal(this.terminalId);
			} catch (error) {
				console.error("Error killing terminal:", error);
			}
		}

		super.cleanup();
		this.isRunning = false;
		this.currentTask = null;
		this.currentPrompt = null;
		this.screenLines = [];
		this.hasSeenTryPrompt = false;
		this.removeAllListeners();
	}

	// Private methods

	private setupTerminalListeners(): void {
		if (!this.terminalId) return;

		this.onTerminalEvent(this.terminalId, (events: TerminalEvent[]) => {
			this.handleTerminalEvents(events).catch((error) => {
				console.error(this.logPrefix, "Error handling terminal events:", error);
			});
		});
	}

	private async handleTerminalEvents(events: TerminalEvent[]): Promise<void> {
		console.log(this.logPrefix, "Received", events.length, "terminal events");

		for (const event of events) {
			console.log(this.logPrefix, "Processing event:", event.type);

			switch (event.type) {
				case "screenUpdate":
					if (event.screen) {
						console.log(
							this.logPrefix,
							"Screen update - new screen has",
							event.screen.length,
							"lines",
						);
						this.screenLines = [...event.screen];

						// Log current screen content for debugging
						const screenText = event.screen.map((line) =>
							line.map((item) => item.lexeme).join(""),
						);
						console.log(this.logPrefix, "Current screen content:");
						screenText.forEach((line, i) => {
							if (line.trim()) {
								console.log(
									this.logPrefix,
									`  Line ${i}:`,
									JSON.stringify(line),
								);
							}
						});
					}
					break;

				case "newLines":
					if (event.lines) {
						console.log(this.logPrefix, "New lines added:", event.lines.length);
						this.screenLines.push(...event.lines);

						// Log new lines content
						event.lines.forEach((line, i) => {
							const lineText = line.map((item) => item.lexeme).join("");
							if (lineText.trim()) {
								console.log(
									this.logPrefix,
									`  New line ${i}:`,
									JSON.stringify(lineText),
								);
							}
						});
					}
					break;

				case "patch":
					if (event.line !== undefined && event.items) {
						console.log(
							this.logPrefix,
							"Patching line",
							event.line,
							"with",
							event.items.length,
							"items",
						);
						// Ensure we have enough lines
						while (this.screenLines.length <= event.line) {
							this.screenLines.push([]);
						}
						this.screenLines[event.line] = [...event.items];

						// Log patched line content
						const lineText = event.items.map((item) => item.lexeme).join("");
						console.log(
							this.logPrefix,
							`  Patched line ${event.line}:`,
							JSON.stringify(lineText),
						);
					}
					break;
			}
		}

		// Get current TUI lines for CLI agents library
		const tuiLines = this.getCurrentTuiLines();
		// Emit screen update event
		this.emit("screenUpdate", tuiLines);

		// Process TUI interactions based on new lines
		await this.processTuiInteraction(tuiLines);

		// Check for task completion patterns
		this.checkForTaskCompletion();
	}

	private async initializeClaudeCode(): Promise<void> {
		if (!this.terminalId) {
			console.error(
				this.logPrefix,
				"No terminal ID available for Claude Code initialization",
			);
			return;
		}

		console.log(this.logPrefix, "Checking if Claude Code is available...");
		// Check if claude is available
		await this.sendInputLines(this.terminalId, ["which claude"]);
		await this.delay(1000);

		console.log(this.logPrefix, "Getting current working directory...");
		// Get the current working directory
		await this.sendInputLines(this.terminalId, ["pwd"]);
		await this.delay(500);

		// Start Claude Code without prompt initially
		const claudeCommand = "claude";
		console.log(
			this.logPrefix,
			"Starting Claude Code with command:",
			claudeCommand,
		);
		await this.sendInputLines(this.terminalId, [claudeCommand]);

		console.log(this.logPrefix, "Claude Code command sent");
		this.emit("taskStarted", {
			prompt: this.currentPrompt,
			terminalId: this.terminalId,
		});
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

	private checkForTaskCompletion(): void {
		if (!this.terminalId) return;

		try {
			const recentLines = this.screenLines
				.slice(-5)
				.map((line) => line.map((item) => item.lexeme).join(""));
			const recentText = recentLines.join("\n").toLowerCase();

			// Look for common completion patterns
			if (
				recentText.includes("task completed") ||
				recentText.includes("✓") ||
				recentText.includes("finished") ||
				recentText.includes("done") ||
				(recentText.includes("$") && !this.hasRecentActivity())
			) {
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
				file_changes: [], // Would need to compute actual file changes
			},
		};

		this.isRunning = false;
	}

	private async processTuiInteraction(tuiLines: TuiLine[]): Promise<void> {
		if (!this.terminalId) return;

		// Extract all new line content from the events
		let newLines: string[] = tuiLines.map((tuiLine) => tuiLine.content);

		newLines = newLines.map((line) => line.replaceAll(" ", " "));

		console.log(this.logPrefix, "Analyzing new lines for TUI interactions:");
		newLines.forEach((line, i) => {
			if (line.trim()) {
				console.log(this.logPrefix, `  Line ${i}:`, JSON.stringify(line));
			}
		});

		// Check for trust folder confirmation
		const hasEnterToConfirm = newLines.some((line) =>
			line.includes("Enter to confirm"),
		);
		const hasTrustQuestion = newLines.some((line) =>
			line.includes("Do you trust the files in this folder?"),
		);

		if (hasEnterToConfirm && hasTrustQuestion) {
			console.log(
				this.logPrefix,
				"Found trust confirmation prompt, sending Enter...",
			);
			await this.sendRawInput(this.terminalId, "\r");
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
			await this.sendRawInput(this.terminalId, this.currentPrompt);
			await this.delay(1000);
			await this.sendRawInput(this.terminalId, "\r");
			return;
		}

		// Check for task completion: "│ > " without "Try"
		const hasPromptWithoutTry = newLines.some(
			(line) => line.includes("│ > ") && !line.includes("│ > Try"),
		);
		if (hasPromptWithoutTry && this.hasSeenTryPrompt) {
			console.log(
				this.logPrefix,
				"Task appears to be complete, sending Ctrl+D twice...",
			);
			await this.sendCtrlD(this.terminalId);
			await this.delay(1000);
			await this.sendCtrlD(this.terminalId);
			return;
		}

		// Check for "esc to interrupt" - do nothing
		const hasEscToInterrupt = newLines.some((line) =>
			line.includes("esc to interrupt"),
		);
		if (hasEscToInterrupt) {
			console.log(this.logPrefix, "Found 'esc to interrupt', waiting...");
			return;
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
