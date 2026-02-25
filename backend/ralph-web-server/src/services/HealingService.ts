/**
 * Healing Service
 *
 * Main orchestrator for the three-layer self-healing mechanism.
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import {
  type HealingLayer,
  type HealingTrigger,
  type HealingAction,
  type HealingResult,
  type HealingEvent,
  type HealingPolicy,
  type KnownFix,
  type CircuitBreakerState,
  type CircuitBreakerStatus,
} from "../types/healing";
import { healingRepository } from "../repositories/HealingRepository";

/**
 * Healing Service
 *
 * Implements the three-layer self-healing architecture:
 * - Layer 1: Agent self-correction
 * - Layer 2: Platform intervention
 * - Layer 3: Circuit breaker
 */
export class HealingService {
  private circuitBreakerStates: Map<string, CircuitBreakerStatus>;

  constructor() {
    this.circuitBreakerStates = new Map();
  }

  /**
   * Initiates healing for a loop
   *
   * @param loopId - Loop identifier
   * @param trigger - What triggered the healing
   * @param details - Additional context
   * @param cwd - Working directory
   */
  async heal(
    loopId: string,
    trigger: HealingTrigger,
    details: Record<string, any>,
    cwd: string
  ): Promise<HealingEvent> {
    const policy = await healingRepository.getPolicy(cwd);

    // Check circuit breaker
    const cbStatus = this.getCircuitBreakerStatus(loopId);
    if (cbStatus.state === "open") {
      // Circuit breaker is open, escalate directly
      const event = await this.createEvent(
        loopId,
        "circuit_breaker",
        trigger,
        {
          type: "escalate",
          params: { reason: "Circuit breaker is open" },
          reason: "Circuit breaker is open, escalating to human",
        },
        {
          status: "failed",
          error: "Circuit breaker is open",
          nextLayer: "circuit_breaker",
        },
        { ...details, circuitBreakerOpen: true }
      );
      await healingRepository.recordEvent(event, cwd);
      return event;
    }

    // Try Layer 1: Agent self-correction
    let result = await this.agentHeal(loopId, trigger, details, policy);
    if (result.status === "success") {
      await this.resetCircuitBreaker(loopId);
    }

    const event = await this.createEvent(
      loopId,
      "agent",
      trigger,
      result.action,
      result,
      details
    );
    await healingRepository.recordEvent(event, cwd);

    // If Layer 1 failed, try Layer 2
    if (result.status === "failed") {
      const event2 = await this.platformHeal(
        loopId,
        trigger,
        result.nextLayer,
        details,
        policy,
        cwd
      );

      await healingRepository.recordEvent(event2, cwd);

      // If Layer 2 failed, trigger circuit breaker
      if (event2.result.status === "failed") {
        await this.triggerCircuitBreaker(loopId, cwd);

        const event3 = await this.createEvent(
          loopId,
          "circuit_breaker",
          trigger,
          {
            type: "escalate",
            params: { reason: "Platform healing failed" },
            reason: "Escalating to human operator",
          },
          {
            status: "failed",
            error: "Circuit breaker triggered",
            nextLayer: "circuit_breaker",
          },
          details
        );
        await healingRepository.recordEvent(event3, cwd);
        return event3;
      }

      return event2;
    }

    return event;
  }

  /**
   * Layer 1: Agent self-correction
   */
  private async agentHeal(
    loopId: string,
    trigger: HealingTrigger,
    details: Record<string, any>,
    policy: HealingPolicy
  ): Promise<HealingResult & { action: HealingAction }> {
    const action: HealingAction = {
      type: "retry_with_backtrack",
      params: { trigger },
      reason: "Agent self-correction: backtracking to last successful iteration",
    };

    // Check if we've exceeded max agent retries
    const events = await healingRepository.getEvents(loopId, process.cwd());
    const recentAgentFailures = events.filter(
      (e) =>
        e.layer === "agent" &&
        e.result.status === "failed" &&
        new Date(e.timestamp).getTime() > Date.now() - 3600000 // 1 hour
    );

    if (recentAgentFailures.length >= policy.maxAgentRetries) {
      return {
        action: {
          type: "escalate_to_platform",
          params: { reason: "Max agent retries exceeded" },
          reason: "Escalating to platform layer",
        },
        ...{
          status: "failed",
          error: `Max agent retries (${policy.maxAgentRetries}) exceeded`,
          nextLayer: "platform",
        },
      };
    }

    // Simulate successful agent healing
    // In a real implementation, this would coordinate with the agent
    return {
      action,
      ...{
        status: "success",
        details: `Agent self-corrected for trigger: ${trigger}`,
      },
    };
  }

