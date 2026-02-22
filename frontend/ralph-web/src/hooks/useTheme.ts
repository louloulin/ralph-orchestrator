/**
 * useTheme Hook
 *
 * Provides convenient access to theme state and controls.
 * Wraps the theme store with additional utilities.
 *
 * @see P3-1: Theme System in Ralph Web Dashboard Plan
 */

import { useCallback, useEffect } from "react";
import { useThemeStore, type ThemeMode } from "@/stores/themeStore";

interface UseThemeReturn {
  /** Current theme mode preference (light, dark, or system) */
  mode: ThemeMode;
  /** Resolved theme (actual applied theme, always light or dark) */
  resolved: "light" | "dark";
  /** Whether the current resolved theme is dark */
  isDark: boolean;
  /** Whether the current resolved theme is light */
  isLight: boolean;
  /** Set theme mode preference */
  setMode: (mode: ThemeMode) => void;
  /** Toggle between light and dark (ignores system preference) */
  toggle: () => void;
  /** Set theme to light */
  setLight: () => void;
  /** Set theme to dark */
  setDark: () => void;
  /** Set theme to follow system preference */
  setSystem: () => void;
}

/**
 * Hook for managing theme state.
 *
 * @example
 * ```tsx
 * const { isDark, toggle, setMode } = useTheme();
 *
 * // Toggle theme
 * <button onClick={toggle}>Toggle Theme</button>
 *
 * // Set specific mode
 * <button onClick={() => setMode('light')}>Light</button>
 * <button onClick={() => setMode('dark')}>Dark</button>
 * <button onClick={() => setMode('system')}>System</button>
 *
 * // Conditional styling
 * <div className={isDark ? 'dark-styles' : 'light-styles'} />
 * ```
 */
export function useTheme(): UseThemeReturn {
  const { mode, resolved, setMode, toggle } = useThemeStore();

  const setLight = useCallback(() => setMode("light"), [setMode]);
  const setDark = useCallback(() => setMode("dark"), [setMode]);
  const setSystem = useCallback(() => setMode("system"), [setMode]);

  return {
    mode,
    resolved,
    isDark: resolved === "dark",
    isLight: resolved === "light",
    setMode,
    toggle,
    setLight,
    setDark,
    setSystem,
  };
}

/**
 * Hook to initialize theme system on app mount.
 * Sets up system theme change listener and applies initial theme.
 *
 * Should be called once in App.tsx or main.tsx.
 *
 * @example
 * ```tsx
 * function App() {
 *   useThemeInit();
 *   return <Router>...</Router>;
 * }
 * ```
 */
export function useThemeInit(): void {
  useEffect(() => {
    // Apply initial theme from store
    const { mode, updateResolved } = useThemeStore.getState();

    // Get the store's update function and initial state
    const resolved = useThemeStore.getState().resolved;

    // Apply theme immediately
    const { applyTheme, getResolvedTheme } = require("@/stores/themeStore");
    const currentResolved = getResolvedTheme(mode);
    applyTheme(currentResolved);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = () => {
      const { mode } = useThemeStore.getState();
      if (mode === "system") {
        updateResolved();
      }
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);
}
