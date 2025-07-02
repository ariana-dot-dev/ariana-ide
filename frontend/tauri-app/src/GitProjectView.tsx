import React, { useRef, useState, useEffect } from "react";
import CanvasView from "./CanvasView";
import { useGitProject } from "./contexts/GitProjectContext";
import { cn } from "./utils";
import { GitProject } from "./types/GitProject";
import { useStore } from "./state";

const GitProjectView: React.FC<{}> = ({ }) => {
	const { selectedGitProject, currentCanvas, updateCanvasElements } = useGitProject();
	const { updateGitProject } = useStore();
	const [showCanvases, setShowCanvases] = useState(false);
	const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);

	const canvasesHoveredRef = useRef(false);

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

	// Compute task progress for each canvas
	const getCanvasTaskCounts = (canvasId: string) => {
		if (!selectedGitProject) return { running: 0, finished: 0, error: 0, total: 0 };
		
		const canvas = selectedGitProject.canvases.find(c => c.id === canvasId);
		if (!canvas?.runningProcesses) return { running: 0, finished: 0, error: 0, total: 0 };
		
		const processes = canvas.runningProcesses;
		const running = processes.filter(p => p.status === 'running').length;
		const finished = processes.filter(p => p.status === 'finished' || p.status === 'completed').length;
		const error = processes.filter(p => p.status === 'error').length;
		const total = processes.length;
		
		return { running, finished, error, total };
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
				onMouseEnter={() => {
					canvasesHoveredRef.current = true;

					setTimeout(() => {
						console.log("canvasesHovered", canvasesHoveredRef.current);
						if (canvasesHoveredRef.current) {
							setShowCanvases(true);
						}
					}, 400);
				}}
				onMouseLeave={() => {
					canvasesHoveredRef.current = false;

					setTimeout(() => {
						if (!canvasesHoveredRef.current) {
							setShowCanvases(false);
						}
					}, 1000);
				}}
				className={cn(
					"flex flex-col gap-1.5 outline-0 rounded-md select-none relative z-50  transition-[height] border-[var(--acc-400-50)]",
					showCanvases
						? "w-fit"
						: "w-1 my-0 hover:w-3 not-hover:bg-[var(--base-400-20)] hover:border-2",
				)}
			>
				{showCanvases && (
					<>
						{/* Project Directory Header */}
						<div className="w-44 px-4 py-2 mb-2 border-2 border-[var(--acc-400-50)] rounded-md bg-[var(--acc-100)] text-center">
							<div className="text-sm font-medium text-[var(--acc-800)]">
								{getProjectDirectoryName()}
							</div>
						</div>
						
						<button 
							className={cn(
								"w-44 px-4 py-2 border-2 border-[var(--acc-400-50)] rounded-md text-left transition-colors",
								isCreatingCanvas 
									? "opacity-50 cursor-not-allowed bg-[var(--base-400-20)]" 
									: "hover:bg-[var(--base-400-20)]"
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
							{isCreatingCanvas ? "Creating..." : "New Version"}
						</button>
						{selectedGitProject.canvases.map((canvas, index) => {
							const taskCounts = getCanvasTaskCounts(canvas.id);

							if (!currentCanvas) {
								return null;
							}

							return (
								<button 
									key={index}
									className={cn(
										"w-44 px-4 py-2 border-2 border-[var(--acc-400-50)] rounded-md text-left hover:bg-[var(--base-400-20)] transition-colors relative",
										currentCanvas.id === canvas.id
											? "bg-[var(--base-400-20)]"
											: "bg-transparent",
									)}
									onClick={() => {
										selectedGitProject.setCurrentCanvasIndex(index);
										// Trigger state update to save to disk
										updateGitProject(selectedGitProject.id);
									}}
								>
									<div className="flex items-center justify-between">
										<span>Workspace</span>
										{taskCounts.total > 0 && (
											<div className="flex items-center gap-1 text-xs">
												{taskCounts.running > 0 && (
													<span className="bg-[var(--acc-500)] text-[var(--whitest)] px-1.5 py-0.5 rounded-full">
														{taskCounts.running}
													</span>
												)}
												{taskCounts.finished > 0 && (
													<span className="bg-[var(--positive-600)] text-[var(--whitest)] px-1.5 py-0.5 rounded-full">
														{taskCounts.finished}
													</span>
												)}
												{taskCounts.error > 0 && (
													<span className="bg-[var(--negative-600)] text-[var(--whitest)] px-1.5 py-0.5 rounded-full">
														{taskCounts.error}
													</span>
												)}
											</div>
										)}
									</div>
									{taskCounts.total === 0 && (
										<div className="text-xs text-[var(--base-600)] mt-1">
											No tasks yet
										</div>
									)}
								</button>
							);
						})}
					</>
				)}
			</div>
			{currentCanvas ? (
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
		</div>
	) : (<></>);
};

export default GitProjectView;