/**
 * Agent Teams Types
 *
 * Frontend types for multi-agent collaboration system (P4.5-1)
 * Matches backend types in backend/ralph-web-server/src/types/teams.ts
 */

/**
 * Agent role in a team
 */
export interface AgentRole {
  id: string;
  name: string;
  description: string;
  hatId: string;
  status: AgentStatus;
  iterationsCompleted: number;
  lastActivityAt: string | null;
}

/**
 * Agent status in the team
 */
export type AgentStatus =
  | "idle"
  | "running"
  | "waiting"
  | "completed"
  | "failed";

/**
 * Context sharing mode for the team
 */
export type ContextSharingMode =
  | "full"
  | "selective"
  | "hierarchical";

/**
 * Task distribution mode for the team
 */
export type TaskDistributionMode =
  | "parallel"
  | "pipeline"
  | "expert"
  | "voting";

/**
 * Team status
 */
export type TeamStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "failed";

/**
 * Team task status
 */
export type TeamTaskStatus =
  | "todo"
  | "in_progress"
  | "review"
  | "done";

/**
 * Team task
 */
export interface TeamTask {
  id: string;
  teamId: string;
  title: string;
  description: string;
  status: TeamTaskStatus;
  assignedTo: string | null;
  dependencies: string[];
  createdAt: string;
  claimedAt: string | null;
  completedAt: string | null;
}

/**
 * Agent Team configuration
 */
export interface AgentTeam {
  id: string;
  name: string;
  description: string;
  coordinator: AgentRole;
  members: AgentRole[];
  contextSharing: ContextSharingMode;
  taskDistribution: TaskDistributionMode;
  status: TeamStatus;
  prompt: string;
  progress: number;
  sharedContextTokens: number;
  maxSharedContextTokens: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
}

/**
 * Team configuration input for creation
 */
export interface CreateTeamInput {
  name: string;
  description?: string;
  prompt: string;
  coordinatorHatId: string;
  members: Array<{
    name: string;
    description: string;
    hatId: string;
  }>;
  contextSharing?: ContextSharingMode;
  taskDistribution?: TaskDistributionMode;
}

/**
 * Team update input
 */
export interface UpdateTeamInput {
  name?: string;
  description?: string;
  taskDistribution?: TaskDistributionMode;
  contextSharing?: ContextSharingMode;
}

/**
 * Team statistics
 */
export interface TeamStats {
  totalTeams: number;
  activeTeams: number;
  completedTeams: number;
  failedTeams: number;
  totalIterations: number;
}

/**
 * Agent activity log entry
 */
export interface AgentActivityLog {
  id: string;
  teamId: string;
  agentId: string;
  activityType: "started" | "completed" | "error" | "waiting";
  message: string;
  timestamp: string;
}

/**
 * Context sharing mode descriptions
 */
export const CONTEXT_SHARING_MODES: Record<ContextSharingMode, { label: string; description: string }> = {
  full: {
    label: "Full",
    description: "Complete context sharing (1M tokens)"
  },
  selective: {
    label: "Selective",
    description: "Agents share selected context"
  },
  hierarchical: {
    label: "Hierarchical",
    description: "Report upward through coordinator"
  }
};

/**
 * Task distribution mode descriptions
 */
export const TASK_DISTRIBUTION_MODES: Record<TaskDistributionMode, { label: string; description: string }> = {
  parallel: {
    label: "Parallel",
    description: "Multiple agents work simultaneously"
  },
  pipeline: {
    label: "Pipeline",
    description: "Sequential processing (plan → code → test → review)"
  },
  expert: {
    label: "Expert",
    description: "Specialized agents (frontend/backend/security)"
  },
  voting: {
    label: "Voting",
    description: "Multiple agents provide solutions, vote/merge"
  }
};

/**
 * Agent status colors for UI
 */
export const AGENT_STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "bg-gray-500",
  running: "bg-blue-500",
  waiting: "bg-yellow-500",
  completed: "bg-green-500",
  failed: "bg-red-500"
};

/**
 * Team status colors for UI
 */
export const TEAM_STATUS_COLORS: Record<TeamStatus, string> = {
  idle: "bg-gray-500",
  running: "bg-blue-500",
  paused: "bg-yellow-500",
  completed: "bg-green-500",
  failed: "bg-red-500"
};

/**
 * Task status colors for UI
 */
export const TASK_STATUS_COLORS: Record<TeamTaskStatus, string> = {
  todo: "bg-gray-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  done: "bg-green-500"
};

/**
 * Conflict severity levels
 */
export type ConflictSeverity = "Low" | "High" | "Critical";

/**
 * Agent involved in a conflict
 */
export interface ConflictAgent {
  loopId: string;
  taskId: string;
  taskTitle: string;
  reservedAt: string;
}

/**
 * Conflict warning for file conflicts
 */
export interface ConflictWarning {
  filePath: string;
  conflictingAgents: ConflictAgent[];
  severity: ConflictSeverity;
  suggestion: string;
}

/**
 * File reservation info
 */
export interface FileReservation {
  taskId: string;
  loopId: string;
  filePaths: string[];
  reservedAt: string;
}

/**
 * Conflict severity colors for UI
 */
export const CONFLICT_SEVERITY_COLORS: Record<ConflictSeverity, string> = {
  Low: "text-yellow-400 border-yellow-800 bg-yellow-900/20",
  High: "text-orange-400 border-orange-800 bg-orange-900/20",
  Critical: "text-red-400 border-red-800 bg-red-900/20"
};

/**
 * Conflict severity icons
 */
export const CONFLICT_SEVERITY_ICONS: Record<ConflictSeverity, string> = {
  Low: "⚠️",
  High: "🔶",
  Critical: "🚨"
};
