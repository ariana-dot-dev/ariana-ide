import type { CustomTerminal } from "./CustomTerminal";
import type { FileTreeCanvas } from "./FileTreeCanvas";
import type { Rectangle } from "./Rectangle";
import type { Terminal } from "./Terminal";
import type { Audio } from "./Audio";

export type SizeTarget = "small" | "medium" | "large";
export type AreaTarget =
	| "center"
	| "left"
	| "top"
	| "right"
	| "bottom"
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right";

export interface ElementTargets {
	size: SizeTarget;
	aspectRatio: number;
	area: AreaTarget;
}

export interface GridCell {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ElementLayout {
	element: CanvasElement;
	cell: GridCell;
	score: number;
	previousCell?: GridCell;
}

export type CanvasElementKind =
	| RectangleKind
	| TerminalKind
	| CustomTerminalKind
	| FileTreeKind
	| AudioKind;

export type RectangleKind = { rectangle: Rectangle };
export type TerminalKind = { terminal: Terminal };
export type CustomTerminalKind = { customTerminal: CustomTerminal };
export type FileTreeKind = { fileTree: FileTreeCanvas };
export type AudioKind = { audio: Audio };

export class CanvasElement {
	public weight: number;
	public id: string;
	public kind: CanvasElementKind;

	constructor(kind: CanvasElementKind, weight: number = 1) {
		this.weight = weight;
		this.id = Math.random().toString(36).substring(2, 9); // Generate unique ID
		this.kind = kind;
	}

	get targets(): ElementTargets {
		if ("rectangle" in this.kind) {
			return this.kind.rectangle.targets();
		} else if ("terminal" in this.kind) {
			return this.kind.terminal.targets();
		} else if ("customTerminal" in this.kind) {
			return this.kind.customTerminal.targets();
		} else if ("fileTree" in this.kind) {
			return this.kind.fileTree.targets();
		} else if ("audio" in this.kind) {
			return this.kind.audio.targets();
		}
		throw new Error("Invalid kind");
	}
}

export interface CanvasState {
	elements: CanvasElement[];
	layouts: ElementLayout[];
	canvasWidth: number;
	canvasHeight: number;
}

export interface OptimizationOptions {
	stabilityWeight: number; // 0-1, how much to favor stability vs optimization
}
