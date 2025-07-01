import { OsSession } from "../bindings/os";
import { CanvasElement, type ElementTargets } from "./types";

export class TextArea {
	public id: string;
	public content: string;
	public isLocked: boolean;
	public osSession: OsSession;

	constructor(osSession: OsSession, content: string = "") {
		this.id = Math.random().toString(36).substring(2, 9);
		this.content = content;
		this.isLocked = false;
		this.osSession = osSession;
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

	static canvasElement(
		osSession: OsSession,
		content: string = "",
	): CanvasElement {
		const textArea = new TextArea(osSession, content);
		return new CanvasElement({ textArea }, 1);
	}
}
