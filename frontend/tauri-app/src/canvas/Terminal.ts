import { CanvasElement, type ElementTargets } from "./types";

export type TerminalKind =
	| {
			$type: "ssh";
			host: string;
			username: string;
			port?: number;
	  }
	| {
			$type: "git-bash";
			workingDirectory?: string;
	  }
	| {
			$type: "wsl";
			distribution?: string;
			workingDirectory?: string;
	  }
	| {
			$type: "local-shell";
			shell?: string;
			workingDirectory?: string;
	  }
	| {
			$type: "iterm";
			profile?: string;
			workingDirectory?: string;
	  };

export interface TerminalConfig {
	kind: TerminalKind;
	// Shared optional config
	environment?: Record<string, string>;
	shellCommand?: string;
	colorScheme?: string;
	fontSize?: number;
	fontFamily?: string;
}

export class Terminal {
	private _targets: ElementTargets;
	private _config: TerminalConfig;
	private _isConnected: boolean = false;
	private _connectionId?: string;

	constructor(config: TerminalConfig) {
		this._targets = {
			size: "medium",
			aspectRatio: 1 / 10,
			area: "bottom",
		};
		this._config = config;
	}

	targets(): ElementTargets {
		return this._targets;
	}

	updateTargets(newTargets: Partial<ElementTargets>): void {
		this._targets = { ...this._targets, ...newTargets };
	}

	get config(): TerminalConfig {
		return this._config;
	}

	updateConfig(newConfig: Partial<TerminalConfig>): void {
		this._config = { ...this._config, ...newConfig };
	}

	get isConnected(): boolean {
		return this._isConnected;
	}

	get connectionId(): string | undefined {
		return this._connectionId;
	}

	setConnection(connectionId: string, connected: boolean): void {
		this._connectionId = connectionId;
		this._isConnected = connected;
	}

	getTerminalType(): string {
		return this._config.kind.$type;
	}

	getConnectionString(): string {
		const kind = this._config.kind;
		switch (kind.$type) {
			case "ssh":
				return `${kind.username}@${kind.host}:${kind.port || 22}`;
			case "wsl":
				return `WSL: ${kind.distribution || "Default"}`;
			case "git-bash":
				return `Git Bash: ${kind.workingDirectory || "~"}`;
			case "local-shell":
				return `${kind.shell || "Default Shell"}: ${kind.workingDirectory || "~"}`;
			case "iterm":
				return `iTerm: ${kind.profile || "Default"}: ${kind.workingDirectory || "~"}`;
			default:
				return "Terminal";
		}
	}

	static canvasElement(
		config: TerminalConfig,
		weight: number = 1,
	): CanvasElement {
		return new CanvasElement({ terminal: new Terminal(config) }, weight);
	}

	// Helper methods for creating different terminal types
	static createLocalShell(
		shell?: string,
		workingDirectory?: string,
		weight: number = 1,
	): CanvasElement {
		const config: TerminalConfig = {
			kind: {
				$type: "local-shell",
				shell,
				workingDirectory,
			},
		};
		return Terminal.canvasElement(config, weight);
	}

	static createSSH(
		host: string,
		username: string,
		port?: number,
		weight: number = 1,
	): CanvasElement {
		const config: TerminalConfig = {
			kind: {
				$type: "ssh",
				host,
				username,
				port,
			},
		};
		return Terminal.canvasElement(config, weight);
	}
}
