import { Store, load } from "@tauri-apps/plugin-store";
import { Project, ProjectManager } from "../types/project";
import { nanoid } from "nanoid";

export class ProjectService implements ProjectManager {
  private store: Store | null = null;
  private _projects: Project[] = [];
  private initialized = false;

  constructor() {
    this.loadProjects();
  }

  get projects(): Project[] {
    return this._projects;
  }

  private async loadProjects(): Promise<void> {
    try {
      this.store = await load("projects.json", { autoSave: false });
      const savedProjects = await this.store.get<Project[]>("projects");
      if (savedProjects) {
        this._projects = savedProjects.map(p => ({
          ...p,
          lastOpened: new Date(p.lastOpened),
          createdAt: new Date(p.createdAt)
        }));
      }
      this.initialized = true;
    } catch (error) {
      console.error("Failed to load projects:", error);
      this.initialized = true;
    }
  }

  private async saveProjects(): Promise<void> {
    if (!this.store || !this.initialized) return;
    try {
      await this.store.set("projects", this._projects);
      await this.store.save();
    } catch (error) {
      console.error("Failed to save projects:", error);
    }
  }

  getRecentProjects(limit = 3): Project[] {
    return this._projects
      .sort((a, b) => b.lastOpened.getTime() - a.lastOpened.getTime())
      .slice(0, limit);
  }

  addProject(projectData: Omit<Project, 'id' | 'createdAt' | 'lastOpened'>): Project {
    const now = new Date();
    const project: Project = {
      ...projectData,
      id: nanoid(),
      createdAt: now,
      lastOpened: now,
      subfolderPaths: [
        { id: nanoid(), relativePath: "/" },
        ...projectData.subfolderPaths
      ]
    };

    this._projects.push(project);
    this.saveProjects();
    return project;
  }

  updateProject(id: string, updates: Partial<Project>): Project | null {
    const projectIndex = this._projects.findIndex(p => p.id === id);
    if (projectIndex === -1) return null;

    this._projects[projectIndex] = {
      ...this._projects[projectIndex],
      ...updates,
      lastOpened: new Date()
    };

    this.saveProjects();
    return this._projects[projectIndex];
  }

  deleteProject(id: string): boolean {
    const initialLength = this._projects.length;
    this._projects = this._projects.filter(p => p.id !== id);
    
    if (this._projects.length < initialLength) {
      this.saveProjects();
      return true;
    }
    return false;
  }

  getProject(id: string): Project | null {
    return this._projects.find(p => p.id === id) || null;
  }

  async waitForInitialization(): Promise<void> {
    while (!this.initialized) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

export const projectService = new ProjectService();