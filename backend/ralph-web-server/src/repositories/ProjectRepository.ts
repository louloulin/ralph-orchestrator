/**
 * Project Repository
 *
 * Data access layer for project management.
 * Provides CRUD operations for Ralph projects.
 */

import { eq, desc } from "drizzle-orm";
import { getDatabase } from "../db/connection";
import { projects, type Project, type NewProject } from "../db/schema";
import { randomUUID } from "crypto";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

export class ProjectRepository {
  private db: BunSQLiteDatabase<typeof import("../db/schema")>;

  constructor(db?: BunSQLiteDatabase<typeof import("../db/schema")>) {
    this.db = db || getDatabase();
  }

  /**
   * Create a new project
   */
  create(data: Omit<NewProject, "id" | "createdAt" | "updatedAt" | "isActive">): Project {
    const now = new Date();
    const id = randomUUID();
    const project: NewProject = {
      id,
      name: data.name,
      path: data.path,
      type: data.type || "local",
      description: data.description || null,
      isActive: false,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(projects).values(project).run();
    return this.findById(id)!;
  }

  /**
   * Find project by ID
   */
  findById(id: string): Project | undefined {
    const result = this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get();
    return result;
  }

  /**
   * Find project by path
   */
  findByPath(path: string): Project | undefined {
    const result = this.db
      .select()
      .from(projects)
      .where(eq(projects.path, path))
      .get();
    return result;
  }

  /**
   * Get all projects, ordered by most recently updated
   */
  findAll(): Project[] {
    return this.db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt))
      .all();
  }

  /**
   * Get the currently active project
   */
  findActive(): Project | undefined {
    const result = this.db
      .select()
      .from(projects)
      .where(eq(projects.isActive, true))
      .get();
    return result;
  }

  /**
   * Update a project
   */
  update(id: string, updates: Partial<Pick<NewProject, "name" | "path" | "type" | "description">>): Project | undefined {
    const existing = this.findById(id);
    if (!existing) return undefined;

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.db
      .update(projects)
      .set({
        name: updated.name,
        path: updated.path,
        type: updated.type,
        description: updated.description,
        updatedAt: updated.updatedAt,
      })
      .where(eq(projects.id, id))
      .run();

    return this.findById(id);
  }

  /**
   * Set a project as active (deactivates all others)
   */
  setActive(id: string): Project | undefined {
    const project = this.findById(id);
    if (!project) return undefined;

    // Deactivate all projects
    this.db
      .update(projects)
      .set({ isActive: false })
      .where(eq(projects.isActive, true))
      .run();

    // Activate the specified project
    this.db
      .update(projects)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .run();

    return this.findById(id);
  }

  /**
   * Deactivate all projects
   */
  deactivateAll(): void {
    this.db
      .update(projects)
      .set({ isActive: false })
      .where(eq(projects.isActive, true))
      .run();
  }

  /**
   * Delete a project
   */
  delete(id: string): boolean {
    const project = this.findById(id);
    if (!project) return false;

    this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .run();

    return true;
  }

  /**
   * Check if a path is already registered
   */
  pathExists(path: string): boolean {
    const result = this.findByPath(path);
    return result !== undefined;
  }

  /**
   * Get project count
   */
  count(): number {
    const result = this.db.select({ count: projects.id }).from(projects).all();
    return result.length;
  }
}

// Singleton instance
export const projectRepository = new ProjectRepository();
