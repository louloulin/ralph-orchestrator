/**
 * Command Palette Store
 *
 * Zustand store for persisting command palette state including:
 * - Recent command history (persisted to localStorage)
 * - User preferences
 *
 * Follows the pattern established in logStore.ts
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Command {
  id: string;
  label: string;
  icon: string;
  shortcut?: string;
  keywords?: string[];
}

interface CommandPaletteState {
  /**
   * Recently used commands, ordered by most recent first
   */
  recentCommands: Command[];

  /**
   * Maximum number of recent commands to keep
   */
  maxRecent: number;

  /**
   * Add a command to recent history (moves to top if exists)
   */
  addToHistory: (command: Command) => void;

  /**
   * Clear all recent command history
   */
  clearHistory: () => void;

  /**
   * Remove a specific command from history
   */
  removeFromHistory: (commandId: string) => void;
}

/**
 * Command palette store - persists recent commands to localStorage.
 *
 * Usage:
 *   const recentCommands = useCommandPaletteStore(state => state.recentCommands);
 *   const addToHistory = useCommandPaletteStore(state => state.addToHistory);
 */
export const useCommandPaletteStore = create<CommandPaletteState>()(
  persist(
    (set) => ({
      recentCommands: [],
      maxRecent: 5,

      addToHistory: (command) =>
        set((state) => {
          // Remove if already exists (to move to top)
          const filtered = state.recentCommands.filter((c) => c.id !== command.id);
          // Add to beginning, limit to maxRecent
          return {
            recentCommands: [command, ...filtered].slice(0, state.maxRecent),
          };
        }),

      clearHistory: () => set({ recentCommands: [] }),

      removeFromHistory: (commandId) =>
        set((state) => ({
          recentCommands: state.recentCommands.filter((c) => c.id !== commandId),
        })),
    }),
    {
      name: "ralph-command-palette",
    }
  )
);
