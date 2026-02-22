/**
 * Diff Store
 *
 * Zustand store for managing diff sessions that display code changes
 * in real-time during task execution.
 *
 * @see .ralph/specs/web-dashboard/diff-viewer.spec.md
 */

import { create } from "zustand";
import type {
  FileDiff,
  DiffSession,
  DiffTotalStats,
  DiffAction,
} from "@/types/diff";

/** Stable empty array to avoid creating new references in selectors */
const EMPTY_FILES: FileDiff[] = [];

/** Stable empty session object */
const EMPTY_SESSION: DiffSession | undefined = undefined;

/** Calculate total stats from files */
function calculateTotalStats(files: FileDiff[]): DiffTotalStats {
  return {
    filesChanged: files.length,
    additions: files.reduce((sum, f) => sum + f.stats.additions, 0),
    deletions: files.reduce((sum, f) => sum + f.stats.deletions, 0),
  };
}

interface DiffStore {
  /**
   * Map of taskId → DiffSession
   * Using a plain object for Zustand compatibility
   */
  sessions: Record<string, DiffSession>;

  /**
   * Update a diff for a task session.
   * Creates a new session if one doesn't exist.
   */
  updateDiff: (taskId: string, file: FileDiff, action: DiffAction) => void;

  /**
   * Add multiple files at once (for batch operations).
   */
  addFiles: (taskId: string, files: FileDiff[]) => void;

  /**
   * Remove a file from a session.
   */
  removeFile: (taskId: string, fileId: string) => void;

  /**
   * Clear a specific task's diff session.
   */
  clearSession: (taskId: string) => void;

  /**
   * Get a diff session for a task.
   */
  getSession: (taskId: string) => DiffSession | undefined;

  /**
   * Get all files for a task. Returns empty array if no session exists.
   */
  getFiles: (taskId: string) => FileDiff[];

  /**
   * Get a specific file from a session.
   */
  getFile: (taskId: string, fileId: string) => FileDiff | undefined;

  /**
   * Check if a session exists for a task.
   */
  hasSession: (taskId: string) => boolean;

  /**
   * Get the count of files for a task.
   */
  getFileCount: (taskId: string) => number;

  /**
   * Get total stats for a task.
   */
  getTotalStats: (taskId: string) => DiffTotalStats;
}

/**
 * Diff session store - manages code change display state.
 *
 * Usage:
 *   const session = useDiffStore(state => state.getSession(taskId));
 *   const updateDiff = useDiffStore(state => state.updateDiff);
 */
export const useDiffStore = create<DiffStore>()((set, get) => ({
  sessions: {},

  updateDiff: (taskId, file, action) => {
    set((state) => {
      const existing = state.sessions[taskId];

      if (action === "remove") {
        if (!existing) return state;

        const newFiles = existing.files.filter((f) => f.id !== file.id);
        if (newFiles.length === existing.files.length) return state;

        return {
          sessions: {
            ...state.sessions,
            [taskId]: {
              ...existing,
              files: newFiles,
              totalStats: calculateTotalStats(newFiles),
              updatedAt: new Date(),
            },
          },
        };
      }

      // Add or update
      const files = existing?.files ?? [];
      const existingIndex = files.findIndex((f) => f.id === file.id);

      let newFiles: FileDiff[];
      if (existingIndex >= 0) {
        newFiles = [...files];
        newFiles[existingIndex] = file;
      } else {
        newFiles = [...files, file];
      }

      const session: DiffSession = existing
        ? {
            ...existing,
            files: newFiles,
            totalStats: calculateTotalStats(newFiles),
            updatedAt: new Date(),
          }
        : {
            taskId,
            files: newFiles,
            totalStats: calculateTotalStats(newFiles),
            updatedAt: new Date(),
          };

      return {
        sessions: {
          ...state.sessions,
          [taskId]: session,
        },
      };
    });
  },

  addFiles: (taskId, files) => {
    if (files.length === 0) return;

    set((state) => {
      const existing = state.sessions[taskId];
      const existingFiles = existing?.files ?? [];

      // Merge files, updating existing ones
      const fileMap = new Map(existingFiles.map((f) => [f.id, f]));
      for (const file of files) {
        fileMap.set(file.id, file);
      }

      const newFiles = Array.from(fileMap.values());

      const session: DiffSession = existing
        ? {
            ...existing,
            files: newFiles,
            totalStats: calculateTotalStats(newFiles),
            updatedAt: new Date(),
          }
        : {
            taskId,
            files: newFiles,
            totalStats: calculateTotalStats(newFiles),
            updatedAt: new Date(),
          };

      return {
        sessions: {
          ...state.sessions,
          [taskId]: session,
        },
      };
    });
  },

  removeFile: (taskId, fileId) => {
    set((state) => {
      const existing = state.sessions[taskId];
      if (!existing) return state;

      const newFiles = existing.files.filter((f) => f.id !== fileId);
      if (newFiles.length === existing.files.length) return state;

      return {
        sessions: {
          ...state.sessions,
          [taskId]: {
            ...existing,
            files: newFiles,
            totalStats: calculateTotalStats(newFiles),
            updatedAt: new Date(),
          },
        },
      };
    });
  },

  clearSession: (taskId) => {
    set((state) => {
      const { [taskId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
  },

  getSession: (taskId) => {
    return get().sessions[taskId] ?? EMPTY_SESSION;
  },

  getFiles: (taskId) => {
    return get().sessions[taskId]?.files ?? EMPTY_FILES;
  },

  getFile: (taskId, fileId) => {
    const session = get().sessions[taskId];
    if (!session) return undefined;
    return session.files.find((f) => f.id === fileId);
  },

  hasSession: (taskId) => {
    const session = get().sessions[taskId];
    return session !== undefined && session.files.length > 0;
  },

  getFileCount: (taskId) => {
    return get().sessions[taskId]?.files.length ?? 0;
  },

  getTotalStats: (taskId) => {
    const session = get().sessions[taskId];
    return session?.totalStats ?? { filesChanged: 0, additions: 0, deletions: 0 };
  },
}));
