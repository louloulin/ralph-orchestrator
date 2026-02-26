/**
 * Task Search Types
 *
 * TypeScript interfaces for the Task Search feature.
 * Provides filtering, search results, and UI component types.
 *
 * @see .ralph/specs/web-dashboard/task-search.spec.md
 */

import type { Task as TaskType } from "@/components/tasks/TaskThread";

// Re-export Task type for consumers
export type Task = TaskType;

/**
 * Task status values matching the backend schema
 * These are the valid status strings used in the tasks table
 */
export type TaskStatus =
  | "pending"
  | "running"
  | "open"
  | "blocked"
  | "completed"
  | "closed"
  | "failed"
  | "archived"
  | "reviewed";

/**
 * All available task status options for filter UI
 */
export const TASK_STATUS_OPTIONS: readonly { value: TaskStatus; label: string; color: string }[] = [
  { value: "running", label: "Running", color: "text-green-500" },
  { value: "pending", label: "Pending", color: "text-yellow-500" },
  { value: "open", label: "Open", color: "text-blue-500" },
  { value: "blocked", label: "Blocked", color: "text-orange-500" },
  { value: "completed", label: "Completed", color: "text-emerald-500" },
  { value: "closed", label: "Closed", color: "text-gray-500" },
  { value: "failed", label: "Failed", color: "text-red-500" },
  { value: "reviewed", label: "Reviewed", color: "text-purple-500" },
  { value: "archived", label: "Archived", color: "text-muted-foreground" },
] as const;

/**
 * Date range filter configuration
 */
export interface DateRangeFilter {
  /** Start date (inclusive) */
  start?: Date;
  /** End date (inclusive) */
  end?: Date;
  /** Which date field to filter on */
  field: "createdAt" | "updatedAt" | "completedAt";
}

/**
 * Predefined date range options for quick selection
 */
export type DateRangePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "thisMonth"
  | "lastMonth";

/**
 * Date range preset configuration
 */
