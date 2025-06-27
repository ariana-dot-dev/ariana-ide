import { motion, type PanInfo } from "framer-motion";
import type React from "react";
import { useState } from "react";
import { FileTree } from "../components/FileTree";
import { useStore } from "../state";
import { cn } from "../utils";
import { CanvasHeader } from "./CanvasHeader";
import type { FileTreeCanvas } from "./FileTreeCanvas";
import type { CanvasElement, ElementLayout, ElementTargets } from "./types";

interface FileTreeOnCanvasProps {
	layout: ElementLayout;
	onDragStart: (element: CanvasElement) => void;
	onDragEnd: (element: CanvasElement) => void;
	onDrag: (
		event: MouseEvent | TouchEvent | PointerEvent,
		info: PanInfo,
	) => void;
	onFileTreeUpdate: (
		element: FileTreeCanvas,
		newTargets: ElementTargets,
	) => void;
	onRemoveElement: (elementId: string) => void;
	isDragTarget: boolean;
	isDragging: boolean;
}

const FileTreeOnCanvas: React.FC<FileTreeOnCanvasProps> = ({
	layout,
	onDragStart: propOnDragStart,
	onDragEnd: propOnDragEnd,
	onDrag: propOnDrag,
	onFileTreeUpdate,
	onRemoveElement,
	isDragTarget,
	isDragging,
}) => {
	const { cell, element } = layout;
	const [isHovered, setIsHovered] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [rootPath, setRootPath] = useState(
		"fileTree" in element.kind ? element.kind.fileTree.rootPath : "/Users/ale",
	);
	const { theme } = useStore();

	const handleDragStartInternal = () => {
		propOnDragStart(element);
	};

	const handleDragEndInternal = () => {
		propOnDragEnd(element);
	};

	const handleFileSelect = (path: string) => {
		// TODO: Implement file opening logic
	};

	const changeDirectory = () => {
		const newPath = prompt("Enter directory path:", rootPath);
		if (newPath && "fileTree" in element.kind) {
			element.kind.fileTree.setRootPath(newPath);
			setRootPath(newPath);
		}
	};

	return (
		<motion.div
			className={cn(
				`absolute cursor-move select-none`,
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
				handleDragStartInternal();
			}}
			onDragEnd={() => {
				setDragging(false);
				handleDragEndInternal();
			}}
			onDrag={(event, info) => {
				if (typeof propOnDrag === "function") {
					propOnDrag(event, info);
				}
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => {
				setIsHovered(false);
			}}
		>
			<div
				className={cn(
					"w-full h-full rounded-md backdrop-blur-md bg-[var(--base-400)]/90 border border-[var(--acc-600)]/20 overflow-hidden flex flex-col",
					`theme-${theme}`,
				)}
			>
				<CanvasHeader
					title="Files"
					icon="📁"
					onRemove={() => onRemoveElement(element.id)}
				/>

				{/* File Tree Content */}
				<div className="flex-1 overflow-auto p-2">
					<div className="text-xs text-[var(--acc-400)] mb-1 px-1 truncate">
						{rootPath}
					</div>
					<div className="text-xs">
						<FileTree rootPath={rootPath} onFileSelect={handleFileSelect} />
					</div>
				</div>
			</div>
		</motion.div>
	);
};

export default FileTreeOnCanvas;
