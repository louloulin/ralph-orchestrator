/**
 * RestartHistory Component
 *
 * Displays the restart history for a loop process in a timeline format.
 */

import type { RestartEvent, TerminationReason } from "@/types/process";
import { cn } from "@/lib/utils";

export interface RestartHistoryProps {
  /** List of restart events */
  events: RestartEvent[];
  /** Maximum number of events to show */
  limit?: number;
  /** Show compact view */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Human-readable labels for termination reasons.
 */
const REASON_LABELS: Record<TerminationReason, string> = {
  crash: "Crashed",
  health_check_failed: "Health Check Failed",
  manual: "Manual Restart",
  resource_limit: "Resource Limit",
  api_error: "API Error",
  timeout: "Timeout",
  unknown: "Unknown",
};

/**
 * Get color class for termination reason.
 */
function getReasonColor(reason: TerminationReason): string {
  switch (reason) {
    case "crash":
    case "health_check_failed":
    case "resource_limit":
    case "api_error":
      return "bg-red-500";
    case "manual":
      return "bg-blue-500";
    case "timeout":
      return "bg-yellow-500";
    default:
      return "bg-gray-500";
  }
}

/**
 * Format relative time.
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  } else {
    const days = Math.floor(diffSeconds / 86400);
    return `${days}d ago`;
  }
}

/**
 * Format previous uptime.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  } else {
    return `${Math.floor(seconds / 3600)}h`;
  }
}

/**
 * RestartHistory Component
 *
 * Timeline of restart events for a loop process.
 */
export function RestartHistory({
  events,
  limit,
  compact = false,
  className,
}: RestartHistoryProps) {
  const displayEvents = limit ? events.slice(-limit) : events;

  if (events.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground py-4 text-center", className)}>
        No restart history
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {!compact && (
        <h3 className="text-sm font-medium">
          Restart History ({events.length})
        </h3>
      )}
      <div className="relative">
        {/* Timeline line */}
        {!compact && (
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
        )}

        <div className="space-y-2">
          {displayEvents.map((event, index) => (
            <div
              key={`${event.timestamp}-${index}`}
              className={cn(
                "flex items-start gap-3",
                compact && "text-xs"
              )}
            >
              {/* Timeline dot */}
              <div
                className={cn(
                  "rounded-full mt-1 shrink-0",
                  getReasonColor(event.reason),
                  compact ? "w-2 h-2" : "w-3 h-3"
                )}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "font-medium",
                    compact ? "text-xs" : "text-sm"
                  )}>
                    {REASON_LABELS[event.reason]}
                  </span>
                  <span className="text-muted-foreground">
                    {formatRelativeTime(event.timestamp)}
                  </span>
                </div>
                {!compact && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Uptime: {formatUptime(event.previousUptime)} •
                    Backoff: {event.backoffSeconds}s
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface RestartHistoryCardProps {
  /** List of restart events */
  events: RestartEvent[];
  /** Maximum events to show */
  limit?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * RestartHistoryCard Component
 *
 * Card wrapper for restart history with title.
 */
export function RestartHistoryCard({
  events,
  limit = 10,
  className,
}: RestartHistoryCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h3 className="text-sm font-medium mb-3">
        Restart History
        <span className="text-muted-foreground ml-2 font-normal">
          {events.length} event{events.length !== 1 ? "s" : ""}
        </span>
      </h3>
      <RestartHistory events={events} limit={limit} />
    </div>
  );
}

export default RestartHistory;