export const DATE_RANGE_PRESETS: readonly { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7days", label: "Last 7 days" },
  { value: "last30days", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
] as const;

/**
 * Complete filter state for task search
 */
export interface TaskSearchFilters {
  /** Search query string (searches in title) */
  query: string;

  /** Filter by task status (multi-select) */
  status: TaskStatus[];

  /** Filter by date range */
  dateRange?: DateRangeFilter;

  /** Quick date range preset selection */
  datePreset?: DateRangePreset;

  /** Filter by project (future: multi-project support) */
  projectId?: string;

  /** Filter by hat/preset */
  presetId?: string;

  /** Include archived tasks in results */
  includeArchived: boolean;

  /** Include closed tasks in results */
  includeClosed: boolean;
}

/**
 * Default filter values
 */
export const DEFAULT_SEARCH_FILTERS: TaskSearchFilters = {
  query: "",
  status: [],
  includeArchived: false,
  includeClosed: false,
};

/**
 * Search match highlight information
 */
export interface SearchHighlight {
  /** Field where the match occurred (e.g., "title", "description") */
  field: string;

  /** Text snippet with HTML <mark> tags around matching terms */
  snippet: string;
}

/**
 * Search result with task and optional highlights
 */
export interface TaskSearchResult {
  /** The matching task */
  task: Task;

  /** Search match highlights for display */
  highlights?: SearchHighlight[];
}

/**
 * Task search input parameters for tRPC API
 */
export interface TaskSearchParams {
  /** Search query string */
  query: string;

  /** Filter by status values */
  status?: TaskStatus[];

  /** Include archived tasks */
  includeArchived?: boolean;

  /** Include closed tasks */
  includeClosed?: boolean;

  /** Date range filter */
  dateRange?: {
    start?: string; // ISO date string
    end?: string; // ISO date string
    field: "createdAt" | "updatedAt" | "completedAt";
  };

  /** Maximum number of results to return */
  limit?: number;
}

/**
 * Props for the TaskSearch component
 */
export interface TaskSearchProps {
  /** Initial filter state */
  defaultFilters?: Partial<TaskSearchFilters>;

  /** Placeholder text for search input */
  placeholder?: string;

  /** Auto-focus the search input on mount */
  autoFocus?: boolean;

  /** Show filter chips below search input */
  showFilters?: boolean;

  /** Show date range picker in filters */
  showDateFilter?: boolean;

  /** Debounce delay in milliseconds */
  debounceMs?: number;

  /** Additional CSS classes */
  className?: string;

  /** Callback when filters change */
  onFiltersChange?: (filters: TaskSearchFilters) => void;

  /** Callback when a result is selected */
  onResultSelect?: (task: Task) => void;
}

/**
 * Props for SearchInput component
 */
export interface SearchInputProps {
  /** Current search value */
  value: string;

  /** Change handler */
  onChange: (value: string) => void;

  /** Placeholder text */
  placeholder?: string;

  /** Shows loading spinner */
  isSearching?: boolean;

  /** Expanded state (shows clear button) */
  isExpanded?: boolean;

  /** Focus callback */
  onFocus?: () => void;

  /** Blur callback */
  onBlur?: () => void;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Props for SearchFilters component
 */
export interface SearchFiltersProps {
  /** Current filter state */
  filters: TaskSearchFilters;

  /** Change handler */
  onChange: (filters: TaskSearchFilters) => void;

  /** Show date range filter */
  showDateFilter?: boolean;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Props for SearchResultItem component
 */
export interface SearchResultItemProps {
  /** Search result with task and highlights */
  result: TaskSearchResult;

  /** Whether this item is focused */
  isFocused?: boolean;

  /** Click handler */
  onClick: (task: Task) => void;

  /** Additional CSS classes */
  className?: string;
}

/**
 * Return type for useTaskSearch hook
 */
export interface UseTaskSearchReturn {
  /** Search results */
  results: TaskSearchResult[];

  /** Whether a search is in progress */
  isSearching: boolean;

  /** Total number of results */
  resultCount: number;

  /** Whether the search query is empty */
  isEmpty: boolean;

  /** Clear search results */
  clear: () => void;
}

/**
 * URL parameter serialization utilities
 */

/**
 * Convert filters to URL search params
 */
export function filtersToParams(filters: TaskSearchFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("q", filters.query);
  }

  filters.status.forEach((s) => {
    params.append("status", s);
  });

  if (filters.dateRange) {
    if (filters.dateRange.start) {
      params.set("from", filters.dateRange.start.toISOString());
    }
    if (filters.dateRange.end) {
      params.set("to", filters.dateRange.end.toISOString());
    }
    params.set("dateField", filters.dateRange.field);
  }

  if (filters.datePreset && filters.datePreset !== "all") {
    params.set("datePreset", filters.datePreset);
  }

  if (filters.includeArchived) {
    params.set("archived", "true");
  }

  if (filters.includeClosed) {
    params.set("closed", "true");
  }

  return params;
}

/**
 * Convert URL search params to filters
 */
export function paramsToFilters(params: URLSearchParams): TaskSearchFilters {
  const filters: TaskSearchFilters = { ...DEFAULT_SEARCH_FILTERS };

  filters.query = params.get("q") || "";

  const statuses = params.getAll("status");
  if (statuses.length > 0) {
    filters.status = statuses.filter((s): s is TaskStatus =>
      TASK_STATUS_OPTIONS.some((opt) => opt.value === s)
    );
  }

  const from = params.get("from");
  const to = params.get("to");
  const dateField = params.get("dateField");

  if (from || to || dateField) {
    filters.dateRange = {
      start: from ? new Date(from) : undefined,
      end: to ? new Date(to) : undefined,
      field: (dateField as "createdAt" | "updatedAt" | "completedAt") || "updatedAt",
    };
  }

  const datePreset = params.get("datePreset");
  if (datePreset && DATE_RANGE_PRESETS.some((p) => p.value === datePreset)) {
    filters.datePreset = datePreset as DateRangePreset;
  }

  filters.includeArchived = params.get("archived") === "true";
  filters.includeClosed = params.get("closed") === "true";

  return filters;
}

/**
 * Calculate date range from preset
 */
export function getDateRangeFromPreset(preset: DateRangePreset): DateRangeFilter | undefined {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case "all":
      return undefined;

    case "today":
      return {
        start: today,
        end: today,
        field: "updatedAt",
      };

    case "yesterday":
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        start: yesterday,
        end: yesterday,
        field: "updatedAt",
      };

    case "last7days":
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 6);
      return {
        start: weekAgo,
        end: today,
        field: "updatedAt",
      };

    case "last30days":
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 29);
      return {
        start: monthAgo,
        end: today,
        field: "updatedAt",
      };

    case "thisMonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: today,
        field: "updatedAt",
      };

    case "lastMonth":
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: new Date(now.getFullYear(), now.getMonth(), 0),
        field: "updatedAt",
      };

    default:
      return undefined;
  }
}
