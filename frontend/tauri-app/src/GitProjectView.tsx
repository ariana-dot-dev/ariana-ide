import React, { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import CanvasView from "./CanvasView";
import { useGitProject } from "./contexts/GitProjectContext";
import { cn } from "./utils";
import { GitProject } from "./types/GitProject";
import { useStore } from "./state";
import { BackgroundAgentsList } from "./components/BackgroundAgentsList";
import { BackgroundAgentTerminalView } from "./components/BackgroundAgentTerminalView";
import { div } from "framer-motion/client";

const GitProjectView: React.FC<{}> = ({ }) => {
	const { 
		selectedGitProject, 
		currentCanvas, 
		updateCanvasElements, 
		mergeCanvasToRoot,
		getBackgroundAgents,
		removeBackgroundAgent,
		forceRemoveBackgroundAgent,
		getCanvasLockState,
		canEditCanvas
	} = useGitProject();
	const { updateGitProject, removeGitProject } = useStore();
	const [showCanvases, setShowCanvases] = useState(true);
	const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);
	const [mergingCanvases, setMergingCanvases] = useState<Set<string>>(new Set());
	const [viewingAgent, setViewingAgent] = useState<string | null>(null);
	const [contextMenu, setContextMenu] = useState<{x: number, y: number, canvasId: string} | null>(null);

	const canvasesHoveredRef = useRef(false);
	const contextMenuRef = useRef<HTMLDivElement>(null);

	// Handle canvas merge to root
	const handleMergeCanvas = async (canvasId: string) => {
		setMergingCanvases(prev => new Set(prev).add(canvasId));
		
		try {
			const result = await mergeCanvasToRoot(canvasId);
			
			if (result.success) {
				console.log('Merge initiated successfully, agent ID:', result.agentId);
			} else {
				console.error('Failed to start merge:', result.error);
				alert(`Failed to start merge: ${result.error}`);
			}
		} catch (error) {
			console.error('Unexpected error during merge:', error);
			alert(`Unexpected error: ${error}`);
		} finally {
			setMergingCanvases(prev => {
				const newSet = new Set(prev);
				newSet.delete(canvasId);
				return newSet;
			});
		}
	};

	// Get the directory name from the project root
	const getProjectDirectoryName = () => {
		if (!selectedGitProject) return "";
		const root = selectedGitProject.root;
		if ('Local' in root) {
			const path = root.Local;
			return path.split('/').pop() || path.split('\\').pop() || path;
		} else if ('Wsl' in root) {
			const path = root.Wsl.working_directory;
			return path.split('/').pop() || path.split('\\').pop() || path;
		}
		return "";
	};

	// Compute task progress for each canvas using TaskManager (persistent data)
	const getCanvasTaskCounts = (canvasId: string) => {
		if (!selectedGitProject) return { running: 0, finished: 0, error: 0, total: 0 };
		
		const canvas = selectedGitProject.canvases.find(c => c.id === canvasId);
		if (!canvas?.taskManager) return { running: 0, finished: 0, error: 0, total: 0 };
		
		const taskManager = canvas.taskManager;
		const allTasks = taskManager.getTasks();
		const running = taskManager.getInProgressTasks().length;
		const finished = taskManager.getCompletedTasks().length;
		const total = allTasks.length;
		
		// For error count, we could check processes since tasks don't have error state yet
		const processes = canvas.runningProcesses || [];
		const error = processes.filter(p => p.status === 'error').length;
		
		return { running, finished, error, total };
	};

	// Handle workspace right-click context menu
	const handleWorkspaceContextMenu = (e: React.MouseEvent, canvasId: string) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({
			x: e.clientX,
			y: e.clientY,
			canvasId
		});
	};

	// Close context menu when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
				setContextMenu(null);
			}
		};

		if (contextMenu) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [contextMenu]);

	// Show workspace in explorer
	const showWorkspaceInExplorer = async (canvasId: string) => {
		if (!selectedGitProject) return;
		
		try {
			const canvas = selectedGitProject.canvases.find(c => c.id === canvasId);
			if (!canvas?.osSession) return;

			let explorerPath = "";
			if ('Local' in canvas.osSession) {
				explorerPath = canvas.osSession.Local;
			} else if ('Wsl' in canvas.osSession) {
				// Convert WSL path to Windows explorer path
				explorerPath = `\\\\wsl$\\${canvas.osSession.Wsl.distribution}${canvas.osSession.Wsl.working_directory.replace(/\//g, '\\')}`;
			}

			if (explorerPath) {
				await invoke("open_path_in_explorer", { path: explorerPath });
			}
		} catch (error) {
			console.error("Failed to open workspace in explorer:", error);
		}
		setContextMenu(null);
	};

	// Delete workspace
	const deleteWorkspace = async (canvasId: string) => {
		if (!selectedGitProject) return;
		
		try {
			const canvas = selectedGitProject.canvases.find(c => c.id === canvasId);
			if (!canvas?.osSession) return;

			let deletePath = "";
			if ('Local' in canvas.osSession) {
				deletePath = canvas.osSession.Local;
			} else if ('Wsl' in canvas.osSession) {
				deletePath = canvas.osSession.Wsl.working_directory;
			}

			if (!deletePath) return;

			const confirmed = window.confirm(`Are you sure you want to permanently delete this workspace and all its files? This action cannot be undone.\n\nPath: ${deletePath}`);
			if (confirmed) {
				// Delete from filesystem first using osSession-aware deletion
				await invoke("delete_path_with_os_session", { 
					path: deletePath, 
					osSession: canvas.osSession 
				});
				// Then remove from project
				selectedGitProject.removeCanvas(canvasId);
				updateGitProject(selectedGitProject.id);
				console.log(`Deleted workspace from filesystem and project: ${canvasId}`);
			}
		} catch (error) {
			console.error("Failed to delete workspace:", error);
			alert(`Failed to delete workspace: ${error}`);
		}
		setContextMenu(null);
	};

	console.log("GitProjectView render:", {
		selectedGitProject: selectedGitProject?.name,
		currentCanvas: currentCanvas?.name,
		canvasCount: selectedGitProject?.canvases.length,
		currentCanvasElements: currentCanvas?.elements.length || 0,
		canvasTaskCounts: selectedGitProject?.canvases.map((c, index) => ({
			index: index,
			counts: getCanvasTaskCounts(c.id)
		})) || []
	});

	// Auto-create first canvas if none exist
	useEffect(() => {
		if (selectedGitProject && selectedGitProject.canvases.length === 0) {
			console.log("No canvases found, creating first version...");
			const createFirstCanvas = async () => {
				try {
					const result = await selectedGitProject.addCanvasCopy();
					if (result.success) {
						console.log("First canvas created with ID:", result.canvasId);
						updateGitProject(selectedGitProject.id);
					} else {
						console.error("Failed to create first canvas:", result.error);
					}
				} catch (error) {
					console.error("Error creating first canvas:", error);
				}
			};
			createFirstCanvas();
		}
	}, [selectedGitProject?.id, selectedGitProject?.canvases.length, updateGitProject]);

	return selectedGitProject ? (
		<div className="w-full h-full flex gap-1.5">
			<div
				// onMouseEnter={() => {
				// 	canvasesHoveredRef.current = true;

				// 	setTimeout(() => {
				// 		console.log("canvasesHovered", canvasesHoveredRef.current);
				// 		if (canvasesHoveredRef.current) {
				// 			setShowCanvases(true);
				// 		}
				// 	}, 400);
				// }}
				// onMouseLeave={() => {
				// 	canvasesHoveredRef.current = false;

				// 	setTimeout(() => {
				// 		if (!canvasesHoveredRef.current) {
				// 			setShowCanvases(false);
				// 		}
				// 	}, 1000);
				// }}
				className={cn(
					"group flex flex-col gap-1.5 transition-all outline-0 rounded-md select-none relative z-50 border-[var(--acc-400-50)]",
					showCanvases
						? "w-64"
						: "w-1 my-0 hover:w-3 not-hover:bg-[var(--base-400-20)] hover:border-2",
				)}
			>
				{showCanvases && (
					<>
						{/* Project Directory Header */}
						<div className="w-full pl-3 py-2">
							<div className="text-sm text-[var(--base-500-50)]">
								{getProjectDirectoryName()}
							</div>
						</div>
						
						<div className="flex flex-col h-full w-full overflow-y-auto">
							<div className="flex flex-col">
								{selectedGitProject.canvases.map((canvas, index) => {
									const taskCounts = getCanvasTaskCounts(canvas.id);
									const lockState = getCanvasLockState(canvas.id);
									const isLocked = lockState !== 'normal';

									if (!currentCanvas) {
										return null;
									}

									return (
										<button 
											key={index}
											className={cn(
												"group w-full flex flex-col text-left px-4 py-3 text-sm first:rounded-t-xl last:rounded-b-xl transition-colors border-[var(--base-300)] border-2 not-last:border-b-transparent not-first:border-t-transparent",
												currentCanvas.id === canvas.id
													? "bg-[var(--acc-200-20)] opacity-100"
													: " even:bg-[var(--base-100-40)] odd:bg-[var(--base-100-80)] cursor-pointer hover:border-solid border-dashed opacity-50 hover:opacity-100 hover:bg-[var(--acc-200-50)]",
												isLocked
													? ""
													: ""
											)}
											onClick={() => {
												selectedGitProject.setCurrentCanvasIndex(index);
												// Trigger state update to save to disk
												updateGitProject(selectedGitProject.id);
											}}
											onContextMenu={(e) => handleWorkspaceContextMenu(e, canvas.id)}
										>
											<div className="flex w-full items-center justify-between">
												<span className="text-[var(--base-600)]">Agent N°{index+1}</span>
												<div className="flex items-center gap-2">
													{taskCounts.total > 0 && (
														<div className="flex items-center gap-1 text-xs">
															{taskCounts.running > 0 && (
																<span className="w-5 aspect-square flex items-center justify-center relative text-[var(--whitest)] rounded-md">
																	<div className="absolute top-0 left-0 w-full h-full bg-[var(--acc-400)] animate-spin rounded-lg"></div>
																	<div className="z-10">
																		{taskCounts.running}
																	</div>
																</span>
															)}
															{taskCounts.finished > 0 && (
																<span className="w-5 aspect-square flex items-center justify-center bg-[var(--positive-400)] text-[var(--whitest)] rounded-full">
																	{taskCounts.finished}
																</span>
															)}
															{taskCounts.error > 0 && (
																<span className="w-5 aspect-square flex items-center justify-center bg-[var(--negative-600)] text-[var(--whitest)] rounded-sm">
																	{taskCounts.error}
																</span>
															)}
														</div>
													)}
													
													{/* Lock State Indicator */}
													{lockState === 'merging' && (
														<span className="w-5 aspect-square flex items-center justify-center relative text-[var(--whitest)] rounded-md">
															<div className="absolute top-0 left-0 w-full h-full bg-[var(--acc-400)] animate-spin rounded-lg"></div>
															<div className="z-10 text-xs">⏳</div>
														</span>
													)}

													{/* Merge Button - only show for normal state and if there are completed tasks */}
													{lockState === 'normal' && taskCounts.finished > 0 && (
														<button
															onClick={(e) => {
																e.stopPropagation();
																handleMergeCanvas(canvas.id);
															}}
															disabled={mergingCanvases.has(canvas.id)}
															className={cn(
																"w-5 aspect-square flex items-center justify-center text-xs rounded transition-colors",
																mergingCanvases.has(canvas.id)
																	? "bg-[var(--base-300)] text-[var(--base-500)] cursor-not-allowed"
																	: "bg-[var(--acc-300-20)] text-[var(--acc-600)] hover:bg-[var(--acc-300-40)] cursor-pointer"
															)}
															title="Merge canvas to root"
														>
															{mergingCanvases.has(canvas.id) ? "⏳" : "🔀"}
														</button>
													)}
												</div>
											</div>
											{lockState === 'merged' && (
												<div className="text-xs text-[var(--base-500-50)] mt-0.5">
													merged
												</div>
											)}
										</button>
									);
								})}
							</div>
							<button 
								className={cn(
									"w-full px-4 py-2 border-2 border-dashed bg-[var(--positive-300-10)] hover:bg-[var(--positive-300-20)] border-[var(--positive-500-50)] text-[var(--positive-500-70)] hover:text-[var(--positive-500)] hover:border-solid hover:border-[var(--positive-500)] text-sm text-center rounded-xl mt-2 transition-all",
									isCreatingCanvas 
										? "opacity-50 cursor-not-allowed" 
										: "cursor-pointer"
								)}
								disabled={isCreatingCanvas}
								onClick={async () => {
									setIsCreatingCanvas(true);
									console.log("Creating new canvas copy...");
									
									try {
										const result = await selectedGitProject.addCanvasCopy();
										
										if (result.success && result.canvasId) {
											selectedGitProject.setCurrentCanvasIndex(selectedGitProject.canvases.length - 1);
											console.log("New canvas copy created with ID:", result.canvasId);
											// Trigger state update to save to disk
											updateGitProject(selectedGitProject.id);
										} else {
											console.error("Failed to create canvas copy:", result.error);
											alert(`Failed to create canvas copy: ${result.error}`);
										}
									} catch (error) {
										console.error("Unexpected error creating canvas copy:", error);
										alert(`Unexpected error: ${error}`);
									} finally {
										setIsCreatingCanvas(false);
									}
								}}
							>
								{isCreatingCanvas ? "Creating..." : "+ New Agent"}
							</button>

							{/* Background Agents List */}
							<BackgroundAgentsList 
								agents={getBackgroundAgents()} 
								onRemoveAgent={removeBackgroundAgent}
								onForceRemoveAgent={forceRemoveBackgroundAgent}
								onSelectAgent={setViewingAgent}
								selectedAgentId={viewingAgent}
							/>
						</div>

					</>
				)}
			</div>
			{viewingAgent ? (
				// Show background agent terminal view
				(() => {
					const agent = getBackgroundAgents().find(a => a.id === viewingAgent);
					return agent ? (
						<div className="w-full h-full animate-fade-in opacity-100" key={`agent-${agent.id}`}>
							<BackgroundAgentTerminalView 
								agent={agent}
								onClose={() => setViewingAgent(null)}
							/>
						</div>
					) : (
						<div className="w-full h-full flex items-center justify-center relative z-10">
							<div className="text-center text-[var(--base-600)]">
								<div className="text-lg">Agent not found</div>
								<button 
									onClick={(e) => {
										console.log('Back to Canvases clicked');
										e.preventDefault();
										e.stopPropagation();
										setViewingAgent(null);
									}}
									className="mt-2 px-3 py-1 bg-[var(--base-200)] rounded hover:bg-[var(--base-300)] cursor-pointer transition-colors border border-[var(--base-400)] text-[var(--base-700)] hover:text-[var(--base-800)] active:bg-[var(--base-400)] select-none"
									style={{ pointerEvents: 'auto' }}
								>
									Close
								</button>
							</div>
						</div>
					);
				})()
			) : currentCanvas ? (
				<div className="w-full h-full animate-fade-in opacity-100" key={currentCanvas.id}>
					<CanvasView
						elements={currentCanvas.elements}
						onElementsChange={updateCanvasElements}
					/>
				</div>
			) : (
				<div className="w-full h-full flex items-center justify-center">
					<div className="text-center text-[var(--base-600)]">
						<div className="text-lg">Creating first version...</div>
						<div className="text-sm mt-2">Please wait while we set up your project workspace</div>
					</div>
				</div>
			)}
			
			{/* Context Menu */}
			{contextMenu && (
				<div
					ref={contextMenuRef}
					className="fixed z-50 bg-[var(--base-100)] border border-[var(--acc-600)]/20 rounded-md shadow-lg py-1 w-fit flex flex-col"
					style={{
						left: contextMenu.x,
						top: contextMenu.y,
					}}
				>
					<button
						onClick={() => showWorkspaceInExplorer(contextMenu.canvasId)}
						className="w-fit min-w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[var(--base-200)] text-[var(--blackest)] transition-colors"
					>
						📁 Show in Explorer
					</button>
					<button
						onClick={async () => await deleteWorkspace(contextMenu.canvasId)}
						className="w-fit min-w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-[var(--negative-200)] text-[var(--negative-800)] transition-colors"
					>
						🗑️ Delete agent & its work
					</button>
				</div>
			)}
		</div>
	) : (<></>);
};

export default GitProjectView;