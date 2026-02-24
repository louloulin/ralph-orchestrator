/**
 * Agent Teams Types
 *
 * Types for multi-agent collaboration system (P4.5-1)
 * Inspired by Claude Code Agent Teams architecture.
 */

/**
 * Agent role in a team
 */
export interface AgentRole {
  /** Unique identifier for this agent role */
  id: string;
  /** Display name for the agent */
  name: string;
  /** Description of the agent's responsibilities */
  description: string;
  /** Hat/preset this agent uses (references hat system) */
  hatId: string;
  /** Current status of the agent */
  status: AgentStatus;
  /** Number of iterations completed by this agent */
  iterationsCompleted: number;
  /** Last activity timestamp */
  lastActivityAt: Date | null;
}

/**
 * Agent status in the team
 */
export type AgentStatus =
  | "idle"         // Waiting for tasks
  | "running"      // Currently processing
  | "waiting"      // Waiting for other agents (pipeline mode)
  | "completed"    // Finished its work
  | "failed";      // Encountered an error

/**
 * Context sharing mode for the team
 */
export type ContextSharingMode =
  | "full"         // Complete context sharing (1M tokens)
  | "selective"    // Selective context sharing
  | "hierarchical"; // Hierarchical (report upward)

/**
 * Task distribution mode for the team
 */
export type TaskDistributionMode =
  | "parallel"     // Multiple agents work simultaneously
  | "pipeline"     // Sequential processing (plan -> code -> test -> review)
  | "expert"       // Specialized agents (frontend/backend/security)
  | "voting";      // Multiple agents provide solutions, vote/merge

/**
 * Team status
 */
export type TeamStatus =
  | "idle"         // Team not started
  | "running"      // Team actively processing
  | "paused"       // Team paused
  | "completed"    // Team finished all tasks
  | "failed";      // Team encountered error

/**
 * Agent Team configuration
 */
export interface AgentTeam {
  /** Unique team identifier */
  id: string;
  /** Team name */
  name: string;
  /** Team description */
  description: string;
  /** Coordinator agent (Ralph role) */
  coordinator: AgentRole;
  /** Team member agents */
  members: AgentRole[];
  /** Context sharing mode */
  contextSharing: ContextSharingMode;
  /** Task distribution mode */
  taskDistribution: TaskDistributionMode;
  /** Current team status */
  status: TeamStatus;
  /** Task prompt the team is working on */
  prompt: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Shared context token count */
  sharedContextTokens: number;
  /** Maximum shared context tokens */
  maxSharedContextTokens: number;
  /** Team creation timestamp */
  createdAt: Date;
  /** Team start timestamp (if started) */
  startedAt: Date | null;
  /** Team completion timestamp (if completed) */
  completedAt: Date | null;
  /** Error message if failed */
  error: string | null;
}

/**
 * Team configuration input for creation
 */
export interface CreateTeamInput {
  /** Team name */
  name: string;
  /** Team description */
  description?: string;
  /** Task prompt */
  prompt: string;
  /** Coordinator hat ID */
  coordinatorHatId: string;
  /** Member configurations */
  members: Array<{
    name: string;
    description: string;
    hatId: string;
  }>;
  /** Context sharing mode */
  contextSharing?: ContextSharingMode;
  /** Task distribution mode */
  taskDistribution?: TaskDistributionMode;
}

/**
 * Team update input
 */
export interface UpdateTeamInput {
  /** Team name */
  name?: string;
  /** Team description */
  description?: string;
  /** Task distribution mode */
  taskDistribution?: TaskDistributionMode;
  /** Context sharing mode */
  contextSharing?: ContextSharingMode;
}

/**
 * Team statistics
 */
export interface TeamStats {
  /** Total teams */
  totalTeams: number;
  /** Active teams */
  activeTeams: number;
  /** Completed teams */
  completedTeams: number;
  /** Failed teams */
  failedTeams: number;
  /** Total iterations across all teams */
  totalIterations: number;
}

/**
 * Agent activity log entry
 */
export interface AgentActivityLog {
  /** Activity ID */
  id: string;
  /** Team ID */
  teamId: string;
  /** Agent ID */
  agentId: string;
  /** Activity type */
  activityType: "started" | "completed" | "error" | "waiting";
  /** Message */
  message: string;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Default max shared context tokens (1M tokens)
 */
export const DEFAULT_MAX_SHARED_CONTEXT_TOKENS = 1_000_000;
