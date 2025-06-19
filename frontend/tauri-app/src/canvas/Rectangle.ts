import { CanvasElement, ElementTargets } from './types';

export class Rectangle extends CanvasElement {
  private _targets: ElementTargets;

  constructor(targets: ElementTargets, weight: number = 1) {
    super(weight);
    this._targets = targets;
  }

  targets(): ElementTargets {
    return this._targets;
  }

  updateTargets(newTargets: Partial<ElementTargets>): void {
    this._targets = { ...this._targets, ...newTargets };
  }
}
