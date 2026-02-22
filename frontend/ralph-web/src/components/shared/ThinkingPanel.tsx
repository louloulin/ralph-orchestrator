/**
 * ThinkingPanel Component
 *
 * A collapsible UI component that displays an AI agent's reasoning process
 * in real-time, inspired by Windsurf IDE's Cascade panel. Provides transparency
 * into how the agent approaches tasks.
 *
 * @see .ralph/specs/web-dashboard/thinking-panel.spec.md
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Search,
  Clock,
  X,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useThinkingStore } from "@/stores/thinkingStore";
import type {
  ThinkingStep,
  ThinkingStepType,
} from "@/types/thinking";
import {
  THINKING_STEP_TYPES,
  THINKING_TYPE_BORDER_COLORS,
  THINKING_TYPE_LABELS,
  THINKING_TYPE_BADGE_VARIANTS as badgeVariants,
} from "@/types/thinking";

/**
 * Format a timestamp to HH:MM:SS.mmm
 */
function formatTimestamp(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  const ms = date.getMilliseconds().toString().padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * Format duration in seconds with 1 decimal place
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
}

/**
 * Props for ThinkingPanel component
 */
export interface ThinkingPanelProps {
  /** Task ID to associate with thinking session */
  taskId: string;
  /** Initial collapsed state */
  defaultCollapsed?: boolean;
  /** Maximum height before scrolling */
  maxHeight?: string;
  /** Show search input */
  showSearch?: boolean;
  /** Show timestamps */
  showTimestamps?: boolean;
  /** Show step type badges */
  showTypeBadges?: boolean;
  /** Filter to specific step types */
  filterTypes?: ThinkingStepType[];
  /** Additional CSS classes */
  className?: string;
  /** Callback when step is clicked */
  onStepClick?: (step: ThinkingStep) => void;
}

/**
 * Props for ThinkingStepItem sub-component
 */
interface ThinkingStepItemProps {
  step: ThinkingStep;
  showTimestamp: boolean;
  showBadge: boolean;
  onClick?: (step: ThinkingStep) => void;
}

/**
 * Individual thinking step display
 */
