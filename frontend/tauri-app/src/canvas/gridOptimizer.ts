// import { CanvasElement, ElementTargets, GridCell, ElementLayout, SizeTarget, AreaTarget, OptimizationOptions } from './types';

// export class GridOptimizer {
//   private canvasWidth: number;
//   private canvasHeight: number;
//   private totalArea: number;
//   private stabilityWeight: number;
//   private previousLayouts: Map<CanvasElement, GridCell>;

//   constructor(canvasWidth: number, canvasHeight: number, options: OptimizationOptions = { stabilityWeight: 0.3 }) {
//     this.canvasWidth = canvasWidth;
//     this.canvasHeight = canvasHeight;
//     this.totalArea = canvasWidth * canvasHeight;
//     this.stabilityWeight = options.stabilityWeight;
//     this.previousLayouts = new Map();
//   }

//   setPreviousLayouts(layouts: ElementLayout[]) {
//     this.previousLayouts.clear();
//     layouts.forEach(layout => {
//       this.previousLayouts.set(layout.element, layout.cell);
//     });
//   }

//   private getSizeScore(target: SizeTarget, cellArea: number): number {
//     const relativeArea = cellArea / this.totalArea;
//     const targetAreas = { small: 0.15, medium: 0.3, large: 0.5 };
//     const targetArea = targetAreas[target];
//     return 1 - Math.abs(relativeArea - targetArea) / Math.max(targetArea, 0.1);
//   }

//   private getAspectRatioScore(targetRatio: number, cellRatio: number): number {
//     const diff = Math.abs(targetRatio - cellRatio) / Math.max(targetRatio, cellRatio);
//     return 1 - Math.min(diff, 1);
//   }

//   private getAreaScore(target: AreaTarget, cell: GridCell): number {
//     const centerX = cell.x + cell.width / 2;
//     const centerY = cell.y + cell.height / 2;
//     const normalizedX = centerX / this.canvasWidth;
//     const normalizedY = centerY / this.canvasHeight;

//     const targetPositions: Record<AreaTarget, { x: number; y: number }> = {
//       'center': { x: 0.5, y: 0.5 },
//       'left': { x: 0.25, y: 0.5 },
//       'right': { x: 0.75, y: 0.5 },
//       'top': { x: 0.5, y: 0.25 },
//       'bottom': { x: 0.5, y: 0.75 },
//       'top-left': { x: 0.25, y: 0.25 },
//       'top-right': { x: 0.75, y: 0.25 },
//       'bottom-left': { x: 0.25, y: 0.75 },
//       'bottom-right': { x: 0.75, y: 0.75 }
//     };

//     const targetPos = targetPositions[target];
//     const distance = Math.sqrt(
//       Math.pow(normalizedX - targetPos.x, 2) + Math.pow(normalizedY - targetPos.y, 2)
//     );
//     return 1 - Math.min(distance / Math.sqrt(2), 1);
//   }

//   private getStabilityScore(element: CanvasElement, cell: GridCell): number {
//     const previousCell = this.previousLayouts.get(element);
//     if (!previousCell) return 1; // No previous position, no penalty

//     // Calculate distance between cell centers
//     const prevCenterX = previousCell.x + previousCell.width / 2;
//     const prevCenterY = previousCell.y + previousCell.height / 2;
//     const newCenterX = cell.x + cell.width / 2;
//     const newCenterY = cell.y + cell.height / 2;

//     const distance = Math.sqrt(
//       Math.pow(newCenterX - prevCenterX, 2) + Math.pow(newCenterY - prevCenterY, 2)
//     );

//     // Normalize by canvas diagonal
//     const maxDistance = Math.sqrt(
//       Math.pow(this.canvasWidth, 2) + Math.pow(this.canvasHeight, 2)
//     );
//     const normalizedDistance = distance / maxDistance;

//     // Return inverted score (closer to previous position = higher score)
//     return 1 - Math.min(normalizedDistance, 1);
//   }

//   private scoreElementInCell(element: CanvasElement, cell: GridCell): number {
//     const targets = element.targets();
//     const cellArea = cell.width * cell.height;
//     const cellRatio = cell.width / cell.height;

//     const sizeScore = this.getSizeScore(targets.size, cellArea);
//     const aspectScore = this.getAspectRatioScore(targets.aspectRatio, cellRatio);
//     const areaScore = this.getAreaScore(targets.area, cell);
//     const stabilityScore = this.getStabilityScore(element, cell);

//     // Combine scores with stability weight
//     const optimizationScore = (sizeScore + aspectScore + areaScore) / 3;
//     const finalScore = (1 - this.stabilityWeight) * optimizationScore + this.stabilityWeight * stabilityScore;

//     return finalScore;
//   }

