import type { PanInfo } from "framer-motion";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../utils";
import type { CodeEditor } from "./CodeEditor";
import CodeEditorCanvas from "./CodeEditorCanvas";
import CustomTerminalOnCanvas from "./CustomTerminalOnCanvas";
import type { FileTreeCanvas } from "./FileTreeCanvas";
import FileTreeOnCanvas from "./FileTreeOnCanvas";
import {
	createGridWorker,
	type WorkerMessage,
	type WorkerResponse,
} from "./gridWorker";
import type { Rectangle } from "./Rectangle";
import RectangleOnCanvas from "./RectangleOnCanvas";
import type { Terminal, TerminalConfig } from "./Terminal";
import TerminalOnCanvas from "./TerminalOnCanvas";
import TextAreaOnCanvas from "./TextAreaOnCanvas";
import type { CanvasElement, ElementLayout, ElementTargets } from "./types";

interface CanvasProps {
	elements: CanvasElement[];
	stabilityWeight?: number;
	onElementsChange: (elements: CanvasElement[]) => void;
}

// Simple string hash function
const simpleHash = (str: string): number => {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0; // Convert to 32bit integer
	}
	return Math.abs(hash);
};

// Generate a stable color based on element ID
const _getColorForId = (id: string): string => {
	const hash = simpleHash(id);
	const hue = (hash % 120) + 180; // Blueish colors (180-300)
	const saturation = 60 + (hash % 20); // 60-80%
	const lightness = 50 + (hash % 20); // 50-70%
	return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.3)`;
};

const Canvas: React.FC<CanvasProps> = ({
	elements,
	stabilityWeight = 0.1,
	onElementsChange,
}) => {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [layouts, setLayouts] = useState<ElementLayout[]>([]);
	const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
	const workerRef = useRef<Worker | null>(null);

	const [draggedElement, setDraggedElement] = useState<CanvasElement | null>(
		null,
	);
	const [dragTarget, setDragTarget] = useState<CanvasElement | null>(null);
	const [dragPosition, setDragPosition] = useState<{ x: number; y: number }>({
		x: 0,
		y: 0,
	});

	// Initialize worker
	useEffect(() => {
		workerRef.current = createGridWorker();

		return () => {
			if (workerRef.current) {
				workerRef.current.terminate();
			}
		};
	}, []);

	// Request layout updates from worker
	useEffect(() => {
		if (!workerRef.current || canvasSize.width === 0 || canvasSize.height === 0)
			return;

		const message: WorkerMessage = {
			type: "OPTIMIZE_GRID",
			payload: {
				elements: elements.map((e) => ({
					id: e.id,
					targets: e.targets,
					weight: e.weight,
				})),
				canvasWidth: canvasSize.width,
				canvasHeight: canvasSize.height,
				options: { stabilityWeight },
			},
		};

		workerRef.current.postMessage(message);

		const handleMessage = (event: MessageEvent<WorkerResponse>) => {
			if (event.data.type === "GRID_OPTIMIZED") {
				const newLayouts = event.data.payload.layouts
					.map((layout) => {
						const element = elements.find((e) => e.id === layout.element.id);
						if (!element) return null;
						return {
							element,
							cell: layout.cell,
							score: layout.score,
							previousCell: layout.previousCell,
						} satisfies ElementLayout;
					})
					.filter((l) => l !== null);
				setLayouts(newLayouts);
			}
		};

		workerRef.current.addEventListener("message", handleMessage);

		return () => {
			if (workerRef.current) {
				workerRef.current.removeEventListener("message", handleMessage);
			}
		};
	}, [elements, canvasSize, stabilityWeight]);

	// Handle canvas resize
	useEffect(() => {
		if (!canvasRef.current) return;

		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setCanvasSize({
					width: entry.contentRect.width,
					height: entry.contentRect.height,
				});
			}
		});

		resizeObserver.observe(canvasRef.current);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	const handleDragStart = useCallback((element: CanvasElement) => {
		console.log("Canvas: handleDragStart", element.id);
		setDraggedElement(element);
		setDragTarget(null);
	}, []);

	const handleDragEnd = useCallback(
		(element: CanvasElement) => {
			console.log("Canvas: handleDragEnd", element.id);
			if (dragTarget && draggedElement) {
				// Find indices of the dragged element and target
				const draggedIndex = elements.findIndex(
					(el) => el.id === draggedElement.id,
				);
				const targetIndex = elements.findIndex((el) => el.id === dragTarget.id);

				if (draggedIndex !== -1 && targetIndex !== -1) {
					// Create a new array with swapped elements
					const newElements = [...elements];
					[newElements[draggedIndex], newElements[targetIndex]] = [
						newElements[targetIndex],
						newElements[draggedIndex],
					];
					onElementsChange(newElements);
				}
			}

			setDraggedElement(null);
			setDragTarget(null);
			setDragPosition({ x: 0, y: 0 });
		},
		[dragTarget, draggedElement, elements, onElementsChange],
	);

	const handleDrag = useCallback(
		(event: unknown, info: PanInfo) => {
			console.log(
				`Canvas: handleDrag received. Delta: x=${info.delta.x}, y=${info.delta.y}`,
			);
			// Find the element under the drag position
			const point = info.point;

			// Check all layouts to see if we're over a different element
			for (const layout of layouts) {
				const { cell } = layout;
				if (
					layout.element !== draggedElement &&
					point.x >= cell.x &&
					point.x <= cell.x + cell.width &&
					point.y >= cell.y &&
					point.y <= cell.y + cell.height
				) {
					if (dragTarget !== layout.element) {
						setDragTarget(layout.element);
					}
					break;
				}
			}

			setDragPosition({
				x: info.point.x,
				y: info.point.y,
			});
		},
		[layouts, draggedElement, dragTarget],
	);

	// CRUD operations for elements
	const handleRectangleUpdate = useCallback(
		(element: Rectangle, newTargets: ElementTargets) => {
			// Find and update the element
			const newElements = elements.map((el) => {
				if ("rectangle" in el.kind && el.kind.rectangle === element) {
					const rect = (el.kind as { rectangle: Rectangle }).rectangle;
					rect.updateTargets({
						size: newTargets.size || rect.targets().size,
						aspectRatio: newTargets.aspectRatio || rect.targets().aspectRatio,
						area: newTargets.area || rect.targets().area,
					});
					return el;
				}
				return el;
			});
			onElementsChange(newElements);
		},
		[elements, onElementsChange],
	);

	const handleTerminalUpdate = useCallback(
		(element: Terminal, newConfig: TerminalConfig) => {
			// Find and update the element
			const newElements = elements.map((el) => {
				if ("terminal" in el.kind && el.kind.terminal === element) {
					const terminal = (el.kind as { terminal: Terminal }).terminal;
					terminal.updateConfig(newConfig);
					return el;
				}
				return el;
			});
			onElementsChange(newElements);
		},
		[elements, onElementsChange],
	);

	const handleFileTreeUpdate = useCallback(
		(element: FileTreeCanvas, newTargets: ElementTargets) => {
			// Find and update the element
			const newElements = elements.map((el) => {
				if ("fileTree" in el.kind && el.kind.fileTree === element) {
					const fileTree = (el.kind as { fileTree: FileTreeCanvas }).fileTree;
					fileTree.updateTargets({
						size: newTargets.size || fileTree.targets().size,
						aspectRatio:
							newTargets.aspectRatio || fileTree.targets().aspectRatio,
						area: newTargets.area || fileTree.targets().area,
					});
					return el;
				}
				return el;
			});
			onElementsChange(newElements);
		},
		[elements, onElementsChange],
	);

	const handleCodeEditorUpdate = useCallback(
		(element: CodeEditor, newTargets: ElementTargets) => {
			// Find and update the element
			const newElements = elements.map((el) => {
				if ("codeEditor" in el.kind && el.kind.codeEditor === element) {
					const codeEditor = (el.kind as { codeEditor: CodeEditor }).codeEditor;
					codeEditor.updateTargets({
						size: newTargets.size || codeEditor.targets().size,
						aspectRatio:
							newTargets.aspectRatio || codeEditor.targets().aspectRatio,
						area: newTargets.area || codeEditor.targets().area,
					});
					return el;
				}
				return el;
			});
			onElementsChange(newElements);
		},
		[elements, onElementsChange],
	);

	const handleRemoveElement = useCallback(
		(elementId: string) => {
			const newElements = elements.filter((el) => el.id !== elementId);
			onElementsChange(newElements);
		},
		[elements, onElementsChange],
	);

	return (
		<div ref={canvasRef} className={cn("relative flex w-full h-full")}>
			{layouts.map((layout) => {
				if ("rectangle" in layout.element.kind) {
					return (
						<RectangleOnCanvas
							key={`${layout.element.id}`}
							layout={layout}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onDrag={layout.element === draggedElement ? handleDrag : () => {}}
							onRectangleUpdate={handleRectangleUpdate}
							onRemoveElement={handleRemoveElement}
							isDragTarget={layout.element === dragTarget}
							isDragging={layout.element === draggedElement}
						/>
					);
				} else if ("terminal" in layout.element.kind) {
					return (
						<TerminalOnCanvas
							key={`${layout.element.id}`}
							layout={layout}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onDrag={layout.element === draggedElement ? handleDrag : () => {}}
							onTerminalUpdate={handleTerminalUpdate}
							onRemoveElement={handleRemoveElement}
							isDragTarget={layout.element === dragTarget}
							isDragging={layout.element === draggedElement}
						/>
					);
				} else if ("customTerminal" in layout.element.kind) {
					return (
						<CustomTerminalOnCanvas
							key={`${layout.element.id}`}
							layout={layout}
							spec={layout.element.kind.customTerminal.spec}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onDrag={layout.element === draggedElement ? handleDrag : () => {}}
							isDragTarget={layout.element === dragTarget}
							isDragging={layout.element === draggedElement}
						/>
					);
				} else if ("fileTree" in layout.element.kind) {
					console.log(
						"Canvas: Rendering FileTreeOnCanvas for element:",
						layout.element.id,
					);
					return (
						<FileTreeOnCanvas
							key={`${layout.element.id}`}
							layout={layout}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onDrag={layout.element === draggedElement ? handleDrag : () => {}}
							onFileTreeUpdate={handleFileTreeUpdate}
							onRemoveElement={handleRemoveElement}
							isDragTarget={layout.element === dragTarget}
							isDragging={layout.element === draggedElement}
						/>
					);
				} else if ("textArea" in layout.element.kind) {
					return (
						<TextAreaOnCanvas
							key={`${layout.element.id}`}
							layout={layout}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onDrag={layout.element === draggedElement ? handleDrag : () => {}}
							isDragTarget={layout.element === dragTarget}
							isDragging={layout.element === draggedElement}
						/>
					);
				} else if ("codeEditor" in layout.element.kind) {
					return (
						<CodeEditorCanvas
							key={`${layout.element.id}`}
							layout={layout}
							onDragStart={handleDragStart}
							onDragEnd={handleDragEnd}
							onDrag={layout.element === draggedElement ? handleDrag : () => {}}
							onCodeEditorUpdate={handleCodeEditorUpdate}
							onRemoveElement={handleRemoveElement}
							isDragTarget={layout.element === dragTarget}
							isDragging={layout.element === draggedElement}
						/>
					);
				}
				return (
					<div key={`${layout.element.id}`}>
						None: {JSON.stringify(layout.element)}
					</div>
				);
			})}
		</div>
	);
};

export default Canvas;
