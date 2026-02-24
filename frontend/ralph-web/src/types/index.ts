/**
 * Types Barrel Export
 *
 * Re-exports all TypeScript types from the types directory.
 */

export type {
  Task,
  TaskStatus,
  DateRangeFilter,
  TaskSearchFilters,
  SearchHighlight,
  TaskSearchResult,
  TaskSearchParams,
  TaskSearchProps,
  SearchInputProps,
  SearchFiltersProps,
  SearchResultItemProps,
  UseTaskSearchReturn,
} from "./search";

export {
  TASK_STATUS_OPTIONS,
  DATE_RANGE_PRESETS,
  DEFAULT_SEARCH_FILTERS,
  filtersToParams,
  paramsToFilters,
  getDateRangeFromPreset,
  type DateRangePreset,
} from "./search";

// Thinking types for ThinkingPanel component
export type {
  ThinkingStepType,
  ThinkingStepMetadata,
  ThinkingStep,
  ThinkingSession,
} from "./thinking";

export {
  THINKING_TYPE_BADGE_VARIANTS,
  THINKING_STEP_TYPES,
  THINKING_TYPE_BORDER_COLORS,
  THINKING_TYPE_LABELS,
} from "./thinking";

// i18n types for internationalization
export type {
  Locale,
  LocaleInfo,
  TranslationKey,
  TranslationFn,
} from "./i18n";

// Process types for 24/7 Platform Daemon
export type {
  LoopStatus,
  LoopConfig,
  LoopProcess,
  HealthIssueSeverity,
  HealthIssue,
  HealthCheckStatus,
  HealthMetrics,
  HealthCheck,
  TerminationReason,
  RestartEvent,
  SupervisorStats,
} from "./process";

export {
  STATUS_COLORS,
  HEALTH_STATUS_COLORS,
  STATUS_LABELS,
} from "./process";

