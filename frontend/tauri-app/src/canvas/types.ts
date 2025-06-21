import { Rectangle } from "./Rectangle";
import { Terminal } from "./Terminal";
import { CustomTerminal } from "./CustomTerminal";

export type SizeTarget = 'small' | 'medium' | 'large';
export type AreaTarget = 'center' | 'left' | 'top' | 'right' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ElementTargets {
  size: SizeTarget;
  aspectRatio: number;
  area: AreaTarget;
}

export interface GridCell {
  id: string;
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

export type CanvasElementKind = 
  | RectangleKind
  | TerminalKind
  | CustomTerminalKind;

export type RectangleKind = { rectangle: Rectangle };
export type TerminalKind = { terminal: Terminal };
export type CustomTerminalKind = { customTerminal: CustomTerminal };

export class CanvasElement {
  public weight: number;
  public id: string;
  public kind: CanvasElementKind;

  constructor(kind: CanvasElementKind, weight: number = 1) {
    this.weight = weight;
    this.id = Math.random().toString(36).substring(2, 9); // Generate unique ID
    this.kind = kind;
  }

  get targets(): ElementTargets {
    if ("rectangle" in this.kind) {
      return this.kind.rectangle.targets();
    } else if ("terminal" in this.kind) {
      return this.kind.terminal.targets();
    } else if ("customTerminal" in this.kind) {
      return this.kind.customTerminal.targets();
    }
    throw new Error("Invalid kind");
  }
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
