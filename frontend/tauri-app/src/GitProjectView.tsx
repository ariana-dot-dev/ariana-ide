import { useRef, useState } from "react";
import CanvasView from "./CanvasView";
import { useGitProject } from "./contexts/GitProjectContext";
import { cn } from "./utils";
import { GitProject } from "./types/GitProject";

const GitProjectView: React.FC<{}> = ({ }) => {
	const { selectedGitProject, currentCanvas, updateCanvasElements } = useGitProject();
	const [showCanvases, setShowCanvases] = useState(false);
	const [isCreatingCanvas, setIsCreatingCanvas] = useState(false);

	const canvasesHoveredRef = useRef(false);

	console.log("GitProjectView render:", {
		selectedGitProject: selectedGitProject?.name,
		currentCanvas: currentCanvas?.name,
		canvasCount: selectedGitProject?.canvases.length,
		currentCanvasElements: currentCanvas?.elements.length
	});

	return currentCanvas && selectedGitProject ? (
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
						{selectedGitProject.canvases.map((canvas, index) => (
							<button 
								key={index}
								className={cn(
									"w-44 px-4 py-2 border-2 border-[var(--acc-400-50)] rounded-md text-left hover:bg-[var(--base-400-20)] transition-colors",
									currentCanvas.id === canvas.id
										? "bg-[var(--base-400-20)]"
										: "bg-transparent",
								)}
								onClick={() => selectedGitProject.setCurrentCanvasIndex(index)}
							>
								{canvas.name}
							</button>
						))}
					</>
				)}
			</div>
			<div className="w-full h-full animate-fade-in opacity-100" key={currentCanvas.id}>
				<CanvasView
					elements={currentCanvas.elements}
					onElementsChange={updateCanvasElements}
				/>
			</div>
		</div>
	) : (<></>);
};

export default GitProjectView;