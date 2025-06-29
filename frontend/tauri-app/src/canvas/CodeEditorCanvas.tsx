import type { PanInfo } from "framer-motion";
import { motion } from "framer-motion";
import type React from "react";
import { useState } from "react";
import { cn } from "../utils";
import { CanvasHeader } from "./CanvasHeader";
import type { CodeEditor } from "./CodeEditor";
import { EditorView } from "./editor/EditorView";
import { TabBar } from "./TabBar";
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
	const [dragging, setDragging] = useState(false);

	const handleDragStart = () => {
		setDragging(true);
		onDragStart(element);
	};

	const _handleUpdateTargets = (newTargets: ElementTargets) => {
		onCodeEditorUpdate(codeEditor, newTargets);
	};

	const handleRemove = () => {
		onRemoveElement(element.id);
	};

	return (
		<motion.div
			className={cn(
				"absolute cursor-move select-none",
				isDragging ? "z-30" : "z-10",
			)}
			initial={{
				x: cell.x + 4,
				y: cell.y + 4,
				width: cell.width - 8,
				height: cell.height - 8,
			}}
			animate={
				!dragging
					? {
							x: cell.x + 4,
							y: cell.y + 4,
							width: cell.width - 8,
							height: cell.height - 8,
						}
					: undefined
			}
			transition={{
				type: "tween",
				duration: 0.2,
			}}
			layout
			drag
			dragMomentum={false}
			onMouseDown={() => {
				if (!dragging) {
					setDragging(true);
				}
			}}
			onDragStart={() => {
				setDragging(true);
				handleDragStart();
			}}
			onDragEnd={() => {
				setDragging(false);
				onDragEnd();
			}}
			onDrag={onDrag}
		>
			<div
				className={cn(
					"w-full h-full rounded-md backdrop-blur-md bg-[var(--base-400)]/90 border border-[var(--acc-600)]/20 overflow-hidden flex flex-col",
					isDragTarget && "ring-2 ring-[var(--acc-500)]",
				)}
			>
				<CanvasHeader title={codeEditor.getTitle()} onRemove={handleRemove} />
				<TabBar />
				<div className="flex-1 p-2 min-h-0">
					<EditorView className="rounded-b-lg h-full" showLineNumbers={true} />
				</div>
			</div>
		</motion.div>
	);
};

export default CodeEditorCanvas;
