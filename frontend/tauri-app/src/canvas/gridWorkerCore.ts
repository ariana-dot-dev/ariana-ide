// Core optimization logic for the grid worker
// This will be compiled to JS and run in the web worker

export interface WorkerElement {
  weight: number;
  id: string;
  targets: {
    size: 'small' | 'medium' | 'large';
    aspectRatio: number;
    area: 'center' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  };
}

export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkerLayout {
  element: WorkerElement;
  cell: GridCell;
  score: number;
  previousCell?: GridCell;
}

export interface OptimizationConfig {
  canvasWidth: number;
  canvasHeight: number;
  stabilityWeight: number;
}

class WorkerGridOptimizer {
  private config: OptimizationConfig;
  private totalArea: number;

  constructor(config: OptimizationConfig) {
    this.config = config;
    this.totalArea = config.canvasWidth * config.canvasHeight;
  }

  private getSizeScore(target: 'small' | 'medium' | 'large', cellArea: number): number {
    const relativeArea = cellArea / this.totalArea;
    const targetAreas = { small: 0.05, medium: 0.4, large: 0.9 };
    const targetArea = targetAreas[target];
    return 1 - Math.abs(relativeArea - targetArea) / Math.max(targetArea, 0.1);
  }

  private getAspectRatioScore(targetRatio: number, cellRatio: number): number {
    const diff = Math.abs(targetRatio - cellRatio) / Math.max(targetRatio, cellRatio);
    return 1 - Math.min(diff, 1);
  }

  private getAreaScore(target: string, cell: GridCell): number {
    const centerX = cell.x + cell.width / 2;
    const centerY = cell.y + cell.height / 2;
    const normalizedX = centerX / this.config.canvasWidth;
    const normalizedY = centerY / this.config.canvasHeight;

    const targetPositions: Record<string, { x: number; y: number }> = {
      'center': { x: 0.5, y: 0.5 },
      'left': { x: 0.25, y: 0.5 },
      'right': { x: 0.75, y: 0.5 },
      'top': { x: 0.5, y: 0.25 },
      'bottom': { x: 0.5, y: 0.75 },
      'top-left': { x: 0.25, y: 0.25 },
      'top-right': { x: 0.75, y: 0.25 },
      'bottom-left': { x: 0.25, y: 0.75 },
      'bottom-right': { x: 0.75, y: 0.75 }
    };

    const targetPos = targetPositions[target];
    const distance = Math.sqrt(
      Math.pow(normalizedX - targetPos.x, 2) + Math.pow(normalizedY - targetPos.y, 2)
    );
    return 1 - Math.min(distance / Math.sqrt(2), 1);
  }

  private getStabilityScore(elementIndex: number, cell: GridCell, previousPositions: Map<number, GridCell>): number {
    const previousCell = previousPositions.get(elementIndex);
    if (!previousCell) return 1;

    const prevCenterX = previousCell.x + previousCell.width / 2;
    const prevCenterY = previousCell.y + previousCell.height / 2;
    const newCenterX = cell.x + cell.width / 2;
    const newCenterY = cell.y + cell.height / 2;

    const distance = Math.sqrt(
      Math.pow(newCenterX - prevCenterX, 2) + Math.pow(newCenterY - prevCenterY, 2)
    );

    const maxDistance = Math.sqrt(
      Math.pow(this.config.canvasWidth, 2) + Math.pow(this.config.canvasHeight, 2)
    );
    const normalizedDistance = distance / maxDistance;

    return 1 - Math.min(normalizedDistance, 1);
  }

  private scoreElementInCell(element: WorkerElement, elementIndex: number, cell: GridCell, previousPositions: Map<number, GridCell>): number {
    const targets = element.targets;
    const cellArea = cell.width * cell.height;
    const cellRatio = cell.width / cell.height;

    const sizeScore = this.getSizeScore(targets.size, cellArea);
    const aspectScore = this.getAspectRatioScore(targets.aspectRatio, cellRatio);
    const areaScore = this.getAreaScore(targets.area, cell);
    const stabilityScore = this.getStabilityScore(elementIndex, cell, previousPositions);

    const optimizationScore = (sizeScore * 5 + aspectScore + areaScore + stabilityScore * this.config.stabilityWeight) / (7 + this.config.stabilityWeight);
    const finalScore = (1 - this.config.stabilityWeight) * optimizationScore;

    return finalScore;
  }

