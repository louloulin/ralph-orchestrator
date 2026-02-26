/**
 * TRPC Router Configuration
 *
 * Defines the TRPC router with task-related procedures.
 * Uses the existing TaskRepository for data access.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { TaskRepository, SettingsRepository, TaskLogRepository, CollectionRepository } from "../repositories";
import { checkpointRepository } from "../repositories/CheckpointRepository";
import type { CheckpointRepository } from "../repositories/CheckpointRepository";
import { TaskBridge } from "../services/TaskBridge";
import { SettingsService } from "../services/SettingsService";
import { LoopsManager } from "../services/LoopsManager";
import { PlanningService } from "../services/PlanningService";
import { CollectionService } from "../services/CollectionService";
import { LoopSupervisor } from "../services/LoopSupervisor";
import { AgentTeamsService } from "../services/AgentTeamsService";
import { MetricStore } from "../services/MetricStore";
import { AlertEngine } from "../services/AlertEngine";
import { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "../db/schema";
import * as fs from "fs";
import * as path from "path";
import YAML from "yaml";

/**
 * Context passed to all TRPC procedures
 */
export interface Context {
  taskRepository: TaskRepository;
  taskLogRepository: TaskLogRepository;
  settingsService: SettingsService;
  collectionService: CollectionService;
  taskBridge?: TaskBridge;
  loopsManager?: LoopsManager;
  planningService?: PlanningService;
  loopSupervisor?: LoopSupervisor;
  agentTeamsService?: AgentTeamsService;
  metricStore?: MetricStore;
  alertEngine?: AlertEngine;
}

/**
 * Create context from database instance
 * @param db - Database instance
 * @param taskBridge - Optional TaskBridge for task execution
 * @param loopsManager - Optional LoopsManager for loop operations
 * @param planningService - Optional PlanningService for planning sessions
 * @param loopSupervisor - Optional LoopSupervisor for process daemon operations
 * @param agentTeamsService - Optional AgentTeamsService for multi-agent operations
 */
export function createContext(
  db: BunSQLiteDatabase<typeof schema>,
  taskBridge?: TaskBridge,
  loopsManager?: LoopsManager,
  planningService?: PlanningService,
  loopSupervisor?: LoopSupervisor,
  agentTeamsService?: AgentTeamsService,
  metricStore?: MetricStore,
  alertEngine?: AlertEngine
): Context {
  const settingsRepository = new SettingsRepository(db);
  const collectionRepository = new CollectionRepository(db);
  return {
    taskRepository: new TaskRepository(db),
    taskLogRepository: new TaskLogRepository(db),
    settingsService: new SettingsService(settingsRepository),
    collectionService: new CollectionService(collectionRepository),
    taskBridge,
    loopsManager,
    planningService,
    loopSupervisor,
    agentTeamsService,
    metricStore,
    alertEngine,
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Project router - CRUD operations for Ralph projects
 */
export const projectRouter = router({
  /**
   * List all projects
   */
  list: publicProcedure.query(async () => {
    const { projectService } = await import("../services/ProjectService");
    return projectService.getAllProjects();
  }),

  /**
   * Get a single project by ID
   */
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const { projectService } = await import("../services/ProjectService");
      const project = projectService.getProject(input.id);
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with id '${input.id}' not found`,
        });
      }
      return project;
    }),

  /**
   * Get the currently active project
   */
  getActive: publicProcedure.query(async () => {
    const { projectService } = await import("../services/ProjectService");
    return projectService.getActiveProject();
  }),

  /**
   * Create a new project
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1, "Project name is required"),
        path: z.string().min(1, "Project path is required"),
        type: z.enum(["local", "worktree"]).default("local"),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { projectService } = await import("../services/ProjectService");
      try {
        return await projectService.createProject(input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to create project",
        });
      }
    }),

  /**
   * Update a project
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        path: z.string().min(1).optional(),
        type: z.enum(["local", "worktree"]).optional(),
        description: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { projectService } = await import("../services/ProjectService");
      const project = projectService.updateProject(input.id, {
        name: input.name,
        path: input.path,
        type: input.type,
        description: input.description,
      });
      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with id '${input.id}' not found`,
        });
      }
      return project;
    }),

  /**
   * Set a project as active (switch project context)
   */
  setActive: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { projectService } = await import("../services/ProjectService");
      try {
        return projectService.setActiveProject(input.id);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to set active project",
        });
      }
    }),

  /**
   * Delete a project
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const { projectService } = await import("../services/ProjectService");
      const deleted = projectService.deleteProject(input.id);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Project with id '${input.id}' not found`,
        });
      }
      return { success: true };
    }),

  /**
   * Validate a project path
   */
  validatePath: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const { projectService } = await import("../services/ProjectService");
      return projectService.validatePath(input.path);
    }),
});

/**
 * Worktree router - Git worktree management
 */
export const worktreeRouter = router({
  /**
   * List all worktrees for a repository
   */
  list: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(async ({ input }) => {
      const { worktreeService } = await import("../services/WorktreeService");
      try {
        return worktreeService.listWorktrees(input.path);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to list worktrees",
        });
      }
    }),

  /**
   * Get status of a specific worktree
   */
  status: publicProcedure
    .input(
      z.object({
        repoPath: z.string(),
        worktreePath: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { worktreeService } = await import("../services/WorktreeService");
      try {
        return worktreeService.getWorktreeStatus(input.repoPath, input.worktreePath);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to get worktree status",
        });
      }
    }),

  /**
   * Create a new worktree
   */
  create: publicProcedure
    .input(
      z.object({
        repoPath: z.string(),
        worktreePath: z.string(),
        branch: z.string(),
        createBranch: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const { worktreeService } = await import("../services/WorktreeService");
      try {
        return worktreeService.createWorktree(
          input.repoPath,
          input.worktreePath,
          input.branch,
          input.createBranch
        );
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to create worktree",
        });
      }
    }),

  /**
   * Remove a worktree
   */
  remove: publicProcedure
    .input(
      z.object({
        repoPath: z.string(),
        worktreePath: z.string(),
        force: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const { worktreeService } = await import("../services/WorktreeService");
      try {
        worktreeService.removeWorktree(input.repoPath, input.worktreePath, input.force);
        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Failed to remove worktree",
        });
      }
    }),
});

