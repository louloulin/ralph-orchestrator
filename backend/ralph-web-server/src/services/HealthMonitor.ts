/**
 * HealthMonitor Service
 *
 * Monitors the health of loop processes through:
 * - Periodic heartbeat checks
 * - Resource usage tracking (CPU, memory)
 * - Stuck detection (no progress timeout)
 * - Backend API health checks
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import type {
  HealthCheck,
  HealthCheckStatus,
  HealthIssue,
  HealthMetrics,
  LoopHeartbeat,
  LoopProcess,
  LoopStatus,
} from "../types/process.js";

/**
 * Configuration for the health monitor.
 */
export interface HealthMonitorConfig {
  /** Interval between health checks (in milliseconds) */
  checkIntervalMs: number;
  /** Maximum time without heartbeat before marking as unhealthy (in milliseconds) */
  heartbeatTimeoutMs: number;
  /** Maximum time without progress before marking as stuck (in milliseconds) */
  progressTimeoutMs: number;
  /** CPU usage threshold for warning (percentage) */
  cpuWarningThreshold: number;
  /** CPU usage threshold for critical (percentage) */
  cpuCriticalThreshold: number;
  /** Memory usage threshold for warning (in MB) */
  memoryWarningThresholdMB: number;
  /** Memory usage threshold for critical (in MB) */
  memoryCriticalThresholdMB: number;
  /** Path to the heartbeat file */
  heartbeatFilePath: string;
}

/**
 * Default health monitor configuration.
 */
export const DEFAULT_HEALTH_MONITOR_CONFIG: HealthMonitorConfig = {
  checkIntervalMs: 30_000, // 30 seconds
  heartbeatTimeoutMs: 90_000, // 90 seconds (3x check interval)
  progressTimeoutMs: 1_800_000, // 30 minutes
  cpuWarningThreshold: 70,
  cpuCriticalThreshold: 90,
  memoryWarningThresholdMB: 1024, // 1 GB
  memoryCriticalThresholdMB: 2048, // 2 GB
  heartbeatFilePath: ".ralph/heartbeat.json",
};

/**
 * Internal tracking for health issues.
 */
interface IssueTracker {
  issue: HealthIssue;
  lastSeen: Date;
}

/**
 * HealthMonitor Service
 *
 * Responsible for monitoring loop process health and detecting issues.
 */