  /**
   * Layer 2: Platform intervention
   */
  private async platformHeal(
    loopId: string,
    trigger: HealingTrigger,
    nextLayer: HealingLayer,
    details: Record<string, any>,
    policy: HealingPolicy,
    cwd: string
  ): Promise<HealingEvent> {
    const action: HealingAction = {
      type: "restart_from_checkpoint",
      params: { trigger },
      reason: "Platform intervention: restarting from last checkpoint",
    };

    // Check if we've exceeded max platform restarts
    const events = await healingRepository.getEvents(
      loopId,
      cwd,
      policy.maxPlatformRestarts * 2
    );
    const recentPlatformRestarts = events.filter(
      (e) =>
        e.layer === "platform" &&
        e.action.type === "restart_from_checkpoint" &&
        new Date(e.timestamp).getTime() >
          Date.now() - this.parseDuration(policy.platformRestartWindow)
    );

    if (recentPlatformRestarts.length >= policy.maxPlatformRestarts) {
      const failAction: HealingAction = {
        type: "escalate_to_circuit_breaker",
        params: { reason: "Max platform restarts exceeded" },
        reason: "Escalating to circuit breaker",
      };

      const failEvent = await this.createEvent(
        loopId,
        "platform",
        trigger,
        failAction,
        {
          status: "failed",
          error: `Max platform restarts (${policy.maxPlatformRestarts}) exceeded`,
          nextLayer: "circuit_breaker",
        },
        details
      );
      return failEvent;
    }

    // Try to find a matching known fix pattern
    const fixes = await healingRepository.getKnownFixes(cwd);
    const matchingFix = fixes.find((fix) =>
      this.errorMatchesPattern(details.error || "", fix.pattern)
    );

    if (matchingFix) {
      const fixAction: HealingAction = {
        type: matchingFix.action.type,
        params: matchingFix.action,
        reason: `Applying known fix: ${matchingFix.description}`,
      };

      return await this.createEvent(
        loopId,
        "platform",
        trigger,
        fixAction,
        {
          status: "success",
          details: `Applied known fix: ${matchingFix.id}`,
        },
        { ...details, knownFixId: matchingFix.id }
      );
    }

    // Simulate successful platform restart
    return await this.createEvent(
      loopId,
      "platform",
      trigger,
      action,
      {
        status: "success",
        details: "Restarted from checkpoint",
      },
      details
    );
  }

  /**
   * Gets circuit breaker status for a loop
   */
  getCircuitBreakerStatus(loopId: string): CircuitBreakerStatus {
    if (!this.circuitBreakerStates.has(loopId)) {
      this.circuitBreakerStates.set(loopId, {
        state: "closed",
        failureCount: 0,
        lastFailureAt: null,
        nextAttemptAt: null,
        loopId,
      });
    }
    return this.circuitBreakerStates.get(loopId)!;
  }

  /**
   * Triggers the circuit breaker
   */
  async triggerCircuitBreaker(loopId: string, cwd: string): Promise<void> {
    const policy = await healingRepository.getPolicy(cwd);
    const status = this.getCircuitBreakerStatus(loopId);

    status.state = "open";
    status.nextAttemptAt = new Date(
      Date.now() + this.parseDuration(policy.circuitBreakerCooldown)
    ).toISOString();

    // Send notification via Telegram
    // This would be implemented via the Telegram bot integration
    console.log(`[Healing] Circuit breaker triggered for loop ${loopId}`);
  }

  /**
   * Resets the circuit breaker
   */
  resetCircuitBreaker(loopId: string): void {
    const status = this.getCircuitBreakerStatus(loopId);
    status.state = "closed";
    status.failureCount = 0;
    status.lastFailureAt = null;
    status.nextAttemptAt = null;
  }

  /**
   * Manually trigger a healing action
   */
  async triggerHealing(
    loopId: string,
    action: HealingAction,
    cwd: string
  ): Promise<HealingResult> {
    const event = await this.createEvent(
      loopId,
      "manual",
      "manual",
      action,
      {
        status: "success",
        details: "Manual healing action triggered",
      },
      {}
    );
    await healingRepository.recordEvent(event, cwd);

    return {
      status: "success",
      details: `Manual healing action ${action.type} executed`,
    };
  }

  /**
   * Creates a healing event
   */
  private async createEvent(
    loopId: string,
    layer: HealingLayer,
    trigger: HealingTrigger,
    action: HealingAction,
    result: HealingResult,
    details: Record<string, any>
  ): Promise<HealingEvent> {
    return {
      id: this.generateEventId(),
      loopId,
      timestamp: new Date().toISOString(),
      layer,
      trigger,
      action,
      result,
      details,
    };
  }

  /**
   * Tests if an error matches a pattern
   */
  private errorMatchesPattern(error: string, pattern: RegExp): boolean {
    return pattern.test(error);
  }

  /**
   * Parses a duration string (e.g., "30s", "1h") to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smh])$/);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value * 1000;
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      default:
        return 0;
    }
  }

  /**
   * Generates a unique event ID
   */
  private generateEventId(): string {
    return `heal-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  }
}

/**
 * Default service instance
 */
export const healingService = new HealingService();