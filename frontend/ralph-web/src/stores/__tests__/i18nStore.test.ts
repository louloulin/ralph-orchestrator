/**
 * i18n Store Tests
 *
 * Tests for the internationalization Zustand store.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useI18nStore, LOCALES, initializeLocale, getInitialLocale } from "./i18nStore";

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
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock navigator
Object.defineProperty(window, "navigator", {
  value: { language: "en-US" },
  writable: true,
});

describe("i18nStore", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Reset store to default state
    useI18nStore.setState({ locale: "en" });
  });

  describe("LOCALES constant", () => {
    it("should have at least two locales", () => {
      expect(LOCALES.length).toBeGreaterThanOrEqual(2);
    });

    it("should include English", () => {
      expect(LOCALES.find((l) => l.code === "en")).toBeDefined();
    });

    it("should include Simplified Chinese", () => {
      expect(LOCALES.find((l) => l.code === "zh-CN")).toBeDefined();
    });

    it("each locale should have code, name, and nativeName", () => {
      LOCALES.forEach((locale) => {
        expect(locale).toHaveProperty("code");
        expect(locale).toHaveProperty("name");
        expect(locale).toHaveProperty("nativeName");
      });
    });
  });

  describe("initial state", () => {
    it("should default to English", () => {
      const { locale } = useI18nStore.getState();
      expect(locale).toBe("en");
    });
  });

  describe("setLocale", () => {
    it("should change locale", () => {
      const { setLocale } = useI18nStore.getState();
      setLocale("zh-CN");

      const { locale } = useI18nStore.getState();
      expect(locale).toBe("zh-CN");
    });

    it("should update HTML lang attribute", () => {
      const { setLocale } = useI18nStore.getState();
      setLocale("zh-CN");

      expect(document.documentElement.lang).toBe("zh-CN");
    });
  });

  describe("getLocaleInfo", () => {
    it("should return locale info for current locale", () => {
      const { setLocale, getLocaleInfo } = useI18nStore.getState();
      setLocale("en");

      const info = getLocaleInfo();
      expect(info.code).toBe("en");
      expect(info.name).toBe("English");
    });

    it("should return first locale if current locale not found", () => {
      // Set to invalid locale (this shouldn't happen in practice but test edge case)
      useI18nStore.setState({ locale: "invalid" as never });

      const { getLocaleInfo } = useI18nStore.getState();
      const info = getLocaleInfo();
      expect(info).toBe(LOCALES[0]);
    });
  });

  describe("resetLocale", () => {
    it("should reset to browser locale", () => {
      // Set navigator to Chinese
      Object.defineProperty(window, "navigator", {
        value: { language: "zh-CN" },
        writable: true,
      });

      const { setLocale, resetLocale } = useI18nStore.getState();
      setLocale("en");
      resetLocale();

      const { locale } = useI18nStore.getState();
      expect(locale).toBe("zh-CN");
    });
  });

  describe("localStorage persistence", () => {
    it("should persist locale to localStorage", () => {
      const { setLocale } = useI18nStore.getState();
      setLocale("zh-CN");

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });
});

describe("initializeLocale", () => {
  it("should set HTML lang attribute", () => {
    useI18nStore.setState({ locale: "zh-CN" });
    initializeLocale();

    expect(document.documentElement.lang).toBe("zh-CN");
  });
});

describe("getInitialLocale", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("should return stored locale if available", () => {
    localStorageMock.setItem(
      "ralph-locale",
      JSON.stringify({ state: { locale: "zh-CN" } })
    );

    const locale = getInitialLocale();
    expect(locale).toBe("zh-CN");
  });

  it("should detect browser locale if not stored", () => {
    Object.defineProperty(window, "navigator", {
      value: { language: "zh-CN" },
      writable: true,
    });

    const locale = getInitialLocale();
    expect(locale).toBe("zh-CN");
  });

  it("should default to English for non-Chinese browser", () => {
    Object.defineProperty(window, "navigator", {
      value: { language: "fr-FR" },
      writable: true,
    });

    const locale = getInitialLocale();
    expect(locale).toBe("en");
  });
});