/**
 * Task router - CRUD operations for tasks
 */
export const taskRouter = router({
  /**
   * List all tasks, optionally filtered by status and archival state
   * Supports project filtering (P5-2: Project Isolation)
   */
  list: publicProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          includeArchived: z.boolean().default(false).optional(),
          projectId: z.string().optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) => {
      // If projectId is specified, use project-scoped query
      if (input?.projectId) {
        return ctx.taskRepository.findByProjectId(
          input.projectId,
          input.status,
          input.includeArchived
        );
      }
      return ctx.taskRepository.findAll(input?.status, input?.includeArchived);
    }),

  /**
   * Search tasks with flexible filtering
   * Supports query string, status filtering, date range, and archival options
   * Supports project filtering (P5-2: Project Isolation)
   */
  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(2),
        status: z.array(z.string()).optional(),
        projectId: z.string().optional(),
        includeArchived: z.boolean().optional(),
        includeClosed: z.boolean().optional(),
        dateRange: z
          .object({
            start: z.date().optional(),
            end: z.date().optional(),
            field: z.enum(["createdAt", "updatedAt", "completedAt"]),
          })
          .optional(),
        limit: z.number().min(1).max(100).default(50).optional(),
      })
    )
    .query(({ ctx, input }) => {
      return ctx.taskRepository.search({
        query: input.query,
        status: input.status,
        projectId: input.projectId,
        includeArchived: input.includeArchived,
        includeClosed: input.includeClosed,
        dateRange: input.dateRange,
        limit: input.limit,
      });
    }),

  /**
   * Get a single task by ID
   */
  get: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const task = ctx.taskRepository.findById(input.id);
    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task with id '${input.id}' not found`,
      });
    }
    return task;
  }),

  /**
   * Get tasks that are ready to be worked on (not blocked)
   */
  ready: publicProcedure.query(({ ctx }) => {
    return ctx.taskRepository.findReady();
  }),

  /**
   * Create a new task and auto-execute it
   * Supports project association (P5-2: Project Isolation)
   */
  create: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        status: z.string().default("open"),
        priority: z.number().int().min(1).max(5).default(2),
        blockedBy: z.string().nullable().optional(),
        autoExecute: z.boolean().default(true),
        preset: z.string().optional(),
        projectId: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { autoExecute, preset, ...taskData } = input;
      const task = ctx.taskRepository.create(taskData);

      // Auto-execute the task if requested and bridge is available
      if (autoExecute && ctx.taskBridge && !task.blockedBy) {
        ctx.taskBridge.enqueueTask(task, preset);
        // Return the updated task with pending status
        return ctx.taskRepository.findById(task.id) ?? task;
      }

      return task;
    }),

  /**
   * Run a specific task (enqueue for execution)
   */
  run: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.taskBridge) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Task execution is not configured",
      });
    }

    const task = ctx.taskRepository.findById(input.id);
    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task with id '${input.id}' not found`,
      });
    }

    const result = ctx.taskBridge.enqueueTask(task);
    if (!result.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: result.error || "Failed to enqueue task",
      });
    }

    return {
      success: true,
      queuedTaskId: result.queuedTaskId,
      task: ctx.taskRepository.findById(input.id),
    };
  }),

  /**
   * Run all pending tasks
   */
  runAll: publicProcedure.mutation(({ ctx }) => {
    if (!ctx.taskBridge) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Task execution is not configured",
      });
    }

    const result = ctx.taskBridge.enqueueAllPending();
    return {
      enqueued: result.enqueued,
      errors: result.errors,
    };
  }),

  /**
   * Retry a failed task
   */
  retry: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.taskBridge) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Task execution is not configured",
      });
    }

    const result = ctx.taskBridge.retryTask(input.id);
    if (!result.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: result.error || "Failed to retry task",
      });
    }

    return {
      success: true,
      queuedTaskId: result.queuedTaskId,
      task: ctx.taskRepository.findById(input.id),
    };
  }),

  /**
   * Get execution status for a task
   */
  executionStatus: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    if (!ctx.taskBridge) {
      return { isQueued: false };
    }

    return ctx.taskBridge.getExecutionStatus(input.id);
  }),

  /**
   * Cancel a running task
   */
  cancel: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.taskBridge) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Task execution is not configured",
      });
    }

    const result = ctx.taskBridge.cancelTask(input.id);
    if (!result.success) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: result.error || "Failed to cancel task",
      });
    }

    return {
      success: true,
      task: ctx.taskRepository.findById(input.id),
    };
  }),

  /**
   * Update an existing task
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        status: z.string().optional(),
        priority: z.number().int().min(1).max(5).optional(),
        blockedBy: z.string().nullable().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, ...updates } = input;
      const task = ctx.taskRepository.update(id, updates);
      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Task with id '${id}' not found`,
        });
      }
      return task;
    }),

  /**
   * Close a task
   */
  close: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const task = ctx.taskRepository.close(input.id);
    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task with id '${input.id}' not found`,
      });
    }
    return task;
  }),

  /**
   * Archive a task
   */
  archive: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const task = ctx.taskRepository.archive(input.id);
    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task with id '${input.id}' not found`,
      });
    }
    return task;
  }),

  /**
   * Unarchive a task
   */
  unarchive: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const task = ctx.taskRepository.unarchive(input.id);
    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task with id '${input.id}' not found`,
      });
    }
    return task;
  }),

  /**
   * Delete a task
   *
   * Security: Only allows deletion of tasks in terminal states (failed, closed)
   * to prevent accidental data loss from running or pending tasks.
   */
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    // First verify the task exists and check its state
    const task = ctx.taskRepository.findById(input.id);
    if (!task) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Task with id '${input.id}' not found`,
      });
    }

    // Only allow deletion of tasks in terminal states
    const deletableStates = ["failed", "closed"];
    if (!deletableStates.includes(task.status)) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Cannot delete task in '${task.status}' state. Only failed or closed tasks can be deleted.`,
      });
    }

    const deleted = ctx.taskRepository.delete(input.id);
    if (!deleted) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to delete task '${input.id}'`,
      });
    }
    return { success: true };
  }),

  /**
   * Delete all tasks and task logs.
   */
  clearAll: publicProcedure.mutation(({ ctx }) => {
    const deletedLogs = ctx.taskLogRepository.deleteAll();
    const deletedTasks = ctx.taskRepository.deleteAll();
    return { success: true, deletedTasks, deletedLogs };
  }),

  /**
   * Get file changes for a task (P5-5: Code Review)
   * Returns the array of file changes with their current approval status.
   */
  getFileChanges: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      const fileChanges = ctx.taskRepository.getFileChanges(input.id);
      return fileChanges ?? [];
    }),

  /**
   * Get file changes statistics for a task (P5-5: Code Review)
   * Returns summary statistics about file changes and approval status.
   */
  getFileChangesStats: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      const stats = ctx.taskRepository.getFileChangesStats(input.id);
      if (!stats) {
        return {
          filesChanged: 0,
          totalAdditions: 0,
          totalDeletions: 0,
          pendingApproval: 0,
          approved: 0,
          rejected: 0,
        };
      }
      return stats;
    }),

  /**
   * Update approval status for a specific file change (P5-5: Code Review)
   * Allows approving or rejecting individual file changes.
   */
  updateFileChangeApproval: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        filePath: z.string(),
        approvalStatus: z.enum(["approved", "rejected"]),
      })
    )
    .mutation(({ ctx, input }) => {
      const task = ctx.taskRepository.updateFileChangeApproval(
        input.taskId,
        input.filePath,
        input.approvalStatus
      );

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Task with id '${input.taskId}' not found or has no file changes`,
        });
      }

      return { success: true, task };
    }),

  /**
   * Set file changes for a task (P5-5: Code Review)
   * Used by the backend to capture file changes after task completion.
   */
  setFileChanges: publicProcedure
    .input(
      z.object({
        taskId: z.string(),
        fileChanges: z.array(
          z.object({
            path: z.string(),
            status: z.enum(["added", "modified", "deleted", "renamed"]),
            additions: z.number().int().min(0),
            deletions: z.number().int().min(0),
            diff: z.string().optional(),
            oldPath: z.string().optional(),
            approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
          })
        ),
      })
    )
    .mutation(({ ctx, input }) => {
      const task = ctx.taskRepository.setFileChanges(input.taskId, input.fileChanges);

      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Task with id '${input.taskId}' not found`,
        });
      }

      return { success: true, task };
    }),
});

