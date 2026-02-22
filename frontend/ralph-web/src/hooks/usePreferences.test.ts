/**
 * usePreferences Hook Tests
 *
 * Tests that usePreferences correctly manages user preferences
 * with localStorage persistence.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePreferences,
  clearAllRalphLocalStorage,
  getRalphLocalStorageInfo,
} from "./usePreferences";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("usePreferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe("initialization", () => {
    it("returns default preferences when localStorage is empty", () => {
      const { result } = renderHook(() => usePreferences());

      expect(result.current.presetSelection).toBe("default");
      expect(result.current.preferences.notificationsEnabled).toBe(true);
      expect(result.current.preferences.autoScrollLogs).toBe(true);
    });

    it("loads preferences from localStorage if available", () => {
      localStorageMock.setItem(
        "ralph-preferences",
        JSON.stringify({
          presetSelection: "custom-preset",
          notificationsEnabled: false,
          autoScrollLogs: false,
        })
      );

      const { result } = renderHook(() => usePreferences());

      expect(result.current.presetSelection).toBe("custom-preset");
    });
  });

  describe("setPresetSelection", () => {
    it("updates preset selection and persists to localStorage", () => {
      const { result } = renderHook(() => usePreferences());

      act(() => {
        result.current.setPresetSelection("planning-preset");
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "ralph-preferences",
        expect.stringContaining("planning-preset")
      );
    });
  });

  describe("resetPreferences", () => {
    it("resets all preferences to defaults", () => {
      localStorageMock.setItem(
        "ralph-preferences",
        JSON.stringify({
          presetSelection: "custom",
          notificationsEnabled: false,
        })
      );

      const { result } = renderHook(() => usePreferences());

      act(() => {
        result.current.resetPreferences();
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "ralph-preferences",
        expect.stringContaining('"presetSelection":"default"')
      );
    });
  });

  describe("clearPreferences", () => {
    it("removes preferences from localStorage", () => {
      const { result } = renderHook(() => usePreferences());

      act(() => {
        result.current.clearPreferences();
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith("ralph-preferences");
    });
  });
});

describe("clearAllRalphLocalStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("removes all ralph-* keys from localStorage", () => {
    // Setup: Add some ralph keys and one non-ralph key
    localStorageMock.setItem("ralph-preferences", '{"test": true}');
    localStorageMock.setItem("ralph-ui", '{"sidebarOpen": true}');
    localStorageMock.setItem("other-app", '{"should": "remain"}');

    clearAllRalphLocalStorage();

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("ralph-preferences");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("ralph-ui");
    expect(localStorageMock.removeItem).not.toHaveBeenCalledWith("other-app");
  });
});

describe("getRalphLocalStorageInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it("returns info about ralph localStorage keys", () => {
    localStorageMock.setItem("ralph-preferences", '{"test": true}');
    localStorageMock.setItem("ralph-ui", '{"sidebarOpen": true}');

    const info = getRalphLocalStorageInfo();

    expect(info).toHaveLength(2);
    expect(info.find((i) => i.key === "ralph-preferences")).toBeDefined();
    expect(info.find((i) => i.key === "ralph-ui")).toBeDefined();
  });

  it("returns empty array when no ralph keys exist", () => {
    const info = getRalphLocalStorageInfo();
    expect(info).toHaveLength(0);
  });
});
