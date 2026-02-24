/**
 * ProcessList Component
 *
 * Displays a list of all loop processes with their status cards.
 * Includes filtering and sorting capabilities.
 */

import * as React from "react";
import { ProcessStatusCard } from "./ProcessStatusCard";
import type { LoopProcess, HealthCheck, LoopStatus } from "@/types/process";
import { STATUS_LABELS } from "@/types/process";
import { cn } from "@/lib/utils";

export interface ProcessListProps {
  /** List of loop processes */
  processes: LoopProcess[];
  /** Map of loop IDs to their health checks */
  healthChecks?: Record<string, HealthCheck>;
  /** Handler for stop button click */
  onStop?: (loopId: string) => void;
  /** Handler for restart button click */
  onRestart?: (loopId: string) => void;
  /** Handler for view details click */
  onViewDetails?: (loopId: string) => void;
  /** Whether an action is in progress */
  isLoading?: boolean;
  /** Filter by status */
  statusFilter?: LoopStatus | "all";
  /** Additional CSS classes */
  className?: string;
}

/**
 * ProcessList Component
 *
 * Displays a grid of process status cards with optional filtering.
 */
export function ProcessList({
  processes,
  healthChecks = {},
  onStop,
  onRestart,
  onViewDetails,
  isLoading = false,
  statusFilter = "all",
  className,
}: ProcessListProps) {
  // Filter processes by status
  const filteredProcesses = React.useMemo(() => {
    if (statusFilter === "all") {
      return processes;
    }
    return processes.filter((p) => p.status === statusFilter);
  }, [processes, statusFilter]);

  // Sort processes: running first, then by name
  const sortedProcesses = React.useMemo(() => {
    return [...filteredProcesses].sort((a, b) => {
      // Running/healthy processes first
      const aRunning = ["running", "healthy", "degraded"].includes(a.status);
      const bRunning = ["running", "healthy", "degraded"].includes(b.status);
      if (aRunning && !bRunning) return -1;
      if (!aRunning && bRunning) return 1;
      // Then by name
      return a.id.localeCompare(b.id);
    });
  }, [filteredProcesses]);

  if (processes.length === 0) {
    return (
      <div className={cn("text-center py-12 text-muted-foreground", className)}>
        <p>No loop processes found.</p>
        <p className="text-sm mt-1">Start a loop to see it here.</p>
      </div>
    );
  }

  if (filteredProcesses.length === 0 && statusFilter !== "all") {
    return (
      <div className={cn("text-center py-12 text-muted-foreground", className)}>
        <p>No processes with status "{STATUS_LABELS[statusFilter as LoopStatus]}".</p>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>
      {sortedProcesses.map((process) => (
        <ProcessStatusCard
          key={process.id}
          process={process}
          healthCheck={healthChecks[process.id]}
          onStop={onStop}
          onRestart={onRestart}
          onViewDetails={onViewDetails}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}

export interface ProcessListHeaderProps {
  /** Total number of processes */
  total: number;
  /** Current filter */
  statusFilter: LoopStatus | "all";
  /** Filter change handler */
  onStatusFilterChange: (status: LoopStatus | "all") => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ProcessListHeader Component
 *
 * Header with count and status filter buttons.
 */
export function ProcessListHeader({
  total,
  statusFilter,
  onStatusFilterChange,
  className,
}: ProcessListHeaderProps) {
  const statusOptions: Array<LoopStatus | "all"> = [
    "all",
    "running",
    "healthy",
    "degraded",
    "unhealthy",
    "stopped",
    "crashed",
  ];

  return (
    <div className={cn("flex items-center justify-between", className)}>
      <h2 className="text-lg font-semibold">
        Processes <span className="text-muted-foreground">({total})</span>
      </h2>
      <div className="flex gap-1 flex-wrap">
        {statusOptions.map((status) => (
          <button
            key={status}
            onClick={() => onStatusFilterChange(status)}
            className={cn(
              "px-2 py-1 text-xs rounded-md transition-colors",
              statusFilter === status
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            {status === "all" ? "All" : STATUS_LABELS[status]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ProcessList;
