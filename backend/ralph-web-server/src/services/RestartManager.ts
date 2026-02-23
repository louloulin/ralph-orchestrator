/**
 * RestartManager Service
 *
 * Manages loop process restart behavior with:
 * - Exponential backoff restarts
 * - Max restart limits per time window
 * - Restart reason classification
 * - Circuit breaker for repeated failures
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import type {
  RestartEvent,
  RestartPolicy,
  TerminationReason,
} from "../types/process.js";
import { DEFAULT_RESTART_POLICY } from "../types/process.js";

/**
 * Configuration for the restart manager.
 */
export interface RestartManagerConfig {
  /** Restart policy */
  policy: RestartPolicy;
  /** Whether to enable circuit breaker */
  circuitBreakerEnabled: boolean;
  /** Number of consecutive failures to trigger circuit breaker */
  circuitBreakerThreshold: number;
  /** Time to wait before allowing restarts after circuit breaker (in seconds) */
  circuitBreakerCooldownSeconds: number;
}

/**
 * Default restart manager configuration.
 */
export const DEFAULT_RESTART_MANAGER_CONFIG: RestartManagerConfig = {
  policy: DEFAULT_RESTART_POLICY,
  circuitBreakerEnabled: true,
  circuitBreakerThreshold: 5,
  circuitBreakerCooldownSeconds: 600, // 10 minutes
};

/**
 * Internal tracking for restarts.
 */
interface RestartTracker {
  /** List of restart timestamps within the window */
  restartTimes: number[];
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Last failure time (epoch ms) */
  lastFailureTime: number;
  /** Circuit breaker tripped at (epoch ms, or 0 if not tripped) */
  circuitBreakerTrippedAt: number;
}

/**
 * Result of a restart decision.
 */
export interface RestartDecision {
  /** Whether a restart should be performed */
  shouldRestart: boolean;
  /** Backoff delay in seconds (if restarting) */
  backoffSeconds: number;
  /** Reason why restart was rejected (if not restarting) */
  rejectionReason?: string;
  /** Whether circuit breaker is active */
  circuitBreakerActive: boolean;
}

/**
 * RestartManager Service
 *
 * Responsible for managing restart behavior and implementing circuit breaker.
 */
export class RestartManager {
  private config: RestartManagerConfig;
  private trackers: Map<string, RestartTracker> = new Map();
  private restartHistory: Map<string, RestartEvent[]> = new Map();
  private onRestartNeeded:
    | ((loopId: string, backoffSeconds: number, reason: TerminationReason) => void)
    | null = null;

  constructor(config: Partial<RestartManagerConfig> = {}) {
    this.config = { ...DEFAULT_RESTART_MANAGER_CONFIG, ...config };
  }

  /**
   * Set callback for when a restart is needed.
   */
  setOnRestartNeeded(
    callback: (
      loopId: string,
      backoffSeconds: number,
      reason: TerminationReason
    ) => void
  ): void {
    this.onRestartNeeded = callback;
  }

  /**
   * Process a termination and decide whether to restart.
   */
  processTermination(
    loopId: string,
    reason: TerminationReason,
    previousUptimeSeconds: number
  ): RestartDecision {
    const tracker = this.getOrCreateTracker(loopId);
    const now = Date.now();

    // Check if circuit breaker is active
    if (this.isCircuitBreakerActive(loopId)) {
      return {
        shouldRestart: false,
        backoffSeconds: 0,
        rejectionReason: "Circuit breaker is active due to repeated failures",
        circuitBreakerActive: true,
      };
    }

    // Clean up old restarts outside the window
    this.cleanupOldRestarts(tracker, now);

    // Count restarts in window
    const restartsInWindow = tracker.restartTimes.length;

    // Check max restarts limit
    if (restartsInWindow >= this.config.policy.maxRestarts) {
      return {
        shouldRestart: false,
        backoffSeconds: 0,
        rejectionReason: `Maximum restarts (${this.config.policy.maxRestarts}) reached within the time window`,
        circuitBreakerActive: false,
      };
    }

    // Check if this is a failure (not manual stop)
    const isFailure = reason !== "manual";

    if (isFailure) {
      tracker.consecutiveFailures++;
      tracker.lastFailureTime = now;

      // Check circuit breaker threshold
      if (
        this.config.circuitBreakerEnabled &&
        tracker.consecutiveFailures >= this.config.circuitBreakerThreshold
      ) {
        this.tripCircuitBreaker(loopId);
        return {
          shouldRestart: false,
          backoffSeconds: 0,
          rejectionReason: `Circuit breaker tripped after ${tracker.consecutiveFailures} consecutive failures`,
          circuitBreakerActive: true,
        };
      }
    }

    // Calculate backoff
    const backoffSeconds = this.calculateBackoff(
      tracker.restartTimes.length,
      isFailure
    );

    // Record the restart
    tracker.restartTimes.push(now);

    // Record restart event
    const event: RestartEvent = {
      loopId,
      timestamp: new Date(now),
      reason,
      previousUptime: previousUptimeSeconds,
      backoffSeconds,
    };
    this.recordRestartEvent(loopId, event);

    // Trigger callback if set
    if (this.onRestartNeeded) {
      this.onRestartNeeded(loopId, backoffSeconds, reason);
    }

    return {
      shouldRestart: true,
      backoffSeconds,
      circuitBreakerActive: false,
    };
  }

