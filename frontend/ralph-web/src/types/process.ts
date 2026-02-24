/**
 * Process Types for 24/7 Platform Daemon System
 *
 * Frontend types matching backend types in types/process.ts
 * Used by monitoring components for process management.
 */

/**
 * Loop status enum representing the lifecycle states of a loop process.
 */
export type LoopStatus =
  | "starting"
  | "running"
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "restarting"
  | "stopped"
  | "crashed";

/**
 * Configuration for a loop process.
 */
export interface LoopConfig {
  maxIterations?: number;
  prompt?: string;
  backend?: string;
  hatCollection?: string;
  cwd?: string;
  env?: Record<string, string>;
  memoriesEnabled?: boolean;
  tasksEnabled?: boolean;
}

/**
 * Represents a loop process being supervised by the daemon.
 */
export interface LoopProcess {
  id: string;
  pid: number;
  status: LoopStatus;
  startedAt: Date;
  lastHeartbeat: Date;
  restartCount: number;
  config: LoopConfig;
}

/**
 * Severity level for health issues.
 */
export type HealthIssueSeverity = "warning" | "critical";

/**
 * Represents a detected health issue in a loop process.
 */
export interface HealthIssue {
  severity: HealthIssueSeverity;
  type: string;
  message: string;
  firstSeen: Date;
  count: number;
}

/**
 * Health check status.
 */
export type HealthCheckStatus = "healthy" | "degraded" | "unhealthy";

/**
 * Metrics collected during a health check.
 */
export interface HealthMetrics {
  cpuPercent: number;
  memoryMB: number;
  uptimeSeconds: number;
  iterationCount: number;
  lastActivityAt: Date;
}

/**
 * Result of a health check on a loop process.
 */
export interface HealthCheck {
  loopId: string;
  timestamp: Date;
  status: HealthCheckStatus;
  metrics: HealthMetrics;
  issues: HealthIssue[];
}

/**
 * Reason for process termination.
 */
export type TerminationReason =
  | "crash"
  | "health_check_failed"
  | "manual"
  | "resource_limit"
  | "api_error"
  | "timeout"
  | "unknown";

/**
 * Record of a restart event.
 */
export interface RestartEvent {
  loopId: string;
  timestamp: Date;
  reason: TerminationReason;
  previousUptime: number;
  backoffSeconds: number;
}

/**
 * Supervisor statistics.
 */
export interface SupervisorStats {
  totalProcesses: number;
  runningProcesses: number;
  stoppedProcesses: number;
  crashedProcesses: number;
  maxConcurrentLoops: number;
  isMonitoring: boolean;
}

/**
 * Status color mapping for UI display.
 */
export const STATUS_COLORS: Record<LoopStatus, string> = {
  starting: "bg-blue-500",
  running: "bg-green-500",
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  restarting: "bg-orange-500",
  stopped: "bg-gray-500",
  crashed: "bg-red-700",
};

/**
 * Health status color mapping for UI display.
 */
export const HEALTH_STATUS_COLORS: Record<HealthCheckStatus, string> = {
  healthy: "text-green-500",
  degraded: "text-yellow-500",
  unhealthy: "text-red-500",
};

/**
 * Human-readable labels for loop status.
 */
export const STATUS_LABELS: Record<LoopStatus, string> = {
  starting: "Starting",
  running: "Running",
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  restarting: "Restarting",
  stopped: "Stopped",
  crashed: "Crashed",
};