export class HealthMonitor {
  private config: HealthMonitorConfig;
  private issueTrackers: Map<string, Map<string, IssueTracker>> = new Map();
  private checkInterval: Timer | null = null;
  private onHealthChange:
    | ((loopId: string, check: HealthCheck) => void)
    | null = null;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.config = { ...DEFAULT_HEALTH_MONITOR_CONFIG, ...config };
  }

  /**
   * Set callback for health status changes.
   */
  setOnHealthChange(callback: (loopId: string, check: HealthCheck) => void): void {
    this.onHealthChange = callback;
  }

  /**
   * Start periodic health monitoring.
   */
  startMonitoring(
    getProcesses: () => LoopProcess[],
    getHeartbeat: (loopId: string) => LoopHeartbeat | null | Promise<LoopHeartbeat | null>,
    getProcessMetrics: (pid: number) => { cpuPercent: number; memoryMB: number } | null
  ): void {
    if (this.checkInterval) {
      this.stopMonitoring();
    }

    this.checkInterval = setInterval(async () => {
      const processes = getProcesses();
      for (const process of processes) {
        if (process.status === "stopped" || process.status === "crashed") {
          continue;
        }

        try {
          const heartbeat = await Promise.resolve(getHeartbeat(process.id));
          const metrics = getProcessMetrics(process.pid);
          const check = this.performHealthCheck(process, heartbeat, metrics);

          if (this.onHealthChange) {
            this.onHealthChange(process.id, check);
          }
        } catch (error) {
          // Log error but continue monitoring other processes
          console.error(`[HealthMonitor] Error checking ${process.id}:`, error);
        }
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop periodic health monitoring.
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Perform a health check on a loop process.
   */
  performHealthCheck(
    process: LoopProcess,
    heartbeat: LoopHeartbeat | null,
    systemMetrics: { cpuPercent: number; memoryMB: number } | null
  ): HealthCheck {
    const now = new Date();
    const issues: HealthIssue[] = [];

    // Calculate uptime
    const uptimeSeconds = Math.floor(
      (now.getTime() - process.startedAt.getTime()) / 1000
    );

    // Get last activity time
    const lastActivityAt = heartbeat?.timestamp ?? process.lastHeartbeat;

    // Build metrics
    const metrics: HealthMetrics = {
      cpuPercent: systemMetrics?.cpuPercent ?? 0,
      memoryMB: systemMetrics?.memoryMB ?? 0,
      uptimeSeconds,
      iterationCount: heartbeat?.iteration ?? 0,
      lastActivityAt,
    };

    // Check heartbeat
    if (!heartbeat) {
      this.addIssue(issues, process.id, {
        severity: "critical",
        type: "missing_heartbeat",
        message: "No heartbeat file found. Process may not be running correctly.",
        firstSeen: now,
        count: 1,
      });
    } else {
      // Check for stale heartbeat
      const heartbeatAge = now.getTime() - new Date(heartbeat.timestamp).getTime();
      if (heartbeatAge > this.config.heartbeatTimeoutMs) {
        this.addIssue(issues, process.id, {
          severity: "critical",
          type: "stale_heartbeat",
          message: `Heartbeat is ${Math.floor(heartbeatAge / 1000)}s old. Process may be stuck or dead.`,
          firstSeen: now,
          count: 1,
        });
      }

      // Check for no progress
      const activityAge = now.getTime() - new Date(lastActivityAt).getTime();
      if (activityAge > this.config.progressTimeoutMs) {
        this.addIssue(issues, process.id, {
          severity: "warning",
          type: "no_progress",
          message: `No activity for ${Math.floor(activityAge / 60000)} minutes. Process may be stuck.`,
          firstSeen: now,
          count: 1,
        });
      }

      // Verify PID matches
      if (heartbeat.pid !== process.pid) {
        this.addIssue(issues, process.id, {
          severity: "critical",
          type: "pid_mismatch",
          message: `Heartbeat PID (${heartbeat.pid}) does not match expected PID (${process.pid}).`,
          firstSeen: now,
          count: 1,
        });
      }
    }

    // Check system metrics
    if (systemMetrics) {
      // CPU check
      if (systemMetrics.cpuPercent >= this.config.cpuCriticalThreshold) {
        this.addIssue(issues, process.id, {
          severity: "critical",
          type: "high_cpu",
          message: `CPU usage is ${systemMetrics.cpuPercent.toFixed(1)}%, which exceeds the critical threshold of ${this.config.cpuCriticalThreshold}%.`,
          firstSeen: now,
          count: 1,
        });
      } else if (systemMetrics.cpuPercent >= this.config.cpuWarningThreshold) {
        this.addIssue(issues, process.id, {
          severity: "warning",
          type: "high_cpu",
          message: `CPU usage is ${systemMetrics.cpuPercent.toFixed(1)}%, which exceeds the warning threshold of ${this.config.cpuWarningThreshold}%.`,
          firstSeen: now,
          count: 1,
        });
      }

      // Memory check
      if (systemMetrics.memoryMB >= this.config.memoryCriticalThresholdMB) {
        this.addIssue(issues, process.id, {
          severity: "critical",
          type: "high_memory",
          message: `Memory usage is ${systemMetrics.memoryMB.toFixed(0)} MB, which exceeds the critical threshold of ${this.config.memoryCriticalThresholdMB} MB.`,
          firstSeen: now,
          count: 1,
        });
      } else if (systemMetrics.memoryMB >= this.config.memoryWarningThresholdMB) {
        this.addIssue(issues, process.id, {
          severity: "warning",
          type: "high_memory",
          message: `Memory usage is ${systemMetrics.memoryMB.toFixed(0)} MB, which exceeds the warning threshold of ${this.config.memoryWarningThresholdMB} MB.`,
          firstSeen: now,
          count: 1,
        });
      }
    }

    // Check restart count
    if (process.restartCount > 0) {
      this.addIssue(issues, process.id, {
        severity: "warning",
        type: "restarts",
        message: `Process has been restarted ${process.restartCount} time(s).`,
        firstSeen: now,
        count: process.restartCount,
      });
    }

    // Determine overall status
    const status = this.calculateStatus(issues);

    return {
      loopId: process.id,
      timestamp: now,
      status,
      metrics,
      issues,
    };
  }

  /**
   * Determine if a process should be restarted based on health check.
   */
  shouldRestart(healthCheck: HealthCheck): boolean {
    // Restart if critical issues detected
    for (const issue of healthCheck.issues) {
      if (issue.severity === "critical") {
        // Don't restart for certain issue types
        if (issue.type === "pid_mismatch") {
          return false; // This needs manual intervention
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Get the recommended termination reason for a health check.
   */
  getTerminationReason(healthCheck: HealthCheck): string | null {
    const criticalIssue = healthCheck.issues.find((i) => i.severity === "critical");
    if (!criticalIssue) {
      return null;
    }

    switch (criticalIssue.type) {
      case "missing_heartbeat":
      case "stale_heartbeat":
        return "health_check_failed";
      case "high_memory":
      case "high_cpu":
        return "resource_limit";
      default:
        return "health_check_failed";
    }
  }

  /**
   * Clear tracked issues for a loop.
   */
  clearIssues(loopId: string): void {
    this.issueTrackers.delete(loopId);
  }

  /**
   * Get all tracked issues for a loop.
   */
  getTrackedIssues(loopId: string): HealthIssue[] {
    const tracker = this.issueTrackers.get(loopId);
    if (!tracker) {
      return [];
    }
    return Array.from(tracker.values()).map((t) => t.issue);
  }

  /**
   * Add an issue, tracking its occurrence count.
   */
  private addIssue(
    issues: HealthIssue[],
    loopId: string,
    issue: HealthIssue
  ): void {
    let loopTracker = this.issueTrackers.get(loopId);
    if (!loopTracker) {
      loopTracker = new Map();
      this.issueTrackers.set(loopId, loopTracker);
    }

    const existing = loopTracker.get(issue.type);
    if (existing) {
      // Update existing issue with incremented count
      existing.issue.count++;
      existing.issue.message = issue.message; // Update message
      existing.lastSeen = new Date();
      issues.push(existing.issue);
    } else {
      // New issue
      loopTracker.set(issue.type, {
        issue: { ...issue, firstSeen: new Date() },
        lastSeen: new Date(),
      });
      issues.push(issue);
    }
  }

  /**
   * Calculate overall health status from issues.
   */
  private calculateStatus(issues: HealthIssue[]): HealthCheckStatus {
    if (issues.length === 0) {
      return "healthy";
    }

    const hasCritical = issues.some((i) => i.severity === "critical");
    if (hasCritical) {
      return "unhealthy";
    }

    return "degraded";
  }

  /**
   * Calculate derived loop status from health check.
   */
  calculateLoopStatus(
    process: LoopProcess,
    healthCheck: HealthCheck
  ): LoopStatus {
    switch (healthCheck.status) {
      case "healthy":
        return "healthy";
      case "degraded":
        return "degraded";
      case "unhealthy":
        // Check if process is still running
        if (
          healthCheck.issues.some(
            (i) => i.type === "missing_heartbeat" || i.type === "stale_heartbeat"
          )
        ) {
          return "unhealthy";
        }
        return "degraded";
      default:
        return process.status;
    }
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<HealthMonitorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): HealthMonitorConfig {
    return { ...this.config };
  }
}
