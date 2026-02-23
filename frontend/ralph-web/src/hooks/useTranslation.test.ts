/**
 * useTranslation Hook Tests
 *
 * Tests for the translation hook functionality.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTranslation, formatRelativeTime } from "./useTranslation";
import { useI18nStore } from "@/stores/i18nStore";

describe("useTranslation", () => {
  beforeEach(() => {
    useI18nStore.setState({ locale: "en" });
  });

  describe("locale", () => {
    it("should return current locale", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.locale).toBe("en");
    });

    it("should update when locale changes", () => {
      const { result, rerender } = renderHook(() => useTranslation());

      act(() => {
        useI18nStore.getState().setLocale("zh-CN");
      });

      rerender();

      expect(result.current.locale).toBe("zh-CN");
    });
  });

  describe("t function", () => {
    it("should translate simple keys", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.t("common.loading")).toBe("Loading...");
    });

    it("should translate nested keys", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.t("tasks.status.running")).toBe("In Progress");
    });

    it("should interpolate parameters with pluralization", () => {
      const { result } = renderHook(() => useTranslation());
      // count=5 triggers plural form (minutesAgo_other)
      expect(result.current.t("time.minutesAgo", { count: 5 })).toBe("5 minutes ago");
    });

    it("should use singular form for count=1", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.t("time.minutesAgo", { count: 1 })).toBe("1 minute ago");
    });

    it("should return key if translation not found", () => {
      const { result } = renderHook(() => useTranslation());
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(result.current.t("nonexistent.key")).toBe("nonexistent.key");

      expect(consoleWarn).toHaveBeenCalledWith("Translation not found: nonexistent.key");
      consoleWarn.mockRestore();
    });

    it("should fallback to English if key not in current locale", () => {
      const { result } = renderHook(() => useTranslation());

      act(() => {
        useI18nStore.getState().setLocale("zh-CN");
      });

      // This key exists in English but we test fallback behavior
      expect(result.current.t("common.loading")).toBe("加载中...");
    });
  });

  describe("has function", () => {
    it("should return true for existing keys", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.has("common.loading")).toBe(true);
    });

    it("should return false for missing keys", () => {
      const { result } = renderHook(() => useTranslation());
      expect(result.current.has("nonexistent.key")).toBe(false);
    });
  });

  describe("availableLocales", () => {
    it("should return array of locales", () => {
      const { result } = renderHook(() => useTranslation());
      expect(Array.isArray(result.current.availableLocales)).toBe(true);
      expect(result.current.availableLocales.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe("formatRelativeTime", () => {
  const t = (key: string, params?: Record<string, string | number>) => {
    // Simple mock translator
    const translations: Record<string, string> = {
      "time.justNow": "Just now",
      "time.minutesAgo": `${params?.count || 0} minute ago`,
      "time.hoursAgo": `${params?.count || 0} hour ago`,
      "time.daysAgo": `${params?.count || 0} day ago`,
    };
    return translations[key] || key;
  };

  it("should return 'just now' for less than a minute", () => {
    const now = new Date();
    const date = new Date(now.getTime() - 30000); // 30 seconds ago

    expect(formatRelativeTime(t, date, now)).toBe("Just now");
  });

  it("should return minutes ago for less than an hour", () => {
    const now = new Date();
    const date = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago

    expect(formatRelativeTime(t, date, now)).toBe("5 minute ago");
  });

  it("should return hours ago for less than a day", () => {
    const now = new Date();
    const date = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago

    expect(formatRelativeTime(t, date, now)).toBe("3 hour ago");
  });

  it("should return days ago for more than a day", () => {
    const now = new Date();
    const date = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

    expect(formatRelativeTime(t, date, now)).toBe("2 day ago");
  });

  it("should handle string dates", () => {
    const now = new Date("2026-01-15T12:00:00");
    const dateString = "2026-01-15T11:55:00"; // 5 minutes ago

    expect(formatRelativeTime(t, dateString, now)).toBe("5 minute ago");
  });
});
