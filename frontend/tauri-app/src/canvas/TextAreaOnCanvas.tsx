import React, { useState, useEffect, useRef } from "react";
import { motion, PanInfo } from "framer-motion";
import { cn } from "../utils";
import { CanvasElement, ElementLayout } from "./types";
import { CustomTerminalRenderer } from "./CustomTerminalRenderer";
import { TerminalSpec } from "../services/CustomTerminalAPI";
import { ClaudeCodeAgent } from "../services/ClaudeCodeAgent";
import { useStore } from "../state";

interface TextAreaOnCanvasProps {
	layout: ElementLayout;
	onDragStart: (element: CanvasElement) => void;
	onDragEnd: (element: CanvasElement) => void;
	onDrag: (
		event: MouseEvent | TouchEvent | PointerEvent,
		info: PanInfo,
	) => void;
	isDragTarget: boolean;
	isDragging: boolean;
}

const TextAreaOnCanvas: React.FC<TextAreaOnCanvasProps> = ({
	layout,
	onDragStart: propOnDragStart,
	onDragEnd: propOnDragEnd,
	onDrag: propOnDrag,
	isDragTarget,
	isDragging,
}) => {
	const { cell, element } = layout;
	const { isLightTheme } = useStore();
	
	// Text area state
	const [text, setText] = useState("Create a simple hello world program in Python");
	const [isLocked, setIsLocked] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	
	// Terminal state
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalId, setTerminalId] = useState<string | null>(null);
	const [claudeAgent, setClaudeAgent] = useState<ClaudeCodeAgent | null>(null);
	
	const textAreaRef = useRef<HTMLTextAreaElement>(null);
	const [dragging, setDragging] = useState(false);

	const handleDragStartInternal = () => {
		propOnDragStart(element);
	};

	const handleDragEndInternal = () => {
		propOnDragEnd(element);
	};

	// Create terminal spec for WSL (minimum 24x80)
	const createTerminalSpec = (): TerminalSpec => ({
		kind: { $type: "wsl" as const },
		lines: Math.max(24, Math.floor(cell.height / 20)), // Ensure minimum 24 rows
		cols: Math.max(80, Math.floor(cell.width / 8)),   // Ensure minimum 80 cols
	});

	const handleGoClick = async () => {
		console.log("[TextAreaOnCanvas]", "🚀 Go button clicked with text:", text.trim());
		
		if (isLoading || !text.trim()) {
			console.log("[TextAreaOnCanvas]", "⚠️ Cannot start - isLoading:", isLoading, "hasText:", !!text.trim());
			return;
		}
		
		console.log("[TextAreaOnCanvas]", "🔒 Locking UI and starting task...");
		setIsLoading(true);
		setIsLocked(true);
		
		try {
			// Create Claude Code agent
			console.log("[TextAreaOnCanvas]", "🤖 Creating Claude Code agent...");
			const agent = new ClaudeCodeAgent();
			setClaudeAgent(agent);
			
			// Show terminal
			console.log("[TextAreaOnCanvas]", "📺 Showing terminal...");
			setShowTerminal(true);
			
			// Start Claude Code task
			const terminalSpec = createTerminalSpec();
			console.log("[TextAreaOnCanvas]", "🎯 Starting Claude Code task with spec:", terminalSpec);
			
			await agent.startTask(text.trim(), terminalSpec, (terminalId: string) => {
				console.log("[TextAreaOnCanvas]", "✅ Terminal ready, ID:", terminalId);
				setTerminalId(terminalId);
			});
			
			console.log("[TextAreaOnCanvas]", "🎉 Task started successfully");
			
		} catch (error) {
			console.error("[TextAreaOnCanvas]", "💥 Failed to start Claude Code task:", error);
			setIsLoading(false);
			setIsLocked(false);
		}
	};

	// Listen for task completion
	useEffect(() => {
		if (!claudeAgent) return;
		
		console.log("[TextAreaOnCanvas]", "👂 Setting up event listeners for Claude Code agent");
		
		const handleTaskComplete = (result: any) => {
			console.log("[TextAreaOnCanvas]", "✅ Task completed:", result);
			setIsLoading(false);
			setIsLocked(false);
		};
		
		const handleTaskError = (error: string) => {
			console.error("[TextAreaOnCanvas]", "❌ Claude Code task error:", error);
			setIsLoading(false);
			setIsLocked(false);
		};
		
		const handleTaskStarted = (data: any) => {
			console.log("[TextAreaOnCanvas]", "🎬 Task started:", data);
		};
		
		const handleScreenUpdate = (tuiLines: any) => {
			console.log("[TextAreaOnCanvas]", "📱 Screen update received:", tuiLines.length, "lines");
		};
		
		claudeAgent.on('taskComplete', handleTaskComplete);
		claudeAgent.on('taskError', handleTaskError);
		claudeAgent.on('taskStarted', handleTaskStarted);
		claudeAgent.on('screenUpdate', handleScreenUpdate);
		
		return () => {
			console.log("[TextAreaOnCanvas]", "🧹 Cleaning up event listeners");
			claudeAgent.off('taskComplete', handleTaskComplete);
			claudeAgent.off('taskError', handleTaskError);
			claudeAgent.off('taskStarted', handleTaskStarted);
			claudeAgent.off('screenUpdate', handleScreenUpdate);
		};
	}, [claudeAgent]);

	const handleStopClick = async () => {
		if (claudeAgent) {
			await claudeAgent.stopTask();
			setClaudeAgent(null);
		}
		setIsLoading(false);
		setIsLocked(false);
		setShowTerminal(false);
		setTerminalId(null);
	};

	const handleClearTerminal = () => {
		setShowTerminal(false);
		setTerminalId(null);
		if (claudeAgent) {
			claudeAgent.cleanup();
			setClaudeAgent(null);
		}
	};

	return (
		<motion.div
			className={cn(
				"absolute p-1 select-none overflow-hidden",
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
		>
			<div className={cn("w-full h-full flex")}>
				{/* Text Area Section */}
				<div 
					className={cn(
						"flex flex-col rounded-md backdrop-blur-md bg-[var(--bg-200)]/10 p-4 gap-4",
						showTerminal ? "w-1/2" : "w-full"
					)}
				>
					{/* Header */}
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold text-[var(--fg-800)]">
							Claude Code Agent
						</h3>
						<div className="flex gap-2">
							{showTerminal && (
								<button
									onClick={handleClearTerminal}
									className={cn(
										"px-2 py-1 text-xs rounded bg-[var(--bg-300)] hover:bg-[var(--bg-400)] transition-colors",
										"text-[var(--fg-700)]"
									)}
								>
									Clear
								</button>
							)}
						</div>
					</div>
					
					{/* Text Area */}
					<textarea
						ref={textAreaRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						disabled={isLocked}
						placeholder="Enter your coding task here..."
						className={cn(
							"flex-1 w-full p-3 rounded border font-mono text-sm resize-none",
							"bg-[var(--bg-100)] border-[var(--bg-400)] text-[var(--fg-800)]",
							"focus:outline-none focus:ring-2 focus:ring-[var(--accent-500)] focus:border-transparent",
							"placeholder:text-[var(--fg-500)]",
							isLocked && "opacity-60 cursor-not-allowed",
							"scrollbar-thin scrollbar-thumb-[var(--bg-400)] scrollbar-track-transparent"
						)}
						rows={Math.max(4, Math.floor((cell.height - 120) / 20))}
					/>
					
					{/* Action Button */}
					<div className="flex justify-end">
						{isLoading ? (
							<button
								onClick={handleStopClick}
								className={cn(
									"px-4 py-2 rounded font-medium transition-all",
									"bg-[var(--negative-500)] hover:bg-[var(--negative-600)] text-white",
									"flex items-center gap-2"
								)}
							>
								<div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
								Stop
							</button>
						) : (
							<button
								onClick={handleGoClick}
								disabled={!text.trim()}
								className={cn(
									"px-4 py-2 rounded font-medium transition-all",
									text.trim()
										? "bg-[var(--accent-500)] hover:bg-[var(--accent-600)] text-white"
										: "bg-[var(--bg-300)] text-[var(--fg-500)] cursor-not-allowed"
								)}
							>
								Go
							</button>
						)}
					</div>
					
					{/* Status */}
					{claudeAgent && (
						<div className="text-xs text-[var(--fg-600)]">
							Status: {isLoading ? "Running..." : "Ready"}
							{terminalId && (
								<span className="ml-2">Terminal: {terminalId.slice(0, 8)}...</span>
							)}
						</div>
					)}
				</div>
				
				{/* Terminal Section */}
				{showTerminal && terminalId && (
					<div className="w-1/2 pl-2">
						<div className="w-full h-full rounded-md backdrop-blur-md bg-[var(--bg-200)]/10 p-2">
							<div className="w-full h-full">
								<CustomTerminalRenderer
									elementId={`claude-terminal-${terminalId}`}
									existingTerminalId={terminalId}
									onTerminalReady={(id) => {
										console.log("Claude terminal ready:", id);
									}}
									onTerminalError={(error) => {
										console.error("Claude terminal error:", error);
									}}
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</motion.div>
	);
};

export default TextAreaOnCanvas;