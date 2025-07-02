import { OsSession, osSessionGetWorkingDirectory } from "../bindings/os";
import { TextArea } from "../canvas/TextArea";
import type { CanvasElement } from "../canvas/types";
import { CanvasService } from "../services/CanvasService";

export interface ProcessState {
	processId: string;
	terminalId: string;
	type: 'claude-code' | 'custom-terminal';
	status: 'running' | 'completed' | 'error';
	startTime: number;
	elementId: string; // Which canvas element owns this process
	prompt?: string; // For claude-code processes
}

export interface GitProjectCanvas {
	id: string;
	name: string;
	elements: CanvasElement[];
	osSession?: OsSession; // Optional OS session for canvas-specific operations
	runningProcesses?: ProcessState[]; // Track processes running in this canvas
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

		console.log(this.canvases)
	}

	// Reactive getters
	getCurrentCanvas(): GitProjectCanvas | null {
		return this.canvases[this.currentCanvasIndex] || null;
	}

	// Reactive setters
	setCurrentCanvasIndex(index: number): void {
		if (index >= 0 && index < this.canvases.length && index !== this.currentCanvasIndex) {
			this.currentCanvasIndex = index;
			this.lastModified = Date.now();
			this.notifyListeners('currentCanvasIndex');
		}
	}

	addCanvas(canvas?: Partial<GitProjectCanvas>): string {
		const newCanvas: GitProjectCanvas = {
			id: crypto.randomUUID(),
			name: canvas?.name || `Canvas ${this.canvases.length + 1}`,
			elements: canvas?.elements || [],
			osSession: canvas?.osSession,
			createdAt: Date.now(),
			lastModified: Date.now(),
		};

		this.canvases.push(newCanvas);
		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		return newCanvas.id;
	}

	/**
	 * Creates a new canvas that is a copy of the repository on another branch and location
	 */
	async addCanvasCopy(): Promise<{ success: boolean; canvasId?: string; error?: string }> {
		try {
			// Generate random ID for the new version
			const randomId = CanvasService.generateRandomId();
			const branchName = `canvas-${randomId}`;
			
			// Get the root working directory
			const rootDirectory = osSessionGetWorkingDirectory(this.root);
			if (!rootDirectory) {
				return { success: false, error: "Could not determine root directory" };
			}

			// Create new location path (add suffix to avoid conflicts)
			const newLocation = `${rootDirectory}-${randomId}`;
			
			// Step 1: Copy the folder to new location
			const copyResult = await CanvasService.copyDirectory(
				rootDirectory,
				newLocation,
				this.root
			);
			
			if (!copyResult.success) {
				return { 
					success: false, 
					error: `Failed to copy directory: ${copyResult.error}` 
				};
			}

			// Step 2: Create new OsSession with the new working directory
			let newOsSession: OsSession;
			if ('Local' in this.root) {
				newOsSession = { Local: newLocation };
			} else if ('Wsl' in this.root) {
				newOsSession = {
					Wsl: {
						distribution: this.root.Wsl.distribution,
						working_directory: newLocation
					}
				};
			} else {
				return { success: false, error: "Unknown OS session type" };
			}

			// Step 3: Create git branch in the new location
			const gitResult = await CanvasService.createGitBranch(
				newLocation,
				branchName,
				newOsSession
			);
			
			if (!gitResult.success) {
				return { 
					success: false, 
					error: `Failed to create git branch: ${gitResult.error}` 
				};
			}

			// Step 4: Create the new canvas with the new OsSession and TextArea
			const canvasId = this.addCanvas({
				name: `Canvas ${this.canvases.length + 1} (${branchName})`,
				osSession: newOsSession,
				elements: [
					TextArea.canvasElement(newOsSession, "")
				]
			});

			return { success: true, canvasId };
		} catch (error) {
			return { 
				success: false, 
				error: `Unexpected error: ${error}` 
			};
		}
	}

	removeCanvas(canvasId: string): boolean {
		const index = this.canvases.findIndex(c => c.id === canvasId);
		if (index === -1 || this.canvases.length <= 1) return false;

		this.canvases.splice(index, 1);
		
		// Adjust currentCanvasIndex if needed
		if (this.currentCanvasIndex >= this.canvases.length) {
			this.currentCanvasIndex = this.canvases.length - 1;
		} else if (this.currentCanvasIndex > index) {
			this.currentCanvasIndex--;
		}

		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		this.notifyListeners('currentCanvasIndex');
		return true;
	}

	updateCanvasElements(canvasId: string, elements: CanvasElement[]): boolean {
		const canvas = this.canvases.find(c => c.id === canvasId);
		if (!canvas) return false;

		canvas.elements = elements;
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		return true;
	}

	addToCurrentCanvasElements(element: CanvasElement): boolean {
		const canvas = this.canvases[this.currentCanvasIndex];
		if (!canvas) return false;
		return this.updateCanvasElements(canvas.id, [...canvas.elements, element])
	}

	renameCanvas(canvasId: string, name: string): boolean {
		const canvas = this.canvases.find(c => c.id === canvasId);
		if (!canvas) return false;

		canvas.name = name;
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		return true;
	}

	// Reactive event system
	subscribe(property: 'canvases' | 'currentCanvasIndex', callback: () => void): () => void {
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
		this.listeners.get(property)?.forEach(callback => callback());
	}

	// Serialization
	toJSON(): any {
		const result = {
			id: this.id,
			name: this.name,
			root: this.root,
			canvases: this.canvases,
			currentCanvasIndex: this.currentCanvasIndex,
			createdAt: this.createdAt,
			lastModified: this.lastModified,
		};
		
		console.log('GitProject.toJSON: Serializing project:', {
			name: this.name,
			canvasCount: this.canvases.length,
			canvases: this.canvases.map(c => ({ id: c.id, name: c.name, osSession: c.osSession }))
		});
		
		return result;
	}

	static fromJSON(data: any): GitProject {
		console.log('GitProject.fromJSON: Loading project data:', {
			name: data.name,
			canvasCount: data.canvases?.length,
			canvases: data.canvases?.map((c: any) => ({ id: c.id, name: c.name, osSession: c.osSession }))
		});
		
		const project = new GitProject(data.root, data.name);
		project.id = data.id;
		project.canvases = data.canvases || [project.createDefaultCanvas()];
		
		console.log('GitProject.fromJSON: Set canvases to:', project.canvases.length, 'canvases');
		
		// Handle migration for canvases that don't have osSession or runningProcesses yet
		project.canvases = project.canvases.map(canvas => ({
			...canvas,
			osSession: canvas.osSession || undefined,
			runningProcesses: canvas.runningProcesses || []
		}));
		project.currentCanvasIndex = data.currentCanvasIndex || 0;
		project.createdAt = data.createdAt || Date.now();
		project.lastModified = data.lastModified || Date.now();
		
		console.log('GitProject.fromJSON: Final project has', project.canvases.length, 'canvases');
		return project;
	}

	// Helper methods
	private generateDefaultName(): string {
		// Extract name from the root OsSession path
		if (this.root && typeof this.root === 'object') {
			if ('Local' in this.root) {
				const path = this.root.Local;
				return path.split('/').pop() || path.split('\\').pop() || 'Local Project';
			}
			if ('Wsl' in this.root) {
				const path = this.root.Wsl.working_directory;
				return path.split('/').pop() || 'WSL Project';
			}
		}
		return 'Untitled Project';
	}

	createDefaultCanvas(): GitProjectCanvas {
		return {
			id: crypto.randomUUID(),
			name: 'Initial version',
			elements: [
				TextArea.canvasElement(this.root, "")
			],
			osSession: this.root, // Set the osSession to the root
			createdAt: Date.now(),
			lastModified: Date.now(),
		};
	}

	// Utility methods
	get osSession(): OsSession {
		return this.root;
	}

	// Process management methods
	addProcessToCanvas(canvasId: string, process: ProcessState): boolean {
		const canvas = this.canvases.find(c => c.id === canvasId);
		if (!canvas) return false;

		if (!canvas.runningProcesses) {
			canvas.runningProcesses = [];
		}

		canvas.runningProcesses.push(process);
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		return true;
	}

	updateProcessInCanvas(canvasId: string, processId: string, updates: Partial<ProcessState>): boolean {
		const canvas = this.canvases.find(c => c.id === canvasId);
		if (!canvas?.runningProcesses) return false;

		const process = canvas.runningProcesses.find(p => p.processId === processId);
		if (!process) return false;

		Object.assign(process, updates);
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		return true;
	}

	removeProcessFromCanvas(canvasId: string, processId: string): boolean {
		const canvas = this.canvases.find(c => c.id === canvasId);
		if (!canvas?.runningProcesses) return false;

		const index = canvas.runningProcesses.findIndex(p => p.processId === processId);
		if (index === -1) return false;

		canvas.runningProcesses.splice(index, 1);
		canvas.lastModified = Date.now();
		this.lastModified = Date.now();
		this.notifyListeners('canvases');
		return true;
	}

	getCanvasProcesses(canvasId: string): ProcessState[] {
		const canvas = this.canvases.find(c => c.id === canvasId);
		return canvas?.runningProcesses || [];
	}

	getProcessByElementId(canvasId: string, elementId: string): ProcessState | undefined {
		const canvas = this.canvases.find(c => c.id === canvasId);
		return canvas?.runningProcesses?.find(p => p.elementId === elementId);
	}
}