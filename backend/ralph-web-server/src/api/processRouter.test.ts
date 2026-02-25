/**
 * Process Router Integration Tests
 *
 * Integration tests for the tRPC processRouter endpoints.
 * Tests the REST API layer with mocked LoopSupervisor.
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import { describe, test, expect, beforeEach, vi } from "bun:test";
import { appRouter, createContext } from "./trpc.js";
import type { LoopSupervisor } from "../services/LoopSupervisor.js";
import type { LoopProcess, HealthCheck, RestartEvent } from "../services/LoopSupervisor.js";

// Create a mock LoopSupervisor for testing
function createMockSupervisor(): LoopSupervisor {
  return {
    getAllProcesses: vi.fn().mockReturnValue([]),
    getProcess: vi.fn().mockReturnValue(null),
    getHealth: vi.fn().mockResolvedValue(null),
    spawnLoop: vi.fn().mockImplementation(async (id: string, config: any) => ({
      id,
      pid: 12345,
      status: "running",
      startedAt: new Date(),
      lastHeartbeat: new Date(),
      restartCount: 0,
      prompt: config?.prompt || "",
      config: config || {},
    })),
    stopLoop: vi.fn().mockResolvedValue(undefined),
    restartLoop: vi.fn().mockResolvedValue(undefined),
    getRestartHistory: vi.fn().mockReturnValue([]),
    // Add other required methods with default implementations
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({ totalProcesses: 0, runningProcesses: 0, maxConcurrentLoops: 10, isMonitoring: false }),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  } as unknown as LoopSupervisor;
}

describe("Process Router - Endpoint Tests", () => {
  let mockSupervisor: LoopSupervisor;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupervisor = createMockSupervisor();
  });

  describe("process.list", () => {
    test("returns empty array when no processes", async () => {
      mockSupervisor.getAllProcesses = vi.fn().mockReturnValue([]);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.list();

      expect(result).toEqual([]);
      expect(mockSupervisor.getAllProcesses).toHaveBeenCalled();
    });

    test("returns processes when supervisor has processes", async () => {
      const mockProcesses: LoopProcess[] = [
        {
          id: "loop-1",
          pid: 12345,
          status: "running",
          startedAt: new Date(),
          lastHeartbeat: new Date(),
          restartCount: 0,
          prompt: "test prompt",
          config: {},
        },
        {
          id: "loop-2",
          pid: 12346,
          status: "running",
          startedAt: new Date(),
          lastHeartbeat: new Date(),
          restartCount: 1,
          prompt: "another prompt",
          config: {},
        },
      ];
      mockSupervisor.getAllProcesses = vi.fn().mockReturnValue(mockProcesses);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.list();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("loop-1");
      expect(result[1].id).toBe("loop-2");
    });

    test("throws error when supervisor not configured", async () => {
      const ctx = createContext({} as any, undefined, undefined, undefined, undefined);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.process.list()).rejects.toThrow("LoopSupervisor is not configured");
    });
  });

  describe("process.get", () => {
    test("returns process by id", async () => {
      const mockProcess: LoopProcess = {
        id: "loop-1",
        pid: 12345,
        status: "running",
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        restartCount: 0,
        prompt: "test prompt",
        config: {},
      };
      mockSupervisor.getProcess = vi.fn().mockReturnValue(mockProcess);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.get({ id: "loop-1" });

      expect(result.id).toBe("loop-1");
      expect(mockSupervisor.getProcess).toHaveBeenCalledWith("loop-1");
    });

    test("throws NOT_FOUND for non-existent process", async () => {
      mockSupervisor.getProcess = vi.fn().mockReturnValue(undefined);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.process.get({ id: "non-existent" })).rejects.toThrow(
        "Loop process 'non-existent' not found"
      );
    });
  });

  describe("process.getHealth", () => {
    test("returns health status for existing process", async () => {
      const mockHealth: HealthCheck = {
        status: "healthy",
        issues: [],
        cpuPercent: 25,
        memoryMB: 512,
        lastCheck: new Date(),
      };
      mockSupervisor.getHealth = vi.fn().mockResolvedValue(mockHealth);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.getHealth({ id: "loop-1" });

      expect(result.status).toBe("healthy");
    });

    test("throws NOT_FOUND when process has no health data", async () => {
      mockSupervisor.getHealth = vi.fn().mockResolvedValue(null);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);

      await expect(caller.process.getHealth({ id: "loop-1" })).rejects.toThrow(
        "Loop process 'loop-1' not found"
      );
    });
  });

  describe("process.start", () => {
    test("spawns new loop process", async () => {
      const newProcess: LoopProcess = {
        id: "new-loop",
        pid: 54321,
        status: "running",
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        restartCount: 0,
        prompt: "my test prompt",
        config: { maxIterations: 10 },
      };
      mockSupervisor.spawnLoop = vi.fn().mockImplementation(async () => newProcess);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.start({
        id: "new-loop",
        config: { maxIterations: 10, prompt: "my test prompt" },
      });

      expect(result.success).toBe(true);
      expect(result.process.id).toBe("new-loop");
      expect(mockSupervisor.spawnLoop).toHaveBeenCalledWith("new-loop", {
        maxIterations: 10,
        prompt: "my test prompt",
      });
    });

    test("spawns loop with minimal config", async () => {
      mockSupervisor.spawnLoop = vi.fn().mockImplementation(async (id: string) => ({
        id,
        pid: 12345,
        status: "running",
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        restartCount: 0,
        prompt: "",
        config: {},
      }));

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.start({ id: "minimal-loop" });

      expect(result.success).toBe(true);
      expect(mockSupervisor.spawnLoop).toHaveBeenCalledWith("minimal-loop", {});
    });
  });

  describe("process.stop", () => {
    test("stops running process", async () => {
      mockSupervisor.stopLoop = vi.fn().mockResolvedValue(undefined);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.stop({ id: "loop-1" });

      expect(result.success).toBe(true);
      expect(mockSupervisor.stopLoop).toHaveBeenCalledWith("loop-1", "manual");
    });
  });

  describe("process.restart", () => {
    test("restarts process", async () => {
      mockSupervisor.restartLoop = vi.fn().mockResolvedValue(undefined);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.restart({ id: "loop-1" });

      expect(result.success).toBe(true);
      expect(mockSupervisor.restartLoop).toHaveBeenCalledWith("loop-1", "manual");
    });
  });

  describe("process.getRestartHistory", () => {
    test("returns restart history", async () => {
      const mockHistory: RestartEvent[] = [
        {
          id: "event-1",
          loopId: "loop-1",
          timestamp: new Date(),
          reason: "crash",
          exitCode: 1,
          backoffSeconds: 0,
        },
        {
          id: "event-2",
          loopId: "loop-1",
          timestamp: new Date(),
          reason: "crash",
          exitCode: 1,
          backoffSeconds: 1,
        },
      ];
      mockSupervisor.getRestartHistory = vi.fn().mockReturnValue(mockHistory);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      const result = await caller.process.getRestartHistory({ id: "loop-1" });

      expect(result).toHaveLength(2);
      expect(mockSupervisor.getRestartHistory).toHaveBeenCalledWith("loop-1", undefined);
    });

    test("passes limit parameter", async () => {
      mockSupervisor.getRestartHistory = vi.fn().mockReturnValue([]);

      const ctx = createContext({} as any, undefined, undefined, undefined, mockSupervisor);
      const caller = appRouter.createCaller(ctx);
      await caller.process.getRestartHistory({ id: "loop-1", limit: 5 });

      expect(mockSupervisor.getRestartHistory).toHaveBeenCalledWith("loop-1", 5);
    });
  });
});
