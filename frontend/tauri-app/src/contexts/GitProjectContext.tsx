import React, {
	createContext,
	useContext,
	useEffect,
	useState,
	ReactNode,
} from "react";
import { GitProject, GitProjectCanvas } from "../types/GitProject";
import { CanvasElement } from "../canvas/types";

interface GitProjectContextValue {
	selectedGitProject: GitProject | null;
	currentCanvas: GitProjectCanvas | null;
	updateCanvasElements: (elements: CanvasElement[]) => void;
	switchCanvas: (canvasIndex: number) => void;
	addCanvas: (canvas?: GitProjectCanvas) => string;
	removeCanvas: (canvasId: string) => boolean;
	renameCanvas: (canvasId: string, name: string) => boolean;
}

const GitProjectContext = createContext<GitProjectContextValue | null>(null);

interface GitProjectProviderProps {
	children: ReactNode;
	gitProject: GitProject | null;
}

export function GitProjectProvider({
	children,
	gitProject,
}: GitProjectProviderProps) {
	const [, forceUpdate] = useState(0);

	// Set up reactive subscriptions to the GitProject
	useEffect(() => {
		if (!gitProject) {
			return;
		}

		const unsubscribeCanvases = gitProject.subscribe("canvases", () => {
			forceUpdate((prev) => prev + 1);
		});

		const unsubscribeCurrentCanvas = gitProject.subscribe(
			"currentCanvasIndex",
			() => {
				forceUpdate((prev) => prev + 1);
			},
		);

		return () => {
			unsubscribeCanvases();
			unsubscribeCurrentCanvas();
		};
	}, [gitProject]);

	const contextValue: GitProjectContextValue = {
		selectedGitProject: gitProject,
		currentCanvas: gitProject?.getCurrentCanvas() || null,

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
			if (!gitProject) return "";
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
		throw new Error("useGitProject must be used within a GitProjectProvider");
	}
	return context;
}

// Hook to get the OsSession from the current GitProject
export function useOsSession() {
	const { selectedGitProject } = useGitProject();
	return selectedGitProject?.osSession || null;
}
