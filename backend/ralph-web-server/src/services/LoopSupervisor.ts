/**
 * LoopSupervisor Service
 *
 * Main process supervision service that manages Ralph loop lifecycle:
 * - Spawns and monitors loop processes
 * - Implements health check protocol (delegates to HealthMonitor)
 * - Manages restart policies (delegates to RestartManager)
 * - Tracks loop lifecycle events
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as fs from "fs/promises";
import * as path from "path";
import type {
  LoopProcess,
  LoopConfig,
  LoopHeartbeat,
  HealthCheck,
  RestartEvent,
  TerminationReason,
} from "../types/process.js";
import { HealthMonitor } from "./HealthMonitor.js";
import { RestartManager } from "./RestartManager.js";

/**
 * Configuration for the loop supervisor.
 */
export interface LoopSupervisorConfig {
  /** Path to ralph executable (default: "ralph") */
  ralphPath: string;
  /** Working directory for spawned processes */
  workspaceRoot: string;
  /** Heartbeat file path (relative to workspace root) */
  heartbeatFilePath: string;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;
  /** Heartbeat timeout in milliseconds */
  heartbeatTimeoutMs: number;
  /** Whether to auto-restart on failure */
  autoRestart: boolean;
  /** Maximum concurrent loops */
  maxConcurrentLoops: number;
}

/**
 * Default supervisor configuration.
 */
export const DEFAULT_LOOP_SUPERVISOR_CONFIG: LoopSupervisorConfig = {
  ralphPath: "ralph",
  workspaceRoot: process.cwd(),
  heartbeatFilePath: ".ralph/heartbeat.json",
  healthCheckIntervalMs: 30_000, // 30 seconds
  heartbeatTimeoutMs: 90_000, // 90 seconds
  autoRestart: true,
  maxConcurrentLoops: 5,
};

/**
 * Event types emitted by LoopSupervisor.
 */
export interface LoopSupervisorEvents {
  "loop:started": { loopId: string; config: LoopConfig };
  "loop:stopped": { loopId: string; reason: TerminationReason };
  "loop:crashed": { loopId: string; error: Error; exitCode: number | null };
  "loop:restarted": { loopId: string; attempt: number; backoffMs: number };
  "loop:healthy": { loopId: string; healthCheck: HealthCheck };
  "loop:unhealthy": { loopId: string; healthCheck: HealthCheck };
  "loop:circuit_breaker": { loopId: string; message: string };
  "health:check": { loopId: string; healthCheck: HealthCheck };
  "error": { error: Error };
}

/**
 * Internal process tracking.
 */
interface TrackedProcess {
  process: LoopProcess;
  childProcess?: ChildProcess;
  restartTimer?: NodeJS.Timeout;
}

/**
 * LoopSupervisor Service
 *
 * Orchestrates loop process lifecycle with health monitoring and restart management.
 */
export class LoopSupervisor extends EventEmitter {
  private config: LoopSupervisorConfig;
  private healthMonitor: HealthMonitor;
  private restartManager: RestartManager;
  private processes: Map<string, TrackedProcess> = new Map();
  private isMonitoring = false;
  private shuttingDown = false;

  constructor(
    config: Partial<LoopSupervisorConfig> = {},
    healthMonitor?: HealthMonitor,
    restartManager?: RestartManager
  ) {
    super();
    this.config = { ...DEFAULT_LOOP_SUPERVISOR_CONFIG, ...config };
    this.healthMonitor = healthMonitor ?? new HealthMonitor({
      checkIntervalMs: this.config.healthCheckIntervalMs,
      heartbeatTimeoutMs: this.config.heartbeatTimeoutMs,
      heartbeatFilePath: this.config.heartbeatFilePath,
    });
    this.restartManager = restartManager ?? new RestartManager();

    // Wire up health monitor callbacks
    this.healthMonitor.setOnHealthChange((loopId, healthCheck) => {
      this.handleHealthChange(loopId, healthCheck);
    });

    // Wire up restart manager callbacks
    this.restartManager.setOnRestartNeeded((loopId, backoffSeconds, reason) => {
      this.scheduleRestart(loopId, backoffSeconds, reason);
    });
  }

