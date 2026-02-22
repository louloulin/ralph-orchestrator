/**
 * ActivityItem Component
 *
 * Displays a single activity event in the activity timeline.
 */

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface ActivityItemProps {
  /** Activity title/description */
  title: string;
  /** Timestamp of the activity */
  timestamp: string | Date;
  /** Optional icon */
  icon?: LucideIcon;
  /** Status indicator color */
  status?: "success" | "warning" | "error" | "info" | "neutral";
  /** Optional secondary text */
  description?: string;
  /** Additional CSS classes */
  className?: string;
}

const statusColors = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-muted-foreground",
};

export function ActivityItem({
  title,
  timestamp,
  icon: Icon,
  status = "neutral",
  description,
  className,
}: ActivityItemProps) {
  const formattedTime = typeof timestamp === "string"
    ? new Date(timestamp).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : timestamp.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className={cn("flex items-start gap-3 py-2", className)}>
      {/* Status indicator dot */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "h-2 w-2 rounded-full mt-1.5",
            statusColors[status]
          )}
        />
        <div className="w-px h-full bg-border min-h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 space-y-0.5 min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
          <p className="text-sm font-medium truncate">{title}</p>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        )}
      </div>

      {/* Timestamp */}
      <span className="text-xs text-muted-foreground flex-shrink-0">
        {formattedTime}
      </span>
    </div>
  );
}

/**
 * ActivityTimeline Component
 *
 * Displays a list of recent activities in chronological order.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface Activity {
  id: string;
  title: string;
  timestamp: string | Date;
  icon?: LucideIcon;
  status?: "success" | "warning" | "error" | "info" | "neutral";
  description?: string;
}

export interface ActivityTimelineProps {
  /** List of activities to display */
  activities: Activity[];
  /** Card title */
  title?: string;
  /** Card description */
  description?: string;
  /** Maximum number of items to show */
  maxItems?: number;
  /** Show "View all" link */
  onViewAll?: () => void;
  /** Empty state message */
  emptyMessage?: string;
}

export function ActivityTimeline({
  activities,
  title = "Recent Activity",
  description,
  maxItems = 5,
  onViewAll,
  emptyMessage = "No recent activity",
}: ActivityTimelineProps) {
  const displayedActivities = activities.slice(0, maxItems);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {onViewAll && activities.length > maxItems && (
          <button
            onClick={onViewAll}
            className="text-xs text-primary hover:underline"
          >
            View all
          </button>
        )}
      </CardHeader>
      <CardContent>
        {displayedActivities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-0">
            {displayedActivities.map((activity, index) => (
              <ActivityItem
                key={activity.id}
                {...activity}
                className={index === displayedActivities.length - 1 ? "pb-0" : undefined}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
