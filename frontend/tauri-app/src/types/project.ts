export interface ProjectSubfolder {
  id: string;
  relativePath: string;
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  subfolderPaths: ProjectSubfolder[];
  lastOpened: Date;
  createdAt: Date;
}

export interface ProjectManager {
  projects: Project[];
  getRecentProjects: (limit?: number) => Project[];
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'lastOpened'>) => Project;
  updateProject: (id: string, updates: Partial<Project>) => Project | null;
  deleteProject: (id: string) => boolean;
  getProject: (id: string) => Project | null;
}