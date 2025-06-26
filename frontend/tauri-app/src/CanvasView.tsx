import React, { useState } from "react";
import Canvas from "./canvas/Canvas";
import { CustomTerminal } from "./canvas/CustomTerminal";
import { Rectangle } from "./canvas/Rectangle";
import { Terminal } from "./canvas/Terminal";
import type { CanvasElement } from "./canvas/types";
import { cn } from "./utils";

interface CanvasViewProps {
	onAddElementRef?: React.MutableRefObject<
		((element: CanvasElement) => void) | null
	>;
}

// Demo elements for testing
const createDemoElements = (): CanvasElement[] => {
	const isWindows = navigator.platform.includes("Win");
	const _isMac = navigator.platform.includes("Mac");
	const _isLinux = navigator.platform.includes("Linux");

	return isWindows
		? [
				// Rectangle.canvasElement(
				// 	{ size: "large", aspectRatio: 1 / 1, area: "center" },
				// 	1,
				// ),
				// CustomTerminal.canvasElement(
				// 	{
				// 		kind: {
				// 			$type: "git-bash",
				// 		},
				// 		workingDir: "$HOME",
				// 		lines: 5,
				// 		cols: 10,
				// 	},
				// 	1,
				// ),
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
