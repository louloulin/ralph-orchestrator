/**
 * TaskSearch Component
 *
 * A comprehensive task search interface with debounced queries, filter chips,
 * keyboard navigation, and result highlighting.
 *
 * @see .ralph/specs/web-dashboard/task-search.spec.md
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Search, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTaskSearch, useSearchFilters } from "@/hooks/useTaskSearch";
import type {
  Task,
  TaskSearchFilters,
  TaskSearchResult,
  TaskStatus,
} from "@/types/search";
import {
  TASK_STATUS_OPTIONS as statusOptions,
  DATE_RANGE_PRESETS,
  getDateRangeFromPreset,
  type DateRangePreset,
} from "@/types/search";

/**
 * Check if an element is an interactive input that should block keyboard shortcuts
 */
function isInteractiveElement(element: Element | null): boolean {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  const interactiveTags = ["input", "textarea", "select", "button"];
  if (interactiveTags.includes(tagName)) return true;
  if (element.getAttribute("contenteditable") === "true") return true;
  return false;
}

// ============================================================================
// SearchInput Component
// ============================================================================

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isSearching?: boolean;
  isExpanded?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}

function SearchInput({
  value,
  onChange,
  placeholder = "Search tasks...",
  isSearching = false,
  isExpanded = false,
  inputRef,
  onFocus,
  onBlur,
  onKeyDown,
  className,
}: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-10 pr-16"
        aria-label="Search tasks"
        autoComplete="off"
      />
      {isSearching && (
        <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {isExpanded && value && !isSearching && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-10 top-1/2 -translate-y-1/2 p-1 hover:bg-accent rounded"
          aria-label="Clear search"
        >
          <X className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {!isExpanded && (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs text-muted-foreground bg-muted rounded pointer-events-none">
          /
        </kbd>
      )}
    </div>
  );
}

// ============================================================================
// FilterChip Component
// ============================================================================

interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
  color?: string;
}

function FilterChip({ label, selected, onToggle, color }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-transparent hover:bg-accent border-border"
      )}
      aria-pressed={selected}
    >
      {selected && (
        <span className="w-2 h-2 rounded-full bg-current" />
      )}
      <span className={cn(!selected && color)}>{label}</span>
    </button>
  );
}

// ============================================================================
// SearchFilters Component
// ============================================================================

interface SearchFiltersProps {
  filters: TaskSearchFilters;
  onToggleStatus: (status: TaskStatus) => void;
  onChangeDatePreset: (preset: DateRangePreset) => void;
  onToggleIncludeClosed: () => void;
  onToggleIncludeArchived: () => void;
  showDateFilter?: boolean;
  className?: string;
}

function SearchFiltersComponent({
  filters,
  onToggleStatus,
  onChangeDatePreset,
  onToggleIncludeClosed,
  onToggleIncludeArchived,
  showDateFilter = true,
  className,
}: SearchFiltersProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 py-2", className)}>
      {/* Status filter chips */}
      <div className="flex flex-wrap items-center gap-1">
        {statusOptions.slice(0, 5).map((status) => (
          <FilterChip
            key={status.value}
            label={status.label}
            selected={filters.status.includes(status.value)}
            onToggle={() => onToggleStatus(status.value)}
            color={status.color}
          />
        ))}
      </div>

      {/* Date preset dropdown */}
      {showDateFilter && (
        <select
          value={filters.datePreset || "all"}
          onChange={(e) => onChangeDatePreset(e.target.value as DateRangePreset)}
          className="px-2 py-1 text-xs rounded border border-input bg-background"
          aria-label="Date range filter"
        >
          {DATE_RANGE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
      )}

      {/* Toggle switches */}
      <div className="flex items-center gap-3 ml-auto text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.includeClosed}
            onChange={onToggleIncludeClosed}
            className="rounded"
          />
          <span className="text-muted-foreground">Closed</span>
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            onChange={onToggleIncludeArchived}
            className="rounded"
          />
          <span className="text-muted-foreground">Archived</span>
        </label>
      </div>
    </div>
  );
}

// ============================================================================
// SearchResultItem Component
// ============================================================================

interface SearchResultItemProps {
  result: TaskSearchResult;
  isFocused: boolean;
  onClick: (task: Task) => void;
  className?: string;
}

