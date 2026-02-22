/**
 * Thinking Types
 *
 * TypeScript interfaces for the ThinkingPanel component that displays
 * AI agent reasoning in real-time, inspired by Windsurf IDE's Cascade panel.
 *
 * @see .ralph/specs/web-dashboard/thinking-panel.spec.md
 */

/**
 * Types of thinking steps the agent can produce.
 * Each type is visually distinguished in the UI.
 */
export type ThinkingStepType =
  | "reasoning"    // General reasoning
  | "planning"     // Planning next steps
  | "analysis"     // Code/data analysis
  | "decision"     // Decision point
  | "action"       // Action being taken
  | "reflection"   // Self-reflection
  | "error"        // Error encountered
  | "correction";  // Error correction

/**
 * Metadata associated with a thinking step.
 * Provides context about when/how the step was produced.
 */
export interface ThinkingStepMetadata {
  /** Which hat produced this thinking step */
  hat?: string;
  /** Loop iteration number */
  iteration?: number;
  /** Token count if available */
  tokens?: number;
}

/**
 * A single step in the agent's thinking process.
 * Each step represents one discrete unit of reasoning.
 */
export interface ThinkingStep {
  /** Unique step identifier */
  id: string;
  /** When this step occurred */
  timestamp: Date;
  /** Type of thinking */
  type: ThinkingStepType;
  /** The thinking content (markdown) */
  content: string;
  /** Time taken in milliseconds (optional) */
  duration?: number;
  /** Additional metadata */
  metadata?: ThinkingStepMetadata;
}

/**
 * A complete thinking session for a task.
 * Contains all steps produced during the task's execution.
 */
export interface ThinkingSession {
  /** Associated task ID */
  taskId: string;
  /** Ordered list of thinking steps */
  steps: ThinkingStep[];
  /** When thinking started */
  startTime: Date;
  /** When thinking ended (if complete) */
  endTime?: Date;
  /** Optional summary of the thinking process */
  summary?: string;
}

/**
 * Badge variant mapping for step types.
 * Used to style type badges consistently.
 */
export const THINKING_TYPE_BADGE_VARIANTS: Record<ThinkingStepType, "default" | "secondary" | "destructive" | "outline"> = {
  reasoning: "default",
  planning: "secondary",
  analysis: "outline",
  decision: "secondary",
  action: "default",
  reflection: "outline",
  error: "destructive",
  correction: "secondary",
};

/**
 * All available thinking step types as an array.
 * Useful for iterating to create filter options.
 */
export const THINKING_STEP_TYPES: readonly ThinkingStepType[] = [
  "reasoning",
  "planning",
  "analysis",
  "decision",
  "action",
  "reflection",
  "error",
  "correction",
] as const;

/**
 * Color classes for thinking step type indicators.
 * Maps each type to its border color for visual distinction.
 */
export const THINKING_TYPE_BORDER_COLORS: Record<ThinkingStepType, string> = {
  reasoning: "border-l-zinc-500",
  planning: "border-l-blue-500",
  analysis: "border-l-purple-500",
  decision: "border-l-amber-500",
  action: "border-l-blue-500",
  reflection: "border-l-green-500",
  error: "border-l-red-500",
  correction: "border-l-emerald-500",
};

/**
 * Human-readable labels for thinking step types.
 */
export const THINKING_TYPE_LABELS: Record<ThinkingStepType, string> = {
  reasoning: "Reasoning",
  planning: "Planning",
  analysis: "Analysis",
  decision: "Decision",
  action: "Action",
  reflection: "Reflection",
  error: "Error",
  correction: "Correction",
};
