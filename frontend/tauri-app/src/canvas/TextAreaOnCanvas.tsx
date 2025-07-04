import React, { useState, useEffect, useRef } from "react";
import { motion, PanInfo } from "framer-motion";
import { cn } from "../utils";
import { CanvasElement, ElementLayout, TextAreaKind } from "./types";
import { CustomTerminalRenderer } from "./CustomTerminalRenderer";
import { TerminalSpec } from "../services/CustomTerminalAPI";
import { ClaudeCodeAgent } from "../services/ClaudeCodeAgent";
import { useGitProject } from "../contexts/GitProjectContext";
import { useStore } from "../state";
import { ProcessManager } from "../services/ProcessManager";
import { ProcessState } from "../types/GitProject";
import { OsSession } from "../bindings/os";
import { GitService } from "../services/GitService";

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
	isDragging
}) => {
	const { cell, element } = layout;
	const { isLightTheme } = useStore();
	const { 
		getProcessByElementId, 
		addProcess, 
		updateProcess, 
		removeProcess,
		getCurrentTaskManager,
		createTask,
		startTask,
		completeTask,
		updateTaskPrompt,
		revertTask,
		restoreTask
	} = useGitProject();
	
	// Get task manager
	const taskManager = getCurrentTaskManager();
	
	// Text area state - simplified to just current prompt
	const [text, setText] = useState((layout.element.kind as TextAreaKind).textArea.content);
	const [currentPrompt, setCurrentPrompt] = useState("");
	
	// Terminal state
	const [showTerminal, setShowTerminal] = useState(false);
	const [terminalId, setTerminalId] = useState<string | null>(null);
	const [claudeAgent, setClaudeAgent] = useState<ClaudeCodeAgent | null>(null);
	
	// Get all tasks for display
	const allTasks = taskManager?.getTasks() || [];
	const currentPromptingTask = taskManager?.getCurrentPromptingTask();
	const currentInProgressTask = taskManager?.getCurrentInProgressTask();
	const completedTasks = taskManager?.getCompletedTasks() || [];
	
	const elementId = element.id;

	// Debug logging
	console.log("[TextAreaOnCanvas] Current state:", {
		elementId,
		allTasksCount: allTasks.length,
		currentPromptingTask: currentPromptingTask?.id,
		currentInProgressTask: currentInProgressTask?.id,
		completedTasksCount: completedTasks.length,
		currentPrompt,
		showTerminal,
		terminalId,
		claudeAgent: !!claudeAgent,
		terminalShouldShow: showTerminal && terminalId
	});
	
	const textAreaRef = useRef<HTMLTextAreaElement>(null);
	const [dragging, setDragging] = useState(false);
	
	const textAreaOsSession = (element.kind as TextAreaKind).textArea.osSession; 
	
	const handleDragStartInternal = () => {
		propOnDragStart(element);
	};

	const handleDragEndInternal = () => {
		propOnDragEnd(element);
	};

	const handleGoClick = async () => {
		console.log(
			"[TextAreaOnCanvas]",
			"Go button clicked with text:",
			currentPrompt.trim(),
		);

		if (currentInProgressTask || !currentPrompt.trim()) {
			console.log(
				"[TextAreaOnCanvas]",
				"Cannot start - hasInProgress:",
				!!currentInProgressTask,
				"hasText:",
				!!currentPrompt.trim(),
			);
			return;
		}

		console.log("[TextAreaOnCanvas]", "Creating and starting task...");
		
		// Create task in TaskManager
		let taskId: string;
		if (currentPromptingTask) {
			// Update existing prompting task
			updateTaskPrompt(currentPromptingTask.id, currentPrompt.trim());
			taskId = currentPromptingTask.id;
		} else {
			// Create new task
			taskId = createTask(currentPrompt.trim()) || '';
			if (!taskId) {
				console.error("[TextAreaOnCanvas]", "Failed to create task");
				return;
			}
		}

		try {
			// Check if we can reuse existing Claude agent
			if (claudeAgent && claudeAgent.isSessionReady()) {
				console.log("[TextAreaOnCanvas]", "🔄 Reusing existing Claude session");
				
				// Register new process for this task
				const processId = crypto.randomUUID();
				const processState: ProcessState = {
					processId,
					terminalId: terminalId!, // Reuse existing terminal
					type: 'claude-code',
					status: 'running',
					startTime: Date.now(),
					elementId,
					prompt: currentPrompt.trim()
				};
				
				// Register with global ProcessManager
				ProcessManager.registerProcess(processId, claudeAgent);
				
				// Register with canvas process state
				addProcess(processState);
				
				// Start the task in TaskManager
				startTask(taskId, processId);
				
				// Submit task to existing session
				await claudeAgent.startTask(
					textAreaOsSession || { Local: "." },
					currentPrompt.trim(),
					(reusedTerminalId: string) => {
						console.log("[TextAreaOnCanvas]", "Reusing terminal ID:", reusedTerminalId);
					}
				);
				
				console.log("[TextAreaOnCanvas]", "Task submitted to existing session");
				return;
			}

			// Create new Claude Code agent if no reusable session exists
			console.log("[TextAreaOnCanvas]", "Creating new Claude Code agent...");
			const agent = new ClaudeCodeAgent();
			setClaudeAgent(agent);

			// Show terminal
			console.log("[TextAreaOnCanvas]", "Showing terminal...", { 
				showTerminalBefore: showTerminal,
				terminalIdBefore: terminalId 
			});
			setShowTerminal(true);

			await agent.startTask(
				textAreaOsSession || { Local: "." }, // Use textArea OS session (which is canvas-specific) or fallback
				currentPrompt.trim(),
				(newTerminalId: string) => {
					console.log("[TextAreaOnCanvas]", "Terminal ready, ID:", newTerminalId, {
						showTerminalState: showTerminal,
						previousTerminalId: terminalId
					});
					setTerminalId(newTerminalId);
					// Ensure terminal is visible when ID is set
					setShowTerminal(true);
					
					// Register process with persistence system
					const processId = crypto.randomUUID();
					const processState: ProcessState = {
						processId,
						terminalId: newTerminalId, // Use the new terminal ID directly
						type: 'claude-code',
						status: 'running',
						startTime: Date.now(),
						elementId,
						prompt: currentPrompt.trim()
					};
					
					// Register with global ProcessManager
					ProcessManager.registerProcess(processId, agent);
					ProcessManager.setTerminalConnection(elementId, newTerminalId);
					
					// Register with canvas process state
					addProcess(processState);
					
					// Start the task in TaskManager
					startTask(taskId, processId);
					
					console.log("[TextAreaOnCanvas]", "Process registered with ID:", processId);
				},
			);

			console.log("[TextAreaOnCanvas]", "Task started successfully");
		} catch (error) {
			console.error(
				"[TextAreaOnCanvas]",
				"Failed to start Claude Code task:",
				error,
			);
			setShowTerminal(false);
			setTerminalId(null);
			// Keep the current prompt so user can try again
		}
	};

	useEffect(() => {
		(layout.element.kind as TextAreaKind).textArea.content = text;
	}, [text])

	// Initialize current prompt from text or existing prompting task
	useEffect(() => {
		if (currentPromptingTask) {
			setCurrentPrompt(currentPromptingTask.prompt);
			setText(currentPromptingTask.prompt);
		} else if (!currentPrompt && text) {
			setCurrentPrompt(text);
		}
	}, [text, currentPrompt, currentPromptingTask]);

	// Hide terminal when no tasks are in progress and no reusable session
	useEffect(() => {
		if (!currentInProgressTask && !claudeAgent) {
			console.log("[TextAreaOnCanvas] Scheduling terminal hide in 1s", {
				currentInProgressTask: !!currentInProgressTask,
				claudeAgent: !!claudeAgent
			});
			// Small delay to prevent flickering between tasks
			const timeoutId = setTimeout(() => {
				console.log("[TextAreaOnCanvas] Auto-hiding terminal");
				setShowTerminal(false);
				setTerminalId(null);
			}, 1000);
			
			return () => {
				console.log("[TextAreaOnCanvas] Cancelling terminal hide");
				clearTimeout(timeoutId);
			};
		} else if (claudeAgent && claudeAgent.isSessionReady()) {
			// Keep terminal visible for reusable sessions
			console.log("[TextAreaOnCanvas] Keeping terminal visible for reusable Claude session");
		}
	}, [currentInProgressTask, claudeAgent]);

	// Restore process state on mount
	useEffect(() => {
		const existingProcess = getProcessByElementId(elementId);
		
		if (existingProcess) {
			console.log('[TextAreaOnCanvas] Found existing process:', existingProcess);
			
			if (existingProcess.status === 'running') {
				// Only restore running processes
				console.log('[TextAreaOnCanvas] Restoring running process UI state');
				setShowTerminal(true);
				setTerminalId(existingProcess.terminalId);
				
				// Try to restore the ClaudeCodeAgent instance from ProcessManager
				const restoredAgent = ProcessManager.getProcess(existingProcess.processId);
				if (restoredAgent) {
					console.log('[TextAreaOnCanvas] Restored ClaudeCodeAgent instance');
					setClaudeAgent(restoredAgent);
				} else {
					console.warn('[TextAreaOnCanvas] ClaudeCodeAgent instance not found in ProcessManager');
					// Mark process as finished since we can't restore it
					updateProcess(existingProcess.processId, { status: 'finished' });
					// Find matching task and complete it
					const inProgressTask = taskManager?.getInProgressTasks().find(t => t.processId === existingProcess.processId);
					if (inProgressTask) {
						completeTask(inProgressTask.id, ""); // Empty commit hash for failed restoration
					}
				}
			} else if (existingProcess.status === 'finished' || existingProcess.status === 'completed') {
				// Clean up old finished processes instead of restoring their UI state
				console.log('[TextAreaOnCanvas] Cleaning up finished process:', existingProcess.processId);
				removeProcess(existingProcess.processId);
				// Don't set terminal state - let current task flow handle it
			}
		}
	}, [elementId, getProcessByElementId, updateProcess]);

	// Listen for task completion
	useEffect(() => {
		if (!claudeAgent) return;

		console.log(
			"[TextAreaOnCanvas]",
			"Setting up event listeners for Claude Code agent",
		);

		const handleTaskComplete = async (result: any) => {
			console.log("[TextAreaOnCanvas]", "✅ Task completed:", result);
			
			// Find the current in-progress task
			const inProgressTask = taskManager?.getCurrentInProgressTask();
			if (!inProgressTask) {
				console.log("[TextAreaOnCanvas]", "No in-progress task found, ignoring completion");
				return;
			}
			
			let commitHash = "";
			
			try {
				// Create git commit with the task prompt as the commit message
				commitHash = await GitService.createCommit(
					textAreaOsSession || { Local: "." },
					inProgressTask.prompt
				);
				console.log("[TextAreaOnCanvas]", "Git commit created:", commitHash);
			} catch (error) {
				console.error("[TextAreaOnCanvas]", "Failed to create git commit:", error);
				
				// Check if it's a "no changes" error
				const errorString = String(error);
				if (errorString === "NO_CHANGES_TO_COMMIT" || errorString.toLowerCase().includes("nothing to commit")) {
					console.log("[TextAreaOnCanvas]", "No changes to commit - task completed without file modifications");
					commitHash = "NO_CHANGES"; // Special marker for no-change tasks
				}
			}
			
			// Complete the task in TaskManager
			completeTask(inProgressTask.id, commitHash);
			
			// Reset states for new prompt
			setCurrentPrompt("");
			setText("");
			
			// Update process state but keep Claude agent for reuse
			const existingProcess = getProcessByElementId(elementId);
			if (existingProcess) {
				updateProcess(existingProcess.processId, { status: 'finished' });
				// Don't unregister process - keep it for session reuse
				// ProcessManager.unregisterProcess(existingProcess.processId);
			}
			
			// Don't destroy Claude agent - keep it for session reuse
			// setTimeout(() => {
			// 	setClaudeAgent(null);
			// }, 500);
			
			console.log("[TextAreaOnCanvas]", "Task completed, Claude session ready for reuse");
		};

		const handleTaskError = (error: string) => {
			console.error("[TextAreaOnCanvas]", "❌ Claude Code task error:", error);
			
			// Find the current in-progress task and revert to prompting
			const inProgressTask = taskManager?.getCurrentInProgressTask();
			if (inProgressTask) {
				// Task failed, revert to prompting state
				// Note: TaskManager doesn't have a revert-to-prompting method, so we'll leave it in_progress
				// In a full implementation, we'd add an "error" state or revert mechanism
			}
			
			// Update process state
			const existingProcess = getProcessByElementId(elementId);
			if (existingProcess) {
				updateProcess(existingProcess.processId, { status: 'error' });
				ProcessManager.unregisterProcess(existingProcess.processId);
			}
			
			// Clean up agent - terminal will be hidden by the useEffect
			setClaudeAgent(null);
		};

		const handleTaskStarted = (data: any) => {
			console.log("[TextAreaOnCanvas]", "Task started:", data);
		};

		const handleScreenUpdate = (tuiLines: any) => {
			// console.log(
			// 	"[TextAreaOnCanvas]",
			// 	"Screen update received:",
			// 	tuiLines.length,
			// 	"lines",
			// );
		};

		const handleSessionReady = () => {
			console.log("[TextAreaOnCanvas]", "🔄 Claude session is ready for next task");
			// Session is ready - user can now submit another task
			// The UI will automatically enable the Go button since claudeAgent still exists
			// and isSessionReady() will return true
		};

		claudeAgent.on("taskCompleted", handleTaskComplete);
		claudeAgent.on("taskError", handleTaskError);
		claudeAgent.on("taskStarted", handleTaskStarted);
		claudeAgent.on("screenUpdate", handleScreenUpdate);
		claudeAgent.on("sessionReady", handleSessionReady);

		return () => {
			console.log("[TextAreaOnCanvas]", "🧹 Cleaning up event listeners");
			claudeAgent.off("taskCompleted", handleTaskComplete);
			claudeAgent.off("taskError", handleTaskError);
			claudeAgent.off("taskStarted", handleTaskStarted);
			claudeAgent.off("screenUpdate", handleScreenUpdate);
			claudeAgent.off("sessionReady", handleSessionReady);
		};
	}, [claudeAgent]);

	const handleStopClick = async () => {
		if (claudeAgent) {
			// Stop the current task but keep session alive
			await claudeAgent.stopTask();
			
			// Don't destroy the agent - let it be reused
			// setClaudeAgent(null);
		}
		
		// Clean up current process state but keep session for reuse
		const existingProcess = getProcessByElementId(elementId);
		if (existingProcess) {
			updateProcess(existingProcess.processId, { status: 'finished' });
			// Don't unregister process completely - keep for potential reuse
			// ProcessManager.unregisterProcess(existingProcess.processId);
			// ProcessManager.removeTerminalConnection(elementId);
		}
		
		// Don't hide terminal - keep it visible for session reuse
		// setShowTerminal(false);
		// setTerminalId(null);
		
		console.log("[TextAreaOnCanvas]", "Task stopped, Claude session kept alive for reuse");
		
		// Revert task back to prompting state (if we had this functionality)
		// For now, the in-progress task will remain in that state
	};

	const handleFullCleanup = async () => {
		if (claudeAgent) {
			// Force cleanup of Claude session
			await claudeAgent.cleanup(true);
			setClaudeAgent(null);
		}
		
		// Clean up all process state
		const existingProcess = getProcessByElementId(elementId);
		if (existingProcess) {
			removeProcess(existingProcess.processId);
			ProcessManager.unregisterProcess(existingProcess.processId);
			ProcessManager.removeTerminalConnection(elementId);
		}
		
		setShowTerminal(false);
		setTerminalId(null);
		
		console.log("[TextAreaOnCanvas]", "Claude session fully cleaned up");
	};

	const handleRevertTask = async (taskId: string) => {
		try {
			const task = taskManager?.getTask(taskId);
			if (!task || task.status !== 'completed') {
				console.error("[TextAreaOnCanvas]", "Task not found or not completed");
				return;
			}

			if (!task.commitHash || task.commitHash === "NO_CHANGES") {
				console.error("[TextAreaOnCanvas]", "No valid commit hash available for revert");
				return;
			}

			// Get target commit from TaskManager
			const targetCommitHash = taskManager?.getRevertTargetCommit(taskId);
			if (!targetCommitHash) {
				console.error("[TextAreaOnCanvas]", "No target commit found for revert");
				return;
			}
			
			console.log("[TextAreaOnCanvas]", `Reverting to commit: ${targetCommitHash}`);
			
			await GitService.revertToCommit(
				textAreaOsSession || { Local: "." },
				targetCommitHash
			);

			// Update TaskManager state
			revertTask(taskId);

			console.log("[TextAreaOnCanvas]", "Successfully reverted to commit:", targetCommitHash);
		} catch (error) {
			console.error("[TextAreaOnCanvas]", "Failed to revert task:", error);
			alert(`Failed to revert: ${error}`);
		}
	};

	const handleRestoreTask = async (taskId: string) => {
		try {
			const task = taskManager?.getTask(taskId);
			if (!task || task.status !== 'completed') {
				console.error("[TextAreaOnCanvas]", "Task not found or not completed");
				return;
			}

			if (!task.commitHash || task.commitHash === "NO_CHANGES") {
				console.error("[TextAreaOnCanvas]", "No valid commit hash available for restore");
				return;
			}

			console.log("[TextAreaOnCanvas]", `Restoring to commit: ${task.commitHash}`);

			await GitService.revertToCommit(
				textAreaOsSession || { Local: "." },
				task.commitHash
			);

			// Update TaskManager state
			restoreTask(taskId);

			console.log("[TextAreaOnCanvas]", "Successfully restored to commit:", task.commitHash);
		} catch (error) {
			console.error("[TextAreaOnCanvas]", "Failed to restore task:", error);
			alert(`Failed to restore: ${error}`);
		}
	};

	return (
		<motion.div
			className={cn(
				"absolute select-none overflow-hidden p-1",
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
			<div className={cn("w-full h-full flex flex-col p-3")}>
				{/* Text Area Section */}
				<div
					className={cn(
						"relative flex flex-col rounded-md gap-0",
						showTerminal ? "h-1/3" : "h-full",
					)}
					style={{
						backgroundImage:
							"radial-gradient(circle at 3px 3px, var(--base-400-30) 1.4px, transparent 0)",
						backgroundSize: "24px 24px",
						backgroundPosition: "10px 20px",
					}}
				>
					{/* Container for all prompts */}
					<div className="h-full overflow-y-auto">
						{/* Completed Tasks */}
						{completedTasks.map((task, index, array) => (
							<div key={task.id} className="relative not-last:mb-2 group">
								<div className="relative">
									<textarea
										value={task.prompt}
										readOnly
										spellCheck={false}
										className={cn(
											"w-full font-mono border-none text-base resize-none bg-transparent",
											task.isReverted 
												? "text-[var(--base-500-50)] line-through" 
												: task.commitHash 
													? "text-[var(--positive-500-50)]"
													: "text-[var(--base-600-50)]", // Different color for no-change tasks
											"cursor-default",
											"scrollbar-thin scrollbar-thumb-[var(--base-400)] scrollbar-track-transparent",
										)}
										rows={Math.max(1, task.prompt.split("\n").length)}
									/>
									{/* Status indicators and button positioned at end of text */}
									<div className="absolute flex items-center gap-1" style={{
										left: `${task.prompt.split("\n").reduce((max, line) => Math.max(max, line.length), 0) * 9.7 + 10}px`,
										top: `${Math.max(0, task.prompt.split("\n").length - 1) * 24 + 2}px`
									}}>
										{/* Status emoji */}
										<span className="text-base">
											{task.isReverted 
												? '❌' 
												: task.commitHash === "NO_CHANGES"
													? '⚠️' // Warning for no-change tasks
													: task.commitHash 
														? '✅' 
														: '❌' // Error for failed commits
											}
										</span>
										
										{/* Revert/Restore Button - only for actual commits, not NO_CHANGES */}
										{task.commitHash && task.commitHash !== "NO_CHANGES" && (
											<button
												onClick={() => task.isReverted ? handleRestoreTask(task.id) : handleRevertTask(task.id)}
												className={cn(
													"px-2 py-0.5 text-xs rounded transition-all cursor-pointer",
													"opacity-0 group-hover:opacity-100",
													task.isReverted
														? "bg-[var(--positive-600)] text-white hover:bg-[var(--positive-700)]"
														: "bg-[var(--base-600)] text-white hover:bg-[var(--base-700)]"
												)}
											>
												{task.isReverted ? 'Restore' : 'Revert'}
											</button>
										)}
									</div>
								</div>
							</div>
						))}

						{/* Current/Running Prompt */}
						{currentInProgressTask && (
							<div className="relative">
								<textarea
									value={`${currentInProgressTask.prompt} 🔄`}
									readOnly
									spellCheck={false}
									className={cn(
										"w-full font-mono border-none text-base resize-none bg-transparent",
										"text-[var(--base-500-50)] animate-pulse",
										"cursor-default",
										"scrollbar-thin scrollbar-thumb-[var(--base-400)] scrollbar-track-transparent",
									)}
									rows={Math.max(1, currentInProgressTask.prompt.split("\n").length)}
								/>
							</div>
						)}

						{/* New Input Area */}
						<div className="relative">
							<textarea
								ref={textAreaRef}
								value={currentInProgressTask ? "" : currentPrompt}
								onChange={(e) => {
									if (!currentInProgressTask) {
										setCurrentPrompt(e.target.value);
										setText(e.target.value);
										
										// Update existing prompting task if it exists
										if (currentPromptingTask) {
											updateTaskPrompt(currentPromptingTask.id, e.target.value);
										}
									}
								}}
								disabled={!!currentInProgressTask}
								placeholder={
									currentInProgressTask 
										? "Task in progress..." 
										: completedTasks.length === 0 
											? "Describe to the agent what to do..." 
											: "Describe to the agent another thing to do..."
								}
								spellCheck={false}
								className={cn(
									"w-full h-fit font-bl font-mono border-none text-base resize-none",
									"text-[var(--base-500)]",
									"focus:text-[var(--base-500)]",
									"placeholder:text-[var(--base-600-50)]",
									currentInProgressTask && "opacity-60 cursor-not-allowed",
									"scrollbar-thin scrollbar-thumb-[var(--base-400)] scrollbar-track-transparent",
								)}
								rows={Math.max(1, currentPrompt.split("\n").length)}
							/>

							{/* Action Button */}
							{!currentInProgressTask && (
								<motion.div
									className="absolute left-0 flex justify-end"
									animate={{
										left: `${currentPrompt.split("\n").reduce((max, line) => (line.length > max ? line.length : max), 0) * 9.7}px`,
										top: `${(currentPrompt.split("\n").length + 0.6) * 24}px`,
									}}
									transition={{ type: "tween", duration: 0.05, ease: "linear" }}
								>
									<button
										onClick={handleGoClick}
										disabled={!currentPrompt.trim()}
										className={cn(
											"group rounded-lg rounded-br-2xl transition-all p-0.5 bg-[var(--base-200)]",
											currentPrompt.trim()
												? "cursor-pointer hover:rounded-3xl hover:bg-[var(--acc-200)] opacity-50 hover:opacity-100"
												: "opacity-0 pointer-events-none",
										)}
									>
										<div className="flex overflow-hidden relative p-0.5 bg-[var(--whitest)] rounded-lg group-hover:rounded-3xl rounded-br-2xl transition-all">
											<div
												className={cn(
													"px-5 py-1 rounded-lg group-hover:rounded-3xl rounded-br-2xl bg-[var(--base-300)] group-hover:bg-[var(--acc-300)]  transition-all text-[var(--whitest)] z-10",
												)}
											>
												Go
											</div>
											<div className="group-hover:block hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1em] h-[400%] animate-spin bg-[var(--acc-500)] blur-[1px]"></div>
										</div>
									</button>
								</motion.div>
							)}
						</div>
					</div>
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
