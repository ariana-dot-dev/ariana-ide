import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { GitProject, GitProjectCanvas, ProcessState } from '../types/GitProject';
import { CanvasElement } from '../canvas/types';
import { ProcessManager } from '../services/ProcessManager';
import { useStore } from '../state';

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
	const { updateGitProject } = useStore();

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
				// Trigger state update to save to disk
				updateGitProject(gitProject.id);
			}
		},

		switchCanvas: (canvasIndex: number) => {
			if (!gitProject) return;
			gitProject.setCurrentCanvasIndex(canvasIndex);
			updateGitProject(gitProject.id);
		},

		addCanvas: (canvas?: any) => {
			if (!gitProject) return '';
			const canvasId = gitProject.addCanvas(canvas);
			updateGitProject(gitProject.id);
			return canvasId;
		},

		removeCanvas: (canvasId: string) => {
			if (!gitProject) return false;
			const result = gitProject.removeCanvas(canvasId);
			if (result) updateGitProject(gitProject.id);
			return result;
		},

		renameCanvas: (canvasId: string, name: string) => {
			if (!gitProject) return false;
			const result = gitProject.renameCanvas(canvasId, name);
			if (result) updateGitProject(gitProject.id);
			return result;
		},

		// Process management methods
		addProcess: (process: ProcessState) => {
			if (!gitProject) return false;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return false;
			const result = gitProject.addProcessToCanvas(currentCanvas.id, process);
			if (result) updateGitProject(gitProject.id);
			return result;
		},

		updateProcess: (processId: string, updates: Partial<ProcessState>) => {
			if (!gitProject) return false;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return false;
			const result = gitProject.updateProcessInCanvas(currentCanvas.id, processId, updates);
			if (result) updateGitProject(gitProject.id);
			return result;
		},

		removeProcess: (processId: string) => {
			if (!gitProject) return false;
			const currentCanvas = gitProject.getCurrentCanvas();
			if (!currentCanvas) return false;
			const result = gitProject.removeProcessFromCanvas(currentCanvas.id, processId);
			if (result) updateGitProject(gitProject.id);
			return result;
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