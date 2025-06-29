import React, { useState } from "react";
import Canvas from "./canvas/Canvas";
import { CodeEditor } from "./canvas/CodeEditor";
import { CustomTerminal } from "./canvas/CustomTerminal";
import { FileTreeCanvas } from "./canvas/FileTreeCanvas";
import { Rectangle } from "./canvas/Rectangle";
import { Terminal } from "./canvas/Terminal";
import { TextArea } from "./canvas/TextArea";
import type { CanvasElement } from "./canvas/types";
import { cn } from "./utils";

interface CanvasViewProps {
	onAddElementRef?: React.RefObject<((element: CanvasElement) => void) | null>;
}

// Demo elements for testing
const createDemoElements = async (): Promise<CanvasElement[]> => {
	const isWindows = navigator.platform.includes("Win");
	const _isMac = navigator.platform.includes("Mac");
	const _isLinux = navigator.platform.includes("Linux");

	try {
		// Get current directory for file tree
		const { invoke } = await import("@tauri-apps/api/core");
		const currentDir = await invoke<string>("get_current_dir");

		// Create file tree on left and code editor on right
		const fileTree = FileTreeCanvas.canvasElement(
			{
				size: "medium",
				aspectRatio: 0.6,
				area: "left",
			},
			currentDir,
			1,
		);

		const codeEditor = CodeEditor.canvasElement(
			{
				size: "large",
				aspectRatio: 16 / 9,
				area: "right",
			},
			1,
			"Code Editor",
			"// Open a file from the file tree to start editing\n",
		);

		return isWindows ? [fileTree, codeEditor] : [fileTree, codeEditor];
	} catch (error) {
		console.error("Failed to get current directory:", error);
		// Fallback to default elements
		return isWindows
			? [TextArea.canvasElement("")]
			: [
					CodeEditor.canvasElement(
						{ size: "large", aspectRatio: 16 / 9, area: "center" },
						1,
					),
					Terminal.createLocalShell(),
				];
	}
};

const CanvasView: React.FC<CanvasViewProps> = ({ onAddElementRef }) => {
	const [elements, setElements] = useState<CanvasElement[]>([]);
	const [stabilityWeight, _setStabilityWeight] = useState(0.3);

	// Initialize elements asynchronously
	React.useEffect(() => {
		createDemoElements().then(setElements);
	}, []);

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
