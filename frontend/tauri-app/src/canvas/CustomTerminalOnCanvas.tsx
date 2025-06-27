import React, { useState, useEffect, useRef } from "react";
import { motion, PanInfo } from "framer-motion";
import { cn } from "../utils";
import { CanvasElement, ElementLayout } from "./types";
import { CustomTerminalRenderer } from "./CustomTerminalRenderer";
import { TerminalSpec } from "../services/CustomTerminalAPI";

interface CustomTerminalOnCanvasProps {
	layout: ElementLayout;
	spec: TerminalSpec;
	onDragStart: (element: CanvasElement) => void;
	onDragEnd: (element: CanvasElement) => void;
	onDrag: (
		event: MouseEvent | TouchEvent | PointerEvent,
		info: PanInfo,
	) => void;
	isDragTarget: boolean;
	isDragging: boolean;
	onTerminalReady?: (terminalId: string) => void;
	onTerminalError?: (error: string) => void;
}

const CustomTerminalOnCanvas: React.FC<CustomTerminalOnCanvasProps> = ({
	layout,
	spec,
	onDragStart: propOnDragStart,
	onDragEnd: propOnDragEnd,
	onDrag: propOnDrag,
	isDragTarget,
	isDragging,
	onTerminalReady,
	onTerminalError,
}) => {
	const { cell, element } = layout;
	const [isHovered, setIsHovered] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [isConnected, setIsConnected] = useState(false);

	const handleDragStartInternal = () => {
		propOnDragStart(element);
	};

	const handleDragEndInternal = () => {
		propOnDragEnd(element);
	};

	const handleTerminalReady = (terminalId: string) => {
		setIsConnected(true);
		onTerminalReady?.(terminalId);
	};

	const handleTerminalError = (error: string) => {
		setIsConnected(false);
		onTerminalError?.(error);
	};

	return (
		<motion.div
			className={cn(
				"absolute select-none overflow-hidden",
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
			// drag
			// dragMomentum={false}
			// onMouseDown={() => {
			//   if (!dragging) {
			//     setDragging(true);
			//   }
			// }}
			// onDragStart={() => {
			//   setDragging(true);
			//   handleDragStartInternal();
			// }}
			// onDragEnd={() => {
			//   setDragging(false);
			//   handleDragEndInternal();
			// }}
			// onDrag={(event, info) => {
			//   if (typeof propOnDrag === 'function') {
			//     propOnDrag(event, info);
			//   }
			// }}
			// onMouseEnter={() => setIsHovered(true)}
			// onMouseLeave={() => {
			//   setIsHovered(false);
			// }}
		>
			<div
				className={cn(
					"w-full h-full rounded-md bg-gradient-to-b from-bg-[var(--acc-900)]/30 to-bg-[var(--base-400)]/30 backdrop-blur-md relative overflow-hidden",
				)}
			>
				{/* Connection status indicator */}
				<div className="absolute top-2 right-2 z-10">
					<div
						className={cn(
							"w-2 h-2 rounded-full",
							isConnected
								? "bg-[var(--positive-400)]"
								: "bg-[var(--negative-400)]",
						)}
					/>
				</div>

				{/* Custom Terminal Renderer */}
				<div className={cn("w-full h-full pointer-events-auto")}>
					<CustomTerminalRenderer
						elementId={element.id}
						spec={spec}
						onTerminalReady={handleTerminalReady}
						onTerminalError={handleTerminalError}
					/>
				</div>
			</div>
		</motion.div>
	);
};

export default CustomTerminalOnCanvas;
