/**
 * useTranslation Hook
 *
 * Provides translation functionality for internationalization.
 * Uses the i18n store for locale management and JSON-based translations.
 *
 * @see P3-2: i18n Support in Ralph Web Dashboard Plan
 */

import { useCallback, useMemo } from "react";
import { useI18nStore, LOCALES } from "@/stores/i18nStore";
import type { TranslationKey, TranslationFn } from "@/types/i18n";

// Import translation files
import enTranslations from "@/locales/en.json";
import zhCNTranslations from "@/locales/zh-CN.json";

/** Translation dictionary type */
type TranslationDict = Record<string, unknown>;

/** All available translations */
const translations: Record<string, TranslationDict> = {
  en: enTranslations,
  "zh-CN": zhCNTranslations,
};

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current && typeof current === "object" && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return typeof current === "string" ? current : undefined;
}

/**
 * Replace template parameters in a string
 * Supports {{param}} syntax
 */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = params[key];
    return value !== undefined ? String(value) : match;
  });
}

/**
 * Handle pluralization based on count
 * Simple implementation using _other suffix for non-singular forms
 */
function handlePlural(key: string, count?: number): string {
  if (count === undefined || count === 1) {
    return key;
  }
  // Try the _other variant for plural
  return `${key}_other`;
}

/**
 * Hook return type
 */
interface UseTranslationReturn {
  /** Current locale */
  locale: string;

  /** Translation function */
  t: TranslationFn;

  /** Check if a translation key exists */
  has: (key: TranslationKey) => boolean;

  /** Get all available locales */
  availableLocales: typeof import("@/stores/i18nStore").LOCALES;
}

/**
 * Hook for accessing translations.
 *
 * @example
 * ```tsx
 * const { t, locale } = useTranslation();
 *
 * // Simple translation
 * <h1>{t("dashboard.title")}</h1>
 *
 * // With parameters
 * <p>{t("time.minutesAgo", { count: 5 })}</p>
 * ```
 */
export function useTranslation(): UseTranslationReturn {
  const locale = useI18nStore((state) => state.locale);

  const t = useCallback<TranslationFn>(
    (key: TranslationKey, params?: Record<string, string | number>) => {
      const dict = translations[locale] || translations.en;

      // Handle pluralization
      const resolvedKey = params?.count !== undefined
        ? handlePlural(key, params.count as number)
        : key;

      // Get the translation
      let translation = getNestedValue(dict, resolvedKey);

      // Fallback to base key if plural form not found
      if (translation === undefined && resolvedKey !== key) {
        translation = getNestedValue(dict, key);
      }

      // Fallback to English if not found in current locale
      if (translation === undefined && locale !== "en") {
        translation = getNestedValue(translations.en, resolvedKey);
        if (translation === undefined && resolvedKey !== key) {
          translation = getNestedValue(translations.en, key);
        }
      }

      // Return key as fallback if translation not found
      if (translation === undefined) {
        console.warn(`Translation not found: ${key}`);
        return key;
      }

      // Interpolate parameters
      return interpolate(translation, params);
    },
    [locale]
  );

  const has = useCallback(
    (key: TranslationKey): boolean => {
      const dict = translations[locale] || translations.en;
      return getNestedValue(dict, key) !== undefined;
    },
    [locale]
  );

  const availableLocales = useMemo(() => LOCALES, []);

  return {
    locale,
    t,
    has,
    availableLocales,
  };
}

/**
 * Format a relative time string
 */
export function formatRelativeTime(
  t: TranslationFn,
  date: Date | string,
  now: Date = new Date()
): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return t("time.justNow");
  } else if (diffMin < 60) {
    return t("time.minutesAgo", { count: diffMin });
  } else if (diffHour < 24) {
    return t("time.hoursAgo", { count: diffHour });
  } else {
    return t("time.daysAgo", { count: diffDay });
  }
}
