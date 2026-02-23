/**
 * Tests for HealthMonitor Service
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  HealthMonitor,
  DEFAULT_HEALTH_MONITOR_CONFIG,
} from "./HealthMonitor.js";
import type {
  HealthCheck,
  LoopHeartbeat,
  LoopProcess,
} from "../types/process.js";

describe("HealthMonitor", () => {
  let monitor: HealthMonitor;

  const createMockProcess = (
    overrides: Partial<LoopProcess> = {}
  ): LoopProcess => ({
    id: "loop-test",
    pid: 12345,
    status: "running",
    startedAt: new Date(Date.now() - 3600000), // 1 hour ago
    lastHeartbeat: new Date(),
    restartCount: 0,
    config: {},
    ...overrides,
  });

  const createMockHeartbeat = (
    overrides: Partial<LoopHeartbeat> = {}
  ): LoopHeartbeat => ({
    loopId: "loop-test",
    pid: 12345,
    timestamp: new Date(),
    iteration: 10,
    hat: "coder",
    status: "running",
    ...overrides,
  });

  beforeEach(() => {
    monitor = new HealthMonitor();
  });

  describe("constructor", () => {
    test("should use default config", () => {
      const config = monitor.getConfig();
      expect(config.checkIntervalMs).toBe(
        DEFAULT_HEALTH_MONITOR_CONFIG.checkIntervalMs
      );
      expect(config.heartbeatTimeoutMs).toBe(
        DEFAULT_HEALTH_MONITOR_CONFIG.heartbeatTimeoutMs
      );
    });

    test("should accept custom config", () => {
      const customMonitor = new HealthMonitor({
        checkIntervalMs: 10000,
        cpuWarningThreshold: 80,
      });
      const config = customMonitor.getConfig();
      expect(config.checkIntervalMs).toBe(10000);
      expect(config.cpuWarningThreshold).toBe(80);
    });
  });

  describe("performHealthCheck", () => {
    test("should return healthy for a process with fresh heartbeat", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 500 };

      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(check.status).toBe("healthy");
      expect(check.loopId).toBe("loop-test");
      expect(check.issues).toHaveLength(0);
      expect(check.metrics.cpuPercent).toBe(30);
      expect(check.metrics.memoryMB).toBe(500);
    });

    test("should detect missing heartbeat", () => {
      const process = createMockProcess();
      const check = monitor.performHealthCheck(process, null, null);

      expect(check.status).toBe("unhealthy");
      expect(check.issues.some((i) => i.type === "missing_heartbeat")).toBe(
        true
      );
    });

    test("should detect stale heartbeat", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat({
        timestamp: new Date(Date.now() - 120000), // 2 minutes ago
      });

      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(check.status).toBe("unhealthy");
      expect(check.issues.some((i) => i.type === "stale_heartbeat")).toBe(
        true
      );
    });

    test("should detect PID mismatch", () => {
      const process = createMockProcess({ pid: 12345 });
      const heartbeat = createMockHeartbeat({ pid: 99999 });

      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(check.status).toBe("unhealthy");
      expect(check.issues.some((i) => i.type === "pid_mismatch")).toBe(true);
    });

    test("should detect high CPU usage (warning)", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 75, memoryMB: 500 };

      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(check.status).toBe("degraded");
      expect(
        check.issues.some(
          (i) => i.type === "high_cpu" && i.severity === "warning"
        )
      ).toBe(true);
    });

    test("should detect high CPU usage (critical)", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 95, memoryMB: 500 };

      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(check.status).toBe("unhealthy");
      expect(
        check.issues.some(
          (i) => i.type === "high_cpu" && i.severity === "critical"
        )
      ).toBe(true);
    });

    test("should detect high memory usage (warning)", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 1500 };

      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(check.status).toBe("degraded");
      expect(
        check.issues.some(
          (i) => i.type === "high_memory" && i.severity === "warning"
        )
      ).toBe(true);
    });

    test("should detect high memory usage (critical)", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 2500 };

      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(check.status).toBe("unhealthy");
      expect(
        check.issues.some(
          (i) => i.type === "high_memory" && i.severity === "critical"
        )
      ).toBe(true);
    });

    test("should track issue count over multiple checks", () => {
      const process = createMockProcess({ restartCount: 2 });
      const heartbeat = createMockHeartbeat();

      // First check
      const check1 = monitor.performHealthCheck(process, heartbeat, null);
      const restartIssue1 = check1.issues.find((i) => i.type === "restarts");
      expect(restartIssue1?.count).toBe(2);

      // Second check (same loop)
      const check2 = monitor.performHealthCheck(process, heartbeat, null);
      const restartIssue2 = check2.issues.find((i) => i.type === "restarts");
      expect(restartIssue2?.count).toBe(3);
    });

    test("should detect no progress", () => {
      const customMonitor = new HealthMonitor({
        progressTimeoutMs: 60000, // 1 minute
      });
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat({
        timestamp: new Date(Date.now() - 120000), // 2 minutes ago
      });

      const check = customMonitor.performHealthCheck(process, heartbeat, null);

      expect(
        check.issues.some(
          (i) => i.type === "no_progress" || i.type === "stale_heartbeat"
        )
      ).toBe(true);
    });

    test("should include iteration count in metrics", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat({ iteration: 42 });

      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(check.metrics.iterationCount).toBe(42);
    });

    test("should calculate uptime correctly", () => {
      const process = createMockProcess({
        startedAt: new Date(Date.now() - 7200000), // 2 hours ago
      });
      const heartbeat = createMockHeartbeat();

      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(check.metrics.uptimeSeconds).toBeGreaterThanOrEqual(7199);
      expect(check.metrics.uptimeSeconds).toBeLessThanOrEqual(7201);
    });
  });

  describe("shouldRestart", () => {
    test("should recommend restart for critical issues", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat({
        timestamp: new Date(Date.now() - 120000),
      });
      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(monitor.shouldRestart(check)).toBe(true);
    });

    test("should not recommend restart for healthy process", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(monitor.shouldRestart(check)).toBe(false);
    });

    test("should not recommend restart for PID mismatch", () => {
      const process = createMockProcess({ pid: 12345 });
      const heartbeat = createMockHeartbeat({ pid: 99999 });
      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(monitor.shouldRestart(check)).toBe(false);
    });
  });

  describe("getTerminationReason", () => {
    test("should return null for healthy check", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(monitor.getTerminationReason(check)).toBeNull();
    });

    test("should return health_check_failed for stale heartbeat", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat({
        timestamp: new Date(Date.now() - 120000),
      });
      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(monitor.getTerminationReason(check)).toBe("health_check_failed");
    });

    test("should return resource_limit for high memory", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 3000 };
      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(monitor.getTerminationReason(check)).toBe("resource_limit");
    });
  });

  describe("clearIssues", () => {
    test("should clear tracked issues for a loop", () => {
      const process = createMockProcess({ restartCount: 2 });
      const heartbeat = createMockHeartbeat();

      // Generate some issues (restarts creates an issue)
      monitor.performHealthCheck(process, heartbeat, null);

      expect(monitor.getTrackedIssues("loop-test")).toHaveLength(1);

      // Clear issues
      monitor.clearIssues("loop-test");

      expect(monitor.getTrackedIssues("loop-test")).toHaveLength(0);
    });
  });

  describe("calculateLoopStatus", () => {
    test("should return healthy for healthy check", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 30, memoryMB: 500 };
      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(monitor.calculateLoopStatus(process, check)).toBe("healthy");
    });

    test("should return degraded for warning issues", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat();
      const metrics = { cpuPercent: 75, memoryMB: 500 };
      const check = monitor.performHealthCheck(process, heartbeat, metrics);

      expect(monitor.calculateLoopStatus(process, check)).toBe("degraded");
    });

    test("should return unhealthy for critical issues", () => {
      const process = createMockProcess();
      const heartbeat = createMockHeartbeat({
        timestamp: new Date(Date.now() - 120000),
      });
      const check = monitor.performHealthCheck(process, heartbeat, null);

      expect(monitor.calculateLoopStatus(process, check)).toBe("unhealthy");
    });
  });

  describe("updateConfig", () => {
    test("should update configuration", () => {
      monitor.updateConfig({ cpuWarningThreshold: 50 });
      expect(monitor.getConfig().cpuWarningThreshold).toBe(50);
    });
  });
});
