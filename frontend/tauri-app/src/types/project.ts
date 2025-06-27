export interface Project {
  id: string;
  name: string;
  rootPath: string;
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