/**
 * Hat router - operations for managing hats (operational roles)
 */
export const hatRouter = router({
  /**
   * List all hat definitions from settings
   */
  list: publicProcedure.query(({ ctx }) => {
    const definitions = ctx.settingsService.getHatDefinitions();
    const activeHat = ctx.settingsService.getActiveHat();

    // Convert map to array with active status
    return Object.entries(definitions).map(([key, hat]) => ({
      key,
      ...hat,
      isActive: key === activeHat,
    }));
  }),

  /**
   * Get the currently active hat
   */
  getActive: publicProcedure.query(({ ctx }) => {
    const activeKey = ctx.settingsService.getActiveHat();
    const definition = ctx.settingsService.getActiveHatDefinition();

    return {
      key: activeKey,
      definition: definition ?? null,
    };
  }),

  /**
   * Get a specific hat by key
   */
  get: publicProcedure.input(z.object({ key: z.string() })).query(({ ctx, input }) => {
    const hat = ctx.settingsService.getHat(input.key);
    if (!hat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Hat '${input.key}' not found`,
      });
    }
    const activeKey = ctx.settingsService.getActiveHat();
    return {
      key: input.key,
      ...hat,
      isActive: input.key === activeKey,
    };
  }),

  /**
   * Set the active hat
   */
  setActive: publicProcedure.input(z.object({ key: z.string() })).mutation(({ ctx, input }) => {
    const hat = ctx.settingsService.getHat(input.key);
    if (!hat) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Hat '${input.key}' not found`,
      });
    }
    ctx.settingsService.setActiveHat(input.key);
    return { success: true, activeHat: input.key };
  }),

  /**
   * Save (create or update) a hat
   */
  save: publicProcedure
    .input(
      z.object({
        key: z.string().min(1),
        name: z.string().min(1),
        description: z.string(),
        triggersOn: z.array(z.string()),
        publishes: z.array(z.string()),
        instructions: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { key, ...definition } = input;
      ctx.settingsService.setHat(key, definition);
      return { success: true, key };
    }),

  /**
   * Delete a hat
   */
  delete: publicProcedure.input(z.object({ key: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.settingsService.deleteHat(input.key);
    if (!deleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Hat '${input.key}' not found`,
      });
    }
    return { success: true };
  }),
});

/**
 * Loops router - operations for managing ralph loops
 */
export const loopsRouter = router({
  /**
   * List all loops, optionally including terminal states
   */
  list: publicProcedure
    .input(
      z
        .object({
          includeTerminal: z.boolean().default(false).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      const loops = await ctx.loopsManager.listLoops();

      // Filter out terminal states unless requested
      const filteredLoops = !input?.includeTerminal
        ? loops.filter((loop) => !["merged", "discarded"].includes(loop.status))
        : loops;

      // Enrich worktree loops with merge button state
      const enrichedLoops = await Promise.all(
        filteredLoops.map(async (loop) => {
          // Only worktree loops (not in-place) need merge button state
          if (loop.location === "(in-place)") {
            return loop;
          }
          const mergeButtonState = await ctx.loopsManager!.getMergeButtonState(loop.id);
          return { ...loop, mergeButtonState };
        })
      );

      return enrichedLoops;
    }),

  /**
   * Get manager status (running state, interval, last processed time)
   */
  managerStatus: publicProcedure.query(({ ctx }) => {
    if (!ctx.loopsManager) {
      return { running: false, intervalMs: 0 };
    }
    return ctx.loopsManager.getStatus();
  }),

  /**
   * Process the merge queue
   */
  process: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.loopsManager) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopsManager is not configured",
      });
    }

    await ctx.loopsManager.processMergeQueue();
    return { success: true };
  }),

  /**
   * Prune stale loops from crashed processes
   */
  prune: publicProcedure.mutation(async ({ ctx }) => {
    if (!ctx.loopsManager) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopsManager is not configured",
      });
    }

    await ctx.loopsManager.pruneStale();
    return { success: true };
  }),

  /**
   * Retry a failed merge with optional user steering input.
   * Steering input provides guidance to the merge-ralph process
   * for resolving conflicts or making merge decisions.
   */
  retry: publicProcedure
    .input(z.object({ id: z.string(), steeringInput: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      await ctx.loopsManager.retryMerge(input.id, input.steeringInput);
      return { success: true };
    }),

  /**
   * Discard a stuck loop
   */
  discard: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      await ctx.loopsManager.discardLoop(input.id);
      return { success: true };
    }),

  /**
   * Stop a running loop
   */
  stop: publicProcedure
    .input(z.object({ id: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      await ctx.loopsManager.stopLoop(input.id, input.force);
      return { success: true };
    }),

  /**
   * Force merge a loop
   */
  merge: publicProcedure
    .input(z.object({ id: z.string(), force: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      await ctx.loopsManager.mergeLoop(input.id, input.force);
      return { success: true };
    }),

  /**
   * Trigger a merge task for a worktree loop.
   * Creates a new task with a predefined merge prompt and auto-executes it.
   * This implements the "Merge Loop as Task" UX pattern where merges are
   * visible as tasks in the task list with full execution tracking.
   */
  triggerMergeTask: publicProcedure
    .input(z.object({ loopId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      if (!ctx.taskBridge) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TaskBridge is not configured",
        });
      }

      // Get loop info to build the merge prompt
      const loops = await ctx.loopsManager.listLoops();
      const loop = loops.find((l) => l.id === input.loopId);

      if (!loop) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Loop '${input.loopId}' not found`,
        });
      }

      if (loop.location === "(in-place)") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot trigger merge for in-place loop (primary)",
        });
      }

      // Build the merge prompt with context about the worktree changes
      const mergePrompt = `Merge worktree loop '${input.loopId}' into main branch.

The worktree is located at: ${loop.location}
Original task: ${loop.prompt || "(no prompt recorded)"}

Instructions:
1. Review the commits in the worktree branch
2. Merge the changes into main branch
3. Resolve any conflicts if present
4. Delete the worktree after successful merge`;

      // Create the task with merge prompt stored in mergeLoopPrompt field
      const taskId = `merge-${input.loopId}-${Date.now()}`;
      const task = ctx.taskRepository.create({
        id: taskId,
        title: `Merge: ${loop.prompt?.slice(0, 50) || input.loopId}`,
        status: "open",
        priority: 1, // High priority for merges
        mergeLoopPrompt: mergePrompt,
      });

      // Auto-execute the task
      const result = ctx.taskBridge.enqueueTask(task);

      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error || "Failed to enqueue merge task",
        });
      }

      return {
        success: true,
        taskId: task.id,
        queuedTaskId: result.queuedTaskId,
      };
    }),

  /**
   * Get merge button state for a loop
   */
  mergeButtonState: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      if (!ctx.loopsManager) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopsManager is not configured",
        });
      }

      return ctx.loopsManager.getMergeButtonState(input.id);
    }),
});

