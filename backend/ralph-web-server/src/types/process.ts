/**
 * Process Types for 24/7 Platform Daemon System
 *
 * These types support the Phase 4 24/7 platform capabilities:
 * - LoopSupervisor: spawns and monitors loop processes
 * - HealthMonitor: periodic heartbeat checks, resource tracking
 * - RestartManager: exponential backoff, circuit breaker
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

/**
 * Loop status enum representing the lifecycle states of a loop process.
 */
export type LoopStatus =
  | "starting" // Process is being spawned
  | "running" // Normal operation
  | "healthy" // Confirmed healthy via heartbeat
  | "degraded" // Functioning but with issues
  | "unhealthy" // Failed health check
  | "restarting" // Being restarted
  | "stopped" // Intentionally stopped
  | "crashed"; // Unexpected termination

/**
 * Configuration for a loop process.
 */
export interface LoopConfig {
  /** Maximum number of iterations */
  maxIterations?: number;
  /** Prompt/template to use */
  prompt?: string;
  /** Backend to use (claude, kiro, gemini, etc.) */
  backend?: string;
  /** Hat collection to use */
  hatCollection?: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Enable memories */
  memoriesEnabled?: boolean;
  /** Enable tasks */
  tasksEnabled?: boolean;
}

/**
 * Represents a loop process being supervised by the daemon.
 */
export interface LoopProcess {
  /** Loop identifier */
  id: string;
  /** Process ID */
  pid: number;
  /** Current status */
  status: LoopStatus;
  /** When the process was started */
  startedAt: Date;
  /** Last successful health check */
  lastHeartbeat: Date;
  /** Number of restarts since initial start */
  restartCount: number;
  /** Loop configuration */
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
  /** Severity level */
  severity: HealthIssueSeverity;
  /** Issue type identifier (e.g., "high_memory", "no_progress", "api_error") */
  type: string;
  /** Human-readable description */
  message: string;
  /** When this issue was first detected */
  firstSeen: Date;
  /** Number of times this issue has occurred */
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
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage in megabytes */
  memoryMB: number;
  /** Process uptime in seconds */
  uptimeSeconds: number;
  /** Number of completed iterations */
  iterationCount: number;
  /** When the last activity was recorded */
  lastActivityAt: Date;
}

/**
 * Result of a health check on a loop process.
 */
export interface HealthCheck {
  /** Loop identifier */
  loopId: string;
  /** When this check was performed */
  timestamp: Date;
  /** Overall health status */
  status: HealthCheckStatus;
  /** Collected metrics */
  metrics: HealthMetrics;
  /** Detected issues */
  issues: HealthIssue[];
}

/**
 * Configuration for restart behavior.
 */
export interface RestartPolicy {
  /** Maximum restarts allowed per time window */
  maxRestarts: number;
  /** Time window for restart counting (in seconds) */
  windowSeconds: number;
  /** Base backoff delay (in seconds) */
  backoffBase: number;
  /** Maximum backoff delay (in seconds) */
  backoffMax: number;
  /** Backoff multiplier for exponential delay */
  backoffMultiplier: number;
}

/**
 * Reason for process termination.
 */
export type TerminationReason =
  | "crash" // Unexpected crash
  | "health_check_failed" // Failed health check
  | "manual" // User-initiated stop
  | "resource_limit" // Exceeded resource limits
  | "api_error" // Backend API error
  | "timeout" // Operation timeout
  | "unknown"; // Unknown reason

/**
 * Record of a restart event.
 */
export interface RestartEvent {
  /** Loop identifier */
  loopId: string;
  /** When the restart occurred */
  timestamp: Date;
  /** Reason for the restart */
  reason: TerminationReason;
  /** How long the process was running before restart (in seconds) */
  previousUptime: number;
  /** Backoff delay applied before restart (in seconds) */
  backoffSeconds: number;
}

/**
 * Heartbeat data written by the loop process.
 * The loop writes this to `.ralph/heartbeat.json` periodically.
 */
export interface LoopHeartbeat {
  /** Loop identifier */
  loopId: string;
  /** Process ID */
  pid: number;
  /** When this heartbeat was written */
  timestamp: Date;
  /** Current iteration number */
  iteration: number;
  /** Currently active hat (if any) */
  hat: string | null;
  /** Current loop status */
  status: LoopStatus;
}

/**
 * Default restart policy values.
 */
export const DEFAULT_RESTART_POLICY: RestartPolicy = {
  maxRestarts: 5,
  windowSeconds: 3600, // 1 hour
  backoffBase: 5, // 5 seconds
  backoffMax: 300, // 5 minutes
  backoffMultiplier: 2,
};
