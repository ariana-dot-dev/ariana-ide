import type { PanInfo } from "framer-motion";
import { motion } from "framer-motion";
import type React from "react";
import { useEffect } from "react";
import { cn } from "../utils";
import type { CodeEditor } from "./CodeEditor";
import { useEditorStore } from "./editor/EditorStore";
import { EditorView } from "./editor/EditorView";
import type { CanvasElement, ElementLayout, ElementTargets } from "./types";

interface CodeEditorCanvasProps {
	layout: ElementLayout;
	onDragStart: (element: CanvasElement) => void;
	onDragEnd: () => void;
	onDrag: (
		event: MouseEvent | TouchEvent | PointerEvent,
		info: PanInfo,
	) => void;
	onCodeEditorUpdate: (element: CodeEditor, newTargets: ElementTargets) => void;
	onRemoveElement: (elementId: string) => void;
	isDragTarget: boolean;
	isDragging: boolean;
}

const CodeEditorCanvas: React.FC<CodeEditorCanvasProps> = ({
	layout,
	onDragStart,
	onDragEnd,
	onDrag,
	onCodeEditorUpdate,
	onRemoveElement,
	isDragTarget,
	isDragging,
}) => {
	const { cell, element } = layout;
	const codeEditor = (element.kind as { codeEditor: CodeEditor }).codeEditor;
	const setText = useEditorStore((state) => state.setText);

	// set initial content when component mounts
	useEffect(() => {
		setText(codeEditor.getInitialContent());
	}, [codeEditor, setText]);

	const handleDragStart = () => {
		onDragStart(element);
	};

	const handleUpdateTargets = (newTargets: ElementTargets) => {
		onCodeEditorUpdate(codeEditor, newTargets);
	};

	const handleRemove = () => {
		onRemoveElement(element.id);
	};

	return (
		<motion.div
			className={cn(
				"absolute rounded-lg overflow-hidden",
				"bg-gray-900 border border-gray-700",
				isDragTarget && "ring-2 ring-blue-500",
				isDragging && "opacity-50",
			)}
			style={{
				left: cell.x,
				top: cell.y,
				width: cell.width,
				height: cell.height,
			}}
			drag
			dragMomentum={false}
			onDragStart={handleDragStart}
			onDragEnd={onDragEnd}
			onDrag={onDrag}
			whileHover={{ scale: 1.005 }}
			transition={{ duration: 0.2 }}
		>
			{/* Title bar */}
			<div className="absolute top-0 left-0 right-0 bg-gray-800 border-b border-gray-700 px-3 py-2 flex justify-between items-center">
				<span className="text-sm text-gray-300">{codeEditor.getTitle()}</span>
				<button
					onClick={handleRemove}
					className="text-gray-400 hover:text-white text-lg leading-none"
				>
					×
				</button>
			</div>

			<div className="w-full h-full pt-10">
				<EditorView className="rounded-b-lg" showLineNumbers={true} />
			</div>
		</motion.div>
	);
};

export default CodeEditorCanvas;