/**
 * Zod schema for graph node position
 */
const nodePositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * Zod schema for hat node data
 */
const hatNodeDataSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  triggersOn: z.array(z.string()),
  publishes: z.array(z.string()),
  instructions: z.string().optional(),
});

/**
 * Zod schema for graph node
 */
const graphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: nodePositionSchema,
  data: hatNodeDataSchema,
});

/**
 * Zod schema for graph edge
 */
const graphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  label: z.string().optional(),
});

/**
 * Zod schema for viewport
 */
const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number(),
});

/**
 * Zod schema for complete graph data
 */
const graphDataSchema = z.object({
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  viewport: viewportSchema,
});

/**
 * Collection router - operations for managing hat collections (visual workflow builder)
 */
export const collectionRouter = router({
  /**
   * List all collections (metadata only, no graph data)
   */
  list: publicProcedure.query(({ ctx }) => {
    return ctx.collectionService.listCollections();
  }),

  /**
   * Get a single collection with full graph data
   */
  get: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const collection = ctx.collectionService.getCollection(input.id);
    if (!collection) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Collection with id '${input.id}' not found`,
      });
    }
    return collection;
  }),

  /**
   * Create a new collection
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        graph: graphDataSchema.optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return ctx.collectionService.createCollection(input);
    }),

  /**
   * Update an existing collection
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        graph: graphDataSchema.optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      const { id, ...updates } = input;
      const collection = ctx.collectionService.updateCollection(id, updates);
      if (!collection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Collection with id '${id}' not found`,
        });
      }
      return collection;
    }),

  /**
   * Delete a collection
   */
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    const deleted = ctx.collectionService.deleteCollection(input.id);
    if (!deleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Collection with id '${input.id}' not found`,
      });
    }
    return { success: true };
  }),

  /**
   * Export a collection to Ralph YAML preset format
   */
  exportYaml: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    const yaml = ctx.collectionService.exportToYaml(input.id);
    if (!yaml) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Collection with id '${input.id}' not found`,
      });
    }
    return { yaml };
  }),

  /**
   * Import a YAML preset as a new collection
   */
  importYaml: publicProcedure
    .input(
      z.object({
        yaml: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      try {
        return ctx.collectionService.importFromYaml(input.yaml, input.name, input.description);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Failed to import YAML: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }),
});

