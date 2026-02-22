/**
 * useTaskSearch Hook
 *
 * Provides task search functionality with debounced queries and tRPC integration.
 * Implements result highlighting for search matches.
 *
 * @see .ralph/specs/web-dashboard/task-search.spec.md
 */

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/trpc";
import type {
  Task,
  TaskSearchFilters,
  TaskSearchResult,
  UseTaskSearchReturn,
} from "@/types/search";

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate search highlights for a task based on query
 */
function generateHighlights(task: Task, query: string): TaskSearchResult["highlights"] {
  if (!query || query.length < 2) return [];

  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  const highlights: TaskSearchResult["highlights"] = [];

  if (task.title && regex.test(task.title)) {
    highlights.push({
      field: "title",
      snippet: task.title.replace(regex, "<mark>$1</mark>"),
    });
  }

  // Reset regex lastIndex for next test
  regex.lastIndex = 0;

  if (task.executionSummary && regex.test(task.executionSummary)) {
    const snippet = task.executionSummary.slice(0, 150);
    highlights.push({
      field: "executionSummary",
      snippet: snippet.replace(regex, "<mark>$1</mark>") + (task.executionSummary.length > 150 ? "..." : ""),
    });
  }

  return highlights;
}

/**
 * Custom hook for debouncing a value
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook for searching tasks with debounced queries
 *
 * Uses server-side search via tRPC when query is 2+ characters.
 * Falls back to listing all tasks when query is empty.
 *
 * @param filters - Current search filters
 * @param debounceMs - Debounce delay in milliseconds (default: 150)
 * @returns Search results, loading state, and utilities
 *
 * @example
 * ```tsx
 * const { results, isSearching, resultCount } = useTaskSearch(filters, 150);
 * ```
 */
export function useTaskSearch(
  filters: TaskSearchFilters,
  debounceMs: number = 150
): UseTaskSearchReturn {
  const [results, setResults] = useState<TaskSearchResult[]>([]);

  // Debounce the search query
  const debouncedQuery = useDebounce(filters.query, debounceMs);

  // Determine if we should use server-side search
  // Only search when query is at least 2 characters
  const shouldSearch = debouncedQuery.length >= 2;

  // Server-side search via tRPC search endpoint
  const { data: searchData, isLoading: searchLoading, isFetching: searchFetching } = trpc.task.search.useQuery(
    {
      query: debouncedQuery,
      status: filters.status.length > 0 ? filters.status : undefined,
      includeArchived: filters.includeArchived,
      includeClosed: filters.includeClosed,
      dateRange: filters.dateRange,
    },
    {
      enabled: shouldSearch,
      staleTime: 30000, // 30 seconds
    }
  );

  // Fallback: list all tasks when not searching
  const { data: listData, isLoading: listLoading, isFetching: listFetching } = trpc.task.list.useQuery(
    { status: filters.status[0], includeArchived: filters.includeArchived },
    {
      enabled: !shouldSearch,
      staleTime: 30000, // 30 seconds
    }
  );

  // Combine data and apply client-side filtering for non-search queries
  useEffect(() => {
    const data = shouldSearch ? searchData : listData;

    if (!data) {
      setResults([]);
      return;
    }

    // When using list endpoint, apply client-side filtering
    let filtered = data;

    if (!shouldSearch) {
      // Filter by status (if specified)
      if (filters.status.length > 0) {
        filtered = filtered.filter((task) =>
          filters.status.includes(task.status as never)
        );
      }

      // Filter out closed tasks unless explicitly included
      if (!filters.includeClosed) {
        filtered = filtered.filter((task) => task.status !== "closed");
      }
    }

    // Generate highlights for search results
    const searchResults: TaskSearchResult[] = filtered.map((task) => ({
      task,
      highlights: generateHighlights(task, debouncedQuery),
    }));

    setResults(searchResults);
  }, [searchData, listData, shouldSearch, debouncedQuery, filters.status, filters.includeClosed]);

  // Clear search results
  const clear = useCallback(() => {
    setResults([]);
  }, []);

  // Determine loading state
  const isLoading = shouldSearch ? searchLoading : listLoading;
  const isFetching = shouldSearch ? searchFetching : listFetching;

  return {
    results,
    isSearching: isLoading || isFetching,
    resultCount: results.length,
    isEmpty: results.length === 0 && !isLoading && (shouldSearch || debouncedQuery.length >= 2),
    clear,
  };
}

/**
 * Hook for managing search filter state with URL persistence
 *
 * @param defaultFilters - Default filter values
 * @returns Current filters and update function
 */
export function useSearchFilters(defaultFilters?: Partial<TaskSearchFilters>) {
  const [filters, setFilters] = useState<TaskSearchFilters>(() => ({
    query: "",
    status: [],
    includeArchived: false,
    includeClosed: false,
    ...defaultFilters,
  }));

  // Update a single filter field
  const updateFilter = useCallback(<K extends keyof TaskSearchFilters>(
    key: K,
    value: TaskSearchFilters[K]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  // Reset filters to defaults
  const resetFilters = useCallback(() => {
    setFilters({
      query: "",
      status: [],
      includeArchived: false,
      includeClosed: false,
      ...defaultFilters,
    });
  }, [defaultFilters]);

  // Toggle a status in the status filter
  const toggleStatus = useCallback((status: TaskSearchFilters["status"][0]) => {
    setFilters((prev) => {
      const hasStatus = prev.status.includes(status);
      return {
        ...prev,
        status: hasStatus
          ? prev.status.filter((s) => s !== status)
          : [...prev.status, status],
      };
    });
  }, []);

  return {
    filters,
    setFilters,
    updateFilter,
    resetFilters,
    toggleStatus,
  };
}

export default useTaskSearch;
