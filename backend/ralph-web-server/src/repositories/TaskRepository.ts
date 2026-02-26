/**
 * TaskRepository
 *
 * Data access layer for task operations using Drizzle ORM.
 * Implements CRUD operations with proper typing and error handling.
 */

import { eq, and, isNull, isNotNull, like, or, inArray, gte, lte, desc, ne } from "drizzle-orm";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { tasks, Task, NewTask } from "../db/schema";
import * as schema from "../db/schema";
import { getRunResult } from "../db/connection";

/**
 * Search options for task queries
 */
export interface TaskSearchOptions {
  /** Search query (searches in title and executionSummary) */
  query?: string;
  /** Filter by status values */
  status?: string[];
  /** Filter by project ID */
  projectId?: string;
  /** Include archived tasks */
  includeArchived?: boolean;
  /** Include closed tasks */
  includeClosed?: boolean;
  /** Date range filter */
  dateRange?: {
    start?: Date;
    end?: Date;
    field: "createdAt" | "updatedAt" | "completedAt";
  };
  /** Maximum number of results */
  limit?: number;
}

export class TaskRepository {
  private db: BunSQLiteDatabase<typeof schema>;

  constructor(db: BunSQLiteDatabase<typeof schema>) {
    this.db = db;
  }

  /**
   * Create a new task
   * Automatically sets createdAt and updatedAt timestamps
   */
  create(task: Omit<NewTask, "createdAt" | "updatedAt">): Task {
    const now = new Date();
    const taskWithTimestamps: NewTask = {
      ...task,
      createdAt: now,
      updatedAt: now,
    };

    this.db.insert(tasks).values(taskWithTimestamps).run();
    return this.findById(task.id)!;
  }

  /**
   * Find a task by its ID
   */
  findById(id: string): Task | undefined {
    const results = this.db.select().from(tasks).where(eq(tasks.id, id)).all();
    return results[0];
  }

  /**
   * Find all tasks, optionally filtered by status and archival state
   */
  findAll(status?: string, includeArchived: boolean = false): Task[] {
    const conditions = [];

    if (status) {
      conditions.push(eq(tasks.status, status));
    }

    if (!includeArchived) {
      conditions.push(isNull(tasks.archivedAt));
    }

    let query = this.db.select().from(tasks);

    if (conditions.length > 0) {
      // @ts-expect-error - drizzle spread operator typing issue with dynamic conditions
      query = query.where(and(...conditions));
    }

    return query.all();
  }

  /**
   * Find all tasks for a specific project
   */
  findByProjectId(projectId: string, status?: string, includeArchived: boolean = false): Task[] {
    const conditions = [eq(tasks.projectId, projectId)];

    if (status) {
      conditions.push(eq(tasks.status, status));
    }

    if (!includeArchived) {
      conditions.push(isNull(tasks.archivedAt));
    }

    // @ts-expect-error - drizzle spread operator typing issue with dynamic conditions
    return this.db.select().from(tasks).where(and(...conditions)).all();
  }

  /**
   * Find tasks that are ready (not blocked)
   * Returns tasks that have no blockedBy value or whose blocker is closed OR archived
   */
  findReady(): Task[] {
    const allTasks = this.findAll("open");

    // Tasks that can unblock others: closed tasks (active) OR any archived task
    const closedTasks = this.findAll("closed");
    const archivedTasks = this.db.select().from(tasks).where(isNotNull(tasks.archivedAt)).all();

    const unblockingIds = new Set([
      ...closedTasks.map((t) => t.id),
      ...archivedTasks.map((t) => t.id),
    ]);

    return allTasks.filter((task) => {
      if (!task.blockedBy) return true;
      return unblockingIds.has(task.blockedBy);
    });
  }

