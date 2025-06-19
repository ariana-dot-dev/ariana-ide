import { Element, ElementTargets } from './types';

export class Rectangle extends Element {
  private _targets: ElementTargets;

  constructor(targets: ElementTargets, weight: number = 1) {
    super(weight);
    this._targets = targets;
  }

  targets(): ElementTargets {
    return this._targets;
  }
}
