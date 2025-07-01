import { OsSession } from "../bindings/os";
import { TextArea } from "../canvas/TextArea";
import type { CanvasElement } from "../canvas/types";

export interface GitProjectCanvas {
	id: string;
	name: string;
	elements: CanvasElement[];
	createdAt: number;
	lastModified: number;
}

export class GitProject {
	public id: string;
	public name: string;
	public root: OsSession; // The OsSession that led to this GitProject's creation
	public canvases: GitProjectCanvas[];
	public currentCanvasIndex: number;
	public createdAt: number;
	public lastModified: number;

	// Reactive state management
	private listeners: Map<string, Set<() => void>> = new Map();

	constructor(root: OsSession, name?: string) {
		this.id = crypto.randomUUID();
		this.root = root;
		this.name = name || this.generateDefaultName();
		this.canvases = [this.createDefaultCanvas()];
		this.currentCanvasIndex = 0;
		this.createdAt = Date.now();
		this.lastModified = Date.now();

		console.log(this.canvases);
	}

	// Reactive getters
	getCurrentCanvas(): GitProjectCanvas | null {
		return this.canvases[this.currentCanvasIndex] || null;
	}

	// Reactive setters
	setCurrentCanvasIndex(index: number): void {
		if (
			index >= 0 &&
			index < this.canvases.length &&
			index !== this.currentCanvasIndex
		) {
			this.currentCanvasIndex = index;
			this.lastModified = Date.now();
			this.notifyListeners("currentCanvasIndex");
		}
	}

	addCanvas(canvas?: Partial<GitProjectCanvas>): string {
		const newCanvas: GitProjectCanvas = {
			id: crypto.randomUUID(),
			name: canvas?.name || `Canvas ${this.canvases.length + 1}`,
			elements: canvas?.elements || [],
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		this.canvases.push(newCanvas);
		this.lastModified = Date.now();
		this.notifyListeners("canvases");
		return newCanvas.id;
	}

	removeCanvas(canvasId: string): boolean {
		const index = this.canvases.findIndex((c) => c.id === canvasId);
		if (index === -1 || this.canvases.length <= 1) return false;

		this.canvases.splice(index, 1);

		// Adjust currentCanvasIndex if needed
		if (this.currentCanvasIndex >= this.canvases.length) {
			this.currentCanvasIndex = this.canvases.length - 1;
		} else if (this.currentCanvasIndex > index) {
			this.currentCanvasIndex--;
		}

		this.lastModified = Date.now();
		this.notifyListeners("canvases");
		this.notifyListeners("currentCanvasIndex");
		return true;
	}

	updateCanvasElements(canvasId: string, elements: CanvasElement[]): boolean {
		const canvas = this.canvases.find((c) => c.id === canvasId);
		if (!canvas) return false;

		canvas.elements = elements;
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners("canvases");
		return true;
	}

	addToCurrentCanvasElements(element: CanvasElement): boolean {
		const canvas = this.canvases[this.currentCanvasIndex];
		if (!canvas) return false;
		return this.updateCanvasElements(canvas.id, [...canvas.elements, element]);
	}

	renameCanvas(canvasId: string, name: string): boolean {
		const canvas = this.canvases.find((c) => c.id === canvasId);
		if (!canvas) return false;

		canvas.name = name;
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners("canvases");
		return true;
	}

	// Reactive event system
	subscribe(
		property: "canvases" | "currentCanvasIndex",
		callback: () => void,
	): () => void {
		if (!this.listeners.has(property)) {
			this.listeners.set(property, new Set());
		}
		this.listeners.get(property)!.add(callback);

		// Return unsubscribe function
		return () => {
			this.listeners.get(property)?.delete(callback);
		};
	}

	private notifyListeners(property: string): void {
		this.listeners.get(property)?.forEach((callback) => callback());
	}

	// Serialization
	toJSON(): any {
		return {
			id: this.id,
			name: this.name,
			root: this.root,
			canvases: this.canvases,
			currentCanvasIndex: this.currentCanvasIndex,
			createdAt: this.createdAt,
			lastModified: this.lastModified,
		};
	}

	static fromJSON(data: any): GitProject {
		const project = new GitProject(data.root, data.name);
		project.id = data.id;
		project.canvases = data.canvases || [project.createDefaultCanvas()];
		project.currentCanvasIndex = data.currentCanvasIndex || 0;
		project.createdAt = data.createdAt || Date.now();
		project.lastModified = data.lastModified || Date.now();
		return project;
	}

	// Helper methods
	private generateDefaultName(): string {
		// Extract name from the root OsSession path
		if (this.root && typeof this.root === "object") {
			if ("Local" in this.root) {
				const path = this.root.Local;
				return (
					path.split("/").pop() || path.split("\\").pop() || "Local Project"
				);
			}
			if ("Wsl" in this.root) {
				const path = this.root.Wsl.working_directory;
				return path.split("/").pop() || "WSL Project";
			}
		}
		return "Untitled Project";
	}

	private createDefaultCanvas(): GitProjectCanvas {
		console.log("here");
		return {
			id: crypto.randomUUID(),
			name: "Main Canvas",
			elements: [TextArea.canvasElement(this.root, "")],
			createdAt: Date.now(),
			lastModified: Date.now(),
		};
	}

	// Utility methods
	get osSession(): OsSession {
		return this.root;
	}
}
