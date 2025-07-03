import { useState } from "react";
import { OsSession, OsSessionKind } from "../bindings/os";
import { useStore } from "../state";
import { OsSessionKindSelector } from "./OsSessionKindSelector";
import { ProjectDirectoryList } from "./ProjectDirectoryList";
import { GitProject } from "../types/GitProject";

interface ProjectSelectorProps {
	onProjectCreated: (projectId: string) => void;
}

export function ProjectSelector({ onProjectCreated }: ProjectSelectorProps) {
	const store = useStore();
	const [selectedKind, setSelectedKind] = useState<OsSessionKind | undefined>();
	const [selectedPath, setSelectedPath] = useState<string | undefined>();

	const handleKindSelect = (kind: OsSessionKind) => {
		setSelectedKind(kind);
		setSelectedPath(undefined); // Reset path when kind changes
	};

	const handlePathSelect = (path: string) => {
		setSelectedPath(path);
	};

	const findExistingProjectForPath = (path: string): GitProject | null => {
		// Check if any existing project has this path as root or in any canvas
		return store.gitProjects.find(project => {
			// Check if this path is the project root
			const rootPath = 'Local' in project.root ? project.root.Local : 
							'Wsl' in project.root ? project.root.Wsl.working_directory : null;
			
			if (rootPath === path) {
				return true;
			}

			// Check if this path is in any canvas osSession
			return project.canvases.some(canvas => {
				if (!canvas.osSession) return false;
				const canvasPath = 'Local' in canvas.osSession ? canvas.osSession.Local :
								  'Wsl' in canvas.osSession ? canvas.osSession.Wsl.working_directory : null;
				return canvasPath === path;
			});
		}) || null;
	};

	const handleCreateSession = () => {
		if (!selectedKind || !selectedPath) return;

		// First, check if there's an existing project that covers this path
		const existingProject = findExistingProjectForPath(selectedPath);
		if (existingProject) {
			console.log("Found existing project for path:", selectedPath, existingProject);
			onProjectCreated(existingProject.id);
			return;
		}

		// Create OsSession based on selected kind and path
		let osSession: OsSession;
		if (selectedKind === "Local") {
			osSession = { Local: selectedPath };
		} else if (typeof selectedKind === "object" && "Wsl" in selectedKind) {
			osSession = {
				Wsl: {
					distribution: selectedKind.Wsl,
					working_directory: selectedPath,
				},
			};
		} else {
			console.error("Invalid OS session kind");
			return;
		}

		// Create GitProject with the OsSession as root
		const gitProject = new GitProject(osSession);
		const projectIndex = store.addGitProject(gitProject);

		onProjectCreated(projectIndex);
	};

	const canProceed = selectedKind && selectedPath;

	return (
		<div className="flex flex-col items-center justify-center w-full h-full max-h-full">
			<div className="flex justify-center items-center gap-8 max-w-4xl w-full h-full max-h-full">
				{/* OS Session Kind Selector */}
				<div
					className="flex-shrink-0"
					style={{ width: selectedKind ? "300px" : "400px" }}
				>
					<OsSessionKindSelector
						onSelect={handleKindSelect}
						selectedKind={selectedKind}
					/>
				</div>

				{/* Project Directory List - only show when kind is selected */}
				{selectedKind && (
					<div className="flex-1 h-full max-h-full">
						<ProjectDirectoryList
							osSessionKind={selectedKind}
							onSelect={handlePathSelect}
							selectedPath={selectedPath}
							existingProjects={store.gitProjects}
						/>
					</div>
				)}
			</div>

			{/* Create Session Button */}
			{canProceed && (
				<div className="mt-6">
					<button
						onClick={handleCreateSession}
						className="px-6 py-3 bg-[var(--acc-400)] hover:bg-[var(--acc-500)] text-[var(--whitest)] rounded-md  transition-colors"
					>
						Open Project
					</button>
				</div>
			)}
		</div>
	);
}
