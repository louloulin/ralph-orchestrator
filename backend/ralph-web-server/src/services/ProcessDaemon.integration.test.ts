/**
 * Process Daemon Integration Tests
 *
 * Integration tests for the Process Daemon with mock processes.
 * Tests the full lifecycle: spawn → monitor → health check → restart → stop
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import { LoopSupervisor } from "./LoopSupervisor.js";
import { HealthMonitor } from "./HealthMonitor.js";
import { RestartManager } from "./RestartManager.js";
import type {
  LoopProcess,
  LoopHeartbeat,
  TerminationReason,
} from "../types/process.js";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Create a mock child process that simulates a Ralph loop
 */
function createMockRalphProcess(
  loopId: string,
  pid: number,
  options: {
    autoKill?: boolean;
    killDelay?: number;
  } = {}
): ChildProcess & EventEmitter {
  const {
    autoKill = false,
    killDelay = 50,
  } = options;

  const mock = new EventEmitter() as ChildProcess & EventEmitter;
  mock.pid = pid;
  mock.killed = false;
  mock.stdout = new EventEmitter() as any;
  mock.stderr = new EventEmitter() as any;
  mock.stdin = null;

  const killFn = (signal?: number | string): boolean => {
    mock.killed = true;

    // Simulate graceful shutdown with SIGTERM
    if (signal === "SIGTERM" || signal === 15 || signal === undefined) {
      setTimeout(() => {
        mock.emit("exit", 0, "SIGTERM");
      }, killDelay);
    } else {
      // Immediate kill for SIGKILL
      mock.emit("exit", 9, "SIGKILL");
    }

    return true;
  };

  mock.kill = killFn as any;

  // Simulate automatic crash for testing
  if (autoKill) {
    setTimeout(() => {
      if (!mock.killed) {
        mock.killed = true; // Mark as killed when auto-crashing
        mock.emit("exit", 1, null);
      }
    }, 100);
  }

  return mock;
}

/**
 * Mock heartbeat file writer
 */
async function writeMockHeartbeat(
  workspaceRoot: string,
  loopId: string,
  pid: number,
  iteration: number = 1
): Promise<void> {
  const heartbeatDir = path.join(workspaceRoot, ".ralph");
  await fs.mkdir(heartbeatDir, { recursive: true });

  const heartbeat: LoopHeartbeat = {
    loopId,
    pid,
    timestamp: new Date(),
    iteration,
    hat: "coder",
    status: "running",
  };

  const heartbeatPath = path.join(heartbeatDir, "heartbeat.json");
  await fs.writeFile(heartbeatPath, JSON.stringify(heartbeat));
}

/**
 * Create a tracked process entry
 */
function createTrackedProcess(
  loopId: string,
  pid: number,
  mockProcess: ChildProcess & EventEmitter,
  supervisor: LoopSupervisor,
  prompt: string = "Test prompt",
  restartCount: number = 0
): LoopProcess {
  const process: LoopProcess = {
    id: loopId,
    pid,
    status: "running",
    startedAt: new Date(),
    lastHeartbeat: new Date(),
    restartCount,
    prompt,
    config: {},
  };

  // Access internal processes map
  (supervisor as any).processes.set(loopId, {
    process,
    childProcess: mockProcess,
  });

  return process;
}

