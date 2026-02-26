/**
 * Panel Store
 *
 * Zustand store for managing slide-out panel state.
 * Supports keyboard shortcuts, click-outside-to-close, and panel history.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Available panel types */
export type PanelId = "tasks" | "plan" | "monitor" | "teams" | "projects" | null;

/** Panel entry for history tracking */
interface PanelHistoryEntry {
  panelId: PanelId;
  timestamp: number;
}

interface PanelState {
  // Active panel
  activePanel: PanelId;

  // Panel history for back navigation (max 5 entries)
  history: PanelHistoryEntry[];

  // Panel props/data for panel content
  panelData: Partial<Record<PanelId, unknown>>;

  // Actions
  openPanel: (panelId: PanelId, data?: unknown) => void;
  closePanel: () => void;
  togglePanel: (panelId: PanelId) => void;
  setPanelData: <T extends PanelId>(panelId: T, data: unknown) => void;
  goBack: () => void;
}

/**
 * Panel store with history and state management.
 * Persisted to localStorage under 'ralph-panels' key.
 */
export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      // No panel open by default
      activePanel: null,
      history: [],
      panelData: {},

      openPanel: (panelId, data) =>
        set((state) => {
          // Don't add to history if reopening the same panel
          const newHistory =
            state.activePanel === panelId
              ? state.history
              : [...state.history.slice(-4), { panelId, timestamp: Date.now() }];

          return {
            activePanel: panelId,
            history: newHistory,
            panelData: data !== undefined ? { ...state.panelData, [panelId]: data } : state.panelData,
          };
        }),

      closePanel: () =>
        set(() => ({
          activePanel: null,
        })),

      togglePanel: (panelId) =>
        set((state) => ({
          activePanel: state.activePanel === panelId ? null : panelId,
        })),

      setPanelData: (panelId, data) =>
        set((state) => ({
          panelData: { ...state.panelData, [panelId]: data },
        })),

      goBack: () =>
        set((state) => {
          if (state.history.length === 0) {
            return { activePanel: null };
          }
          // Pop the current panel from history
          const previousHistory = state.history.slice(0, -1);
          const previousPanel = previousHistory.length > 0
            ? previousHistory[previousHistory.length - 1].panelId
            : null;
          return {
            activePanel: previousPanel,
            history: previousHistory,
          };
        }),
    }),
    {
      name: "ralph-panels",
      // Partial persistence - persist activePanel but reset history on page load
      partialize: (state) => ({
        activePanel: state.activePanel,
        panelData: state.panelData,
      }),
    }
  )
);