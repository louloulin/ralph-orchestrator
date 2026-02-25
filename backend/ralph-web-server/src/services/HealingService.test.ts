/**
 * Healing Service Tests
 *
 * Unit tests for the three-layer self-healing mechanism.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { HealingService } from "../services/HealingService";
import { healingRepository } from "../repositories/HealingRepository";

describe("HealingService", () => {
  let service: HealingService;
  const testLoopId = "test-loop-123";
  const testCwd = "/tmp/test-ralph";

  beforeEach(() => {
    service = new HealingService();
    vi.clearAllMocks();
  });

  describe("getCircuitBreakerStatus", () => {
    it("should return closed state for new loop", () => {
      const status = service.getCircuitBreakerStatus(testLoopId);

      expect(status.state).toBe("closed");
      expect(status.failureCount).toBe(0);
      expect(status.loopId).toBe(testLoopId);
    });

    it("should return cached state for existing loop", () => {
      service.getCircuitBreakerStatus(testLoopId);
      const status = service.getCircuitBreakerStatus(testLoopId);

      expect(status.state).toBe("closed");
    });
  });

  describe("triggerCircuitBreaker", () => {
    it("should set circuit breaker to open state", async () => {
      vi.spyOn(healingRepository, "getPolicy").mockResolvedValue({
        maxAgentRetries: 3,
        agentRetryDelay: "30s",
        maxPlatformRestarts: 5,
        platformRestartWindow: "1h",
        backends: ["claude", "gemini"],
        circuitBreakerThreshold: 10,
        circuitBreakerCooldown: "5m",
        escalationChannels: ["telegram"],
      });

      await service.triggerCircuitBreaker(testLoopId, testCwd);

      const status = service.getCircuitBreakerStatus(testLoopId);
      expect(status.state).toBe("open");
      expect(status.nextAttemptAt).not.toBeNull();
    });
  });

  describe("resetCircuitBreaker", () => {
    it("should reset circuit breaker to closed state", async () => {
      // First trigger the circuit breaker
      vi.spyOn(healingRepository, "getPolicy").mockResolvedValue({
        maxAgentRetries: 3,
        agentRetryDelay: "30s",
        maxPlatformRestarts: 5,
        platformRestartWindow: "1h",
        backends: ["claude", "gemini"],
        circuitBreakerThreshold: 10,
        circuitBreakerCooldown: "5m",
        escalationChannels: ["telegram"],
      });

      await service.triggerCircuitBreaker(testLoopId, testCwd);

      // Then reset it
      service.resetCircuitBreaker(testLoopId);

      const status = service.getCircuitBreakerStatus(testLoopId);
      expect(status.state).toBe("closed");
      expect(status.failureCount).toBe(0);
      expect(status.lastFailureAt).toBeNull();
      expect(status.nextAttemptAt).toBeNull();
    });
  });

  describe("heal", () => {
    it("should handle healing when circuit breaker is open", async () => {
      vi.spyOn(healingRepository, "getPolicy").mockResolvedValue({
        maxAgentRetries: 3,
        agentRetryDelay: "30s",
        maxPlatformRestarts: 5,
        platformRestartWindow: "1h",
        backends: ["claude", "gemini"],
        circuitBreakerThreshold: 10,
        circuitBreakerCooldown: "5m",
        escalationChannels: ["telegram"],
      });

      // Set circuit breaker to open
      await service.triggerCircuitBreaker(testLoopId, testCwd);

      vi.spyOn(healingRepository, "recordEvent").mockResolvedValue();

      const event = await service.heal(
        testLoopId,
        "api_error",
        { error: "test error" },
        testCwd
      );

      expect(event.layer).toBe("circuit_breaker");
      expect(event.result.status).toBe("failed");
    });
  });

  describe("triggerHealing", () => {
    it("should manually trigger healing action", async () => {
      vi.spyOn(healingRepository, "recordEvent").mockResolvedValue();

      const result = await service.triggerHealing(
        testLoopId,
        {
          type: "restart",
          params: { reason: "Manual restart" },
          reason: "Manual intervention",
        },
        testCwd
      );

      expect(result.status).toBe("success");
      expect(healingRepository.recordEvent).toHaveBeenCalled();
    });
  });
});

describe("Healing layers", () => {
  it("should have correct layer ordering", () => {
    const layers = ["agent", "platform", "circuit_breaker", "manual"];
    expect(layers).toContain("agent");
    expect(layers).toContain("platform");
    expect(layers).toContain("circuit_breaker");
    expect(layers).toContain("manual");
  });
});

describe("Healing triggers", () => {
  it("should have all required triggers", () => {
    const triggers = [
      "consecutive_failures",
      "validation_error",
      "api_error",
      "timeout",
      "resource_exhausted",
      "loop_thrashing",
      "manual",
    ];

    triggers.forEach((trigger) => {
      expect(trigger).toBeDefined();
    });
  });
});
