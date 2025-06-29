import React, { useState } from "react";
import Canvas from "./canvas/Canvas";
import { Rectangle } from "./canvas/Rectangle";
import { Terminal } from "./canvas/Terminal";
import { CanvasElement } from "./canvas/types";
import { cn } from "./utils";
import { TextArea } from "./canvas/TextArea";

interface CanvasViewProps {
	onAddElementRef?: React.RefObject<((element: CanvasElement) => void) | null>;
}

// Demo elements for testing
const createDemoElements = (): CanvasElement[] => {
	const isWindows = navigator.platform.includes("Win");
	const _isMac = navigator.platform.includes("Mac");
	const _isLinux = navigator.platform.includes("Linux");

	return isWindows
		? [
				// Create a Claude Code text area with a default prompt
				TextArea.canvasElement(""),
				// CustomTerminal.canvasElement(
				// 	{
				// 		kind: {
				// 			$type: "wsl",
				// 			distribution: "Ubuntu",
				// 			workingDirectory: "~",
				// 		},
				// 		lines: 5,
				// 		cols: 10,
				// 	},
				// 	1,
				// ),
			]
		: [
				Rectangle.canvasElement(
					{ size: "large", aspectRatio: 1 / 1, area: "center" },
					1,
				),
				Terminal.createLocalShell(),
			];
};

const CanvasView: React.FC<CanvasViewProps> = ({ onAddElementRef }) => {
	const [elements, setElements] = useState<CanvasElement[]>(() =>
		createDemoElements(),
	);
	const [stabilityWeight, _setStabilityWeight] = useState(0.3);

	const handleElementsChange = (newElements: CanvasElement[]) => {
		setElements(newElements);
	};

	const addElement = (element: CanvasElement) => {
		setElements((prev) => [...prev, element]);
	};

	// Expose addElement function to parent
	React.useEffect(() => {
		if (onAddElementRef) {
			onAddElementRef.current = addElement;
		}
	}, [onAddElementRef]);

	return (
		<div className="w-full h-full">
			<Canvas
				elements={elements}
				stabilityWeight={stabilityWeight}
				onElementsChange={handleElementsChange}
			/>
		</div>
	);
};

export default CanvasView;
