import { CanvasElement, ElementTargets } from './types';

export class Rectangle {
  private _targets: ElementTargets;

  constructor(targets: ElementTargets) {
    this._targets = targets;
  }

  targets(): ElementTargets {
    return this._targets;
  }

  updateTargets(newTargets: Partial<ElementTargets>): void {
    this._targets = { ...this._targets, ...newTargets };
  }

  static canvasElement(targets: ElementTargets, weight: number = 1): CanvasElement {
    return new CanvasElement({ rectangle: new Rectangle(targets) }, weight);
  }
}
