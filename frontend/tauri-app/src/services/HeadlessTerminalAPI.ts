import { customTerminalAPI, TerminalSpec, TerminalEvent, LineItem } from "./CustomTerminalAPI";

export interface HeadlessTerminalSession {
	id: string;
	spec: TerminalSpec;
	isActive: boolean;
	startTime: number;
	lastActivity: number;
}

export interface TerminalScreenState {
	lines: LineItem[][];
	cursorLine: number;
	cursorCol: number;
	totalLines: number;
}

/**
 * Enhanced CustomTerminalAPI that provides headless operation capabilities
 * while maintaining compatibility with the existing CustomTerminalRenderer.
 * 
 * This API can operate terminals without requiring the CustomTerminalRenderer
 * to exist, making it suitable for headless automation scenarios.
 */
export class HeadlessTerminalAPI {
	private sessions = new Map<string, HeadlessTerminalSession>();
	private screenStates = new Map<string, TerminalScreenState>();
	private eventCallbacks = new Map<string, (events: TerminalEvent[]) => void>();
	private logPrefix = "[HeadlessTerminalAPI]";
	
	constructor() {
		console.log(this.logPrefix, "🏗️ HeadlessTerminalAPI initialized");
	}
	
	/**
	 * Create a new headless terminal session
	 * Ensures minimum 24 rows x 80 cols for WSL compatibility
	 */
	async createSession(spec: TerminalSpec): Promise<string> {
		// Ensure minimum dimensions for WSL compatibility
		const enhancedSpec: TerminalSpec = {
			...spec,
			lines: Math.max(24, spec.lines),
			cols: Math.max(80, spec.cols)
		};
		
		console.log(this.logPrefix, "🚀 Creating terminal session with spec:", JSON.stringify(enhancedSpec, null, 2));
		
		try {
			const terminalId = await customTerminalAPI.connectTerminal(enhancedSpec);
			console.log(this.logPrefix, "✅ Terminal connected with ID:", terminalId);
			
			const session: HeadlessTerminalSession = {
				id: terminalId,
				spec: enhancedSpec,
				isActive: true,
				startTime: Date.now(),
				lastActivity: Date.now()
			};
			
			this.sessions.set(terminalId, session);
			this.screenStates.set(terminalId, {
				lines: [],
				cursorLine: 0,
				cursorCol: 0,
				totalLines: 0
			});
			
			console.log(this.logPrefix, "📊 Session state initialized for:", terminalId);
			
			// Set up event monitoring
			console.log(this.logPrefix, "👂 Setting up event monitoring...");
			await this.setupEventMonitoring(terminalId);
			
			console.log(this.logPrefix, "🎉 Session created successfully:", terminalId);
			return terminalId;
		} catch (error) {
			console.error(this.logPrefix, "💥 Failed to create session:", error);
			throw new Error(`Failed to create headless terminal session: ${error}`);
		}
	}
	
	/**
	 * Send a complete command to the terminal
	 */
	async sendCommand(sessionId: string, command: string): Promise<void> {
		console.log(this.logPrefix, "📝 Sending command to session", sessionId.slice(0, 8) + "...:", command);
		
		if (!this.isSessionActive(sessionId)) {
			const error = `Session ${sessionId} is not active`;
			console.error(this.logPrefix, "❌", error);
			throw new Error(error);
		}
		
		await customTerminalAPI.sendRawInput(sessionId, command + "\n");
		this.updateLastActivity(sessionId);
		console.log(this.logPrefix, "✅ Command sent successfully");
	}
	
	/**
	 * Send raw input to the terminal
	 */
	async sendRawInput(sessionId: string, input: string): Promise<void> {
		if (!this.isSessionActive(sessionId)) {
			throw new Error(`Session ${sessionId} is not active`);
		}
		
		await customTerminalAPI.sendRawInput(sessionId, input);
		this.updateLastActivity(sessionId);
	}
	
