import { Element, ElementTargets } from './types';

export class Rectangle extends Element {
  private _targets: ElementTargets;
  public id: string;

  constructor(targets: ElementTargets, weight: number = 1) {
    super(weight);
    this._targets = targets;
    this.id = Math.random().toString(36).substr(2, 9); // Generate unique ID
  }

  targets(): ElementTargets {
    return this._targets;
  }

  updateTargets(newTargets: Partial<ElementTargets>): void {
    this._targets = { ...this._targets, ...newTargets };
  }
}
