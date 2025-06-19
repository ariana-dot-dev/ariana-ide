import { GridOptimizer } from './gridOptimizer';
import { CanvasElement, ElementLayout, ElementTargets, OptimizationOptions } from './types';

export interface WorkerMessage {
  type: 'OPTIMIZE_GRID';
  payload: {
    elements: Array<{
      weight: number;
      id: string;
      targets: ElementTargets;
    }>;
    canvasWidth: number;
    canvasHeight: number;
    previousLayouts?: ElementLayout[];
    options?: OptimizationOptions;
  };
}

export interface WorkerResponse {
  type: 'GRID_OPTIMIZED';
  payload: {
    layouts: ElementLayout[];
  };
}

// Worker function that will be run in the web worker
export const gridWorkerFunction = () => {
  self.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const { type, payload } = event.data;

    if (type === 'OPTIMIZE_GRID') {
      const { elements, canvasWidth, canvasHeight } = payload;

      // Create optimizer and run optimization
      const optimizer = new GridOptimizer(canvasWidth, canvasHeight);

      // Simulate iterative optimization with timeout
      const startTime = Date.now();
      let bestLayouts = optimizer.optimize(elements.map(e => ({
        weight: e.weight,
        id: e.id,
        targets: () => e.targets
      })));

      // Continue optimizing for up to 100ms
      while (Date.now() - startTime < 100) {
        const layouts = optimizer.optimize(elements.map(e => ({
          weight: e.weight,
          id: e.id,
          targets: () => e.targets
        })));
        const currentScore = layouts.reduce((sum, layout) => sum + layout.score * layout.element.weight, 0);
        const bestScore = bestLayouts.reduce((sum, layout) => sum + layout.score * layout.element.weight, 0);

        if (currentScore > bestScore) {
          bestLayouts = layouts;
        }
      }

      const response: WorkerResponse = {
        type: 'GRID_OPTIMIZED',
        payload: { layouts: bestLayouts }
      };

      self.postMessage(response);
    }
  };
};

// Create worker using Vite's worker support
export const createGridWorker = (): Worker => {
  // Use Vite's ?worker suffix to import as a web worker
  // This works in both dev and production
  return new Worker(
    new URL('./gridWorkerCore.ts', import.meta.url),
    { type: 'module' }
  );
};
