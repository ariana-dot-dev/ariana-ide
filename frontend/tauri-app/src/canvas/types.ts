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
  element: Element;
  cell: GridCell;
  score: number;
}

export abstract class Element {
  public weight: number;

  constructor(weight: number = 1) {
    this.weight = weight;
  }

  abstract targets(): ElementTargets;
}

export interface CanvasState {
  elements: Element[];
  layouts: ElementLayout[];
  canvasWidth: number;
  canvasHeight: number;
}
