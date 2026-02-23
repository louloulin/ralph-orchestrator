/**
 * Tests for RestartManager Service
 */

import { describe, test, expect, beforeEach, vi } from "bun:test";
import {
  RestartManager,
  DEFAULT_RESTART_MANAGER_CONFIG,
} from "./RestartManager.js";
import { DEFAULT_RESTART_POLICY } from "../types/process.js";
import type { TerminationReason } from "../types/process.js";

describe("RestartManager", () => {
  let manager: RestartManager;

  beforeEach(() => {
    manager = new RestartManager();
  });

  describe("constructor", () => {
    test("should use default config", () => {
      const config = manager.getConfig();
      expect(config.policy.maxRestarts).toBe(DEFAULT_RESTART_POLICY.maxRestarts);
      expect(config.policy.backoffBase).toBe(DEFAULT_RESTART_POLICY.backoffBase);
      expect(config.circuitBreakerEnabled).toBe(true);
    });

    test("should accept custom config", () => {
      const customManager = new RestartManager({
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 10 },
        circuitBreakerThreshold: 3,
      });
      const config = customManager.getConfig();
      expect(config.policy.maxRestarts).toBe(10);
      expect(config.circuitBreakerThreshold).toBe(3);
    });
  });

  describe("processTermination", () => {
    test("should allow restart for first failure", () => {
      const decision = manager.processTermination("loop-test", "crash", 3600);

      expect(decision.shouldRestart).toBe(true);
      expect(decision.backoffSeconds).toBe(5); // Default base
      expect(decision.circuitBreakerActive).toBe(false);
    });

    test("should not restart for manual stop", () => {
      const decision = manager.processTermination("loop-test", "manual", 3600);

      expect(decision.shouldRestart).toBe(true);
      expect(decision.backoffSeconds).toBe(0); // No backoff for manual
    });

    test("should apply exponential backoff", () => {
      const decision1 = manager.processTermination("loop-test", "crash", 3600);
      expect(decision1.backoffSeconds).toBe(5); // 5 * 2^0 = 5 (first restart)

      const decision2 = manager.processTermination("loop-test", "crash", 1800);
      expect(decision2.backoffSeconds).toBe(10); // 5 * 2^1 = 10 (second restart)

      const decision3 = manager.processTermination("loop-test", "crash", 900);
      expect(decision3.backoffSeconds).toBe(20); // 5 * 2^2 = 20 (third restart)

      const decision4 = manager.processTermination("loop-test", "crash", 450);
      expect(decision4.backoffSeconds).toBe(40); // 5 * 2^3 = 40 (fourth restart)
    });

    test("should cap backoff at maximum", () => {
      // Force many restarts to exceed max backoff
      for (let i = 0; i < 10; i++) {
        manager.processTermination("loop-test", "crash", 100);
      }

      const decision = manager.processTermination("loop-test", "crash", 100);
      expect(decision.backoffSeconds).toBeLessThanOrEqual(300); // max backoff
    });

    test("should reject restart after max restarts reached", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 10, // Higher than maxRestarts to avoid circuit breaker
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 5 },
      });

      // Hit max restarts (default is 5)
      for (let i = 0; i < 5; i++) {
        customManager.processTermination("loop-test", "crash", 100);
      }

      const decision = customManager.processTermination("loop-test", "crash", 100);

      expect(decision.shouldRestart).toBe(false);
      expect(decision.rejectionReason).toContain("Maximum restarts");
    });

    test("should trip circuit breaker after threshold", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 3,
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 10 },
      });

      // 3 consecutive failures
      customManager.processTermination("loop-test", "crash", 100);
      customManager.processTermination("loop-test", "crash", 100);
      const decision = customManager.processTermination("loop-test", "crash", 100);

      expect(decision.circuitBreakerActive).toBe(true);
      expect(decision.shouldRestart).toBe(false);
      expect(decision.rejectionReason).toContain("Circuit breaker");
    });

    test("should reset consecutive failures on successful start", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 3,
      });

      customManager.processTermination("loop-test", "crash", 100);
      customManager.processTermination("loop-test", "crash", 100);
      expect(customManager.getConsecutiveFailures("loop-test")).toBe(2);

      customManager.recordSuccessfulStart("loop-test");
      expect(customManager.getConsecutiveFailures("loop-test")).toBe(0);
    });

    test("should call onRestartNeeded callback", () => {
      const callback = vi.fn();
      manager.setOnRestartNeeded(callback);

      manager.processTermination("loop-test", "crash", 3600);

      expect(callback).toHaveBeenCalledWith(
        "loop-test",
        5,
        "crash"
      );
    });

    test("should not call callback when restart is rejected", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 10, // Higher than maxRestarts to avoid circuit breaker
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 5 },
      });
      const callback = vi.fn();
      customManager.setOnRestartNeeded(callback);

      // Hit max restarts
      for (let i = 0; i < 5; i++) {
        customManager.processTermination("loop-test", "crash", 100);
      }

      // This should not trigger callback
      customManager.processTermination("loop-test", "crash", 100);

      // Callback should have been called 5 times (for successful restarts)
      // but not the 6th time
      expect(callback).toHaveBeenCalledTimes(5);
    });
  });

  describe("calculateBackoff", () => {
    test("should return 0 for non-failure restarts", () => {
      expect(manager.calculateBackoff(0, false)).toBe(0);
      expect(manager.calculateBackoff(5, false)).toBe(0);
    });

    test("should calculate exponential backoff", () => {
      expect(manager.calculateBackoff(0, true)).toBe(5); // 5 * 2^0
      expect(manager.calculateBackoff(1, true)).toBe(10); // 5 * 2^1
      expect(manager.calculateBackoff(2, true)).toBe(20); // 5 * 2^2
      expect(manager.calculateBackoff(3, true)).toBe(40); // 5 * 2^3
    });

    test("should cap at maximum backoff", () => {
      expect(manager.calculateBackoff(100, true)).toBe(300); // max backoff
    });
  });

  describe("circuit breaker", () => {
    test("should not be active initially", () => {
      expect(manager.isCircuitBreakerActive("loop-test")).toBe(false);
    });

    test("should be active after tripping", () => {
      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        manager.processTermination("loop-test", "crash", 100);
      }

      expect(manager.isCircuitBreakerActive("loop-test")).toBe(true);
    });

    test("should reset after cooldown", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 2,
        circuitBreakerCooldownSeconds: 1, // 1 second for testing
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 10 },
      });

      // Trigger circuit breaker
      customManager.processTermination("loop-test", "crash", 100);
      customManager.processTermination("loop-test", "crash", 100);

      expect(customManager.isCircuitBreakerActive("loop-test")).toBe(true);

      // Wait for cooldown
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(customManager.isCircuitBreakerActive("loop-test")).toBe(false);
          resolve();
        }, 1100);
      });
    });

    test("should manually reset circuit breaker", () => {
      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        manager.processTermination("loop-test", "crash", 100);
      }

      expect(manager.isCircuitBreakerActive("loop-test")).toBe(true);

      manager.resetCircuitBreaker("loop-test");

      expect(manager.isCircuitBreakerActive("loop-test")).toBe(false);
    });

    test("should return time remaining for circuit breaker", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 2,
        circuitBreakerCooldownSeconds: 60,
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 10 },
      });

      // Trigger circuit breaker
      customManager.processTermination("loop-test", "crash", 100);
      customManager.processTermination("loop-test", "crash", 100);

      const remaining = customManager.getCircuitBreakerTimeRemaining("loop-test");
      expect(remaining).toBeGreaterThan(58);
      expect(remaining).toBeLessThanOrEqual(60);
    });
  });

  describe("restart history", () => {
    test("should record restart events", () => {
      manager.processTermination("loop-test", "crash", 3600);
      manager.processTermination("loop-test", "api_error", 1800);

      const history = manager.getRestartHistory("loop-test");

      expect(history).toHaveLength(2);
      expect(history[0].reason).toBe("crash");
      expect(history[1].reason).toBe("api_error");
    });

    test("should limit history with limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        manager.processTermination("loop-test", "crash", 100);
      }

      const history = manager.getRestartHistory("loop-test", 3);

      expect(history).toHaveLength(3);
    });

    test("should include previous uptime in events", () => {
      manager.processTermination("loop-test", "crash", 3600);

      const history = manager.getRestartHistory("loop-test");

      expect(history[0].previousUptime).toBe(3600);
    });

    test("should include backoff in events", () => {
      manager.processTermination("loop-test", "crash", 3600);

      const history = manager.getRestartHistory("loop-test");

      expect(history[0].backoffSeconds).toBe(5);
    });
  });

  describe("getRestartCountInWindow", () => {
    test("should count restarts in window", () => {
      manager.processTermination("loop-test", "crash", 100);
      manager.processTermination("loop-test", "crash", 100);
      manager.processTermination("loop-test", "crash", 100);

      expect(manager.getRestartCountInWindow("loop-test")).toBe(3);
    });

    test("should return 0 for unknown loop", () => {
      expect(manager.getRestartCountInWindow("unknown")).toBe(0);
    });
  });

  describe("clearTracking", () => {
    test("should clear all tracking data", () => {
      manager.processTermination("loop-test", "crash", 100);
      manager.processTermination("loop-test", "crash", 100);

      manager.clearTracking("loop-test");

      expect(manager.getRestartHistory("loop-test")).toHaveLength(0);
      expect(manager.getRestartCountInWindow("loop-test")).toBe(0);
    });
  });

  describe("canRestartNow", () => {
    test("should allow restart for new loop", () => {
      const decision = manager.canRestartNow("new-loop");

      expect(decision.shouldRestart).toBe(true);
      expect(decision.circuitBreakerActive).toBe(false);
    });

    test("should not allow restart when max reached", () => {
      // Hit max
      for (let i = 0; i < 5; i++) {
        manager.processTermination("loop-test", "crash", 100);
      }

      const decision = manager.canRestartNow("loop-test");

      expect(decision.shouldRestart).toBe(false);
    });

    test("should not allow restart when circuit breaker active", () => {
      const customManager = new RestartManager({
        circuitBreakerThreshold: 3,
        circuitBreakerCooldownSeconds: 60,
        policy: { ...DEFAULT_RESTART_POLICY, maxRestarts: 10 },
      });

      // Trigger circuit breaker with 3 failures
      customManager.processTermination("loop-test", "crash", 100);
      customManager.processTermination("loop-test", "crash", 100);
      customManager.processTermination("loop-test", "crash", 100);

      const decision = customManager.canRestartNow("loop-test");

      expect(decision.circuitBreakerActive).toBe(true);
    });
  });

  describe("getStats", () => {
    test("should return comprehensive stats", () => {
      manager.processTermination("loop-test", "crash", 100);
      manager.processTermination("loop-test", "crash", 100);

      const stats = manager.getStats("loop-test");

      expect(stats.restartCountInWindow).toBe(2);
      expect(stats.consecutiveFailures).toBe(2);
      expect(stats.circuitBreakerActive).toBe(false);
      expect(stats.totalRestarts).toBe(2);
    });

    test("should return zero stats for unknown loop", () => {
      const stats = manager.getStats("unknown");

      expect(stats.restartCountInWindow).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.totalRestarts).toBe(0);
    });
  });

  describe("updatePolicy", () => {
    test("should update policy", () => {
      manager.updatePolicy({ maxRestarts: 10 });

      expect(manager.getPolicy().maxRestarts).toBe(10);
    });
  });

  describe("updateConfig", () => {
    test("should update config", () => {
      manager.updateConfig({ circuitBreakerThreshold: 10 });

      expect(manager.getConfig().circuitBreakerThreshold).toBe(10);
    });
  });
});
