import { GridOptimizer } from './gridOptimizer';
import { Element, ElementLayout } from './types';

export interface WorkerMessage {
  type: 'OPTIMIZE_GRID';
  payload: {
    elements: Element[];
    canvasWidth: number;
    canvasHeight: number;
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
      let bestLayouts = optimizer.optimize(elements);
      
      // Continue optimizing for up to 100ms
      while (Date.now() - startTime < 100) {
        const layouts = optimizer.optimize(elements);
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

// Simplified worker creation without blob - use inline worker instead
export const createGridWorker = (): Worker => {
  // For now, create a simple inline worker
  const workerScript = `
    // Simple grid optimization in worker
    self.onmessage = function(event) {
      const { type, payload } = event.data;
      
      if (type === 'OPTIMIZE_GRID') {
        const { elements, canvasWidth, canvasHeight } = payload;
        
        // Simple grid layout - divide canvas into equal cells
        const numElements = elements.length;
        let rows = Math.ceil(Math.sqrt(numElements));
        let cols = Math.ceil(numElements / rows);
        
        const cellWidth = canvasWidth / cols;
        const cellHeight = canvasHeight / rows;
        
        const layouts = elements.map((element, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          
          return {
            element: element,
            cell: {
              x: col * cellWidth,
              y: row * cellHeight,
              width: cellWidth,
              height: cellHeight
            },
            score: 1
          };
        });
        
        self.postMessage({
          type: 'GRID_OPTIMIZED',
          payload: { layouts }
        });
      }
    };
  `;
  
  const blob = new Blob([workerScript], { type: 'application/javascript' });
  const workerUrl = URL.createObjectURL(blob);
  return new Worker(workerUrl);
};
