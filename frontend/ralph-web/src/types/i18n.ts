/**
 * i18n Types
 *
 * Type definitions for internationalization support.
 */

/** Supported locales */
export type Locale = "en" | "zh-CN";

/** Locale display information */
export interface LocaleInfo {
  code: Locale;
  name: string;
  nativeName: string;
}

/** Translation key path (dot notation) */
export type TranslationKey = string;

/** Translation function signature */
export type TranslationFn = (key: TranslationKey, params?: Record<string, string | number>) => string;
