import type { WorkerElementTargets, WorkerLayout } from "./gridWorkerCore";
import {
	type ElementLayout,
	ElementTargets,
	type OptimizationOptions,
} from "./types";

export interface WorkerMessage {
	type: "OPTIMIZE_GRID";
	payload: {
		elements: Array<{
			weight: number;
			id: string;
			targets: WorkerElementTargets;
		}>;
		canvasWidth: number;
		canvasHeight: number;
		previousLayouts?: ElementLayout[];
		options?: OptimizationOptions;
	};
}

export interface WorkerResponse {
	type: "GRID_OPTIMIZED";
	payload: {
		layouts: WorkerLayout[];
	};
}

// Create worker using Vite's worker support
export const createGridWorker = (): Worker => {
	// Use Vite's ?worker suffix to import as a web worker
	// This works in both dev and production
	return new Worker(new URL("./gridWorkerCore.ts", import.meta.url), {
		type: "module",
	});
};
