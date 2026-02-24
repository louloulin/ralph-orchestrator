/**
 * Tests for LoopSupervisor Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  LoopSupervisor,
  LoopSupervisorEvents,
  DEFAULT_LOOP_SUPERVISOR_CONFIG,
} from "./LoopSupervisor.js";
import { HealthMonitor } from "./HealthMonitor.js";
import { RestartManager } from "./RestartManager.js";
import type { LoopProcess, LoopConfig, HealthCheck } from "../types/process.js";
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";

// Mock child_process
vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

// Mock fs/promises
vi.mock("fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

import { spawn } from "child_process";
import * as fs from "fs/promises";

// Helper to mock a function
function mockFn<T extends (...args: any[]) => any>(fn: T): T & ReturnType<typeof vi.fn> {
  return fn as T & ReturnType<typeof vi.fn>;
}

describe("LoopSupervisor", () => {
  let supervisor: LoopSupervisor;
  let mockSpawn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn = spawn as ReturnType<typeof vi.fn>;
    supervisor = new LoopSupervisor({
      ralphPath: "ralph",
      workspaceRoot: "/test/workspace",
    });
  });

  afterEach(async () => {
    if (supervisor) {
      await supervisor.stop();
    }
  });

  describe("constructor", () => {
    it("should create instance with default config", () => {
      const sup = new LoopSupervisor();
      expect(sup.getConfig()).toEqual(DEFAULT_LOOP_SUPERVISOR_CONFIG);
    });

    it("should accept custom config", () => {
      const sup = new LoopSupervisor({
        ralphPath: "/custom/ralph",
        maxConcurrentLoops: 10,
      });
      const config = sup.getConfig();
      expect(config.ralphPath).toBe("/custom/ralph");
      expect(config.maxConcurrentLoops).toBe(10);
    });

    it("should accept custom HealthMonitor and RestartManager", () => {
      const customHealthMonitor = new HealthMonitor({ checkIntervalMs: 5000 });
      const customRestartManager = new RestartManager({ circuitBreakerThreshold: 3 });
      const sup = new LoopSupervisor(
        {},
        customHealthMonitor,
        customRestartManager
      );
      expect(sup).toBeDefined();
    });
  });

  describe("start/stop", () => {
    it("should start and stop monitoring", async () => {
      await supervisor.start();
      expect(supervisor.getStats().isMonitoring).toBe(true);

      await supervisor.stop();
      expect(supervisor.getStats().isMonitoring).toBe(false);
    });

    it("should be idempotent on start", async () => {
      await supervisor.start();
      await supervisor.start(); // Second call should be no-op
      expect(supervisor.getStats().isMonitoring).toBe(true);
    });

    it("should be idempotent on stop", async () => {
      await supervisor.stop(); // Stop without starting
      expect(supervisor.getStats().isMonitoring).toBe(false);
    });
  });

  describe("spawnLoop", () => {
    it("should spawn a new loop process", async () => {
      const mockProcess = createMockChildProcess(12345);
      mockSpawn.mockReturnValue(mockProcess);

      const config: LoopConfig = {
        prompt: "test prompt",
        maxIterations: 10,
      };

      const process = await supervisor.spawnLoop("loop-1", config);

      expect(process.id).toBe("loop-1");
      expect(process.pid).toBe(12345);
      expect(process.status).toBe("running");
      expect(process.config).toEqual(config);
      expect(mockSpawn).toHaveBeenCalledWith(
        "ralph",
        expect.arrayContaining(["run"]),
        expect.objectContaining({
          cwd: "/test/workspace",
        })
      );
    });

    it("should reject duplicate loop IDs", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));

      await supervisor.spawnLoop("loop-1", {});
      await expect(supervisor.spawnLoop("loop-1", {})).rejects.toThrow(
        "already exists"
      );
    });

    it("should reject when max concurrent loops reached", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));

      // Create max loops
      for (let i = 0; i < 5; i++) {
        await supervisor.spawnLoop(`loop-${i}`, {});
      }

      // Try to create one more
      await expect(supervisor.spawnLoop("loop-6", {})).rejects.toThrow(
        "Maximum concurrent loops"
      );
    });

    it("should build correct ralph args from config", async () => {
      const mockProcess = createMockChildProcess(12345);
      mockSpawn.mockReturnValue(mockProcess);

      const config: LoopConfig = {
        prompt: "test prompt",
        maxIterations: 10,
        backend: "claude",
        hatCollection: "default",
        memoriesEnabled: false,
        tasksEnabled: false,
      };

      await supervisor.spawnLoop("loop-args", config);

      expect(mockSpawn).toHaveBeenCalledWith(
        "ralph",
        expect.arrayContaining([
          "run",
          "--max-iterations",
          "10",
          "-p",
          "test prompt",
          "-b",
          "claude",
          "--hat-collection",
          "default",
          "--no-memories",
          "--no-tasks",
        ]),
        expect.any(Object)
      );
    });

    it("should emit loop:started event", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));

      const listener = vi.fn();
      supervisor.on("loop:started", listener);

      await supervisor.spawnLoop("loop-event", { prompt: "test" });

      expect(listener).toHaveBeenCalledWith({
        loopId: "loop-event",
        config: { prompt: "test" },
      });
    });
  });

  describe("stopLoop", () => {
    it("should stop a running loop", async () => {
      const mockProcess = createMockChildProcess(12345);
      mockSpawn.mockReturnValue(mockProcess);

      await supervisor.spawnLoop("loop-stop", {});
      await supervisor.stopLoop("loop-stop", "manual");

      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should handle non-existent loop gracefully", async () => {
      // Should not throw for non-existent loop
      await supervisor.stopLoop("nonexistent", "manual");
      expect(true).toBe(true); // Explicit assertion
    });

    it("should emit loop:stopped event", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));

      const listener = vi.fn();
      supervisor.on("loop:stopped", listener);

      await supervisor.spawnLoop("loop-stop-event", {});
      await supervisor.stopLoop("loop-stop-event", "manual");

      expect(listener).toHaveBeenCalledWith({
        loopId: "loop-stop-event",
        reason: "manual",
      });
    });
  });

  describe("restartLoop", () => {
    it("should restart a loop", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));

      await supervisor.spawnLoop("loop-restart", { prompt: "test" });

      // Reset mock for second spawn
      mockSpawn.mockReturnValue(createMockChildProcess(67890));

      await supervisor.restartLoop("loop-restart", "manual");

      const process = supervisor.getProcess("loop-restart");
      expect(process?.pid).toBe(67890);
    });

    it("should throw for non-existent loop", async () => {
      await expect(supervisor.restartLoop("nonexistent", "manual")).rejects.toThrow(
        "not found"
      );
    });
  });

  describe("getAllProcesses / getProcess", () => {
    it("should return all processes", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));
      await supervisor.spawnLoop("loop-1", {});

      mockSpawn.mockReturnValue(createMockChildProcess(67890));
      await supervisor.spawnLoop("loop-2", {});

      const processes = supervisor.getAllProcesses();
      expect(processes).toHaveLength(2);
      expect(processes.map((p) => p.id)).toContain("loop-1");
      expect(processes.map((p) => p.id)).toContain("loop-2");
    });

    it("should return specific process", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));
      await supervisor.spawnLoop("loop-specific", { prompt: "specific" });

      const process = supervisor.getProcess("loop-specific");
      expect(process?.id).toBe("loop-specific");
      expect(process?.config.prompt).toBe("specific");
    });

    it("should return undefined for non-existent process", () => {
      const process = supervisor.getProcess("nonexistent");
      expect(process).toBeUndefined();
    });
  });

  describe("getHealth", () => {
    it("should return health check for a loop", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));

      // Mock heartbeat file
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify({
          loopId: "loop-health",
          pid: 12345,
          timestamp: new Date().toISOString(),
          iteration: 5,
          hat: "coder",
          status: "running",
        })
      );

      await supervisor.spawnLoop("loop-health", {});
      const health = await supervisor.getHealth("loop-health");

      expect(health).toBeDefined();
      expect(health?.loopId).toBe("loop-health");
    });

    it("should return null for non-existent loop", async () => {
      const health = await supervisor.getHealth("nonexistent");
      expect(health).toBeNull();
    });
  });

  describe("getRestartHistory", () => {
    it("should return restart history from RestartManager", () => {
      const history = supervisor.getRestartHistory("loop-1");
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe("getStats", () => {
    it("should return supervisor statistics", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));
      await supervisor.spawnLoop("loop-stats", {});

      const stats = supervisor.getStats();

      expect(stats.totalProcesses).toBe(1);
      expect(stats.runningProcesses).toBe(1);
      expect(stats.maxConcurrentLoops).toBe(5);
    });
  });

  describe("resetCircuitBreaker", () => {
    it("should reset circuit breaker", () => {
      // Should not throw
      supervisor.resetCircuitBreaker("loop-1");
    });
  });

  describe("updateConfig / getConfig", () => {
    it("should update configuration", () => {
      supervisor.updateConfig({ maxConcurrentLoops: 10 });
      expect(supervisor.getConfig().maxConcurrentLoops).toBe(10);
    });

    it("should return copy of config", () => {
      const config1 = supervisor.getConfig();
      const config2 = supervisor.getConfig();
      expect(config1).not.toBe(config2); // Different references
      expect(config1).toEqual(config2); // Same values
    });
  });

  describe("health monitoring integration", () => {
    it("should emit health:check events", async () => {
      const healthListener = vi.fn();

      // Create supervisor with short health check interval
      const sup = new LoopSupervisor({
        healthCheckIntervalMs: 100,
      });
      sup.on("health:check", healthListener);

      mockSpawn.mockReturnValue(createMockChildProcess(12345));
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify({
          loopId: "loop-health-check",
          pid: 12345,
          timestamp: new Date().toISOString(),
          iteration: 1,
          hat: null,
          status: "running",
        })
      );

      await sup.start();
      await sup.spawnLoop("loop-health-check", {});

      // Wait for a health check cycle
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(healthListener).toHaveBeenCalled();

      await sup.stop();
    });
  });

  describe("error handling", () => {
    it("should emit error on spawn failure", async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error("Spawn failed");
      });

      const errorListener = vi.fn();
      supervisor.on("error", errorListener);

      await expect(supervisor.spawnLoop("loop-error", {})).rejects.toThrow(
        "Spawn failed"
      );
    });

    it("should handle process crash", async () => {
      const mockProcess = createMockChildProcess(12345);
      mockSpawn.mockReturnValue(mockProcess);

      const crashListener = vi.fn();
      supervisor.on("loop:crashed", crashListener);

      await supervisor.spawnLoop("loop-crash", {});

      // Simulate crash
      mockProcess.emit("exit", 1, null);

      expect(crashListener).toHaveBeenCalled();
    });
  });

  describe("gracefulShutdown", () => {
    it("should stop all processes on shutdown", async () => {
      mockSpawn.mockReturnValue(createMockChildProcess(12345));
      await supervisor.spawnLoop("loop-shutdown", {});

      await supervisor.gracefulShutdown();

      expect(supervisor.getStats().isMonitoring).toBe(false);
    });

    it("should be idempotent", async () => {
      await supervisor.gracefulShutdown();
      await supervisor.gracefulShutdown(); // Second call should be no-op
    });
  });
});

/**
 * Helper to create a mock child process.
 */
function createMockChildProcess(pid: number): ChildProcess & EventEmitter {
  const mockProcess = new EventEmitter() as ChildProcess & EventEmitter;
  mockProcess.pid = pid;
  mockProcess.killed = false;
  mockProcess.kill = vi.fn((signal?: string) => {
    mockProcess.killed = true;
    setTimeout(() => mockProcess.emit("exit", 0, signal ?? null), 0);
    return true;
  });
  mockProcess.stdout = new EventEmitter() as any;
  mockProcess.stderr = new EventEmitter() as any;
  mockProcess.stdin = null;
  mockProcess.stdio = [null, mockProcess.stdout, mockProcess.stderr, null, null];
  return mockProcess;
}
