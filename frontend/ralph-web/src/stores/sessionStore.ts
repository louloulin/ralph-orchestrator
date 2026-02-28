/**
 * Session Store
 *
 * Zustand store for managing active session state.
 * Stores the active session ID in localStorage for persistence.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "../types/session";

/** Storage key for session persistence */
const SESSION_STORAGE_KEY = "ralph-active-session";

interface SessionStore {
  /** Currently active session */
  activeSession: Session | null;

  /** Whether sessions are loaded */
  isLoaded: boolean;

  /** Set the active session */
  setActiveSession: (session: Session | null) => void;

  /** Mark as loaded */
  setLoaded: (loaded: boolean) => void;

  /** Clear active session */
  clearActiveSession: () => void;
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      activeSession: null,
      isLoaded: false,

      setActiveSession: (session) => {
        set({ activeSession: session });
      },

      setLoaded: (loaded) => {
        set({ isLoaded: loaded });
      },

      clearActiveSession: () => {
        set({ activeSession: null });
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      partialize: (state) => ({ activeSession: state.activeSession }),
    }
  )
);