	/**
	 * Send keyboard sequence to terminal
	 */
	async sendKeySequence(sessionId: string, keys: string[]): Promise<void> {
		if (!this.isSessionActive(sessionId)) {
			throw new Error(`Session ${sessionId} is not active`);
		}
		
		for (const key of keys) {
			let rawInput: string;
			
			switch (key) {
				case 'Enter': rawInput = '\r'; break;
				case 'Tab': rawInput = '\t'; break;
				case 'Escape': rawInput = '\x1b'; break;
				case 'Backspace': rawInput = '\b'; break;
				case 'Ctrl+C': rawInput = '\x03'; break;
				case 'Ctrl+D': rawInput = '\x04'; break;
				case 'ArrowUp': rawInput = '\x1b[A'; break;
				case 'ArrowDown': rawInput = '\x1b[B'; break;
				case 'ArrowLeft': rawInput = '\x1b[D'; break;
				case 'ArrowRight': rawInput = '\x1b[C'; break;
				default:
					rawInput = key; // Regular character
			}
			
			await customTerminalAPI.sendRawInput(sessionId, rawInput);
			// Small delay between keys to avoid overwhelming
			await this.delay(10);
		}
		
		this.updateLastActivity(sessionId);
	}
	
	/**
	 * Get the current screen state (last N lines where N is terminal height)
	 */
	getCurrentScreen(sessionId: string): LineItem[][] {
		const state = this.screenStates.get(sessionId);
		if (!state) {
			throw new Error(`Session ${sessionId} not found`);
		}
		
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}
		