  /**
   * Update a task by ID
   * Automatically updates the updatedAt timestamp
   */
  update(
    id: string,
    updates: Partial<Omit<Task, "id" | "createdAt" | "updatedAt">>
  ): Task | undefined {
    const existing = this.findById(id);
    if (!existing) {
      return undefined;
    }

    this.db
      .update(tasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .run();

    return this.findById(id);
  }

  /**
   * Close a task (set status to 'closed')
   */
  close(id: string): Task | undefined {
    return this.update(id, { status: "closed" });
  }

  /**
   * Archive a task
   */
  archive(id: string): Task | undefined {
    return this.update(id, { archivedAt: new Date() });
  }

  /**
   * Unarchive a task
   */
  unarchive(id: string): Task | undefined {
    return this.update(id, { archivedAt: null });
  }

  /**
   * Delete a task by ID
   * Returns true if a task was deleted, false if not found
   */
  delete(id: string): boolean {
    const result = getRunResult(this.db.delete(tasks).where(eq(tasks.id, id)).run());
    return result.changes > 0;
  }

  /**
   * Delete all tasks (useful for testing)
   */
  deleteAll(): number {
    const result = getRunResult(this.db.delete(tasks).run());
    return result.changes;
  }

  /**
   * Search tasks with flexible filtering options
   * Supports full-text search, status filtering, date range, and archival options
   */
  search(options: TaskSearchOptions): Task[] {
    const conditions = [];

    // Project filter (P5-2: Project Isolation)
    if (options.projectId) {
      conditions.push(eq(tasks.projectId, options.projectId));
    }

    // Full-text search on title and executionSummary
    if (options.query && options.query.length >= 2) {
      const searchPattern = `%${options.query}%`;
      conditions.push(
        or(
          like(tasks.title, searchPattern),
          like(tasks.executionSummary, searchPattern)
        )
      );
    }

    // Status filter (multi-select)
    if (options.status && options.status.length > 0) {
      conditions.push(inArray(tasks.status, options.status));
    }

    // Exclude archived tasks unless explicitly included
    if (!options.includeArchived) {
      conditions.push(isNull(tasks.archivedAt));
    }

    // Exclude closed tasks unless explicitly included or status filter includes "closed"
    const closedInStatus = options.status && options.status.includes("closed");
    if (!options.includeClosed && !closedInStatus) {
      conditions.push(ne(tasks.status, "closed"));
    }

    // Date range filter
    if (options.dateRange) {
      const dateField = tasks[options.dateRange.field];
      if (options.dateRange.start) {
        conditions.push(gte(dateField, options.dateRange.start));
      }
      if (options.dateRange.end) {
        conditions.push(lte(dateField, options.dateRange.end));
      }
    }

    // Build and execute the query
    if (conditions.length > 0) {
      return this.db
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(desc(tasks.updatedAt))
        .limit(options.limit ?? 50)
        .all();
    }

    // No conditions - return all tasks (with limit)
    return this.db
      .select()
      .from(tasks)
      .orderBy(desc(tasks.updatedAt))
      .limit(options.limit ?? 50)
      .all();
  }

  /**
   * Set file changes for a task (P5-5: Code Review)
   *
   * Stores the array of file changes as JSON-serialized string.
   */
  setFileChanges(id: string, fileChanges: schema.FileChange[]): Task | undefined {
    const serialized = JSON.stringify(fileChanges);
    return this.update(id, { fileChanges: serialized });
  }

  /**
   * Get file changes for a task (P5-5: Code Review)
   *
   * Parses the JSON-serialized file changes array.
   */
  getFileChanges(id: string): schema.FileChange[] | undefined {
    const task = this.findById(id);
    if (!task || !task.fileChanges) {
      return undefined;
    }
    try {
      return JSON.parse(task.fileChanges) as schema.FileChange[];
    } catch {
      return undefined;
    }
  }

  /**
   * Update approval status for a specific file change (P5-5: Code Review)
   *
   * Allows approving or rejecting individual file changes.
   */
  updateFileChangeApproval(
    id: string,
    filePath: string,
    approvalStatus: "approved" | "rejected"
  ): Task | undefined {
    const fileChanges = this.getFileChanges(id);
    if (!fileChanges) {
      return undefined;
    }

    const updatedChanges = fileChanges.map((change) =>
      change.path === filePath ? { ...change, approvalStatus } : change
    );

    return this.setFileChanges(id, updatedChanges);
  }

  /**
   * Calculate summary statistics for file changes (P5-5: Code Review)
   */
  getFileChangesStats(id: string): schema.FileChangesStats | undefined {
    const fileChanges = this.getFileChanges(id);
    if (!fileChanges) {
      return undefined;
    }

    return {
      filesChanged: fileChanges.length,
      totalAdditions: fileChanges.reduce((sum, fc) => sum + fc.additions, 0),
      totalDeletions: fileChanges.reduce((sum, fc) => sum + fc.deletions, 0),
      pendingApproval: fileChanges.filter((fc) => !fc.approvalStatus || fc.approvalStatus === "pending").length,
      approved: fileChanges.filter((fc) => fc.approvalStatus === "approved").length,
      rejected: fileChanges.filter((fc) => fc.approvalStatus === "rejected").length,
    };
  }
}
