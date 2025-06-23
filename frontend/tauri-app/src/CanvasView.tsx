import React, { useState } from "react";
import Canvas from "./canvas/Canvas";
import { Rectangle } from "./canvas/Rectangle";
import { Terminal } from "./canvas/Terminal";
import { CustomTerminal } from "./canvas/CustomTerminal";
import { CanvasElement, SizeTarget, AreaTarget } from "./canvas/types";
import { cn } from "./utils";

// Demo elements for testing
const createDemoElements = (): CanvasElement[] => {
	return [
		Rectangle.canvasElement(
			{ size: "large", aspectRatio: 1 / 1, area: "center" },
			1,
		),
		// Terminal.canvasElement({
		//     kind: {
		//       $type: 'git-bash',
		//       workingDirectory: 'C:\\Users\\mr003\\riana'
		//     },
		//     environment: {},
		//     shellCommand: '',
		//     colorScheme: 'default',
		//     fontSize: 14,
		//     fontFamily: 'Space Mono'
		// }, 1),
		// Terminal.canvasElement({
		//   kind: {
		//     $type: 'wsl',
		//     distribution: 'Ubuntu'
		//   },
		//   environment: {},
		//   shellCommand: '',
		//   colorScheme: 'default',
		//   fontSize: 14,
		//   fontFamily: 'Space Mono'
		// }, 1),<
		CustomTerminal.canvasElement(
			{
				kind: {
					$type: "git-bash",
				},
				workingDir: "$HOME",
				lines: 5,
				cols: 10,
			},
			1,
		),
		CustomTerminal.canvasElement(
			{
				kind: {
					$type: "wsl",
					distribution: "Ubuntu",
					workingDirectory: "~",
				},
				lines: 5,
				cols: 10,
			},
			1,
		),
		// new Terminal({
		//   kind: {
		//     $type: 'ssh',
		//     host: 'example.com',
		//     username: 'user',
		//     port: 22
		//   }
		// }),
		// new Terminal({
		//   kind: {
		//     $type: 'git-bash',
		//     workingDirectory: 'C:\\Users\\mr003\\riana'
		//   }
		// }),
	];
};

// Create platform-appropriate terminals
const createDefaultElements = (): CanvasElement[] => {
	const elements: CanvasElement[] = [];

	// Add a rectangle for visual variety
	elements.push(
		Rectangle.canvasElement({ size: "medium", aspectRatio: 1, area: "center" }),
	);

	// Detect platform and add appropriate terminals
	const isMac = navigator.platform.includes("Mac");
	const isWindows = navigator.platform.includes("Win");
	const isLinux = navigator.platform.includes("Linux");

	if (isMac || isLinux) {
		// Default shell terminal
		elements.push(Terminal.createLocalShell());

		// Zsh terminal (common on macOS)
		elements.push(Terminal.createLocalShell("/bin/zsh", "~"));

		// Bash terminal for compatibility
		elements.push(Terminal.createLocalShell("/opt/homebrew/bin/bash", "~"));
	}

	return elements;
};

const CanvasView: React.FC = () => {
	const [elements, setElements] = useState<CanvasElement[]>(() =>
		createDefaultElements(),
	);
	const [stabilityWeight, setStabilityWeight] = useState(0.3);

	const handleElementsChange = (newElements: CanvasElement[]) => {
		setElements(newElements);
	};

	return (
		<div
			className={cn("absolute top-0 left-0 w-screen h-screen overflow-hidden")}
		>
			<Canvas
				elements={elements}
				stabilityWeight={stabilityWeight}
				onElementsChange={handleElementsChange}
			/>
		</div>
	);
};

export default CanvasView;
