/**
 * Loop Store - Zustand store for active loops state management
 *
 * Manages the state of Ralph loops displayed in the ActiveLoopsDock.
 * Provides real-time updates via tRPC and polling.
 */

import { create } from "zustand";
import { trpc } from "@/trpc";

export interface Loop {
  id: string;
  status: "running" | "completed" | "failed" | "merging" | "stuck" | "queued";
  location: string;
  pid?: number;
  prompt?: string;
  mergeButtonState?: {
    state: "active" | "blocked";
    reason?: string;
  };
}

interface LoopState {
  loops: Loop[];
  isLoading: boolean;
  error: string | null;
  setLoops: (loops: Loop[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  refresh: () => void;
}

/**
 * Loop store for managing active loops state
 */
export const useLoopStore = create<LoopState>((set) => ({
  loops: [],
  isLoading: false,
  error: null,

  setLoops: (loops) => set({ loops }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  refresh: () => {
    // Trigger a refresh - the component will re-query
    set({ isLoading: true });
    // The actual data fetch happens in the component via tRPC
  },
}));

/**
 * Hook to fetch and sync loops with tRPC
 * This should be called in the component that uses the dock
 */
export function useLoopsQuery() {
  const { setLoops, setLoading, setError } = useLoopStore();

  const { data, isLoading, error, refetch } = trpc.loops.list.useQuery(
    { includeTerminal: false },
    {
      refetchInterval: 5000, // Poll every 5 seconds for real-time updates
      onSuccess: (data) => {
        setLoops(data as Loop[]);
        setLoading(false);
        setError(null);
      },
      onError: (err) => {
        setError(err.message);
        setLoading(false);
      },
    }
  );

  return { data, isLoading, error, refetch };
}
