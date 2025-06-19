import { Element, ElementTargets, GridCell, ElementLayout, SizeTarget, AreaTarget } from './types';

interface GridConfiguration {
  rows: number;
  cols: number;
  cells: GridCell[];
}

export class GridOptimizer {
  private canvasWidth: number;
  private canvasHeight: number;

  constructor(canvasWidth: number, canvasHeight: number) {
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  private getSizeScore(target: SizeTarget, cellArea: number, totalArea: number): number {
    const relativeArea = cellArea / totalArea;
    const targetAreas = { small: 0.15, medium: 0.3, large: 0.5 };
    const targetArea = targetAreas[target];
    return 1 - Math.abs(relativeArea - targetArea) / targetArea;
  }

  private getAspectRatioScore(targetRatio: number, cellRatio: number): number {
    const diff = Math.abs(targetRatio - cellRatio) / Math.max(targetRatio, cellRatio);
    return 1 - Math.min(diff, 1);
  }

  private getAreaScore(target: AreaTarget, cell: GridCell, canvas: { width: number; height: number }): number {
    const centerX = cell.x + cell.width / 2;
    const centerY = cell.y + cell.height / 2;
    const normalizedX = centerX / canvas.width;
    const normalizedY = centerY / canvas.height;

    const targetPositions: Record<AreaTarget, { x: number; y: number }> = {
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

  private scoreElementInCell(element: Element, cell: GridCell): number {
    const targets = element.targets();
    const totalArea = this.canvasWidth * this.canvasHeight;
    const cellArea = cell.width * cell.height;
    const cellRatio = cell.width / cell.height;

    const sizeScore = this.getSizeScore(targets.size, cellArea, totalArea);
    const aspectScore = this.getAspectRatioScore(targets.aspectRatio, cellRatio);
    const areaScore = this.getAreaScore(targets.area, cell, { 
      width: this.canvasWidth, 
      height: this.canvasHeight 
    });

    return (sizeScore + aspectScore + areaScore) / 3;
  }

  private generateGridConfigurations(numElements: number): GridConfiguration[] {
    const configs: GridConfiguration[] = [];
    const canvasRatio = this.canvasWidth / this.canvasHeight;

    // Generate different row/col combinations that multiply to numElements
    for (let rows = 1; rows <= numElements; rows++) {
      if (numElements % rows === 0) {
        const cols = numElements / rows;
        const cellWidth = this.canvasWidth / cols;
        const cellHeight = this.canvasHeight / rows;
        
        const cells: GridCell[] = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            cells.push({
              x: c * cellWidth,
              y: r * cellHeight,
              width: cellWidth,
              height: cellHeight
            });
          }
        }

        configs.push({ rows, cols, cells });
      }
    }

    return configs;
  }

  private optimizeAssignment(elements: Element[], cells: GridCell[]): ElementLayout[] {
    // Use Hungarian algorithm approximation for optimal assignment
    const layouts: ElementLayout[] = [];
    const usedCells = new Set<number>();
    const remainingElements = [...elements];

    // Greedy assignment based on scores
    while (remainingElements.length > 0) {
      let bestScore = -1;
      let bestElementIndex = -1;
      let bestCellIndex = -1;

      for (let i = 0; i < remainingElements.length; i++) {
        const element = remainingElements[i];
        for (let j = 0; j < cells.length; j++) {
          if (usedCells.has(j)) continue;
          
          const score = this.scoreElementInCell(element, cells[j]) * element.weight;
          if (score > bestScore) {
            bestScore = score;
            bestElementIndex = i;
            bestCellIndex = j;
          }
        }
      }

      if (bestElementIndex >= 0 && bestCellIndex >= 0) {
        const element = remainingElements[bestElementIndex];
        layouts.push({
          element,
          cell: cells[bestCellIndex],
          score: bestScore
        });
        usedCells.add(bestCellIndex);
        remainingElements.splice(bestElementIndex, 1);
      } else {
        break;
      }
    }

    return layouts;
  }

  optimize(elements: Element[]): ElementLayout[] {
    if (elements.length === 0) return [];

    const configurations = this.generateGridConfigurations(elements.length);
    let bestLayouts: ElementLayout[] = [];
    let bestTotalScore = -1;

    for (const config of configurations) {
      const layouts = this.optimizeAssignment(elements, config.cells);
      const totalScore = layouts.reduce((sum, layout) => sum + layout.score * layout.element.weight, 0);
      
      if (totalScore > bestTotalScore) {
        bestTotalScore = totalScore;
        bestLayouts = layouts;
      }
    }

    return bestLayouts;
  }
}
