import { CanvasElement } from "./types";
import { Rectangle } from "./Rectangle";
import { TextArea } from "./TextArea";

/**
 * Create a new Canvas Element with a TextArea
 */
export function createTextAreaElement(content: string = ""): CanvasElement {
	const textArea = new TextArea(content);
	return new CanvasElement({ textArea }, 1);
}

/**
 * Create a new Canvas Element with a Rectangle
 */
export function createRectangleElement(): CanvasElement {
	const rectangle = new Rectangle();
	return new CanvasElement({ rectangle }, 1);
}

/**
 * Helper to check if a canvas element is a TextArea
 */
export function isTextAreaElement(element: CanvasElement): boolean {
	return "textArea" in element.kind;
}

/**
 * Helper to get the TextArea from a canvas element
 */
export function getTextArea(element: CanvasElement): TextArea | null {
	if (isTextAreaElement(element)) {
		return element.kind.textArea;
	}
	return null;
}