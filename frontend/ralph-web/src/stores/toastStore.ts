/**
 * Toast Store
 *
 * State management for toast notifications.
 * Provides methods to add, remove, and manage toast notifications.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Toast notification types
 */
export type ToastType = "success" | "error" | "warning" | "info";

/**
 * Toast notification
 */
export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: number;
}

/**
 * Toast store state
 */
interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id" | "createdAt">) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

/**
 * Generate unique toast ID
 */
function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Toast store
 */
export const useToastStore = create<ToastState>()(
  persist(
    (set, get) => ({
      toasts: [],

      addToast: (toast) => {
        const id = generateToastId();
        const newToast: Toast = {
          ...toast,
          id,
          createdAt: Date.now(),
          duration: toast.duration ?? 5000,
        };

        set((state) => ({
          toasts: [...state.toasts, newToast],
        }));

        // Auto-remove after duration
        if (newToast.duration && newToast.duration > 0) {
          setTimeout(() => {
            get().removeToast(id);
          }, newToast.duration);
        }

        return id;
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      },

      clearToasts: () => {
        set({ toasts: [] });
      },
    }),
    {
      name: "toast-storage",
      // Don't persist toasts between sessions - this is for runtime only
      skipHydration: true,
    }
  )
);

/**
 * Convenience functions for adding specific toast types
 */
export const toast = {
  success: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "success", title, message, duration }),

  error: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "error", title, message, duration }),

  warning: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "warning", title, message, duration }),

  info: (title: string, message?: string, duration?: number) =>
    useToastStore.getState().addToast({ type: "info", title, message, duration }),

  // Generic add method for custom toasts
  add: (toast: Omit<Toast, "id" | "createdAt">) =>
    useToastStore.getState().addToast(toast),
};

/**
 * useToast hook for component usage
 */
export function useToast() {
  return toast;
}