  /**
   * Calculate exponential backoff delay.
   */
  calculateBackoff(restartCount: number, isFailure: boolean): number {
    const { backoffBase, backoffMax, backoffMultiplier } = this.config.policy;

    if (!isFailure) {
      // No backoff for manual restarts
      return 0;
    }

    // Exponential backoff: base * multiplier^count
    const delay = backoffBase * Math.pow(backoffMultiplier, restartCount);

    // Cap at maximum
    return Math.min(delay, backoffMax);
  }

  /**
   * Check if circuit breaker is active for a loop.
   */
  isCircuitBreakerActive(loopId: string): boolean {
    const tracker = this.trackers.get(loopId);
    if (!tracker || tracker.circuitBreakerTrippedAt === 0) {
      return false;
    }

    const now = Date.now();
    const cooldownMs = this.config.circuitBreakerCooldownSeconds * 1000;

    // Check if cooldown has passed
    if (now - tracker.circuitBreakerTrippedAt >= cooldownMs) {
      // Reset circuit breaker
      tracker.circuitBreakerTrippedAt = 0;
      tracker.consecutiveFailures = 0;
      return false;
    }

    return true;
  }

  /**
   * Get time remaining until circuit breaker resets (in seconds).
   */
  getCircuitBreakerTimeRemaining(loopId: string): number {
    const tracker = this.trackers.get(loopId);
    if (!tracker || tracker.circuitBreakerTrippedAt === 0) {
      return 0;
    }

    const now = Date.now();
    const cooldownMs = this.config.circuitBreakerCooldownSeconds * 1000;
    const elapsed = now - tracker.circuitBreakerTrippedAt;
    const remaining = cooldownMs - elapsed;

    return Math.max(0, Math.ceil(remaining / 1000));
  }

  /**
   * Manually reset circuit breaker for a loop.
   */
  resetCircuitBreaker(loopId: string): void {
    const tracker = this.trackers.get(loopId);
    if (tracker) {
      tracker.circuitBreakerTrippedAt = 0;
      tracker.consecutiveFailures = 0;
    }
  }

  /**
   * Record a successful start (resets consecutive failure count).
   */
  recordSuccessfulStart(loopId: string): void {
    const tracker = this.trackers.get(loopId);
    if (tracker) {
      tracker.consecutiveFailures = 0;
    }
  }

  /**
   * Get restart history for a loop.
   */
  getRestartHistory(loopId: string, limit?: number): RestartEvent[] {
    const history = this.restartHistory.get(loopId) ?? [];
    if (limit !== undefined && limit > 0) {
      return history.slice(-limit);
    }
    return [...history];
  }

  /**
   * Get restart count within the current window.
   */
  getRestartCountInWindow(loopId: string): number {
    const tracker = this.trackers.get(loopId);
    if (!tracker) {
      return 0;
    }

    this.cleanupOldRestarts(tracker, Date.now());
    return tracker.restartTimes.length;
  }

