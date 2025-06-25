import { motion, type PanInfo } from "framer-motion";
import type React from "react";
import { useState } from "react";
import Logo from "../components/Logo";
import { useStore } from "../state";
import { cn } from "../utils";
import type { Rectangle } from "./Rectangle";
import type { CanvasElement, ElementLayout, ElementTargets } from "./types";

interface RectangleOnCanvasProps {
	layout: ElementLayout;
	onDragStart: (element: CanvasElement) => void;
	onDragEnd: (element: CanvasElement) => void;
	onDrag: (
		event: MouseEvent | TouchEvent | PointerEvent,
		info: PanInfo,
	) => void;
	onRectangleUpdate: (element: Rectangle, newTargets: ElementTargets) => void;
	onRemoveElement: (elementId: string) => void;
	isDragTarget: boolean;
	isDragging: boolean;
}

const RectangleOnCanvas: React.FC<RectangleOnCanvasProps> = ({
	layout,
	onDragStart: propOnDragStart,
	onDragEnd: propOnDragEnd,
	onDrag: propOnDrag,
	onRectangleUpdate,
	onRemoveElement,
	isDragTarget,
	isDragging,
}) => {
	const { cell, element } = layout;
	const [isHovered, setIsHovered] = useState(false);
	const [showOverlay, setShowOverlay] = useState(false);
	const [dragging, setDragging] = useState(false);
	const { theme, isLightTheme } = useStore();

	if (isDragging) {
		console.log(
			`RectangleOnCanvas for ${element.id} IS DRAGGING. Received propOnDrag type: ${typeof propOnDrag}`,
		);
	} else if (
		typeof propOnDrag === "function" &&
		propOnDrag.toString().includes("handleDrag")
	) {
		console.warn(
			`RectangleOnCanvas for ${element.id} NOT DRAGGING but received actual handleDrag function.`,
		);
	}

	const handleDragStartInternal = () => {
		console.log(`INTERNAL handleDragStart for: ${element.id}`);
		propOnDragStart(element);
	};

	const handleDragEndInternal = () => {
		console.log(`INTERNAL handleDragEnd for: ${element.id}`);
		propOnDragEnd(element);
	};

	const handleElementUpdate = (
		updatedElement: Rectangle,
		newTargets: ElementTargets,
	) => {
		onRectangleUpdate(updatedElement, newTargets);
	};

	return (
		<motion.div
			className={cn(
				`absolute p-1 cursor-move select-none`,
				isDragging ? "z-30" : "z-10",
			)}
			initial={{
				x: cell.x,
				y: cell.y,
				width: cell.width,
				height: cell.height,
			}}
			animate={
				!dragging
					? {
							x: cell.x,
							y: cell.y,
							width: cell.width,
							height: cell.height,
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
				console.log(
					`MOTION.DIV onDrag FIRED for ${element.id}. isDragging: ${isDragging}. Type of propOnDrag: ${typeof propOnDrag}`,
				);
				if (typeof propOnDrag === "function") {
					propOnDrag(event, info);
				} else {
					console.error(
						`propOnDrag is NOT a function for ${element.id}! Type: ${typeof propOnDrag}.`,
					);
				}
			}}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => {
				setIsHovered(false);
			}}
		>
			<div
				className={cn(
					"w-full h-full rounded-md backdrop-blur-md bg-[var(--bg-400)]/90 border border-[var(--fg-600)]/20 overflow-hidden flex flex-col",
				)}
			>
				{/* Header */}
				<div className="flex items-center justify-between p-2 border-b border-[var(--fg-600)]/20 bg-[var(--bg-500)]/50">
					<span className="text-xs font-medium">✨ Ariana</span>
					<button
						type="button"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onRemoveElement(element.id);
						}}
						className="text-xs w-6 h-6 bg-[var(--fg-800)] hover:bg-[var(--fg-700)] rounded transition-colors text-[var(--bg-white)] flex items-center justify-center"
					>
						×
					</button>
				</div>

				{/* Logo Content */}
				<div className={cn("flex-1 flex items-center justify-center")}>
					<div className={cn("select-none")} style={{ width: cell.width / 4 }}>
						<Logo
							className={cn(
								isLightTheme
									? "text-[var(--fg-800-30)]"
									: "text-[var(--fg-100-30)]",
							)}
						/>
					</div>
				</div>

				{/* {showOverlay && element instanceof Rectangle && (
        <ElementOverlay
          element={element}
          onConfirm={handleElementUpdate}
          onClose={() => {
            console.log('Closing overlay for', element.id);
            setShowOverlay(false);
          }}
        />
      )} */}
			</div>
		</motion.div>
	);
};

export default RectangleOnCanvas;