//   private partitionSpace(bounds: GridCell, elements: CanvasElement[]): ElementLayout[] {
//     if (elements.length === 0) return [];
//     if (elements.length === 1) {
//       const element = elements[0];
//       const previousCell = this.previousLayouts.get(element);
//       return [{
//         element,
//         cell: bounds,
//         score: this.scoreElementInCell(element, bounds),
//         previousCell
//       }];
//     }

//     let bestLayouts: ElementLayout[] = [];
//     let bestScore = -1;

//     // Try different ways to split the space
//     const splitOptions = this.generateSplitOptions(bounds, elements.length);

//     for (const split of splitOptions) {
//       const layouts = this.evaluateSplit(bounds, elements, split);
//       const totalScore = layouts.reduce((sum, layout) => 
//         sum + layout.score * layout.element.weight, 0
//       );

//       if (totalScore > bestScore) {
//         bestScore = totalScore;
//         bestLayouts = layouts;
//       }
//     }

//     return bestLayouts;
//   }

//   private generateSplitOptions(bounds: GridCell, numElements: number): Array<{
//     direction: 'horizontal' | 'vertical';
//     position: number;
//     leftCount: number;
//     rightCount: number;
//   }> {
//     const options: Array<{
//       direction: 'horizontal' | 'vertical';
//       position: number;
//       leftCount: number;
//       rightCount: number;
//     }> = [];

//     // Try different element distributions
//     for (let leftCount = 1; leftCount < numElements; leftCount++) {
//       const rightCount = numElements - leftCount;

//       // Vertical splits (left/right)
//       const verticalRatio = leftCount / numElements;
//       const verticalPosition = bounds.x + bounds.width * verticalRatio;
      
//       options.push({
//         direction: 'vertical',
//         position: verticalPosition,
//         leftCount,
//         rightCount
//       });

//       // Horizontal splits (top/bottom)
//       const horizontalRatio = leftCount / numElements;
//       const horizontalPosition = bounds.y + bounds.height * horizontalRatio;
      
//       options.push({
//         direction: 'horizontal',
//         position: horizontalPosition,
//         leftCount,
//         rightCount
//       });
//     }

//     return options;
//   }

//   private evaluateSplit(bounds: GridCell, elements: CanvasElement[], split: {
//     direction: 'horizontal' | 'vertical';
//     position: number;
//     leftCount: number;
//     rightCount: number;
//   }): ElementLayout[] {
//     const { direction, position, leftCount, rightCount } = split;

//     let leftBounds: GridCell;
//     let rightBounds: GridCell;

//     if (direction === 'vertical') {
//       leftBounds = {
//         id: `left-${bounds.id}`,
//         x: bounds.x,
//         y: bounds.y,
//         width: position - bounds.x,
//         height: bounds.height
//       };
//       rightBounds = {
//         id: `right-${bounds.id}`,
//         x: position,
//         y: bounds.y,
//         width: bounds.x + bounds.width - position,
//         height: bounds.height
//       };
//     } else {
//       leftBounds = {
//         id: `top-${bounds.id}`,
//         x: bounds.x,
//         y: bounds.y,
//         width: bounds.width,
//         height: position - bounds.y
//       };
//       rightBounds = {
//         id: `bottom-${bounds.id}`,
//         x: bounds.x,
//         y: position,
//         width: bounds.width,
//         height: bounds.y + bounds.height - position
//       };
//     }

//     // Assign elements to left and right partitions based on their preferences
//     const elementScores = elements.map((element, index) => ({
//       element,
//       index,
//       leftScore: this.scoreElementInCell(element, leftBounds),
//       rightScore: this.scoreElementInCell(element, rightBounds)
//     }));

//     // Sort by preference difference to make optimal assignments
//     elementScores.sort((a, b) => 
//       Math.abs(b.leftScore - b.rightScore) - Math.abs(a.leftScore - a.rightScore)
//     );

//     const leftElements: CanvasElement[] = [];
//     const rightElements: CanvasElement[] = [];

//     // Assign elements to partitions
//     for (let i = 0; i < elementScores.length; i++) {
//       const { element, leftScore, rightScore } = elementScores[i];
      
//       if (leftElements.length < leftCount && 
//           (rightElements.length >= rightCount || leftScore >= rightScore)) {
//         leftElements.push(element);
//       } else {
//         rightElements.push(element);
//       }
//     }

//     // Recursively partition
//     const leftLayouts = this.partitionSpace(leftBounds, leftElements);
//     const rightLayouts = this.partitionSpace(rightBounds, rightElements);

//     return [...leftLayouts, ...rightLayouts];
//   }

//   optimize(elements: CanvasElement[]): ElementLayout[] {
//     if (elements.length === 0) return [];

//     const canvasBounds: GridCell = {
//       id: 'canvas',
//       x: 0,
//       y: 0,
//       width: this.canvasWidth,
//       height: this.canvasHeight
//     };

//     return this.partitionSpace(canvasBounds, elements);
//   }
// }
