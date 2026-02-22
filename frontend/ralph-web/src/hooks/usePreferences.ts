/**
 * usePreferences Hook
 *
 * Manages user preferences with localStorage persistence.
 * Provides a centralized way to access and modify UI preferences
 * that survive page refreshes and browser sessions.
 */

import { useCallback, useMemo } from "react";

/**
 * Storage key for all Ralph preferences
 */
const PREFERENCES_KEY = "ralph-preferences";

/**
 * Default preferences structure
 */
interface Preferences {
  /** Selected preset ID for task creation */
  presetSelection: string;
  /** Whether to show notifications */
  notificationsEnabled: boolean;
  /** Whether to auto-scroll logs */
  autoScrollLogs: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  presetSelection: "default",
  notificationsEnabled: true,
  autoScrollLogs: true,
};

/**
 * Read preferences from localStorage
 */
function readPreferences(): Preferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (error) {
    console.warn("Failed to read preferences from localStorage:", error);
  }
  return { ...DEFAULT_PREFERENCES };
}

/**
 * Write preferences to localStorage
 */
function writePreferences(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Failed to write preferences to localStorage:", error);
  }
}

/**
 * Hook return type
 */
interface UsePreferencesReturn {
  /** Current preferences object */
  preferences: Preferences;
  /** Update the selected preset */
  setPresetSelection: (preset: string) => void;
  /** Update notification preference */
  setNotificationsEnabled: (enabled: boolean) => void;
  /** Update auto-scroll preference */
  setAutoScrollLogs: (enabled: boolean) => void;
  /** Reset all preferences to defaults */
  resetPreferences: () => void;
  /** Clear all preferences from localStorage */
  clearPreferences: () => void;
  /** Get the current preset selection (convenience getter) */
  presetSelection: string;
}

/**
 * Hook for managing user preferences with localStorage persistence.
 *
 * @example
 * ```tsx
 * const { presetSelection, setPresetSelection } = usePreferences();
 *
 * // Read current value
 * console.log(presetSelection);
 *
 * // Update value (persisted to localStorage)
 * setPresetSelection("custom-preset");
 * ```
 */
export function usePreferences(): UsePreferencesReturn {
  // Get current preferences (synchronous read on each render)
  // This is safe because localStorage reads are fast and we want
  // to react to changes from other tabs/windows
  const preferences = useMemo(() => readPreferences(), []);

  const setPresetSelection = useCallback((preset: string) => {
    const current = readPreferences();
    const updated = { ...current, presetSelection: preset };
    writePreferences(updated);
  }, []);

  const setNotificationsEnabled = useCallback((enabled: boolean) => {
    const current = readPreferences();
    const updated = { ...current, notificationsEnabled: enabled };
    writePreferences(updated);
  }, []);

  const setAutoScrollLogs = useCallback((enabled: boolean) => {
    const current = readPreferences();
    const updated = { ...current, autoScrollLogs: enabled };
    writePreferences(updated);
  }, []);

  const resetPreferences = useCallback(() => {
    writePreferences(DEFAULT_PREFERENCES);
  }, []);

  const clearPreferences = useCallback(() => {
    try {
      localStorage.removeItem(PREFERENCES_KEY);
    } catch (error) {
      console.warn("Failed to clear preferences from localStorage:", error);
    }
  }, []);

  return {
    preferences,
    setPresetSelection,
    setNotificationsEnabled,
    setAutoScrollLogs,
    resetPreferences,
    clearPreferences,
    presetSelection: preferences.presetSelection,
  };
}

/**
 * Utility to clear all Ralph-related localStorage data.
 * Useful for "clear cache" functionality.
 */
export function clearAllRalphLocalStorage(): void {
  const ralphKeys = [
    PREFERENCES_KEY,
    "ralph-ui", // UI store from store.ts
    "ralph-command-history", // Command palette history
    "ralph-notifications", // Notification preferences
  ];

  ralphKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`Failed to remove ${key} from localStorage:`, error);
    }
  });
}

/**
 * Get list of all Ralph localStorage keys with their sizes.
 * Useful for displaying cache info to users.
 */
export function getRalphLocalStorageInfo(): { key: string; size: number }[] {
  const ralphKeyPatterns = [/^ralph-/];

  const info: { key: string; size: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && ralphKeyPatterns.some((pattern) => pattern.test(key))) {
      const value = localStorage.getItem(key);
      info.push({
        key,
        size: value ? new Blob([value]).size : 0,
      });
    }
  }

  return info;
}
