import React, { useState, useEffect } from "react";
import Canvas from "./canvas/Canvas";
import { CodeEditor } from "./canvas/CodeEditor";
import { CustomTerminal } from "./canvas/CustomTerminal";
import { FileTreeCanvas } from "./canvas/FileTreeCanvas";
import { Rectangle } from "./canvas/Rectangle";
import { Terminal } from "./canvas/Terminal";
import { TextArea } from "./canvas/TextArea";
import type { CanvasElement } from "./canvas/types";

interface CanvasViewProps {
	elements: CanvasElement[];
	onElementsChange: (elements: CanvasElement[]) => void;
	onAddElementRef?: React.RefObject<((element: CanvasElement) => void) | null>;
}

const CanvasView: React.FC<CanvasViewProps> = ({
	elements,
	onElementsChange,
	onAddElementRef,
}) => {
	const [stabilityWeight, _setStabilityWeight] = useState(0.3);
	return (
		<div className="w-full h-full">
			<Canvas
				elements={elements}
				stabilityWeight={stabilityWeight}
				onElementsChange={onElementsChange}
			/>
		</div>
	);
};

export default CanvasView;
