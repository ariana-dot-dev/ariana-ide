import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Project } from "../types/project";
import { projectService } from "../services/ProjectService";
import { cn } from "../utils";

interface LandingPageProps {
  onProjectSelect: (project: Project, subfolderId?: string) => void;
}

export default function LandingPage({ onProjectSelect }: LandingPageProps) {
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectPath, setNewProjectPath] = useState("");
  const [showAllSubfolders, setShowAllSubfolders] = useState<string | null>(null);

  console.log("LandingPage rendered - recentProjects:", recentProjects.length);

  useEffect(() => {
    loadRecentProjects();
  }, []);

  const loadRecentProjects = async () => {
    await projectService.waitForInitialization();
    setRecentProjects(projectService.getRecentProjects(3));
  };

  const handleSelectProject = (project: Project) => {
    setSelectedProject(project);
    setSelectedSubfolder(project.subfolderPaths[0]?.id || "");
  };

  const handleOpenProject = () => {
    if (selectedProject) {
      onProjectSelect(selectedProject, selectedSubfolder);
    }
  };

  const handleAddSubfolder = async (project: Project) => {
    try {
      console.log("Opening directory picker for new subfolder...");
      const selectedPath = await open({
        directory: true,
        multiple: false,
      });
      
      if (!selectedPath) {
        return;
      }
      
      const pathString = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
      
      // Calculate relative path from project root
      let relativePath = pathString.replace(project.rootPath, "");
      if (relativePath.startsWith("/")) {
        relativePath = relativePath.substring(1);
      }
      if (!relativePath) {
        relativePath = "/"; // Root folder
      }
      
      // Check if this subfolder already exists
      const existingSubfolder = project.subfolderPaths.find(sf => sf.relativePath === relativePath);
      if (existingSubfolder) {
        alert("This subfolder is already in the project.");
        return;
      }
      
      // Add the new subfolder to the project
      await projectService.waitForInitialization();
      const updatedProject = projectService.addSubfolderToProject(project.id, relativePath);
      
      if (updatedProject) {
        // Refresh the recent projects list
        setRecentProjects(projectService.getRecentProjects(3));
        console.log("Added subfolder:", relativePath, "to project:", project.name);
      }
      
    } catch (error) {
      console.error("Error adding subfolder:", error);
      alert(`Error adding subfolder: ${error.message || error}`);
    }
  };

  const handleCreateNewProject = async () => {
    console.log("handleCreateNewProject called");
    if (!newProjectName.trim()) {
      alert("Please enter a project name");
      return;
    }

    if (!newProjectPath.trim()) {
      alert("Please select a location for your project");
      return;
    }

    try {
      const projectPath = newProjectPath.trim();
      
      // Create the full project path (parent directory + project name)
      const fullProjectPath = `${projectPath}/${newProjectName}`;
      
      console.log("Creating project with path:", fullProjectPath);
      
      // Create project using the service
      await projectService.waitForInitialization();
      const project = projectService.addProject({
        name: newProjectName,
        rootPath: fullProjectPath,
        subfolderPaths: []
      });

      console.log("Project created:", project);
      onProjectSelect(project);
    } catch (error) {
      console.error("Failed to create project:", error);
      alert(`Failed to create project: ${error}`);
    }
  };


  return (
    <div className="flex-1 flex items-center justify-center p-8 relative z-50 font-sans font-semibold">
      <div className="max-w-4xl w-full relative z-50">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="mb-6">
            <img 
              src="app-icon.png" 
              alt="Ariana IDE Logo" 
              className="w-16 h-16 mx-auto mb-4"
            />
          </div>
          <h1 className="text-4xl font-bold text-[var(--acc-600)] mb-4">
            Welcome to Ariana IDE
          </h1>
          <p className="text-lg text-[var(--base-600)]">
            Select a project to get started
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Recent Projects */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-[var(--acc-600)] mb-4">
              Recent Projects
            </h2>
            
            {recentProjects.length === 0 ? (
              <div className="bg-[var(--base-200)] rounded-lg p-6 text-center">
                <p className="text-[var(--base-600)]">No recent projects</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className={cn(
                      "bg-[var(--base-200)] hover:bg-[var(--base-300)] rounded-lg p-4 cursor-pointer transition-colors border-2",
                      selectedProject?.id === project.id
                        ? "border-[var(--acc-400)]"
                        : "border-transparent"
                    )}
                    onClick={() => handleSelectProject(project)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-[var(--acc-600)]">
                          {project.name}
                        </h3>
                        <p className="text-sm text-[var(--base-600)] mt-1 break-words break-all overflow-wrap-anywhere max-w-full">
                          {project.rootPath}
                        </p>
                        <p className="text-xs text-[var(--base-500)] mt-2">
                          Last opened: {project.lastOpened.toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-2xl">📁</div>
                    </div>

                    {/* Subfolders */}
                    {selectedProject?.id === project.id && (
                      <div className="mt-4 pt-4 border-t border-[var(--base-400)]">
                        <p className="text-sm font-medium text-[var(--base-600)] mb-2">
                          Active subfolders:
                        </p>
                        <div className="space-y-1 max-w-full">
                          {(() => {
                            // Always show root first
                            const rootSubfolder = project.subfolderPaths.find(sf => sf.relativePath === "/");
                            // Get non-root subfolders sorted by most recent (we'll simulate this for now)
                            const nonRootSubfolders = project.subfolderPaths.filter(sf => sf.relativePath !== "/");
                            
                            const showingAll = showAllSubfolders === project.id;
                            const subfoldersToShow = showingAll ? nonRootSubfolders : nonRootSubfolders.slice(0, 2);
                            
                            const allSubfolders = rootSubfolder ? [rootSubfolder, ...subfoldersToShow] : subfoldersToShow;
                            
                            return (
                              <>
                                {allSubfolders.map((subfolder) => (
                                  <label
                                    key={subfolder.id}
                                    className="flex items-start space-x-2 cursor-pointer w-full max-w-full"
                                  >
                                    <input
                                      type="radio"
                                      name="subfolder"
                                      value={subfolder.id}
                                      checked={selectedSubfolder === subfolder.id}
                                      onChange={(e) => setSelectedSubfolder(e.target.value)}
                                      className="w-4 h-4 text-[var(--acc-500)] mt-0.5 flex-shrink-0"
                                    />
                                    <span className="text-sm text-[var(--base-600)] break-words break-all overflow-wrap-anywhere flex-1 min-w-0">
                                      {subfolder.relativePath === "/" ? "Root" : subfolder.relativePath}
                                    </span>
                                  </label>
                                ))}
                                
                                {/* Show More/Less button */}
                                {nonRootSubfolders.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => setShowAllSubfolders(showingAll ? null : project.id)}
                                    className="text-xs text-[var(--acc-500)] hover:text-[var(--acc-600)] mt-1"
                                  >
                                    {showingAll ? "Show Less" : `Show ${nonRootSubfolders.length - 2} More`}
                                  </button>
                                )}
                                
                                {/* Add Subfolder button */}
                                <button
                                  type="button"
                                  onClick={() => handleAddSubfolder(project)}
                                  className="flex items-center space-x-1 text-xs text-[var(--acc-500)] hover:text-[var(--acc-600)] mt-2"
                                >
                                  <span>+</span>
                                  <span>Add Subfolder</span>
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {selectedProject && (
                  <button
                    onClick={handleOpenProject}
                    className="w-full bg-[var(--acc-500)] hover:bg-[var(--acc-600)] text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Open Project
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Load Previous Project */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-[var(--acc-600)] mb-4">
              Load Previous Project
            </h2>
            
            <div className="space-y-3">
              <button
                type="button"
                onClick={async () => {
                  try {
                    console.log("Opening directory picker for existing project...");
                    const selectedPath = await open({
                      directory: true,
                      multiple: false,
                    });
                    
                    if (!selectedPath) {
                      return;
                    }
                    
                    const pathString = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
                    const projectName = pathString.split('/').pop() || "Loaded Project";
                    
                    console.log("Loading existing project:", projectName, "from:", pathString);
                    
                    // Create project entry for the existing folder
                    await projectService.waitForInitialization();
                    const project = projectService.addProject({
                      name: projectName,
                      rootPath: pathString,
                      subfolderPaths: []
                    });

                    console.log("Project loaded:", project);
                    onProjectSelect(project);
                    
                  } catch (error) {
                    console.error("Error loading existing project:", error);
                    alert(`Error loading project: ${error.message || error}`);
                  }
                }}
                style={{ pointerEvents: 'auto', zIndex: 9999 }}
                className="relative z-50 w-full bg-[var(--acc-500)] hover:bg-[var(--acc-600)] text-white font-semibold py-4 px-6 rounded-lg transition-colors border-2 border-solid border-[var(--acc-700)] flex items-center justify-center gap-3 cursor-pointer"
              >
                <span className="text-2xl">📂</span>
                <span>Browse for Project</span>
              </button>
              
            </div>
          </div>

          {/* Create New Project */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-[var(--acc-600)] mb-4">
              Create New Project
            </h2>

            {!isCreatingProject ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log("Create new project button clicked!");
                    setIsCreatingProject(true);
                  }}
                  style={{ pointerEvents: 'auto', zIndex: 9999 }}
                  className="relative z-50 w-full bg-[var(--acc-500)] hover:bg-[var(--acc-600)] text-white font-semibold py-4 px-6 rounded-lg transition-colors border-2 border-solid border-[var(--acc-700)] flex items-center justify-center gap-3 cursor-pointer"
                >
                  <span className="text-2xl">✨</span>
                  <span>Create New Project</span>
                </button>
              </div>
            ) : (
              <div className="bg-[var(--base-200)] rounded-lg p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--base-600)] mb-2">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--base-100)] border border-[var(--base-400)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--acc-500)] text-[var(--base-700)]"
                    placeholder="Enter project name..."
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[var(--base-600)] mb-2">
                    Project Location
                  </label>
                  <div className="flex gap-2 w-full max-w-full">
                    <input
                      type="text"
                      value={newProjectPath}
                      onChange={(e) => setNewProjectPath(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 bg-[var(--base-100)] border border-[var(--base-400)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--acc-500)] text-[var(--base-700)]"
                      placeholder="Choose a location for your project..."
                      readOnly
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          console.log("Opening directory picker for project location...");
                          const selectedPath = await open({
                            directory: true,
                            multiple: false,
                          });
                          if (selectedPath) {
                            const pathString = Array.isArray(selectedPath) ? selectedPath[0] : selectedPath;
                            setNewProjectPath(pathString);
                            console.log("Project location selected:", pathString);
                          }
                        } catch (error) {
                          console.error("Error selecting project location:", error);
                          alert(`Error selecting location: ${error.message || error}`);
                        }
                      }}
                      className="flex-shrink-0 px-4 py-2 bg-[var(--acc-500)] hover:bg-[var(--acc-600)] text-white rounded-md font-medium transition-colors"
                    >
                      Browse
                    </button>
                  </div>
                  {!newProjectPath && (
                    <p className="text-xs text-[var(--base-500)] mt-1">
                      Click "Browse" to select where to create your project
                    </p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      console.log("Create button clicked with name:", newProjectName);
                      handleCreateNewProject();
                    }}
                    disabled={!newProjectName.trim() || !newProjectPath.trim()}
                    className="flex-1 bg-[var(--acc-500)] hover:bg-[var(--acc-600)] disabled:bg-[var(--base-400)] text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingProject(false);
                      setNewProjectName("");
                      setNewProjectPath("");
                    }}
                    className="flex-1 bg-[var(--base-400)] hover:bg-[var(--base-500)] text-[var(--base-700)] font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}