/**
 * Config router - operations for reading/writing ralph.yml configuration
 *
 * Security considerations:
 * - Config path is hardcoded to prevent path traversal
 * - YAML parsing is safe (no code execution)
 * - Input validation ensures valid YAML before writing
 */
// Path to configs directory relative to this file (4 levels up to repo root)
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const CONFIG_PATH = path.join(REPO_ROOT, "ralph.yml");

export const configRouter = router({
  /**
   * Get the current ralph.yml configuration
   * Returns both raw YAML string and parsed object
   */
  get: publicProcedure.query(() => {
    const configPath = CONFIG_PATH;

    if (!fs.existsSync(configPath)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Configuration file not found at ralph.yml",
      });
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    let parsed: Record<string, unknown> = {};

    try {
      parsed = YAML.parse(raw) as Record<string, unknown>;
    } catch (err) {
      console.warn("[Config] Failed to parse ralph.yml:", err);
    }

    return { raw, parsed };
  }),

  /**
   * Update the ralph.yml configuration
   * Validates YAML before writing to prevent corruption
   */
  update: publicProcedure
    .input(
      z.object({
        content: z.string(),
      })
    )
    .mutation(({ input }) => {
      const configPath = CONFIG_PATH;

      // Validate YAML syntax before writing
      try {
        YAML.parse(input.content);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid YAML syntax: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }

      // Ensure config directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(configPath, input.content, "utf-8");

      // Return the updated config
      const parsed = YAML.parse(input.content) as Record<string, unknown>;
      return { success: true, parsed };
    }),
});

/**
 * Preset type for the presets.list endpoint
 */
export interface Preset {
  id: string;
  name: string;
  source: "builtin" | "directory" | "collection";
  description?: string;
  path?: string;
}

/**
 * Read YAML presets from a directory
 * @param dir - Directory to scan for .yml files
 * @param source - Source type for the presets
 * @param includePath - Whether to include the file path in the preset
 */
export function readPresetsFromDir(
  dir: string,
  source: "builtin" | "directory",
  includePath: boolean
): Preset[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml"))
    .map((file) => {
      const name = path.basename(file, ".yml");
      const filePath = path.join(dir, file);
      let description = "";

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = YAML.parse(content) as Record<string, unknown>;
        if (parsed && typeof parsed.description === "string") {
          description = parsed.description;
        }
      } catch (err) {
        console.warn(`[Presets] Failed to parse preset file ${file}:`, err);
      }

      return {
        id: `${source}:${name}`,
        name,
        source,
        description,
        ...(includePath && { path: filePath }),
      };
    });
}

// Path to builtin presets - shared directory at repo root
const BUILTIN_PRESETS_DIR = path.resolve(__dirname, "../../../../presets");

export function getBuiltinPresets(): Preset[] {
  return readPresetsFromDir(BUILTIN_PRESETS_DIR, "builtin", false);
}

export function getDirectoryPresets(): Preset[] {
  const hatsDir = path.resolve(process.cwd(), ".ralph/hats");
  return readPresetsFromDir(hatsDir, "directory", true);
}

/**
 * Presets router - operations for listing available presets
 */
export const presetsRouter = router({
  /**
   * List all presets from all sources: builtin, directory, and collections
   */
  list: publicProcedure.query(({ ctx }) => {
    const builtinPresets = getBuiltinPresets();
    const directoryPresets = getDirectoryPresets();

    // Get collections from database and convert to presets
    const collections = ctx.collectionService.listCollections();
    const collectionPresets: Preset[] = collections.map((c) => ({
      id: c.id,
      name: c.name,
      source: "collection" as const,
      description: c.description ?? undefined,
    }));

    // Return in order: builtin, directory, collection
    return [...builtinPresets, ...directoryPresets, ...collectionPresets];
  }),
});

/**
 * Process router - operations for managing loop processes (24/7 Platform Daemon)
 * Provides API endpoints for the LoopSupervisor service.
 */
export const processRouter = router({
  /**
   * Get all loop processes being supervised
   */
  list: publicProcedure.query(({ ctx }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    return ctx.loopSupervisor.getAllProcesses();
  }),

  /**
   * Get a specific loop process
   */
  get: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    const process = ctx.loopSupervisor.getProcess(input.id);
    if (!process) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Loop process '${input.id}' not found`,
      });
    }
    return process;
  }),

  /**
   * Get health status for a loop
   */
  getHealth: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    const health = await ctx.loopSupervisor.getHealth(input.id);
    if (!health) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Loop process '${input.id}' not found`,
      });
    }
    return health;
  }),

  /**
   * Start a new loop process
   */
  start: publicProcedure
    .input(
      z.object({
        id: z.string(),
        config: z.object({
          maxIterations: z.number().optional(),
          prompt: z.string().optional(),
          backend: z.string().optional(),
          hatCollection: z.string().optional(),
          cwd: z.string().optional(),
          env: z.record(z.string(), z.string()).optional(),
          memoriesEnabled: z.boolean().optional(),
          tasksEnabled: z.boolean().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.loopSupervisor) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopSupervisor is not configured",
        });
      }
      const process = await ctx.loopSupervisor.spawnLoop(input.id, input.config ?? {});
      return { success: true, process };
    }),

  /**
   * Stop a running loop process
   */
  stop: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    await ctx.loopSupervisor.stopLoop(input.id, "manual");
    return { success: true };
  }),

  /**
   * Restart a loop process
   */
  restart: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    await ctx.loopSupervisor.restartLoop(input.id, "manual");
    return { success: true };
  }),

  /**
   * Get restart history for a loop
   */
  getRestartHistory: publicProcedure
    .input(z.object({ id: z.string(), limit: z.number().optional() }))
    .query(({ ctx, input }) => {
      if (!ctx.loopSupervisor) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "LoopSupervisor is not configured",
        });
      }
      return ctx.loopSupervisor.getRestartHistory(input.id, input.limit);
    }),

  /**
   * Get supervisor statistics
   */
  stats: publicProcedure.query(({ ctx }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    return ctx.loopSupervisor.getStats();
  }),

  /**
   * Reset circuit breaker for a loop
   */
  resetCircuitBreaker: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.loopSupervisor) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "LoopSupervisor is not configured",
      });
    }
    ctx.loopSupervisor.resetCircuitBreaker(input.id);
    return { success: true };
  }),
});

