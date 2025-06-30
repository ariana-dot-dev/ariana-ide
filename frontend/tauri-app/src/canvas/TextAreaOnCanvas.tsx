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
	const [text, setText] = useState("");
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

	const createTerminalSpec = (): TerminalSpec => ({
		kind: { $type: "wsl" as const },
		lines: 24,
		cols: 60,
	});

	const handleGoClick = async () => {
		console.log(
			"[TextAreaOnCanvas]",
			"Go button clicked with text:",
			text.trim(),
		);

		if (isLoading || !text.trim()) {
			console.log(
				"[TextAreaOnCanvas]",
				"Cannot start - isLoading:",
				isLoading,
				"hasText:",
				!!text.trim(),
			);
			return;
		}

		console.log("[TextAreaOnCanvas]", "Locking UI and starting task...");
		setIsLoading(true);
		setIsLocked(true);

		try {
			// Create Claude Code agent
			console.log("[TextAreaOnCanvas]", "Creating Claude Code agent...");
			const agent = new ClaudeCodeAgent();
			setClaudeAgent(agent);

			// Show terminal
			console.log("[TextAreaOnCanvas]", "Showing terminal...");
			setShowTerminal(true);

			// Start Claude Code task
			const terminalSpec = createTerminalSpec();
			console.log(
				"[TextAreaOnCanvas]",
				"Starting Claude Code task with spec:",
				terminalSpec,
			);

			await agent.startTask(
				{ Wsl: { distribution: "Ubuntu", working_directory: "~" } },
				text.trim(),
				terminalSpec,
				(terminalId: string) => {
					console.log("[TextAreaOnCanvas]", "Terminal ready, ID:", terminalId);
					setTerminalId(terminalId);
				},
			);

			console.log("[TextAreaOnCanvas]", "Task started successfully");
		} catch (error) {
			console.error(
				"[TextAreaOnCanvas]",
				"Failed to start Claude Code task:",
				error,
			);
			setIsLoading(false);
			setIsLocked(false);
		}
	};

	// Listen for task completion
	useEffect(() => {
		if (!claudeAgent) return;

		console.log(
			"[TextAreaOnCanvas]",
			"Setting up event listeners for Claude Code agent",
		);

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
			console.log("[TextAreaOnCanvas]", "Task started:", data);
		};

		const handleScreenUpdate = (tuiLines: any) => {
			console.log(
				"[TextAreaOnCanvas]",
				"Screen update received:",
				tuiLines.length,
				"lines",
			);
		};

		claudeAgent.on("taskComplete", handleTaskComplete);
		claudeAgent.on("taskError", handleTaskError);
		claudeAgent.on("taskStarted", handleTaskStarted);
		claudeAgent.on("screenUpdate", handleScreenUpdate);

		return () => {
			console.log("[TextAreaOnCanvas]", "🧹 Cleaning up event listeners");
			claudeAgent.off("taskComplete", handleTaskComplete);
			claudeAgent.off("taskError", handleTaskError);
			claudeAgent.off("taskStarted", handleTaskStarted);
			claudeAgent.off("screenUpdate", handleScreenUpdate);
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

	return (
		<motion.div
			className={cn(
				"absolute select-none overflow-hidden border-2 rounded-md border-[var(--base-400-20)]",
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
			{/* <div className="fixed w-full h-full opacity-30" style={{ background: 'url("assets/noise.png")' }}>
			</div> */}
			<div className={cn("w-full h-full flex flex-col py-4 px-5")}>
				{/* Text Area Section */}
				<div
					className={cn(
						"relative flex flex-col rounded-md gap-2",
						showTerminal ? "h-1/3" : "h-full",
					)}
				>
					{/* Header */}
					<div className="flex items-center justify-between">
						<h3 className="text-sm text-[var(--base-500)]">
							Prompt something ↓
						</h3>
					</div>

					{/* Text Area */}
					<textarea
						ref={textAreaRef}
						value={text}
						onChange={(e) => setText(e.target.value)}
						disabled={isLocked}
						placeholder=""
						spellCheck={false}
						className={cn(
							"flex-1 font-mono border-none w-full border text-base resize-none",
							"text-[var(--acc-800)]",
							"focus:text-[var(--acc-900)]",
							"placeholder:text-[var(--base-600-50)]",
							isLocked && "opacity-60 cursor-not-allowed",
							"scrollbar-thin scrollbar-thumb-[var(--base-400)] scrollbar-track-transparent",
						)}
						style={{
							backgroundImage:
								"radial-gradient(circle at 3px 3px, var(--base-400-40) 1.4px, transparent 0)",
							backgroundSize: "24px 24px",
							backgroundPosition: "10px 20px",
						}}
						rows={Math.max(4, Math.floor((cell.height - 120) / 20))}
					/>

					{/* Action Button */}
					<motion.div
						className="absolute left-0 flex justify-end"
						animate={{
							left: `${isLoading ? 0 : text.split("\n").reduce((max, line) => (line.length > max ? line.length : max), 0) * 9.7}px`,
							top: `${(text.split("\n").length + 1.6) * 24}px`,
						}}
						transition={{ type: "tween", duration: 0.05, ease: "linear" }}
					>
						{isLoading ? (
							<button
								onClick={handleStopClick}
								disabled={!text.trim()}
								className={cn(
									"group rounded-lg rounded-br-2xl transition-all p-0.5 bg-[var(--base-200)] cursor-pointer hover:rounded-3xl opacity-70 hover:opacity-100",
								)}
							>
								<div className="flex overflow-hidden relative p-0.5 bg-[var(--whitest)] rounded-lg group-hover:rounded-3xl rounded-br-2xl transition-all">
									<div
										className={cn(
											"px-5 py-1 rounded-lg group-hover:rounded-3xl rounded-br-2xl bg-[var(--base-300)] font-medium transition-all text-[var(--whitest)] z-10",
										)}
									>
										<div className="relative overflow-hidden">
											<div className="absolute -translate-y-full group-hover:translate-y-0 transition-all">
												Stop
											</div>
											<div className="absolute translate-y-0 group-hover:translate-y-full transition-all">
												Running...
											</div>
											<div className="opacity-0">Running...</div>
										</div>
									</div>
									<div className="group-hover:hidden block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1em] h-[400%] animate-spin bg-[var(--base-500)] blur-[1px]"></div>
								</div>
							</button>
						) : (
							<button
								onClick={handleGoClick}
								disabled={!text.trim()}
								className={cn(
									"group rounded-lg rounded-br-2xl transition-all p-0.5 bg-[var(--base-200)]",
									text.trim()
										? "cursor-pointer hover:rounded-3xl hover:bg-[var(--acc-200)] opacity-50 hover:opacity-100"
										: "opacity-0 pointer-events-none",
								)}
							>
								<div className="flex overflow-hidden relative p-0.5 bg-[var(--whitest)] rounded-lg group-hover:rounded-3xl rounded-br-2xl transition-all">
									<div
										className={cn(
											"px-5 py-1 rounded-lg group-hover:rounded-3xl rounded-br-2xl bg-[var(--base-300)] group-hover:bg-[var(--acc-300)] font-medium transition-all text-[var(--whitest)] z-10",
										)}
									>
										Go
									</div>
									<div className="group-hover:block hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1em] h-[400%] animate-spin bg-[var(--acc-500)] blur-[1px]"></div>
								</div>
							</button>
						)}
					</motion.div>
				</div>

				{/* Terminal Section */}
				{showTerminal && terminalId && (
					<div className="h-2/3 mt-2 opacity-70">
						<CustomTerminalRenderer
							elementId={`claude-terminal-${terminalId}`}
							existingTerminalId={terminalId}
							terminalAPI={claudeAgent || undefined}
							onTerminalReady={(id) => {
								console.log("Claude terminal ready:", id);
							}}
							onTerminalError={(error) => {
								console.error("Claude terminal error:", error);
							}}
							fontSize="base"
						/>
					</div>
				)}
			</div>
		</motion.div>
	);
};

export default TextAreaOnCanvas;