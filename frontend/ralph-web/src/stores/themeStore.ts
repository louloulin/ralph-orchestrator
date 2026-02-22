/**
 * Theme Store
 *
 * Zustand store for managing theme state with localStorage persistence.
 * Supports light, dark, and system preferences.
 *
 * @see P3-1: Theme System in Ralph Web Dashboard Plan
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Theme mode options */
export type ThemeMode = "light" | "dark" | "system";

/** Storage key for theme persistence */
const THEME_STORAGE_KEY = "ralph-theme";

/**
 * Get the system preferred color scheme
 */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "dark"; // Default for SSR
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Get the resolved theme based on mode preference
 */
export function getResolvedTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") {
    return getSystemTheme();
  }
  return mode;
}

interface ThemeStore {
  /** Current theme mode preference */
  mode: ThemeMode;

  /** Resolved theme (actual applied theme) */
  resolved: "light" | "dark";

  /** Set theme mode */
  setMode: (mode: ThemeMode) => void;

  /** Toggle between light and dark (ignores system) */
  toggle: () => void;

  /** Update resolved theme based on current mode and system preference */
  updateResolved: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: "dark", // Default to dark for hacker aesthetic
      resolved: "dark",

      setMode: (mode) => {
        const resolved = getResolvedTheme(mode);
        set({ mode, resolved });
        applyTheme(resolved);
      },

      toggle: () => {
        const { resolved } = get();
        const newMode = resolved === "dark" ? "light" : "dark";
        set({ mode: newMode, resolved: newMode });
        applyTheme(newMode);
      },

      updateResolved: () => {
        const { mode } = get();
        const resolved = getResolvedTheme(mode);
        set({ resolved });
        applyTheme(resolved);
      },
    }),
    {
      name: THEME_STORAGE_KEY,
      partialize: (state) => ({ mode: state.mode }), // Only persist mode preference
    }
  )
);

/**
 * Apply theme to the document by setting data-theme attribute
 * and managing the .dark class for Tailwind dark mode.
 */
export function applyTheme(theme: "light" | "dark"): void {
  if (typeof document === "undefined") {
    return;
  }

  const root = document.documentElement;

  // Set data-theme attribute for CSS custom properties
  root.setAttribute("data-theme", theme);

  // Toggle dark class for Tailwind dark: variants
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Update meta theme-color for mobile browsers
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute(
      "content",
      theme === "dark" ? "#1a1a1a" : "#ffffff"
    );
  }
}

/**
 * Initialize theme on app load.
 * Should be called once in main.tsx or App.tsx.
 */
export function initializeTheme(): () => void {
  // Apply initial theme
  const { mode, updateResolved } = useThemeStore.getState();
  const resolved = getResolvedTheme(mode);
  applyTheme(resolved);

  // Listen for system theme changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  const handleChange = () => {
    const { mode } = useThemeStore.getState();
    if (mode === "system") {
      updateResolved();
    }
  };

  mediaQuery.addEventListener("change", handleChange);

  // Return cleanup function
  return () => {
    mediaQuery.removeEventListener("change", handleChange);
  };
}