/**
 * Checkpoint router - operations for managing checkpoints (state persistence)
 * Provides API endpoints for crash recovery and state restoration.
 */
export const checkpointRouter = router({
  /**
   * Create a checkpoint for a loop
   */
  create: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
        type: z
          .enum(["interval", "pre_task", "post_task", "manual", "pre_restart"])
          .optional()
          .default("manual"),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const { id, checkpoint, meta } = await checkpointRepository.create(
        input.loopId,
        input.type as "interval" | "pre_task" | "post_task" | "manual" | "pre_restart",
        cwd
      );

      return {
        id,
        loopId: checkpoint.loopId,
        createdAt: checkpoint.createdAt,
        iteration: checkpoint.iteration,
        checkpointType: checkpoint.checkpointType,
        size: checkpoint.size,
        checksum: checkpoint.checksum,
        compressed: checkpoint.compressed,
      };
    }),

  /**
   * List checkpoints for a loop
   */
  list: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      return await checkpointRepository.list(input.loopId, cwd);
    }),

  /**
   * Get a specific checkpoint
   */
  get: publicProcedure
    .input(
      z.object({
        checkpointId: z.string(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      return await checkpointRepository.get(input.checkpointId, cwd);
    }),

  /**
   * Get the latest checkpoint for a loop
   */
  getLatest: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      return await checkpointRepository.getLatest(input.loopId, cwd);
    }),

  /**
   * Restore from a checkpoint
   */
  restore: publicProcedure
    .input(
      z.object({
        checkpointId: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      return await checkpointRepository.restore(input.checkpointId, cwd);
    }),

  /**
   * Delete a checkpoint
   */
  delete: publicProcedure
    .input(
      z.object({
        checkpointId: z.string(),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      await checkpointRepository.delete(input.checkpointId, cwd);
      return { success: true };
    }),

  /**
   * Get checkpoint statistics
   */
  stats: publicProcedure
    .input(
      z.object({
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      return await checkpointRepository.getStats(cwd);
    }),
});

/**
 * Teams router - operations for managing multi-agent collaboration teams (P4.5-1)
 * Provides API endpoints for AgentTeamsService.
 */
export const teamsRouter = router({
  /**
   * List all teams, optionally filtered by status
   */
  list: publicProcedure
    .input(
      z
        .object({
          status: z.enum(["idle", "running", "paused", "completed", "failed"]).optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      return ctx.agentTeamsService.listTeams(input);
    }),

  /**
   * Get a specific team by ID
   */
  get: publicProcedure.input(z.object({ id: z.string() })).query(({ ctx, input }) => {
    if (!ctx.agentTeamsService) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AgentTeamsService is not configured",
      });
    }
    const team = ctx.agentTeamsService.getTeam(input.id);
    if (!team) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Team with id '${input.id}' not found`,
      });
    }
    return team;
  }),

  /**
   * Create a new team
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        prompt: z.string().min(1),
        coordinatorHatId: z.string(),
        members: z.array(
          z.object({
            name: z.string().min(1),
            description: z.string(),
            hatId: z.string(),
          })
        ),
        contextSharing: z.enum(["full", "selective", "hierarchical"]).optional(),
        taskDistribution: z.enum(["parallel", "pipeline", "expert", "voting"]).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      return ctx.agentTeamsService.createTeam(input);
    }),

  /**
   * Update a team
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        taskDistribution: z.enum(["parallel", "pipeline", "expert", "voting"]).optional(),
        contextSharing: z.enum(["full", "selective", "hierarchical"]).optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      const { id, ...updates } = input;
      const team = ctx.agentTeamsService.updateTeam(id, updates);
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Team with id '${id}' not found`,
        });
      }
      return team;
    }),

  /**
   * Start a team
   */
  start: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.agentTeamsService) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AgentTeamsService is not configured",
      });
    }
    const team = ctx.agentTeamsService.startTeam(input.id);
    if (!team) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Team with id '${input.id}' not found or cannot be started`,
      });
    }
    return team;
  }),

  /**
   * Pause a running team
   */
  pause: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.agentTeamsService) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AgentTeamsService is not configured",
      });
    }
    const team = ctx.agentTeamsService.pauseTeam(input.id);
    if (!team) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Team with id '${input.id}' not found or cannot be paused`,
      });
    }
    return team;
  }),

  /**
   * Stop a team
   */
  stop: publicProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      const team = ctx.agentTeamsService.stopTeam(input.id, input.reason);
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Team with id '${input.id}' not found or cannot be stopped`,
        });
      }
      return team;
    }),

  /**
   * Delete a team
   */
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => {
    if (!ctx.agentTeamsService) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AgentTeamsService is not configured",
      });
    }
    const deleted = ctx.agentTeamsService.deleteTeam(input.id);
    if (!deleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Team with id '${input.id}' not found`,
      });
    }
    return { success: true };
  }),

  /**
   * Update agent status
   */
  updateAgentStatus: publicProcedure
    .input(
      z.object({
        teamId: z.string(),
        agentId: z.string(),
        status: z.enum(["idle", "running", "waiting", "completed", "failed"]),
        message: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      const team = ctx.agentTeamsService.updateAgentStatus(
        input.teamId,
        input.agentId,
        input.status,
        input.message
      );
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Team with id '${input.teamId}' not found or agent '${input.agentId}' not found`,
        });
      }
      return team;
    }),

  /**
   * Update shared context token count
   */
  updateSharedContext: publicProcedure
    .input(
      z.object({
        teamId: z.string(),
        tokenCount: z.number().int().min(0),
      })
    )
    .mutation(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      const team = ctx.agentTeamsService.updateSharedContext(input.teamId, input.tokenCount);
      if (!team) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Team with id '${input.teamId}' not found`,
        });
      }
      return team;
    }),

  /**
   * Get activity logs for a team
   */
  getActivityLogs: publicProcedure
    .input(
      z.object({
        teamId: z.string(),
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .query(({ ctx, input }) => {
      if (!ctx.agentTeamsService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AgentTeamsService is not configured",
        });
      }
      return ctx.agentTeamsService.getActivityLogs(input.teamId, input.limit);
    }),

  /**
   * Get team statistics
   */
  stats: publicProcedure.query(({ ctx }) => {
    if (!ctx.agentTeamsService) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AgentTeamsService is not configured",
      });
    }
    return ctx.agentTeamsService.getStats();
  }),
});

