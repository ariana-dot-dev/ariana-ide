import { CanvasElement, ElementTargets } from "./types";

export class FileTreeCanvas {
	private _targets: ElementTargets;
	private _rootPath: string;

	constructor(targets: ElementTargets, rootPath: string = "/") {
		this._targets = targets;
		this._rootPath = rootPath;
	}

	targets(): ElementTargets {
		return this._targets;
	}

	updateTargets(newTargets: Partial<ElementTargets>): void {
		this._targets = { ...this._targets, ...newTargets };
	}

	get rootPath(): string {
		return this._rootPath;
	}

	setRootPath(path: string): void {
		this._rootPath = path;
	}

	static canvasElement(
		targets: ElementTargets,
		rootPath?: string,
		weight: number = 1,
	): CanvasElement {
		return new CanvasElement(
			{ fileTree: new FileTreeCanvas(targets, rootPath) },
			weight,
		);
	}
}
