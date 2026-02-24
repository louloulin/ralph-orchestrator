/**
 * ProcessStatusCard Component
 *
 * Displays the status of a single loop process including:
 * - Process ID and loop ID
 * - Current status with health indicator
 * - Uptime and restart count
 * - Quick action buttons
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HealthIndicator, HealthBadge } from "./HealthIndicator";
import type { LoopProcess, HealthCheck } from "@/types/process";
import { STATUS_LABELS } from "@/types/process";
import { cn } from "@/lib/utils";

export interface ProcessStatusCardProps {
  /** The loop process to display */
  process: LoopProcess;
  /** Optional health check data */
  healthCheck?: HealthCheck;
  /** Handler for stop button click */
  onStop?: (loopId: string) => void;
  /** Handler for restart button click */
  onRestart?: (loopId: string) => void;
  /** Handler for view details click */
  onViewDetails?: (loopId: string) => void;
  /** Whether an action is in progress */
  isLoading?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format uptime in human-readable format.
 */
function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Format a date relative to now.
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return "just now";
  } else if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)}m ago`;
  } else if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)}h ago`;
  } else {
    return `${Math.floor(diffSeconds / 86400)}d ago`;
  }
}

/**
 * ProcessStatusCard Component
 *
 * Card displaying the status and quick actions for a loop process.
 */
export function ProcessStatusCard({
  process,
  healthCheck,
  onStop,
  onRestart,
  onViewDetails,
  isLoading = false,
  className,
}: ProcessStatusCardProps) {
  const uptime = Math.floor(
    (Date.now() - new Date(process.startedAt).getTime()) / 1000
  );

  const isRunning = ["running", "healthy", "degraded", "starting", "restarting"].includes(
    process.status
  );

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HealthIndicator status={process.status} pulse={isRunning} />
            <span className="font-mono text-xs">{process.id}</span>
          </CardTitle>
          {healthCheck && <HealthBadge status={healthCheck.status} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Process info grid */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">PID</span>
            <p className="font-mono">{process.pid || "-"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Status</span>
            <p>{STATUS_LABELS[process.status]}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Uptime</span>
            <p>{formatUptime(uptime)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Restarts</span>
            <p className={process.restartCount > 0 ? "text-yellow-500" : ""}>
              {process.restartCount}
            </p>
          </div>
        </div>

        {/* Health metrics if available */}
        {healthCheck && (
          <div className="border-t border-border pt-3 space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Health Metrics
            </h4>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">CPU</span>
                <p className={cn(
                  healthCheck.metrics.cpuPercent > 80 && "text-yellow-500",
                  healthCheck.metrics.cpuPercent > 90 && "text-red-500"
                )}>
                  {healthCheck.metrics.cpuPercent.toFixed(1)}%
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Memory</span>
                <p className={cn(
                  healthCheck.metrics.memoryMB > 1024 && "text-yellow-500",
                  healthCheck.metrics.memoryMB > 2048 && "text-red-500"
                )}>
                  {healthCheck.metrics.memoryMB.toFixed(0)} MB
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Iterations</span>
                <p>{healthCheck.metrics.iterationCount}</p>
              </div>
            </div>

            {/* Health issues */}
            {healthCheck.issues.length > 0 && (
              <div className="mt-2 space-y-1">
                {healthCheck.issues.map((issue, index) => (
                  <div
                    key={index}
                    className={cn(
                      "text-xs px-2 py-1 rounded",
                      issue.severity === "critical"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-yellow-500/10 text-yellow-500"
                    )}
                  >
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Last heartbeat */}
        <div className="text-xs text-muted-foreground">
          Last heartbeat: {formatRelativeTime(process.lastHeartbeat)}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails?.(process.id)}
            disabled={isLoading}
          >
            Details
          </Button>
          {isRunning && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRestart?.(process.id)}
                disabled={isLoading}
              >
                Restart
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onStop?.(process.id)}
                disabled={isLoading}
              >
                Stop
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ProcessStatusCard;
