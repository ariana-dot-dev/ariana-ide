import { ElementTargets, CanvasElement } from "./types";
import { TerminalSpec } from "../services/CustomTerminalAPI";

export class CustomTerminal {
	public spec: TerminalSpec;

	constructor(spec: TerminalSpec) {
		this.spec = spec;
	}

	targets(): ElementTargets {
		return {
			size: "large",
			aspectRatio: 16 / 9, // Terminal aspect ratio
			area: "center",
		};
	}

	static canvasElement(spec: TerminalSpec, weight: number = 1): CanvasElement {
		const terminal = new CustomTerminal(spec);
		return new CanvasElement({ customTerminal: terminal }, weight);
	}
}
