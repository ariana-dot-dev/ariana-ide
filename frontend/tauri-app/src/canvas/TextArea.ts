import { CanvasElement, ElementTargets } from "./types";

export class TextArea {
	public id: string;
	public content: string;
	public isLocked: boolean;

	constructor(content: string = "") {
		this.id = Math.random().toString(36).substring(2, 9);
		this.content = content;
		this.isLocked = false;
	}

	public targets(): ElementTargets {
		return {
			size: "medium",
			aspectRatio: 16 / 9, // Wide aspect ratio for text area + terminal
			area: "center",
		};
	}

	public updateContent(content: string): void {
		if (!this.isLocked) {
			this.content = content;
		}
	}

	public lock(): void {
		this.isLocked = true;
	}

	public unlock(): void {
		this.isLocked = false;
	}

	static canvasElement(content: string = ""): CanvasElement {
		const textArea = new TextArea(content);
		return new CanvasElement({ textArea }, 1);
	}
}
