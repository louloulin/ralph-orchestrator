/**
 * Healing Types
 *
 * Type definitions for the Self-Healing System (P4-4) frontend.
 * Matches the backend healing types.
 */

import { z } from "zod";

/**
 * Healing layer in the three-tier architecture.
 */
export const HealingLayerSchema = z.enum(["agent", "platform", "circuit_breaker", "manual"]);
export type HealingLayer = z.infer<typeof HealingLayerSchema>;

/**
 * Trigger that initiated a healing event.
 */
export const HealingTriggerSchema = z.enum([
  "consecutive_failures",
  "validation_error",
  "api_error",
  "timeout",
  "resource_exhausted",
  "loop_thrashing",
  "manual",
]);
export type HealingTrigger = z.infer<typeof HealingTriggerSchema>;

/**
 * Result of a healing action.
 */
export const HealingResultSuccessSchema = z.object({
  status: z.literal("success"),
  details: z.string(),
});
export const HealingResultFailedSchema = z.object({
  status: z.literal("failed"),
  error: z.string(),
  nextLayer: HealingLayerSchema,
});
export const HealingResultSchema = z.union([HealingResultSuccessSchema, HealingResultFailedSchema]);
export type HealingResult = z.infer<typeof HealingResultSchema>;

/**
 * Healing action taken by the system.
 */
export const HealingActionSchema = z.object({
  type: z.string(),
  params: z.record(z.string(), z.any()),
  reason: z.string(),
});
export type HealingAction = z.infer<typeof HealingActionSchema>;

/**
 * Healing event recorded by the system.
 */
export const HealingEventSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  timestamp: z.string(),
  layer: HealingLayerSchema,
  trigger: HealingTriggerSchema,
  action: HealingActionSchema,
  result: HealingResultSchema,
  details: z.record(z.string(), z.any()),
});
export type HealingEvent = z.infer<typeof HealingEventSchema>;

/**
 * Healing policy configuration.
 */
export const HealingPolicySchema = z.object({
  // Layer 1: Agent
  maxAgentRetries: z.number(),
  agentRetryDelay: z.string(),
  // Layer 2: Platform
  maxPlatformRestarts: z.number(),
  platformRestartWindow: z.string(),
  backends: z.array(z.string()),
  // Layer 3: Circuit Breaker
  circuitBreakerThreshold: z.number(),
  circuitBreakerCooldown: z.string(),
  escalationChannels: z.array(z.string()),
});
export type HealingPolicy = z.infer<typeof HealingPolicySchema>;

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
export const FixActionSchema = z.union([
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("switch_backend"), backend: z.string() }),
  z.object({ type: z.literal("inject_context"), content: z.string() }),
  z.object({ type: z.literal("skip_step") }),
  z.object({ type: z.literal("request_human") }),
]);
export type FixAction = z.infer<typeof FixActionSchema>;

/**
 * Known fix pattern.
 */
export const KnownFixSchema = z.object({
  id: z.string(),
  pattern: z.string(), // RegExp source for serialization
  action: FixActionSchema,
  description: z.string(),
  successRate: z.number(),
});
export type KnownFix = z.infer<typeof KnownFixSchema>;

/**
 * Circuit breaker state.
 */
export const CircuitBreakerStateSchema = z.enum(["closed", "open", "half_open"]);
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

/**
 * Circuit breaker status.
 */
export const CircuitBreakerStatusSchema = z.object({
  state: CircuitBreakerStateSchema,
  failureCount: z.number(),
  lastFailureAt: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  loopId: z.string(),
});
export type CircuitBreakerStatus = z.infer<typeof CircuitBreakerStatusSchema>;

/**
 * Layer labels for display
 */
export const HEALING_LAYER_LABELS: Record<HealingLayer, string> = {
  agent: "Agent Self-Correction",
  platform: "Platform Intervention",
  circuit_breaker: "Circuit Breaker",
  manual: "Manual",
};

/**
 * Layer colors for badges
 */
export const HEALING_LAYER_COLORS: Record<HealingLayer, string> = {
  agent: "bg-blue-500/20 text-blue-400",
  platform: "bg-purple-500/20 text-purple-400",
  circuit_breaker: "bg-red-500/20 text-red-400",
  manual: "bg-yellow-500/20 text-yellow-400",
};

/**
 * Trigger labels for display
 */
export const HEALING_TRIGGER_LABELS: Record<HealingTrigger, string> = {
  consecutive_failures: "Consecutive Failures",
  validation_error: "Validation Error",
  api_error: "API Error",
  timeout: "Timeout",
  resource_exhausted: "Resource Exhausted",
  loop_thrashing: "Loop Thrashing",
  manual: "Manual",
};

/**
 * Circuit breaker state colors
 */
export const CIRCUIT_BREAKER_STATE_COLORS: Record<CircuitBreakerState, string> = {
  closed: "bg-green-500/20 text-green-400",
  open: "bg-red-500/20 text-red-400",
  half_open: "bg-yellow-500/20 text-yellow-400",
};

/**
 * Circuit breaker state labels
 */
export const CIRCUIT_BREAKER_STATE_LABELS: Record<CircuitBreakerState, string> = {
  closed: "Closed (Healthy)",
  open: "Open (Tripped)",
  half_open: "Half-Open (Testing)",
};

/**
 * Format date for display
 */
export function formatHealingDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

/**
 * Get relative time string
 */
export function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
