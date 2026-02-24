/**
 * HealthIndicator Component
 *
 * Visual health indicator that displays the current health status
 * of a loop process with color coding and optional pulse animation.
 */

import { cn } from "@/lib/utils";
import type { HealthCheckStatus, LoopStatus } from "@/types/process";
import { STATUS_COLORS, STATUS_LABELS } from "@/types/process";

export interface HealthIndicatorProps {
  /** Current health or loop status */
  status: HealthCheckStatus | LoopStatus;
  /** Show pulsing animation for active states */
  pulse?: boolean;
  /** Show label alongside indicator */
  showLabel?: boolean;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
}

const SIZE_CLASSES = {
  sm: "w-2 h-2",
  md: "w-3 h-3",
  lg: "w-4 h-4",
};

/**
 * Check if status is a health check status.
 */
function isHealthCheckStatus(status: string): status is HealthCheckStatus {
  return ["healthy", "degraded", "unhealthy"].includes(status);
}

/**
 * Get color class for status.
 */
function getStatusColor(status: HealthCheckStatus | LoopStatus): string {
  if (isHealthCheckStatus(status)) {
    const colorMap: Record<HealthCheckStatus, string> = {
      healthy: "bg-green-500",
      degraded: "bg-yellow-500",
      unhealthy: "bg-red-500",
    };
    return colorMap[status];
  }
  return STATUS_COLORS[status as LoopStatus];
}

/**
 * HealthIndicator Component
 *
 * Displays a colored dot indicating health status with optional label.
 */
export function HealthIndicator({
  status,
  pulse = false,
  showLabel = false,
  size = "md",
  className,
}: HealthIndicatorProps) {
  const colorClass = getStatusColor(status);
  const sizeClass = SIZE_CLASSES[size];

  // Show pulse for running/healthy states
  const shouldPulse = pulse && ["running", "healthy", "starting"].includes(status);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="relative flex">
        <span
          className={cn(
            "rounded-full",
            sizeClass,
            colorClass,
            shouldPulse && "animate-pulse"
          )}
        />
        {shouldPulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              colorClass,
              "animate-ping"
            )}
          />
        )}
      </span>
      {showLabel && (
        <span className="text-sm text-muted-foreground">
          {STATUS_LABELS[status as LoopStatus] || status}
        </span>
      )}
    </div>
  );
}

export interface HealthBadgeProps {
  /** Current health check status */
  status: HealthCheckStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * HealthBadge Component
 *
 * Displays a badge with health status text and color coding.
 */
export function HealthBadge({ status, className }: HealthBadgeProps) {
  const colorClasses: Record<HealthCheckStatus, string> = {
    healthy: "bg-green-500/10 text-green-500 border-green-500/20",
    degraded: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    unhealthy: "bg-red-500/10 text-red-500 border-red-500/20",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold",
        colorClasses[status],
        className
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default HealthIndicator;
