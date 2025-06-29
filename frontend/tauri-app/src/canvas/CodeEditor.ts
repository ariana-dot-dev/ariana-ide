import { CanvasElement, type ElementTargets } from "./types";

export class CodeEditor {
	private _targets: ElementTargets;
	private _title: string;
	private _initialContent: string;

	constructor(title: string = "Code Editor", initialContent: string = "") {
		this._title = title;
		this._initialContent = initialContent;
		this._targets = {
			size: "large",
			aspectRatio: 16 / 9,
			area: "center",
		};
	}

	targets(): ElementTargets {
		return this._targets;
	}

	updateTargets(targets: ElementTargets): void {
		this._targets = targets;
	}

	getTitle(): string {
		return this._title;
	}

	setTitle(title: string): void {
		this._title = title;
	}

	getInitialContent(): string {
		return this._initialContent;
	}

	setInitialContent(content: string): void {
		this._initialContent = content;
	}

	static canvasElement(
		targets: ElementTargets,
		weight: number = 1,
		title: string = "Code Editor",
		initialContent: string = "// Welcome to the code editor\nfunction hello() {\n  console.log('Hello, world!');\n}\n\nhello();",
	): CanvasElement {
		const editor = new CodeEditor(title, initialContent);
		editor._targets = targets;
		return new CanvasElement({ codeEditor: editor }, weight);
	}
}