  /**
   * Start the supervisor and begin monitoring.
   */
  async start(): Promise<void> {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.shuttingDown = false;

    // Start health monitoring
    this.healthMonitor.startMonitoring(
      () => this.getAllProcesses(),
      (loopId) => this.readHeartbeat(loopId),
      (pid) => this.getProcessMetrics(pid)
    );

    this.emit("supervisor:started");
  }

  /**
   * Stop the supervisor and all managed processes.
   */
  async stop(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    this.shuttingDown = true;
    this.isMonitoring = false;

    // Stop health monitoring
    this.healthMonitor.stopMonitoring();

    // Stop all tracked processes
    const stopPromises: Promise<void>[] = [];
    for (const [loopId] of this.processes) {
      stopPromises.push(this.stopLoop(loopId, "manual"));
    }
    await Promise.all(stopPromises);

    this.emit("supervisor:stopped");
  }

  /**
   * Spawn a new loop process.
   */
  async spawnLoop(loopId: string, config: LoopConfig): Promise<LoopProcess> {
    if (this.processes.has(loopId)) {
      throw new Error(`Loop ${loopId} already exists`);
    }

    if (this.processes.size >= this.config.maxConcurrentLoops) {
      throw new Error(
        `Maximum concurrent loops (${this.config.maxConcurrentLoops}) reached`
      );
    }

    const now = new Date();
    const loopProcess: LoopProcess = {
      id: loopId,
      pid: 0, // Will be set after spawn
      status: "starting",
      startedAt: now,
      lastHeartbeat: now,
      restartCount: 0,
      config,
    };

    // Track the process
    const tracked: TrackedProcess = {
      process: loopProcess,
    };
    this.processes.set(loopId, tracked);

    try {
      // Build ralph command arguments
      const args = this.buildRalphArgs(config);

      // Spawn the child process
      const childProcess = spawn(this.config.ralphPath, args, {
        cwd: this.config.workspaceRoot,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...config.env,
          RALPH_LOOP_ID: loopId,
        },
        detached: false,
      });

      tracked.childProcess = childProcess;
      loopProcess.pid = childProcess.pid ?? 0;

      // Handle process events
      childProcess.on("error", (error) => {
        this.handleProcessError(loopId, error);
      });

      childProcess.on("exit", (code, signal) => {
        this.handleProcessExit(loopId, code, signal);
      });

      // Update status to running
      loopProcess.status = "running";

      // Clear any previous tracking data for fresh start
      this.healthMonitor.clearIssues(loopId);
      this.restartManager.recordSuccessfulStart(loopId);

      this.emit("loop:started", { loopId, config });

      return { ...loopProcess };
    } catch (error) {
      // Clean up on spawn failure
      this.processes.delete(loopId);
      throw error;
    }
  }

  /**
   * Stop a loop process.
   */
  async stopLoop(loopId: string, reason: TerminationReason = "manual"): Promise<void> {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      return;
    }

    // Clear any pending restart timer
    if (tracked.restartTimer) {
      clearTimeout(tracked.restartTimer);
      tracked.restartTimer = undefined;
    }

    // Update status
    tracked.process.status = "stopped";

    // Kill the child process
    if (tracked.childProcess && !tracked.childProcess.killed) {
      // Try graceful shutdown first
      tracked.childProcess.kill("SIGTERM");

      // Force kill after timeout
      setTimeout(() => {
        if (tracked.childProcess && !tracked.childProcess.killed) {
          tracked.childProcess.kill("SIGKILL");
        }
      }, 5000);
    }

    // Clear tracking data
    this.healthMonitor.clearIssues(loopId);

    this.emit("loop:stopped", { loopId, reason });
  }

  /**
   * Restart a loop process.
   */
  async restartLoop(loopId: string, _reason: TerminationReason = "manual"): Promise<void> {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      throw new Error(`Loop ${loopId} not found`);
    }

    const config = tracked.process.config;

    // Kill the current process but keep tracking
    if (tracked.childProcess && !tracked.childProcess.killed) {
      // Clear any pending restart timer
      if (tracked.restartTimer) {
        clearTimeout(tracked.restartTimer);
        tracked.restartTimer = undefined;
      }

      // Kill the process
      tracked.childProcess.kill("SIGTERM");
    }

    // Update status to restarting
    tracked.process.status = "restarting";

    // Small delay before restart
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Remove old tracking
    this.processes.delete(loopId);

    // Spawn a new process with the same ID
    await this.spawnLoop(loopId, config);
  }

  /**
   * Get all managed processes.
   */
  getAllProcesses(): LoopProcess[] {
    return Array.from(this.processes.values()).map((t) => ({ ...t.process }));
  }

  /**
   * Get a specific process.
   */
  getProcess(loopId: string): LoopProcess | undefined {
    const tracked = this.processes.get(loopId);
    return tracked ? { ...tracked.process } : undefined;
  }

  /**
   * Get health check for a loop.
   */
  async getHealth(loopId: string): Promise<HealthCheck | null> {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      return null;
    }

    const heartbeat = await this.readHeartbeat(loopId);
    const metrics = this.getProcessMetrics(tracked.process.pid);

    return this.healthMonitor.performHealthCheck(tracked.process, heartbeat, metrics);
  }

  /**
   * Get restart history for a loop.
   */
  getRestartHistory(loopId: string, limit?: number): RestartEvent[] {
    return this.restartManager.getRestartHistory(loopId, limit);
  }

  /**
   * Get supervisor statistics.
   */
  getStats(): {
    totalProcesses: number;
    runningProcesses: number;
    stoppedProcesses: number;
    crashedProcesses: number;
    maxConcurrentLoops: number;
    isMonitoring: boolean;
  } {
    const processes = this.getAllProcesses();
    return {
      totalProcesses: processes.length,
      runningProcesses: processes.filter((p) => p.status === "running" || p.status === "healthy").length,
      stoppedProcesses: processes.filter((p) => p.status === "stopped").length,
      crashedProcesses: processes.filter((p) => p.status === "crashed").length,
      maxConcurrentLoops: this.config.maxConcurrentLoops,
      isMonitoring: this.isMonitoring,
    };
  }

  /**
   * Reset circuit breaker for a loop.
   */
  resetCircuitBreaker(loopId: string): void {
    this.restartManager.resetCircuitBreaker(loopId);
  }

  /**
   * Update supervisor configuration.
   */
  updateConfig(config: Partial<LoopSupervisorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): LoopSupervisorConfig {
    return { ...this.config };
  }

  /**
   * Handle health status changes from the health monitor.
   */
  private handleHealthChange(loopId: string, healthCheck: HealthCheck): void {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      return;
    }

    // Update process status based on health
    tracked.process.status = this.healthMonitor.calculateLoopStatus(
      tracked.process,
      healthCheck
    );
    tracked.process.lastHeartbeat = healthCheck.timestamp;

    // Emit health check event
    this.emit("health:check", { loopId, healthCheck });

    // Check if restart is needed
    if (
      this.config.autoRestart &&
      !this.shuttingDown &&
      this.healthMonitor.shouldRestart(healthCheck)
    ) {
      const reason = this.healthMonitor.getTerminationReason(healthCheck);
      if (reason) {
        this.initiateRestart(loopId, reason as TerminationReason);
      }
    }

    // Emit specific events based on status
    if (healthCheck.status === "healthy") {
      this.emit("loop:healthy", { loopId, healthCheck });
    } else if (healthCheck.status === "unhealthy") {
      this.emit("loop:unhealthy", { loopId, healthCheck });
    }
  }

  /**
   * Initiate a restart for a loop.
   */
  private initiateRestart(loopId: string, reason: TerminationReason): void {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      return;
    }

    const uptimeSeconds = Math.floor(
      (Date.now() - tracked.process.startedAt.getTime()) / 1000
    );

    const decision = this.restartManager.processTermination(
      loopId,
      reason,
      uptimeSeconds
    );

    if (!decision.shouldRestart) {
      // Update process status
      tracked.process.status = "stopped";

      if (decision.circuitBreakerActive) {
        this.emit("loop:circuit_breaker", {
          loopId,
          message: decision.rejectionReason ?? "Circuit breaker active",
        });
      }
    }
  }

  /**
   * Schedule a restart after backoff delay.
   */
  private scheduleRestart(
    loopId: string,
    backoffSeconds: number,
    _reason: TerminationReason
  ): void {
    const tracked = this.processes.get(loopId);
    if (!tracked || this.shuttingDown) {
      return;
    }

    // Clear existing timer
    if (tracked.restartTimer) {
      clearTimeout(tracked.restartTimer);
    }

    tracked.process.status = "restarting";
    tracked.process.restartCount++;

    const backoffMs = backoffSeconds * 1000;

    this.emit("loop:restarted", {
      loopId,
      attempt: tracked.process.restartCount,
      backoffMs,
    });

    tracked.restartTimer = setTimeout(async () => {
      if (this.shuttingDown) {
        return;
      }

      try {
        const config = tracked.process.config;
        // Remove old tracking
        this.processes.delete(loopId);
        // Spawn new process
        await this.spawnLoop(loopId, config);
      } catch (error) {
        this.emit("error", { error: error as Error });
      }
    }, backoffMs);
  }

  /**
   * Handle process error events.
   */
  private handleProcessError(loopId: string, error: Error): void {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      return;
    }

    tracked.process.status = "crashed";

    this.emit("loop:crashed", {
      loopId,
      error,
      exitCode: null,
    });

    // Initiate restart if auto-restart is enabled
    if (this.config.autoRestart && !this.shuttingDown) {
      this.initiateRestart(loopId, "crash");
    }
  }

  /**
   * Handle process exit events.
   */
  private handleProcessExit(
    loopId: string,
    code: number | null,
    signal: string | null
  ): void {
    const tracked = this.processes.get(loopId);
    if (!tracked) {
      return;
    }

    // Determine reason based on exit code/signal
    let reason: TerminationReason;
    if (signal === "SIGTERM" || signal === "SIGINT") {
      reason = "manual";
    } else if (code !== 0) {
      reason = "crash";
    } else {
      reason = "unknown";
    }

    if (reason === "crash") {
      tracked.process.status = "crashed";

      this.emit("loop:crashed", {
        loopId,
        error: new Error(`Process exited with code ${code}, signal ${signal}`),
        exitCode: code,
      });

      // Initiate restart if auto-restart is enabled
      if (this.config.autoRestart && !this.shuttingDown) {
        this.initiateRestart(loopId, reason);
      }
    }
  }

  /**
   * Read heartbeat file for a loop.
   */
  private async readHeartbeat(loopId: string): Promise<LoopHeartbeat | null> {
    try {
      const heartbeatPath = path.join(
        this.config.workspaceRoot,
        this.config.heartbeatFilePath
      );
      const content = await fs.readFile(heartbeatPath, "utf-8");
      const heartbeat = JSON.parse(content) as LoopHeartbeat;

      // Verify it's for this loop
      if (heartbeat.loopId !== loopId) {
        return null;
      }

      return heartbeat;
    } catch {
      return null;
    }
  }

  /**
   * Get process metrics (CPU, memory) for a PID.
   * This is a basic implementation - can be enhanced with system-specific tools.
   */
  private getProcessMetrics(pid: number): { cpuPercent: number; memoryMB: number } | null {
    if (!pid || pid === 0) {
      return null;
    }

    try {
      // Basic implementation using process.memoryUsage() for self
      // For external processes, would need system-specific tools
      if (pid === process.pid) {
        const mem = process.memoryUsage();
        return {
          cpuPercent: 0, // Would need cpu-usage library
          memoryMB: Math.round(mem.rss / 1024 / 1024),
        };
      }

      // For child processes, return null (would need system-specific implementation)
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Build ralph CLI arguments from loop config.
   */
  private buildRalphArgs(config: LoopConfig): string[] {
    const args: string[] = ["run"];

    if (config.maxIterations) {
      args.push("--max-iterations", String(config.maxIterations));
    }

    if (config.prompt) {
      args.push("-p", config.prompt);
    }

    if (config.backend) {
      args.push("-b", config.backend);
    }

    if (config.hatCollection) {
      args.push("--hat-collection", config.hatCollection);
    }

    if (config.memoriesEnabled === false) {
      args.push("--no-memories");
    }

    if (config.tasksEnabled === false) {
      args.push("--no-tasks");
    }

    return args;
  }

  /**
   * Graceful shutdown handler.
   */
  async gracefulShutdown(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    this.shuttingDown = true;
    await this.stop();
  }
}
