/**
 * Thinking Store
 *
 * Zustand store for managing thinking sessions that display AI agent reasoning
 * in real-time. Provides transparency into the agent's decision-making process.
 *
 * @see .ralph/specs/web-dashboard/thinking-panel.spec.md
 */

import { create } from "zustand";
import type {
  ThinkingStep,
  ThinkingSession,
  ThinkingStepType,
} from "@/types/thinking";

/** Stable empty array to avoid creating new references in selectors */
const EMPTY_STEPS: ThinkingStep[] = [];

/** Stable empty session object */
const EMPTY_SESSION: ThinkingSession | undefined = undefined;

interface ThinkingStore {
  /**
   * Map of taskId → ThinkingSession
   * Using a plain object for Zustand compatibility
   */
  sessions: Record<string, ThinkingSession>;

  /**
   * Add a thinking step to a task's session.
   * Creates a new session if one doesn't exist.
   */
  addStep: (taskId: string, step: ThinkingStep) => void;

  /**
   * Add multiple steps at once (for batch operations).
   * More efficient than calling addStep repeatedly.
   */
  addSteps: (taskId: string, steps: ThinkingStep[]) => void;

  /**
   * Mark a session as complete by setting the endTime.
   */
  completeSession: (taskId: string, summary?: string) => void;

  /**
   * Clear a specific task's thinking session.
   */
  clearSession: (taskId: string) => void;

  /**
   * Get a thinking session for a task.
   */
  getSession: (taskId: string) => ThinkingSession | undefined;

  /**
   * Get all steps for a task. Returns empty array if no session exists.
   */
  getSteps: (taskId: string) => ThinkingStep[];

  /**
   * Check if a session exists for a task.
   */
  hasSession: (taskId: string) => boolean;

  /**
   * Get the count of steps for a task.
   */
  getStepCount: (taskId: string) => number;

  /**
   * Get steps filtered by type.
   */
  getStepsByType: (taskId: string, types: ThinkingStepType[]) => ThinkingStep[];

  /**
   * Search steps by content.
   */
  searchSteps: (taskId: string, query: string) => ThinkingStep[];

  /**
   * Get session duration in milliseconds.
   */
  getSessionDuration: (taskId: string) => number | null;

  /**
   * Get total token count for a session.
   */
  getTotalTokens: (taskId: string) => number;
}

/**
 * Thinking session store - manages AI reasoning display state.
 *
 * Usage:
 *   const session = useThinkingStore(state => state.getSession(taskId));
 *   const addStep = useThinkingStore(state => state.addStep);
 */
export const useThinkingStore = create<ThinkingStore>()((set, get) => ({
  sessions: {},

  addStep: (taskId, step) => {
    set((state) => {
      const existing = state.sessions[taskId];
      const session: ThinkingSession = existing
        ? {
            ...existing,
            steps: [...existing.steps, step],
          }
        : {
            taskId,
            steps: [step],
            startTime: step.timestamp,
          };

      return {
        sessions: {
          ...state.sessions,
          [taskId]: session,
        },
      };
    });
  },

  addSteps: (taskId, steps) => {
    if (steps.length === 0) return;

    set((state) => {
      const existing = state.sessions[taskId];
      const sortedSteps = [...steps].sort(
        (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
      );

      const session: ThinkingSession = existing
        ? {
            ...existing,
            steps: [...existing.steps, ...sortedSteps],
          }
        : {
            taskId,
            steps: sortedSteps,
            startTime: sortedSteps[0].timestamp,
          };

      return {
        sessions: {
          ...state.sessions,
          [taskId]: session,
        },
      };
    });
  },

  completeSession: (taskId, summary) => {
    set((state) => {
      const existing = state.sessions[taskId];
      if (!existing) return state;

      return {
        sessions: {
          ...state.sessions,
          [taskId]: {
            ...existing,
            endTime: new Date(),
            summary,
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

  getSteps: (taskId) => {
    return get().sessions[taskId]?.steps ?? EMPTY_STEPS;
  },

  hasSession: (taskId) => {
    const session = get().sessions[taskId];
    return session !== undefined && session.steps.length > 0;
  },

  getStepCount: (taskId) => {
    return get().sessions[taskId]?.steps.length ?? 0;
  },

  getStepsByType: (taskId, types) => {
    const session = get().sessions[taskId];
    if (!session) return EMPTY_STEPS;

    return session.steps.filter((step) => types.includes(step.type));
  },

  searchSteps: (taskId, query) => {
    const session = get().sessions[taskId];
    if (!session || !query.trim()) return session?.steps ?? EMPTY_STEPS;

    const lowerQuery = query.toLowerCase();
    return session.steps.filter((step) =>
      step.content.toLowerCase().includes(lowerQuery)
    );
  },

  getSessionDuration: (taskId) => {
    const session = get().sessions[taskId];
    if (!session) return null;

    const endTime = session.endTime ?? new Date();
    return endTime.getTime() - session.startTime.getTime();
  },

  getTotalTokens: (taskId) => {
    const session = get().sessions[taskId];
    if (!session) return 0;

    return session.steps.reduce(
      (total, step) => total + (step.metadata?.tokens ?? 0),
      0
    );
  },
}));