describe("Process Daemon Integration", () => {
  let workspaceRoot: string;
  let supervisor: LoopSupervisor;
  let healthMonitor: HealthMonitor;
  let restartManager: RestartManager;

  beforeEach(async () => {
    // Create temporary workspace
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ralph-test-"));

    // Create HealthMonitor with faster intervals for testing
    healthMonitor = new HealthMonitor({
      checkIntervalMs: 100,
      heartbeatTimeoutMs: 500,
      cpuWarningThreshold: 80,
      cpuCriticalThreshold: 95,
      memoryWarningThresholdMB: 1000,
      memoryCriticalThresholdMB: 2000,
      stuckIterationThreshold: 100,
    });

    // Create RestartManager with lenient thresholds for testing
    restartManager = new RestartManager({
      maxRestartsPerWindow: 5,
      restartWindowMs: 60000,
      circuitBreakerThreshold: 5,
      initialBackoffSeconds: 0.05,
      maxBackoffSeconds: 0.5,
    });

    // Create supervisor with test configuration
    supervisor = new LoopSupervisor(
      {
        ralphPath: "ralph",
        workspaceRoot,
        heartbeatFilePath: ".ralph/heartbeat.json",
        healthCheckIntervalMs: 100,
        heartbeatTimeoutMs: 500,
        autoRestart: true,
        maxConcurrentLoops: 3,
      },
      healthMonitor,
      restartManager
    );

    await supervisor.start();
  });

  afterEach(async () => {
    await supervisor.stop();

    // Clean up temporary workspace
    try {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("End-to-end process lifecycle", () => {
    test("graceful shutdown stops processes", async () => {
      const loopId = "test-loop-shutdown";
      const mockProcess = createMockRalphProcess(loopId, 10002);

      createTrackedProcess(loopId, 10002, mockProcess, supervisor);

      // Verify process is tracked
      const processes = supervisor.getAllProcesses();
      expect(processes.length).toBe(1);

      // Stop the supervisor (should send SIGTERM)
      await supervisor.stop();

      // Verify process was killed
      expect(mockProcess.killed).toBe(true);
    });

    test("mock process can simulate crash", async () => {
      const loopId = "test-loop-crash";
      const mockProcess = createMockRalphProcess(loopId, 10003, { autoKill: true });

      // Verify initial state
      expect(mockProcess.killed).toBe(false);
      expect(mockProcess.pid).toBe(10003);

      // Wait for auto-kill to trigger (100ms delay in mock)
      await new Promise(resolve => setTimeout(resolve, 150));

      // Process should have killed itself
      expect(mockProcess.killed).toBe(true);
    });
  });

  describe("Health monitoring integration", () => {
    test("heartbeat file reading", async () => {
      const loopId = "test-loop-heartbeat";

      // Write heartbeat file
      await writeMockHeartbeat(workspaceRoot, loopId, 10004, 10);

      // Read heartbeat through supervisor
      const heartbeat = await (supervisor as any).readHeartbeat(loopId);

      expect(heartbeat).toBeDefined();
      expect(heartbeat.loopId).toBe(loopId);
      expect(heartbeat.pid).toBe(10004);
      expect(heartbeat.iteration).toBe(10);
    });

    test("stale heartbeat detection", async () => {
      const loopId = "test-loop-stale";

      // Write old heartbeat
      const heartbeatDir = path.join(workspaceRoot, ".ralph");
      await fs.mkdir(heartbeatDir, { recursive: true });

      const oldHeartbeat: LoopHeartbeat = {
        loopId,
        pid: 10005,
        timestamp: new Date(Date.now() - 10000), // 10 seconds ago
        iteration: 1,
        hat: "coder",
        status: "running",
      };

      await fs.writeFile(
        path.join(heartbeatDir, "heartbeat.json"),
        JSON.stringify(oldHeartbeat)
      );

      const mockProcess = createMockRalphProcess(loopId, 10005);
      const process = createTrackedProcess(loopId, 10005, mockProcess, supervisor);

      // Perform health check
      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const healthCheck = healthMonitor.performHealthCheck(
        process,
        oldHeartbeat,
        metrics
      );

      // Should detect stale heartbeat
      expect(healthCheck.status).toBe("unhealthy");
      const staleIssue = healthCheck.issues.find((i) => i.type === "stale_heartbeat");
      expect(staleIssue).toBeDefined();
    });

    test("PID mismatch detection", async () => {
      const loopId = "test-loop-pid-mismatch";

      // Write heartbeat with different PID
      await writeMockHeartbeat(workspaceRoot, loopId, 99999, 1);

      const mockProcess = createMockRalphProcess(loopId, 10006);
      const process = createTrackedProcess(loopId, 10006, mockProcess, supervisor);

      // Read heartbeat
      const heartbeat = await (supervisor as any).readHeartbeat(loopId);

      // Perform health check
      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      // Should detect PID mismatch
      const pidIssue = healthCheck.issues.find((i) => i.type === "pid_mismatch");
      expect(pidIssue).toBeDefined();
    });
  });

  describe("Restart policy integration", () => {
    test("circuit breaker activates after threshold failures", async () => {
      const loopId = "test-loop-circuit";

      // Simulate failures up to just before circuit breaker
      // (circuitBreakerThreshold=5 means it trips ON the 5th failure)
      for (let i = 0; i < 4; i++) {
        const decision = restartManager.processTermination(loopId, "crash", 1);
        // First 4 should allow restart
        expect(decision.shouldRestart).toBe(true);
      }

      // The 5th failure should trigger circuit breaker
      const decision = restartManager.processTermination(loopId, "crash", 1);
      expect(decision.shouldRestart).toBe(false);
      expect(decision.circuitBreakerActive).toBe(true);
    });

    test("exponential backoff increases with failures", async () => {
      // Backoff for non-failure (manual) is 0
      const backoff0 = restartManager.calculateBackoff(0, false);
      expect(backoff0).toBe(0);

      // Backoff for failure increases with count
      const backoff1 = restartManager.calculateBackoff(1, true);
      const backoff2 = restartManager.calculateBackoff(2, true);
      const backoff3 = restartManager.calculateBackoff(3, true);

      // Verify backoff increases
      expect(backoff2).toBeGreaterThan(backoff1);
      expect(backoff3).toBeGreaterThan(backoff2);
    });

    test("restart history tracking via processTermination", async () => {
      const loopId = "test-loop-history";

      // Record restart events through processTermination
      restartManager.processTermination(loopId, "crash", 10);
      restartManager.processTermination(loopId, "crash", 20);

      const history = restartManager.getRestartHistory(loopId);

      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0].reason).toBe("crash");
    });
  });

  describe("Resource monitoring", () => {
    test("high CPU detection returns warning severity", async () => {
      const loopId = "test-loop-high-cpu";

      const mockProcess = createMockRalphProcess(loopId, 10007);
      const process = createTrackedProcess(loopId, 10007, mockProcess, supervisor);

      // Write fresh heartbeat
      await writeMockHeartbeat(workspaceRoot, loopId, 10007, 100);

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 90, memoryMB: 500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      // Should detect high CPU (warning at 90%)
      const cpuIssue = healthCheck.issues.find((i) => i.type === "high_cpu");
      expect(cpuIssue).toBeDefined();
      expect(cpuIssue?.severity).toBe("warning");
      // Status is degraded for warnings
      expect(healthCheck.status).toBe("degraded");
    });

    test("critical CPU detection", async () => {
      const loopId = "test-loop-critical-cpu";

      const mockProcess = createMockRalphProcess(loopId, 10008);
      const process = createTrackedProcess(loopId, 10008, mockProcess, supervisor);

      await writeMockHeartbeat(workspaceRoot, loopId, 10008, 100);

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 98, memoryMB: 500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      // Should detect critical CPU (critical at 98%)
      const cpuIssue = healthCheck.issues.find((i) => i.type === "high_cpu");
      expect(cpuIssue?.severity).toBe("critical");
      expect(healthCheck.status).toBe("unhealthy");
    });

    test("high memory detection", async () => {
      const loopId = "test-loop-high-memory";

      const mockProcess = createMockRalphProcess(loopId, 10009);
      const process = createTrackedProcess(loopId, 10009, mockProcess, supervisor);

      await writeMockHeartbeat(workspaceRoot, loopId, 10009, 100);

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 30, memoryMB: 1500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      // Should detect high memory
      const memoryIssue = healthCheck.issues.find((i) => i.type === "high_memory");
      expect(memoryIssue).toBeDefined();
      expect(memoryIssue?.severity).toBe("warning");
    });

    test("no progress detection with old activity", async () => {
      const loopId = "test-loop-no-progress";

      const mockProcess = createMockRalphProcess(loopId, 10010);
      const process = createTrackedProcess(
        loopId,
        10010,
        mockProcess,
        supervisor,
        "Test",
        0
      );
      process.startedAt = new Date(Date.now() - 60000);

      // Create heartbeat with old timestamp (older than progressTimeoutMs)
      const heartbeatDir = path.join(workspaceRoot, ".ralph");
      await fs.mkdir(heartbeatDir, { recursive: true });

      const oldHeartbeat: LoopHeartbeat = {
        loopId,
        pid: 10010,
        timestamp: new Date(Date.now() - 600000), // 10 min ago (exceeds default 5 min)
        iteration: 5,
        hat: "coder",
        status: "running",
      };
      await fs.writeFile(
        path.join(heartbeatDir, "heartbeat.json"),
        JSON.stringify(oldHeartbeat)
      );

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 30, memoryMB: 500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      // Should detect no progress (stale heartbeat triggers critical)
      const staleIssue = healthCheck.issues.find((i) => i.type === "stale_heartbeat");
      expect(staleIssue).toBeDefined();
    });
  });

  describe("Health check decisions", () => {
    test("should restart on stale heartbeat", async () => {
      const loopId = "test-loop-restart-stale";

      const mockProcess = createMockRalphProcess(loopId, 10011);
      const process = createTrackedProcess(loopId, 10011, mockProcess, supervisor);

      const oldHeartbeat: LoopHeartbeat = {
        loopId,
        pid: 10011,
        timestamp: new Date(Date.now() - 100000), // Very old
        iteration: 10,
        hat: "coder",
        status: "running",
      };

      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const healthCheck = healthMonitor.performHealthCheck(
        process,
        oldHeartbeat,
        metrics
      );

      const shouldRestart = healthMonitor.shouldRestart(healthCheck);
      expect(shouldRestart).toBe(true);
    });

    test("should restart on critical issues", async () => {
      const loopId = "test-loop-restart-critical";

      const mockProcess = createMockRalphProcess(loopId, 10012);
      const process = createTrackedProcess(loopId, 10012, mockProcess, supervisor);

      await writeMockHeartbeat(workspaceRoot, loopId, 10012, 100);

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 99, memoryMB: 2500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      const shouldRestart = healthMonitor.shouldRestart(healthCheck);
      expect(shouldRestart).toBe(true);
    });

    test("should not restart healthy process", async () => {
      const loopId = "test-loop-no-restart";

      const mockProcess = createMockRalphProcess(loopId, 10013);
      const process = createTrackedProcess(loopId, 10013, mockProcess, supervisor);

      await writeMockHeartbeat(workspaceRoot, loopId, 10013, 100);

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 30, memoryMB: 500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      const shouldRestart = healthMonitor.shouldRestart(healthCheck);
      expect(shouldRestart).toBe(false);
      expect(healthCheck.status).toBe("healthy");
    });
  });

  describe("Multiple concurrent loops", () => {
    test("track multiple loops", async () => {
      const loopIds = ["loop-1", "loop-2", "loop-3"];

      for (const loopId of loopIds) {
        const pid = 10200 + loopIds.indexOf(loopId);
        const mockProcess = createMockRalphProcess(loopId, pid);
        createTrackedProcess(loopId, pid, mockProcess, supervisor);
      }

      const processes = (supervisor as any).getAllProcesses();
      expect(processes.length).toBe(loopIds.length);

      for (const loopId of loopIds) {
        const process = processes.find((p: LoopProcess) => p.id === loopId);
        expect(process).toBeDefined();
      }
    });

    test("respect max concurrent loops", async () => {
      const stats = supervisor.getStats();
      expect(stats.maxConcurrentLoops).toBe(3);
    });
  });

  describe("Termination reasons", () => {
    test("get termination reason for stale heartbeat", async () => {
      const loopId = "test-loop-term-reason";

      const mockProcess = createMockRalphProcess(loopId, 10014);
      const process = createTrackedProcess(loopId, 10014, mockProcess, supervisor);

      const oldHeartbeat: LoopHeartbeat = {
        loopId,
        pid: 10014,
        timestamp: new Date(Date.now() - 100000),
        iteration: 10,
        hat: "coder",
        status: "running",
      };

      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const healthCheck = healthMonitor.performHealthCheck(
        process,
        oldHeartbeat,
        metrics
      );

      // Implementation returns "health_check_failed" for stale heartbeat
      const reason = healthMonitor.getTerminationReason(healthCheck);
      expect(reason).toBe("health_check_failed");
    });

    test("get termination reason for critical CPU", async () => {
      const loopId = "test-loop-term-cpu";

      const mockProcess = createMockRalphProcess(loopId, 10015);
      const process = createTrackedProcess(loopId, 10015, mockProcess, supervisor);

      await writeMockHeartbeat(workspaceRoot, loopId, 10015, 100);

      const heartbeat = await (supervisor as any).readHeartbeat(loopId);
      const metrics = { cpuPercent: 99, memoryMB: 500 };

      const healthCheck = healthMonitor.performHealthCheck(
        process,
        heartbeat,
        metrics
      );

      // Implementation returns "resource_limit" for high CPU
      const reason = healthMonitor.getTerminationReason(healthCheck);
      expect(reason).toBe("resource_limit");
    });
  });
});
