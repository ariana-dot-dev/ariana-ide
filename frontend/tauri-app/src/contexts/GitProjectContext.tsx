import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GitProject, GitProjectCanvas, ProcessState } from '../types/GitProject';
import { CanvasElement } from '../canvas/types';
import { ProcessManager } from '../services/ProcessManager';

interface GitProjectContextValue {
	selectedGitProject: GitProject | null;
	currentCanvas: GitProjectCanvas | null;
	updateCanvasElements: (elements: CanvasElement[]) => void;
	switchCanvas: (canvasIndex: number) => void;
	addCanvas: (canvas?: GitProjectCanvas) => string;
	removeCanvas: (canvasId: string) => boolean;
	renameCanvas: (canvasId: string, name: string) => boolean;
	// Process management
	addProcess: (process: ProcessState) => boolean;
	updateProcess: (processId: string, updates: Partial<ProcessState>) => boolean;
	removeProcess: (processId: string) => boolean;
	getProcessByElementId: (elementId: string) => ProcessState | undefined;
	getCurrentCanvasProcesses: () => ProcessState[];
}

const GitProjectContext = createContext<GitProjectContextValue | null>(null);

interface GitProjectProviderProps {
	children: ReactNode;
	gitProject: GitProject | null;
}

export function GitProjectProvider({ children, gitProject }: GitProjectProviderProps) {
	const [, forceUpdate] = useState(0);

	// Set up reactive subscriptions to the GitProject
	useEffect(() => {
		if (!gitProject) {
			return;
		}

		const unsubscribeCanvases = gitProject.subscribe('canvases', () => {
			forceUpdate(prev => prev + 1);
		});

		const unsubscribeCurrentCanvas = gitProject.subscribe('currentCanvasIndex', () => {
			forceUpdate(prev => prev + 1);
		});

		return () => {
			unsubscribeCanvases();
			unsubscribeCurrentCanvas();
		};
	}, [gitProject]);

	const currentCanvas = gitProject?.getCurrentCanvas() || null;
	
	console.log("GitProjectContext:", {
		gitProject: gitProject?.name,
		canvasCount: gitProject?.canvases.length,
		currentCanvasIndex: gitProject?.currentCanvasIndex,
		currentCanvas: currentCanvas?.name,
		canvasElements: currentCanvas?.elements.length
	});

	const contextValue: GitProjectContextValue = {
		selectedGitProject: gitProject,
		currentCanvas: currentCanvas,
		
		updateCanvasElements: (elements: any[]) => {
			if (!gitProject) return;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (currentCanvas) {
				gitProject.updateCanvasElements(currentCanvas.id, elements);
			}
		},

		switchCanvas: (canvasIndex: number) => {
			if (!gitProject) return;
			gitProject.setCurrentCanvasIndex(canvasIndex);
		},

		addCanvas: (canvas?: any) => {
			if (!gitProject) return '';
			return gitProject.addCanvas(canvas);
		},

		removeCanvas: (canvasId: string) => {
			if (!gitProject) return false;
			return gitProject.removeCanvas(canvasId);
		},

		renameCanvas: (canvasId: string, name: string) => {
			if (!gitProject) return false;
			return gitProject.renameCanvas(canvasId, name);
		},

		// Process management methods
		addProcess: (process: ProcessState) => {
			if (!gitProject) return false;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return false;
			return gitProject.addProcessToCanvas(currentCanvas.id, process);
		},

		updateProcess: (processId: string, updates: Partial<ProcessState>) => {
			if (!gitProject) return false;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return false;
			return gitProject.updateProcessInCanvas(currentCanvas.id, processId, updates);
		},

		removeProcess: (processId: string) => {
			if (!gitProject) return false;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return false;
			return gitProject.removeProcessFromCanvas(currentCanvas.id, processId);
		},

		getProcessByElementId: (elementId: string) => {
			if (!gitProject) return undefined;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return undefined;
			return gitProject.getProcessByElementId(currentCanvas.id, elementId);
		},

		getCurrentCanvasProcesses: () => {
			if (!gitProject) return [];
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return [];
			return gitProject.getCanvasProcesses(currentCanvas.id);
		},
	};

	return (
		<GitProjectContext.Provider value={contextValue}>
			{children}
		</GitProjectContext.Provider>
	);
}

export function useGitProject(): GitProjectContextValue {
	const context = useContext(GitProjectContext);
	if (!context) {
		throw new Error('useGitProject must be used within a GitProjectProvider');
	}
	return context;
}

// Hook to get the OsSession from the current GitProject
export function useOsSession() {
	const { selectedGitProject } = useGitProject();
	return selectedGitProject?.osSession || null;
}