  partitionSpace(bounds: GridCell, elementIndices: number[], elements: WorkerElement[], previousPositions: Map<number, GridCell>): WorkerLayout[] {
    if (elementIndices.length === 0) return [];
    if (elementIndices.length === 1) {
      const elementIndex = elementIndices[0];
      const element = elements[elementIndex];
      const previousCell = previousPositions.get(elementIndex);
      return [{
        element,
        cell: bounds,
        score: this.scoreElementInCell(element, elementIndex, bounds, previousPositions),
        previousCell
      }];
    }

    // For stability, try to keep elements close to their previous positions
    if (this.config.stabilityWeight > 0 && previousPositions.size > 0) {
      const elementScores = elementIndices.map(idx => ({
        index: idx,
        stabilityScore: this.getStabilityScore(idx, bounds, previousPositions)
      }));
      
      elementScores.sort((a, b) => b.stabilityScore - a.stabilityScore);
      elementIndices = elementScores.map(es => es.index);
    }

    let bestLayout: WorkerLayout[] = [];
    let bestScore = -Infinity;

    // Explore different split ratios to find the best layout
    const splitRatios = [0.3, 0.4, 0.5, 0.6, 0.7]; // 20/80, 40/60, 60/40, 80/20

    for (const ratio of splitRatios) {
        const numLeft = Math.max(1, Math.round(0.5 * elementIndices.length));
        if (numLeft >= elementIndices.length) continue; // Ensure both partitions are non-empty

        const leftElements = elementIndices.slice(0, numLeft);
        const rightElements = elementIndices.slice(numLeft);

        const isWide = bounds.width > bounds.height;
        let leftBounds: GridCell;
        let rightBounds: GridCell;

        if (isWide) {
            const splitX = bounds.x + bounds.width * ratio;
            leftBounds = {
                x: bounds.x,
                y: bounds.y,
                width: splitX - bounds.x,
                height: bounds.height
            };
            rightBounds = {
                x: splitX,
                y: bounds.y,
                width: bounds.x + bounds.width - splitX,
                height: bounds.height
            };
        } else {
            const splitY = bounds.y + bounds.height * ratio;
            leftBounds = {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: splitY - bounds.y
            };
            rightBounds = {
                x: bounds.x,
                y: splitY,
                width: bounds.width,
                height: bounds.y + bounds.height - splitY
            };
        }

        const currentLayout = [
            ...this.partitionSpace(leftBounds, leftElements, elements, previousPositions),
            ...this.partitionSpace(rightBounds, rightElements, elements, previousPositions)
        ];

        const currentScore = currentLayout.reduce((sum, item) => sum + item.score, 0);

        if (currentScore > bestScore) {
            bestScore = currentScore;
            bestLayout = currentLayout;
        }
    }

    return bestLayout;
  }
}

// Worker message handler
self.onmessage = function(event) {
  const { type, payload } = event.data;
  
  if (type === 'OPTIMIZE_GRID') {
    const { elements, canvasWidth, canvasHeight, previousLayouts = [], options = { stabilityWeight: 0.3 } } = payload;
    
    const config: OptimizationConfig = {
      canvasWidth,
      canvasHeight,
      stabilityWeight: options.stabilityWeight
    };
    
    const optimizer = new WorkerGridOptimizer(config);
    
    // Create map of previous positions for stability
    const previousPositions = new Map<number, GridCell>();
    previousLayouts.forEach((layout: any) => {
      const elementIndex = elements.findIndex((el: any) => el === layout.element);
      if (elementIndex >= 0) {
        previousPositions.set(elementIndex, layout.cell);
      }
    });
    
    const canvasBounds: GridCell = {
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight
    };
    
    const elementIndices = elements.map((_: any, index: number) => index);
    const layouts = optimizer.partitionSpace(canvasBounds, elementIndices, elements, previousPositions);
    
    self.postMessage({
      type: 'GRID_OPTIMIZED',
      payload: { layouts }
    });
  }
};
