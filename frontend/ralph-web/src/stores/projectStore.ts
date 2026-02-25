/**
 * Project Store
 *
 * Zustand store for managing active project state.
 * Stores the active project ID in localStorage for persistence.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Project } from "../types/project";

/** Storage key for project persistence */
const PROJECT_STORAGE_KEY = "ralph-active-project";

interface ProjectStore {
  /** Currently active project */
  activeProject: Project | null;

  /** Whether projects are loaded */
  isLoaded: boolean;

  /** Set the active project */
  setActiveProject: (project: Project | null) => void;

  /** Mark as loaded */
  setLoaded: (loaded: boolean) => void;
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      activeProject: null,
      isLoaded: false,

      setActiveProject: (project) => {
        set({ activeProject: project });
      },

      setLoaded: (loaded) => {
        set({ isLoaded: loaded });
      },
    }),
    {
      name: PROJECT_STORAGE_KEY,
      partialize: (state) => ({ activeProject: state.activeProject }),
    }
  )
);
