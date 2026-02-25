/**
 * Healing Types for Self-Recovery Mechanism
 *
 * These types support the Phase 4 P4-4 self-healing system:
 * - AgentHealer: Layer 1 - Agent self-correction
 * - PlatformHealer: Layer 2 - Platform intervention
 * - CircuitBreaker: Layer 3 - Circuit breaker and escalation
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

/**
 * Healing layer in the three-tier architecture.
 */
export type HealingLayer = "agent" | "platform" | "circuit_breaker" | "manual";

/**
 * Trigger that initiated a healing event.
 */
export type HealingTrigger =
  | "consecutive_failures"
  | "validation_error"
  | "api_error"
  | "timeout"
  | "resource_exhausted"
  | "loop_thrashing"
  | "manual";

/**
 * Result of a healing action.
 */
export type HealingResult =
  | { status: "success"; details: string }
  | { status: "failed"; error: string; nextLayer: HealingLayer };

/**
 * Healing action taken by the system.
 */
export interface HealingAction {
  type: string;
  params: Record<string, any>;
  reason: string;
}

/**
 * Healing event recorded by the system.
 */
export interface HealingEvent {
  id: string;
  loopId: string;
  timestamp: string;
  layer: HealingLayer;
  trigger: HealingTrigger;
  action: HealingAction;
  result: HealingResult;
  details: Record<string, any>;
}

/**
 * Healing policy configuration.
 */
export interface HealingPolicy {
  // Layer 1: Agent
  maxAgentRetries: number;
  agentRetryDelay: string;

  // Layer 2: Platform
  maxPlatformRestarts: number;
  platformRestartWindow: string;
  backends: string[];

  // Layer 3: Circuit Breaker
  circuitBreakerThreshold: number;
  circuitBreakerCooldown: string;
  escalationChannels: string[];
}

/**
 * Default healing policy.
 */
export const DEFAULT_HEALING_POLICY: HealingPolicy = {
  maxAgentRetries: 3,
  agentRetryDelay: "30s",
  maxPlatformRestarts: 5,
  platformRestartWindow: "1h",
  backends: ["claude", "gemini"],
  circuitBreakerThreshold: 10,
  circuitBreakerCooldown: "5m",
  escalationChannels: ["telegram"],
};

/**
 * Fix action type.
 */
export type FixAction =
  | { type: "restart" }
  | { type: "switch_backend"; backend: string }
  | { type: "inject_context"; content: string }
  | { type: "skip_step" }
  | { type: "request_human" };

/**
 * Known fix pattern.
 */
export interface KnownFix {
  id: string;
  pattern: RegExp;
  action: FixAction;
  description: string;
  successRate: number;
}

/**
 * Circuit breaker state.
 */
export type CircuitBreakerState = "closed" | "open" | "half_open";

/**
 * Circuit breaker status.
 */
export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: string | null;
  nextAttemptAt: string | null;
  loopId: string;
}