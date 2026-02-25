/**
 * Project Service
 *
 * Business logic layer for project management.
 * Handles project CRUD operations and project context switching.
 */

import * as fs from "fs";
import * as path from "path";
import { projectRepository, type ProjectRepository } from "../repositories/ProjectRepository";
import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
} from "../types/project";

export class ProjectService {
  private repository: ProjectRepository;

  constructor(repository?: ProjectRepository) {
    this.repository = repository || projectRepository;
  }

  /**
   * Create a new project
   */
  async createProject(input: CreateProjectInput): Promise<Project> {
    // Validate path exists and is a directory
    if (!fs.existsSync(input.path)) {
      throw new Error(`Path does not exist: ${input.path}`);
    }

    const stats = fs.statSync(input.path);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${input.path}`);
    }

    // Check if path already registered
    if (this.repository.pathExists(input.path)) {
      throw new Error(`Project already exists at path: ${input.path}`);
    }

    return this.repository.create({
      name: input.name,
      path: input.path,
      description: input.description || null,
    });
  }

  /**
   * Get all projects
   */
  getAllProjects(): Project[] {
    return this.repository.findAll();
  }

  /**
   * Get project by ID
   */
  getProject(id: string): Project | undefined {
    return this.repository.findById(id);
  }

  /**
   * Get active project
   */
  getActiveProject(): Project | undefined {
    return this.repository.findActive();
  }

  /**
   * Update a project
   */
  updateProject(id: string, input: UpdateProjectInput): Project | undefined {
    // If path is being updated, validate it
    if (input.path) {
      if (!fs.existsSync(input.path)) {
        throw new Error(`Path does not exist: ${input.path}`);
      }

      const stats = fs.statSync(input.path);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${input.path}`);
      }
    }

    return this.repository.update(id, input);
  }

  /**
   * Set a project as active (switch project context)
   */
  setActiveProject(id: string): Project | undefined {
    const project = this.repository.findById(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }

    // Validate project path still exists
    if (!fs.existsSync(project.path)) {
      throw new Error(`Project path no longer exists: ${project.path}`);
    }

    return this.repository.setActive(id);
  }

  /**
   * Deactivate all projects
   */
  deactivateAll(): void {
    this.repository.deactivateAll();
  }

  /**
   * Delete a project
   */
  deleteProject(id: string): boolean {
    const project = this.repository.findById(id);
    if (!project) {
      return false;
    }

    // If deleting active project, deactivate first
    if (project.isActive) {
      this.repository.deactivateAll();
    }

    return this.repository.delete(id);
  }

  /**
   * Get project workspace root (for services that need current project path)
   */
  getWorkspaceRoot(): string {
    const activeProject = this.repository.findActive();
    if (activeProject) {
      return activeProject.path;
    }

    // Fallback to default workspace (process.cwd() or RALPH_WORKSPACE_ROOT)
    return process.env.RALPH_WORKSPACE_ROOT || process.cwd();
  }

  /**
   * Validate a project path
   */
  validatePath(projectPath: string): { valid: boolean; error?: string } {
    if (!fs.existsSync(projectPath)) {
      return { valid: false, error: "Path does not exist" };
    }

    const stats = fs.statSync(projectPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: "Path is not a directory" };
    }

    return { valid: true };
  }

  /**
   * Discover Ralph projects in a directory
   */
  discoverProjects(basePath: string): string[] {
    const projects: string[] = [];

    if (!fs.existsSync(basePath)) {
      return projects;
    }

    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const ralphPath = path.join(basePath, entry.name, ".ralph");
        if (fs.existsSync(ralphPath)) {
          projects.push(path.join(basePath, entry.name));
        }
      }
    }

    return projects;
  }
}

// Singleton instance
export const projectService = new ProjectService();