function ThinkingStepItem({
  step,
  showTimestamp,
  showBadge,
  onClick,
}: ThinkingStepItemProps) {
  return (
    <div
      className={cn(
        "border-l-2 pl-4 py-2 cursor-pointer hover:bg-muted/30 transition-colors",
        THINKING_TYPE_BORDER_COLORS[step.type]
      )}
      onClick={() => onClick?.(step)}
      data-type={step.type}
      role="article"
      aria-label={`${THINKING_TYPE_LABELS[step.type]} step at ${formatTimestamp(step.timestamp)}`}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {showTimestamp && (
          <span className="text-xs font-mono text-muted-foreground">
            {formatTimestamp(step.timestamp)}
          </span>
        )}
        {showBadge && (
          <Badge variant={badgeVariants[step.type]}>
            {THINKING_TYPE_LABELS[step.type].toUpperCase()}
          </Badge>
        )}
        {step.duration !== undefined && step.duration > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(step.duration)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="text-sm whitespace-pre-wrap break-words">
        {step.content}
      </div>

      {/* Metadata */}
      {step.metadata && (
        <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
          {step.metadata.hat && (
            <span className="flex items-center gap-1">
              <span className="font-medium">Hat:</span> {step.metadata.hat}
            </span>
          )}
          {step.metadata.iteration !== undefined && (
            <span className="flex items-center gap-1">
              <span className="font-medium">Iteration:</span> {step.metadata.iteration}
            </span>
          )}
          {step.metadata.tokens !== undefined && step.metadata.tokens > 0 && (
            <span className="flex items-center gap-1">
              <span className="font-medium">Tokens:</span>{" "}
              {step.metadata.tokens.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Props for ThinkingSearchBar sub-component
 */
interface ThinkingSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  typeFilter: ThinkingStepType | "";
  onTypeFilterChange: (type: ThinkingStepType | "") => void;
}

/**
 * Search bar with type filter dropdown
 */
function ThinkingSearchBar({
  value,
  onChange,
  typeFilter,
  onTypeFilterChange,
}: ThinkingSearchBarProps) {
  return (
    <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/30">
      {/* Search input */}
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search thoughts..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "w-full pl-8 pr-8 py-1.5 text-sm rounded-md",
            "bg-background border border-input",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            "placeholder:text-muted-foreground"
          )}
        />
        {value && (
          <button
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={typeFilter}
          onChange={(e) =>
            onTypeFilterChange(e.target.value as ThinkingStepType | "")
          }
          className={cn(
            "px-2 py-1.5 text-sm rounded-md",
            "bg-background border border-input",
            "focus:outline-none focus:ring-2 focus:ring-ring"
          )}
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          {THINKING_STEP_TYPES.map((type) => (
            <option key={type} value={type}>
              {THINKING_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * ThinkingPanel Component
 *
 * Displays AI agent reasoning in a collapsible, searchable panel.
 */
export function ThinkingPanel({
  taskId,
  defaultCollapsed = false,
  maxHeight = "400px",
  showSearch = true,
  showTimestamps = true,
  showTypeBadges = true,
  filterTypes,
  className,
  onStepClick,
}: ThinkingPanelProps) {
  // State
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ThinkingStepType | "">("");

  // Store hooks
  const steps = useThinkingStore((state) => state.getSteps(taskId));
  const sessionDuration = useThinkingStore((state) =>
    state.getSessionDuration(taskId)
  );
  const totalTokens = useThinkingStore((state) => state.getTotalTokens(taskId));
  const hasSession = useThinkingStore((state) => state.hasSession(taskId));

  // Ref for auto-scrolling
  const stepsContainerRef = useRef<HTMLDivElement>(null);

  // Filter and search logic
  const filteredSteps = useMemo(() => {
    let result = steps;

    // Apply prop-level type filter
    if (filterTypes && filterTypes.length > 0) {
      result = result.filter((s) => filterTypes.includes(s.type));
    }

    // Apply UI type filter
    if (typeFilter) {
      result = result.filter((s) => s.type === typeFilter);
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((s) =>
        s.content.toLowerCase().includes(query)
      );
    }

    return result;
  }, [steps, filterTypes, typeFilter, searchQuery]);

  // Auto-scroll to bottom on new steps
  useEffect(() => {
    if (stepsContainerRef.current && !collapsed) {
      stepsContainerRef.current.scrollTop =
        stepsContainerRef.current.scrollHeight;
    }
  }, [filteredSteps.length, collapsed]);

  // Don't render if no session
  if (!hasSession) {
    return null;
  }

  const stepCount = steps.length;
  const filteredCount = filteredSteps.length;
  const duration = sessionDuration ? formatDuration(sessionDuration) : null;

  return (
    <div
      className={cn(
        "border border-border rounded-lg overflow-hidden",
        className
      )}
      aria-label="Agent thinking panel"
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-2",
          "bg-muted/50 hover:bg-muted/70 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset"
        )}
        aria-expanded={!collapsed}
        aria-controls="thinking-panel-content"
      >
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <span className="font-medium">Agent Thinking</span>
          {stepCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {stepCount} step{stepCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {duration && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {duration}
            </span>
          )}
          {collapsed ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div id="thinking-panel-content">
          {/* Search bar */}
          {showSearch && (
            <ThinkingSearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              typeFilter={typeFilter}
              onTypeFilterChange={setTypeFilter}
            />
          )}

          {/* Steps container */}
          <div
            ref={stepsContainerRef}
            className="overflow-y-auto p-4 space-y-4"
            style={{ maxHeight }}
            aria-live="polite"
            aria-relevant="additions"
          >
            {filteredSteps.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {searchQuery || typeFilter
                  ? "No steps match your search"
                  : "No thinking steps recorded yet"}
              </div>
            ) : (
              filteredSteps.map((step) => (
                <ThinkingStepItem
                  key={step.id}
                  step={step}
                  showTimestamp={showTimestamps}
                  showBadge={showTypeBadges}
                  onClick={onStepClick}
                />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
            <span>
              {filteredCount !== stepCount
                ? `${filteredCount} of ${stepCount} steps`
                : `${stepCount} step${stepCount !== 1 ? "s" : ""}`}
              {duration && ` • ${duration}`}
              {totalTokens > 0 && ` • ${totalTokens.toLocaleString()} tokens`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThinkingPanel;
