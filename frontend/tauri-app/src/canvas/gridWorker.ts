import { GridOptimizer } from './gridOptimizer';
import { Element, ElementLayout, OptimizationOptions } from './types';

export interface WorkerMessage {
  type: 'OPTIMIZE_GRID';
  payload: {
    elements: Element[];
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

// Simplified worker creation with space partitioning and stability
export const createGridWorker = (): Worker => {
  const workerScript = `
    // Space partitioning optimization in worker with stability
    self.onmessage = function(event) {
      const { type, payload } = event.data;
      
      if (type === 'OPTIMIZE_GRID') {
        const { elements, canvasWidth, canvasHeight, previousLayouts = [], options = { stabilityWeight: 0.3 } } = payload;
        
        // Create map of previous positions for stability
        const previousPositions = new Map();
        previousLayouts.forEach(layout => {
          const elementIndex = elements.findIndex(el => el === layout.element);
          if (elementIndex >= 0) {
            previousPositions.set(elementIndex, layout.cell);
          }
        });
        
        // Calculate stability score for an element in a cell
        function getStabilityScore(elementIndex, cell) {
          const previousCell = previousPositions.get(elementIndex);
          if (!previousCell) return 1; // No previous position, no penalty

          const prevCenterX = previousCell.x + previousCell.width / 2;
          const prevCenterY = previousCell.y + previousCell.height / 2;
          const newCenterX = cell.x + cell.width / 2;
          const newCenterY = cell.y + cell.height / 2;

          const distance = Math.sqrt(
            Math.pow(newCenterX - prevCenterX, 2) + Math.pow(newCenterY - prevCenterY, 2)
          );

          const maxDistance = Math.sqrt(
            Math.pow(canvasWidth, 2) + Math.pow(canvasHeight, 2)
          );
          const normalizedDistance = distance / maxDistance;

          return 1 - Math.min(normalizedDistance, 1);
        }
        
        // Recursive space partitioning with stability consideration
        function partitionSpace(bounds, elementIndices) {
          if (elementIndices.length === 0) return [];
          if (elementIndices.length === 1) {
            const elementIndex = elementIndices[0];
            const element = elements[elementIndex];
            const previousCell = previousPositions.get(elementIndex);
            const stabilityScore = getStabilityScore(elementIndex, bounds);
            
            return [{
              element: element,
              cell: bounds,
              score: stabilityScore,
              previousCell: previousCell
            }];
          }
          
          // For stability, try to keep elements close to their previous positions
          if (options.stabilityWeight > 0 && previousPositions.size > 0) {
            // Sort elements by their preference for staying in current region
            const elementScores = elementIndices.map(idx => ({
              index: idx,
              stabilityScore: getStabilityScore(idx, bounds)
            }));
            
            elementScores.sort((a, b) => b.stabilityScore - a.stabilityScore);
            elementIndices = elementScores.map(es => es.index);
          }
          
          const midPoint = Math.floor(elementIndices.length / 2);
          const leftElements = elementIndices.slice(0, midPoint);
          const rightElements = elementIndices.slice(midPoint);
          
          // Choose split direction based on bounds aspect ratio
          const isWide = bounds.width > bounds.height;
          
          if (isWide) {
            // Vertical split
            const splitX = bounds.x + bounds.width * (leftElements.length / elementIndices.length);
            const leftBounds = {
              x: bounds.x,
              y: bounds.y,
              width: splitX - bounds.x,
              height: bounds.height
            };
            const rightBounds = {
              x: splitX,
              y: bounds.y,
              width: bounds.x + bounds.width - splitX,
              height: bounds.height
            };
            
            return [
              ...partitionSpace(leftBounds, leftElements),
              ...partitionSpace(rightBounds, rightElements)
            ];
          } else {
            // Horizontal split
            const splitY = bounds.y + bounds.height * (leftElements.length / elementIndices.length);
            const leftBounds = {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: splitY - bounds.y
            };
            const rightBounds = {
              x: bounds.x,
              y: splitY,
              width: bounds.width,
              height: bounds.y + bounds.height - splitY
            };
            
            return [
              ...partitionSpace(leftBounds, leftElements),
              ...partitionSpace(rightBounds, rightElements)
            ];
          }
        }
        
        const canvasBounds = {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight
        };
        
        const elementIndices = elements.map((_, index) => index);
        const layouts = partitionSpace(canvasBounds, elementIndices);
        
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
