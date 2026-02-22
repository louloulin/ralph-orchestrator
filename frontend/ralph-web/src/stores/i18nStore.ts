/**
 * i18n Store
 *
 * Zustand store for managing locale state with localStorage persistence.
 * Supports English (en) and Simplified Chinese (zh-CN).
 *
 * @see P3-2: i18n Support in Ralph Web Dashboard Plan
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale, LocaleInfo } from "@/types/i18n";

// Re-export LocaleInfo for use in tests
export type { LocaleInfo } from "@/types/i18n";

/** Storage key for locale persistence */
const LOCALE_STORAGE_KEY = "ralph-locale";

/** Available locales with display information */
export const LOCALES: LocaleInfo[] = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文" },
];

/** Default locale */
const DEFAULT_LOCALE: Locale = "en";

/**
 * Detect browser locale preference
 */
function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") {
    return DEFAULT_LOCALE;
  }

  const browserLang = navigator.language;

  // Match exact locale
  if (browserLang === "zh-CN" || browserLang === "zh-Hans" || browserLang === "zh") {
    return "zh-CN";
  }

  return DEFAULT_LOCALE;
}

interface I18nStore {
  /** Current locale */
  locale: Locale;

  /** Set locale */
  setLocale: (locale: Locale) => void;

  /** Get locale info for current locale */
  getLocaleInfo: () => LocaleInfo;

  /** Reset to default locale */
  resetLocale: () => void;
}

export const useI18nStore = create<I18nStore>()(
  persist(
    (set, get) => ({
      locale: DEFAULT_LOCALE,

      setLocale: (locale) => {
        set({ locale });
        // Update HTML lang attribute
        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }
      },

      getLocaleInfo: () => {
        const { locale } = get();
        return LOCALES.find((l) => l.code === locale) || LOCALES[0];
      },

      resetLocale: () => {
        const detected = detectBrowserLocale();
        set({ locale: detected });
        if (typeof document !== "undefined") {
          document.documentElement.lang = detected;
        }
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      partialize: (state) => ({ locale: state.locale }),
    }
  )
);

/**
 * Initialize locale on app load.
 * Sets HTML lang attribute based on stored or detected preference.
 */
export function initializeLocale(): void {
  if (typeof document === "undefined") {
    return;
  }

  const { locale } = useI18nStore.getState();
  document.documentElement.lang = locale;
}

/**
 * Get the locale to use on first load.
 * Returns stored locale if available, otherwise detects from browser.
 */
export function getInitialLocale(): Locale {
  // Try to get stored locale from localStorage
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.state?.locale) {
          return parsed.state.locale;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return detectBrowserLocale();
}
