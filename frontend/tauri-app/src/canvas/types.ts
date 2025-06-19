export type SizeTarget = 'small' | 'medium' | 'large';
export type AreaTarget = 'center' | 'left' | 'top' | 'right' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ElementTargets {
  size: SizeTarget;
  aspectRatio: number;
  area: AreaTarget;
}

export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementLayout {
  element: CanvasElement;
  cell: GridCell;
  score: number;
  previousCell?: GridCell;
}

export abstract class CanvasElement {
  public weight: number;
  public id: string;

  constructor(weight: number = 1) {
    this.weight = weight;
    this.id = Math.random().toString(36).substring(2, 9); // Generate unique ID
  }

  abstract targets(): ElementTargets;
}

export interface CanvasState {
  elements: CanvasElement[];
  layouts: ElementLayout[];
  canvasWidth: number;
  canvasHeight: number;
}

export interface OptimizationOptions {
  stabilityWeight: number; // 0-1, how much to favor stability vs optimization
}