function SearchResultItem({ result, isFocused, onClick, className }: SearchResultItemProps) {
  const { task, highlights } = result;
  const statusOption = statusOptions.find((s) => s.value === task.status);

  // Get relative time
  const relativeTime = useMemo(() => {
    const date = task.updatedAt instanceof Date ? task.updatedAt : new Date(task.updatedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }, [task.updatedAt]);

  return (
    <button
      type="button"
      onClick={() => onClick(task)}
      className={cn(
        "w-full text-left px-3 py-2 rounded-lg transition-colors",
        "hover:bg-accent",
        isFocused && "bg-accent",
        className
      )}
      aria-selected={isFocused}
      role="option"
    >
      <div className="flex items-center gap-2 text-sm">
        <Badge
          variant={task.status === "completed" ? "default" : "outline"}
          className={cn("text-xs", statusOption?.color)}
        >
          {statusOption?.label || task.status}
        </Badge>
        <span className="text-muted-foreground text-xs font-mono">
          {task.id.slice(0, 12)}...
        </span>
      </div>
      <div
        className="font-medium mt-1 text-sm line-clamp-2"
        dangerouslySetInnerHTML={{
          __html: highlights?.find((h) => h.field === "title")?.snippet ?? task.title,
        }}
      />
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
        <span>{relativeTime}</span>
        {task.durationMs !== undefined && task.durationMs !== null && (
          <>
            <span>·</span>
            <span>{Math.round(task.durationMs / 1000)}s</span>
          </>
        )}
      </div>
    </button>
  );
}

// ============================================================================
// Main TaskSearch Component
// ============================================================================

export interface TaskSearchProps {
  defaultFilters?: Partial<TaskSearchFilters>;
  placeholder?: string;
  autoFocus?: boolean;
  showFilters?: boolean;
  showDateFilter?: boolean;
  debounceMs?: number;
  className?: string;
  onFiltersChange?: (filters: TaskSearchFilters) => void;
  onResultSelect?: (task: Task) => void;
}

export function TaskSearch({
  defaultFilters,
  placeholder = "Search tasks...",
  autoFocus = false,
  showFilters = true,
  showDateFilter = true,
  debounceMs = 150,
  className,
  onFiltersChange,
  onResultSelect,
}: TaskSearchProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(autoFocus);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Filter state management
  const { filters, updateFilter, toggleStatus } = useSearchFilters(defaultFilters);

  // Search hook
  const { results, isSearching, resultCount, isEmpty } = useTaskSearch(filters, debounceMs);

  // Notify parent of filter changes
  useEffect(() => {
    onFiltersChange?.(filters);
  }, [filters, onFiltersChange]);

  // Handle date preset change
  const handleDatePresetChange = useCallback((preset: DateRangePreset) => {
    updateFilter("datePreset", preset);
    const range = getDateRangeFromPreset(preset);
    updateFilter("dateRange", range);
  }, [updateFilter]);

  // Handle result selection
  const handleResultSelect = useCallback((task: Task) => {
    onResultSelect?.(task);
    navigate(`/tasks/${task.id}`);
    setIsExpanded(false);
    setFocusedIndex(-1);
  }, [navigate, onResultSelect]);

  // Global keyboard shortcut (/) to focus search
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      // Only trigger "/" when not in an input field
      if (e.key === "/" && !isInteractiveElement(document.activeElement)) {
        e.preventDefault();
        inputRef.current?.focus();
        setIsExpanded(true);
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Keyboard navigation for results
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!isExpanded || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case "Enter":
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < results.length) {
          handleResultSelect(results[focusedIndex].task);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsExpanded(false);
        inputRef.current?.blur();
        setFocusedIndex(-1);
        break;
    }
  }, [isExpanded, results, focusedIndex, handleResultSelect]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset focused index when results change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [results]);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* Search Input */}
      <SearchInput
        value={filters.query}
        onChange={(value) => updateFilter("query", value)}
        placeholder={placeholder}
        isSearching={isSearching}
        isExpanded={isExpanded}
        inputRef={inputRef}
        onFocus={() => setIsExpanded(true)}
        onKeyDown={handleKeyDown}
      />

      {/* Expanded dropdown */}
      {isExpanded && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50">
          {/* Filter chips */}
          {showFilters && (
            <div className="px-3 border-b border-border">
              <SearchFiltersComponent
                filters={filters}
                onToggleStatus={toggleStatus}
                onChangeDatePreset={handleDatePresetChange}
                onToggleIncludeClosed={() => updateFilter("includeClosed", !filters.includeClosed)}
                onToggleIncludeArchived={() => updateFilter("includeArchived", !filters.includeArchived)}
                showDateFilter={showDateFilter}
              />
            </div>
          )}

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2" role="listbox">
            {/* Results header */}
            {filters.query.length >= 2 && (
              <div className="px-3 py-1 text-xs text-muted-foreground">
                {isSearching ? (
                  "Searching..."
                ) : (
                  `${resultCount} result${resultCount !== 1 ? "s" : ""}`
                )}
              </div>
            )}

            {/* Loading state */}
            {isSearching && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state */}
            {!isSearching && isEmpty && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                No tasks found for "{filters.query}"
              </div>
            )}

            {/* Search results */}
            {!isSearching && results.length > 0 && (
              <>
                {results.map((result, index) => (
                  <SearchResultItem
                    key={result.task.id}
                    result={result}
                    isFocused={index === focusedIndex}
                    onClick={handleResultSelect}
                  />
                ))}
              </>
            )}

            {/* Initial state (no query) */}
            {!isSearching && filters.query.length < 2 && results.length === 0 && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                Type at least 2 characters to search
              </div>
            )}
          </div>

          {/* Keyboard hints */}
          <div className="px-3 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <kbd className="px-1 bg-muted rounded">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1 bg-muted rounded">↵</kbd> Select
            </span>
            <span>
              <kbd className="px-1 bg-muted rounded">Esc</kbd> Close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TaskSearch;