		// Return the last N lines where N is the terminal height
		const terminalHeight = session.spec.lines;
		return state.lines.slice(-terminalHeight);
	}
	
	/**
	 * Get current screen as text lines
	 */
	getCurrentScreenText(sessionId: string): string[] {
		const screenLines = this.getCurrentScreen(sessionId);
		return screenLines.map(line => 
			line.map(item => item.lexeme).join('')
		);
	}
	
	/**
	 * Wait for specific text to appear in the terminal output
	 */
	async waitForText(sessionId: string, text: string, timeoutMs: number = 30000): Promise<boolean> {
		return new Promise((resolve) => {
			const startTime = Date.now();
			
			const checkForText = () => {
				try {
					const screenText = this.getCurrentScreenText(sessionId).join('\n');
					if (screenText.includes(text)) {
						resolve(true);
						return;
					}
				} catch (error) {
					resolve(false);
					return;
				}
				
				if (Date.now() - startTime > timeoutMs) {
					resolve(false);
					return;
				}
				
				setTimeout(checkForText, 100);
			};
			
			checkForText();
		});
	}
	
	/**
	 * Wait for terminal to be idle (no new output for specified duration)
	 */
	async waitForIdle(sessionId: string, idleDurationMs: number = 2000): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new Error(`Session ${sessionId} not found`);
		}
		
		return new Promise((resolve) => {
			const checkIdle = () => {
				const timeSinceActivity = Date.now() - session.lastActivity;
				if (timeSinceActivity >= idleDurationMs) {
					resolve();
				} else {
					setTimeout(checkIdle, 100);
				}
			};
			
			checkIdle();
		});
	}
	
	/**
	 * Set up a callback for terminal events
	 */
	onTerminalEvents(sessionId: string, callback: (events: TerminalEvent[]) => void): void {
		this.eventCallbacks.set(sessionId, callback);
	}
	
	/**
	 * Remove event callback
	 */
	removeEventCallback(sessionId: string): void {
		this.eventCallbacks.delete(sessionId);
	}
	
	/**
	 * Check if session is active
	 */
	isSessionActive(sessionId: string): boolean {
		const session = this.sessions.get(sessionId);
		return session?.isActive ?? false;
	}
	
	/**
	 * Get session information
	 */
	getSession(sessionId: string): HeadlessTerminalSession | undefined {
		return this.sessions.get(sessionId);
	}
	
	/**
	 * Close a headless terminal session
	 */
	async closeSession(sessionId: string): Promise<void> {
		const session = this.sessions.get(sessionId);
		if (!session) return;
		
		try {
			await customTerminalAPI.killTerminal(sessionId);
		} catch (error) {
			console.error(`Error killing terminal ${sessionId}:`, error);
		}
		
		// Clean up local state
		session.isActive = false;
		this.sessions.delete(sessionId);
		this.screenStates.delete(sessionId);
		this.eventCallbacks.delete(sessionId);
	}
	
	/**
	 * List all active sessions
	 */
	getActiveSessions(): HeadlessTerminalSession[] {
		return Array.from(this.sessions.values()).filter(session => session.isActive);
	}
	
	/**
	 * Resize terminal session
	 */
	async resizeSession(sessionId: string, lines: number, cols: number): Promise<void> {
		if (!this.isSessionActive(sessionId)) {
			throw new Error(`Session ${sessionId} is not active`);
		}
		
		// Ensure minimum dimensions
		const newLines = Math.max(24, lines);
		const newCols = Math.max(80, cols);
		
		await customTerminalAPI.resizeTerminal(sessionId, newLines, newCols);
		
		// Update session spec
		const session = this.sessions.get(sessionId);
		if (session) {
			session.spec.lines = newLines;
			session.spec.cols = newCols;
		}
	}
	
	// Private methods
	
	private async setupEventMonitoring(sessionId: string): Promise<void> {
		await customTerminalAPI.onTerminalEvent(sessionId, (events: TerminalEvent[]) => {
			this.handleTerminalEvents(sessionId, events);
		});
		
		await customTerminalAPI.onTerminalDisconnect(sessionId, () => {
			this.handleTerminalDisconnect(sessionId);
		});
	}
	
	private handleTerminalEvents(sessionId: string, events: TerminalEvent[]): void {
		console.log(this.logPrefix, "📺 Handling", events.length, "events for session", sessionId.slice(0, 8) + "...");
		
		const state = this.screenStates.get(sessionId);
		if (!state) {
			console.error(this.logPrefix, "❌ No state found for session:", sessionId);
			return;
		}
		
		this.updateLastActivity(sessionId);
		
		// Update screen state based on events
		for (const event of events) {
			console.log(this.logPrefix, "🔄 Processing event:", event.type);
			
			switch (event.type) {
				case 'screenUpdate':
					if (event.screen) {
						console.log(this.logPrefix, "📱 Screen update - setting", event.screen.length, "lines");
						state.lines = [...event.screen];
						state.cursorLine = event.cursor_line ?? 0;
						state.cursorCol = event.cursor_col ?? 0;
						state.totalLines = state.lines.length;
						
						// Log current screen text
						const screenText = this.getCurrentScreenText(sessionId);
						console.log(this.logPrefix, "📄 Screen content after update:");
						screenText.forEach((line, i) => {
							if (line.trim()) {
								console.log(this.logPrefix, `  [${i}]:`, JSON.stringify(line));
							}
						});
					}
					break;
					
				case 'newLines':
					if (event.lines) {
						console.log(this.logPrefix, "➕ Adding", event.lines.length, "new lines");
						state.lines.push(...event.lines);
						state.totalLines = state.lines.length;
						
						// Log new lines
						event.lines.forEach((line, i) => {
							const lineText = line.map(item => item.lexeme).join('');
							if (lineText.trim()) {
								console.log(this.logPrefix, `  New[${i}]:`, JSON.stringify(lineText));
							}
						});
					}
					break;
					
				case 'patch':
					if (event.line !== undefined && event.items) {
						console.log(this.logPrefix, "🔧 Patching line", event.line, "with", event.items.length, "items");
						// Ensure we have enough lines
						while (state.lines.length <= event.line) {
							state.lines.push([]);
						}
						state.lines[event.line] = [...event.items];
						
						// Log patched line
						const lineText = event.items.map(item => item.lexeme).join('');
						console.log(this.logPrefix, `  Patch[${event.line}]:`, JSON.stringify(lineText));
					}
					break;
					
				case 'cursorMove':
					if (event.line !== undefined && event.col !== undefined) {
						console.log(this.logPrefix, "↔️ Cursor moved to line", event.line, "col", event.col);
						state.cursorLine = event.line;
						state.cursorCol = event.col;
					}
					break;
			}
		}
		
		// Forward events to callback if registered
		const callback = this.eventCallbacks.get(sessionId);
		if (callback) {
			console.log(this.logPrefix, "📞 Forwarding events to callback");
			callback(events);
		} else {
			console.log(this.logPrefix, "⚠️ No callback registered for session");
		}
	}
	
	private handleTerminalDisconnect(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.isActive = false;
		}
	}
	
	private updateLastActivity(sessionId: string): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			session.lastActivity = Date.now();
		}
	}
	
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// Export singleton instance
export const headlessTerminalAPI = new HeadlessTerminalAPI();