  /**
   * Get consecutive failure count.
   */
  getConsecutiveFailures(loopId: string): number {
    const tracker = this.trackers.get(loopId);
    return tracker?.consecutiveFailures ?? 0;
  }

  /**
   * Clear tracking data for a loop.
   */
  clearTracking(loopId: string): void {
    this.trackers.delete(loopId);
    this.restartHistory.delete(loopId);
  }

  /**
   * Update the restart policy.
   */
  updatePolicy(policy: Partial<RestartPolicy>): void {
    this.config.policy = { ...this.config.policy, ...policy };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<RestartManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration.
   */
  getConfig(): RestartManagerConfig {
    return { ...this.config, policy: { ...this.config.policy } };
  }

  /**
   * Get current policy.
   */
  getPolicy(): RestartPolicy {
    return { ...this.config.policy };
  }

  /**
   * Get or create a tracker for a loop.
   */
  private getOrCreateTracker(loopId: string): RestartTracker {
    let tracker = this.trackers.get(loopId);
    if (!tracker) {
      tracker = {
        restartTimes: [],
        consecutiveFailures: 0,
        lastFailureTime: 0,
        circuitBreakerTrippedAt: 0,
      };
      this.trackers.set(loopId, tracker);
    }
    return tracker;
  }

  /**
   * Clean up restart times outside the window.
   */
  private cleanupOldRestarts(tracker: RestartTracker, now: number): void {
    const windowMs = this.config.policy.windowSeconds * 1000;
    const cutoff = now - windowMs;
    tracker.restartTimes = tracker.restartTimes.filter((t) => t >= cutoff);
  }

  /**
   * Trip the circuit breaker for a loop.
   */
  private tripCircuitBreaker(loopId: string): void {
    const tracker = this.getOrCreateTracker(loopId);
    tracker.circuitBreakerTrippedAt = Date.now();
  }

  /**
   * Record a restart event in history.
   */
  private recordRestartEvent(loopId: string, event: RestartEvent): void {
    let history = this.restartHistory.get(loopId);
    if (!history) {
      history = [];
      this.restartHistory.set(loopId, history);
    }
    history.push(event);

    // Keep only last 100 events
    if (history.length > 100) {
      history.shift();
    }
  }

  /**
   * Check if a restart should be allowed now (without processing a termination).
   * Useful for checking if a manual restart would be allowed.
   */
  canRestartNow(loopId: string): RestartDecision {
    const tracker = this.trackers.get(loopId);

    // Check circuit breaker
    if (this.isCircuitBreakerActive(loopId)) {
      return {
        shouldRestart: false,
        backoffSeconds: 0,
        rejectionReason: "Circuit breaker is active due to repeated failures",
        circuitBreakerActive: true,
      };
    }

    if (tracker) {
      // Clean up old restarts
      this.cleanupOldRestarts(tracker, Date.now());

      // Check max restarts
      if (tracker.restartTimes.length >= this.config.policy.maxRestarts) {
        return {
          shouldRestart: false,
          backoffSeconds: 0,
          rejectionReason: `Maximum restarts (${this.config.policy.maxRestarts}) reached within the time window`,
          circuitBreakerActive: false,
        };
      }
    }

    return {
      shouldRestart: true,
      backoffSeconds: 0,
      circuitBreakerActive: false,
    };
  }

  /**
   * Get statistics for a loop.
   */
  getStats(loopId: string): {
    restartCountInWindow: number;
    maxRestarts: number;
    consecutiveFailures: number;
    circuitBreakerThreshold: number;
    circuitBreakerActive: boolean;
    circuitBreakerTimeRemaining: number;
    totalRestarts: number;
  } {
    const history = this.restartHistory.get(loopId) ?? [];
    return {
      restartCountInWindow: this.getRestartCountInWindow(loopId),
      maxRestarts: this.config.policy.maxRestarts,
      consecutiveFailures: this.getConsecutiveFailures(loopId),
      circuitBreakerThreshold: this.config.circuitBreakerThreshold,
      circuitBreakerActive: this.isCircuitBreakerActive(loopId),
      circuitBreakerTimeRemaining: this.getCircuitBreakerTimeRemaining(loopId),
      totalRestarts: history.length,
    };
  }
}