/**
 * Monitoring router - metrics and alerts (P4-3.5)
 */
export const monitoringRouter = router({
  /**
   * Get all registered metrics
   */
  getMetrics: publicProcedure.query(({ ctx }) => {
    if (!ctx.metricStore) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "MetricStore is not configured",
      });
    }
    return ctx.metricStore.getSnapshot().metrics;
  }),

  /**
   * Get a metrics snapshot (all metrics at current time)
   */
  getSnapshot: publicProcedure.query(({ ctx }) => {
    if (!ctx.metricStore) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "MetricStore is not configured",
      });
    }
    return ctx.metricStore.getSnapshot();
  }),

  /**
   * Get metrics for specific names
   */
  getMetricsByNames: publicProcedure
    .input(z.object({ names: z.array(z.string()) }))
    .query(({ ctx, input }) => {
      if (!ctx.metricStore) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "MetricStore is not configured",
        });
      }
      return ctx.metricStore.getSnapshot().metrics.filter(m =>
        input.names.includes(m.name)
      );
    }),

  /**
   * Get Prometheus-formatted metrics
   */
  getPrometheusMetrics: publicProcedure.query(({ ctx }) => {
    if (!ctx.metricStore) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "MetricStore is not configured",
      });
    }
    return ctx.metricStore.exportPrometheus();
  }),

  /**
   * Get all alert rules
   */
  getAlertRules: publicProcedure.query(({ ctx }) => {
    if (!ctx.alertEngine) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AlertEngine is not configured",
      });
    }
    return ctx.alertEngine.getRules();
  }),

  /**
   * Get a specific alert rule
   */
  getAlertRule: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      if (!ctx.alertEngine) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AlertEngine is not configured",
        });
      }
      const rule = ctx.alertEngine.getRule(input.id);
      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Alert rule with id '${input.id}' not found`,
        });
      }
      return rule;
    }),

  /**
   * Get all active alerts
   */
  getActiveAlerts: publicProcedure.query(({ ctx }) => {
    if (!ctx.alertEngine) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AlertEngine is not configured",
      });
    }
    return ctx.alertEngine.getAlerts();
  }),

  /**
   * Get alerts for a specific rule
   */
  getAlertsByRule: publicProcedure
    .input(z.object({ ruleId: z.string() }))
    .query(({ ctx, input }) => {
      if (!ctx.alertEngine) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AlertEngine is not configured",
        });
      }
      return ctx.alertEngine.getAlerts({ ruleId: input.ruleId });
    }),

  /**
   * Get alert history
   */
  getAlertHistory: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).optional() }))
    .query(({ ctx, input }) => {
      if (!ctx.alertEngine) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AlertEngine is not configured",
        });
      }
      return ctx.alertEngine.getAlertHistory(undefined, input.limit);
    }),
});

/**
 * Healing router - operations for self-healing mechanism (P4-4)
 * Provides API endpoints for three-layer self-healing system.
 */
export const healingRouter = router({
  /**
   * Get healing events for a loop
   */
  getEvents: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../repositories/HealingRepository");
      return await healingMod.healingRepository.getEvents(input.loopId, cwd, input.limit);
    }),

  /**
   * Get the healing policy
   */
  getPolicy: publicProcedure
    .input(
      z.object({
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../repositories/HealingRepository");
      return await healingMod.healingRepository.getPolicy(cwd);
    }),

  /**
   * Update the healing policy
   */
  updatePolicy: publicProcedure
    .input(
      z.object({
        policy: z.object({
          maxAgentRetries: z.number().int().min(1).max(10).optional(),
          agentRetryDelay: z.string().optional(),
          maxPlatformRestarts: z.number().int().min(1).max(20).optional(),
          platformRestartWindow: z.string().optional(),
          backends: z.array(z.string()).optional(),
          circuitBreakerThreshold: z.number().int().min(1).max(50).optional(),
          circuitBreakerCooldown: z.string().optional(),
          escalationChannels: z.array(z.string()).optional(),
        }),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../repositories/HealingRepository");
      await healingMod.healingRepository.updatePolicy(input.policy, cwd);
      return { success: true };
    }),

  /**
   * Get known fix patterns
   */
  getKnownFixes: publicProcedure
    .input(
      z.object({
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../repositories/HealingRepository");
      const fixes = await healingMod.healingRepository.getKnownFixes(cwd);
      // Convert RegExp to string for serialization
      return fixes.map((fix) => ({
        ...fix,
        pattern: fix.pattern.source,
      }));
    }),

  /**
   * Add a known fix pattern
   */
  addKnownFix: publicProcedure
    .input(
      z.object({
        id: z.string().min(1),
        pattern: z.string().min(1),
        action: z.discriminatedUnion("type", [
          z.object({ type: z.literal("restart") }),
          z.object({ type: z.literal("switch_backend"), backend: z.string() }),
          z.object({ type: z.literal("inject_context"), content: z.string() }),
          z.object({ type: z.literal("skip_step") }),
          z.object({ type: z.literal("request_human") }),
        ]),
        description: z.string().min(1),
        successRate: z.number().min(0).max(1),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../repositories/HealingRepository");
      await healingMod.healingRepository.addKnownFix(
        {
          id: input.id,
          pattern: new RegExp(input.pattern, "i"),
          action: input.action,
          description: input.description,
          successRate: input.successRate,
        },
        cwd
      );
      return { success: true };
    }),

  /**
   * Test a fix pattern against an error message
   */
  testFix: publicProcedure
    .input(
      z.object({
        fixId: z.string(),
        error: z.string(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../repositories/HealingRepository");
      const fixes = await healingMod.healingRepository.getKnownFixes(cwd);
      const fix = fixes.find((f) => f.id === input.fixId);
      if (!fix) {
        return { matches: false, error: "Fix not found" };
      }
      const matches = fix.pattern.test(input.error);
      return { matches, fix: { ...fix, pattern: fix.pattern.source } };
    }),

  /**
   * Manually trigger a healing action
   */
  triggerHealing: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
        action: z.object({
          type: z.string(),
          params: z.record(z.string(), z.any()),
          reason: z.string(),
        }),
        cwd: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const healingMod = await import("../services/HealingService");
      return await healingMod.healingService.triggerHealing(input.loopId, input.action, cwd);
    }),

  /**
   * Get circuit breaker status for a loop
   */
  getCircuitBreakerStatus: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const healingMod = await import("../services/HealingService");
      return healingMod.healingService.getCircuitBreakerStatus(input.loopId);
    }),

  /**
   * Reset circuit breaker for a loop
   */
  resetCircuitBreaker: publicProcedure
    .input(
      z.object({
        loopId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const healingMod = await import("../services/HealingService");
      healingMod.healingService.resetCircuitBreaker(input.loopId);
      return { success: true };
    }),
});

/**
 * Skills router - operations for skills system (P4.5-2)
 * Provides API endpoints for skill management and marketplace.
 */
export const skillsRouter = router({
  /**
   * List all available skills
   */
  list: publicProcedure
    .input(
      z.object({
        cwd: z.string().optional(),
        source: z.enum(["all", "built_in", "user_defined", "marketplace"]).optional(),
        tags: z.array(z.string()).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const cwd = input?.cwd || process.cwd();
      const skillMod = await import("../services/SkillService");
      let skills = await skillMod.skillService.listSkills(cwd);

      // Filter by source
      if (input?.source && input.source !== "all") {
        skills = skills.filter((s) => s.source === input.source);
      }

      // Filter by tags
      if (input?.tags && input.tags.length > 0) {
        skills = skills.filter((s) =>
          input.tags!.some((tag) => s.tags.includes(tag))
        );
      }

      return skills;
    }),

  /**
   * Get a specific skill by name
   */
  get: publicProcedure
    .input(
      z.object({
        name: z.string(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const skillMod = await import("../services/SkillService");
      const skill = await skillMod.skillService.getSkill(input.name, cwd);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill "${input.name}" not found`,
        });
      }

      return skill;
    }),

  /**
   * Get skill content
   */
  getContent: publicProcedure
    .input(
      z.object({
        name: z.string(),
        cwd: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const cwd = input.cwd || process.cwd();
      const skillMod = await import("../services/SkillService");
      const content = await skillMod.skillService.getSkillContent(input.name, cwd);

      if (!content) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill "${input.name}" not found`,
        });
      }

      return { content };
    }),

  /**
   * Get skill categories
   */
  getCategories: publicProcedure
    .input(
      z.object({
        cwd: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const cwd = input?.cwd || process.cwd();
      const skillMod = await import("../services/SkillService");
      return await skillMod.skillService.getCategories(cwd);
    }),
});

/**
 * Main app router combining all sub-routers
 */
export const appRouter = router({
  project: projectRouter,
  worktree: worktreeRouter,
  task: taskRouter,
  hat: hatRouter,
  loops: loopsRouter,
  collection: collectionRouter,
  presets: presetsRouter,
  config: configRouter,
  process: processRouter,
  checkpoint: checkpointRouter,
  teams: teamsRouter,
  monitoring: monitoringRouter,
  healing: healingRouter,
  skills: skillsRouter,
  planning: router({
    /**
     * List all planning sessions.
     */
    list: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.planningService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "PlanningService is not configured",
        });
      }
      return ctx.planningService.listSessions();
    }),

    /**
     * Get a specific planning session with conversation history.
     */
    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.planningService) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "PlanningService is not configured",
          });
        }
        return ctx.planningService.getSession(input.id);
      }),

    /**
     * Start a new planning session.
     */
    start: publicProcedure
      .input(z.object({ prompt: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.planningService) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "PlanningService is not configured",
          });
        }
        return ctx.planningService.startSession(input.prompt);
      }),

    /**
     * Submit a user response to a planning session.
     */
    respond: publicProcedure
      .input(
        z.object({
          sessionId: z.string(),
          promptId: z.string(),
          response: z.string(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (!ctx.planningService) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "PlanningService is not configured",
          });
        }

        await ctx.planningService.submitResponse(
          input.sessionId,
          input.promptId,
          input.response
        );
        return { success: true };
      }),

    /**
     * Resume a paused planning session.
     */
    resume: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.planningService) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "PlanningService is not configured",
          });
        }

        await ctx.planningService.resumeSession(input.id);
        return { success: true };
      }),

    /**
     * Delete a planning session.
     */
    delete: publicProcedure
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        if (!ctx.planningService) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "PlanningService is not configured",
          });
        }

        await ctx.planningService.deleteSession(input.id);
        return { success: true };
      }),

    /**
     * Get artifact content for a planning session.
     */
    getArtifact: publicProcedure
      .input(z.object({ sessionId: z.string(), filename: z.string() }))
      .query(async ({ input, ctx }) => {
        if (!ctx.planningService) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "PlanningService is not configured",
          });
        }

        try {
          return await ctx.planningService.getArtifact(
            input.sessionId,
            input.filename
          );
        } catch (error) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              error instanceof Error ? error.message : "Artifact not found",
          });
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
