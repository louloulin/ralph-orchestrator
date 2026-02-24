/**
 * AgentTeamsService
 *
 * Service for managing multi-agent collaboration teams (P4.5-1)
 * Implements Coordinator role, context sharing, and task distribution strategies.
 *
 * Architecture:
 * - Manages AgentTeam configurations and state
 * - Handles context sharing between agents
 * - Implements task distribution strategies (parallel/pipeline/expert/voting)
 * - Provides team lifecycle management (create, start, pause, stop)
 * - Tracks agent status and activity logs
 */

import {
  type AgentTeam,
  type AgentRole,
  type CreateTeamInput,
  type UpdateTeamInput,
  type TeamStats,
  type AgentActivityLog,
  type TeamStatus,
  type AgentStatus,
  type ContextSharingMode,
  type TaskDistributionMode,
  DEFAULT_MAX_SHARED_CONTEXT_TOKENS,
} from "../types/teams";

/**
 * Configuration for AgentTeamsService
 */
export interface AgentTeamsServiceConfig {
  /** Maximum number of active teams */
  maxActiveTeams?: number;
  /** Maximum shared context tokens per team */
  maxSharedContextTokens?: number;
}

/**
 * Default configuration
 */
export const DEFAULT_AGENT_TEAMS_CONFIG: Required<AgentTeamsServiceConfig> = {
  maxActiveTeams: 10,
  maxSharedContextTokens: DEFAULT_MAX_SHARED_CONTEXT_TOKENS,
};

/**
 * In-memory storage for teams
 */
interface TeamsStorage {
  teams: Map<string, AgentTeam>;
  activityLogs: Map<string, AgentActivityLog[]>;
}

/**
 * AgentTeamsService
 *
 * Manages agent team creation, lifecycle, and coordination.
 */
export class AgentTeamsService {
  private readonly storage: TeamsStorage;
  private readonly config: Required<AgentTeamsServiceConfig>;

  constructor(config: AgentTeamsServiceConfig = {}) {
    this.config = { ...DEFAULT_AGENT_TEAMS_CONFIG, ...config };
    this.storage = {
      teams: new Map(),
      activityLogs: new Map(),
    };
  }

  /**
   * Create a new agent team
   */
  createTeam(input: CreateTeamInput): AgentTeam {
    const teamId = this.generateTeamId(input.name);

    // Create coordinator agent role
    const coordinator: AgentRole = {
      id: `${teamId}-coordinator`,
      name: input.coordinatorHatId,
      description: "Coordinator: Planning and task distribution",
      hatId: input.coordinatorHatId,
      status: "idle",
      iterationsCompleted: 0,
      lastActivityAt: null,
    };

    // Create member agent roles
    const members: AgentRole[] = input.members.map((member, index) => ({
      id: `${teamId}-agent-${index}`,
      name: member.name,
      description: member.description,
      hatId: member.hatId,
      status: "idle",
      iterationsCompleted: 0,
      lastActivityAt: null,
    }));

    const team: AgentTeam = {
      id: teamId,
      name: input.name,
      description: input.description ?? "",
      coordinator,
      members,
      contextSharing: input.contextSharing ?? "selective",
      taskDistribution: input.taskDistribution ?? "pipeline",
      status: "idle",
      prompt: input.prompt,
      progress: 0,
      sharedContextTokens: 0,
      maxSharedContextTokens: this.config.maxSharedContextTokens,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
    };

    // Initialize activity logs for this team
    this.storage.activityLogs.set(teamId, []);

    // Store the team
    this.storage.teams.set(teamId, team);

    // Log team creation
    this.logActivity(teamId, coordinator.id, "started", "Team created and initialized");

    return team;
  }

  /**
   * Get a team by ID
   */
  getTeam(teamId: string): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }
    return this.deepCloneTeam(team);
  }

  /**
   * List all teams
   */
  listTeams(filter?: { status?: TeamStatus }): AgentTeam[] {
    const teams = Array.from(this.storage.teams.values());
    const filtered = filter?.status
      ? teams.filter((t) => t.status === filter.status)
      : teams;
    return filtered.map((t) => this.deepCloneTeam(t));
  }

  /**
   * Update a team
   */
  updateTeam(teamId: string, updates: UpdateTeamInput): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }

    // Update allowed fields
    if (updates.name !== undefined) team.name = updates.name;
    if (updates.description !== undefined) team.description = updates.description;
    if (updates.taskDistribution !== undefined) team.taskDistribution = updates.taskDistribution;
    if (updates.contextSharing !== undefined) team.contextSharing = updates.contextSharing;

    return this.deepCloneTeam(team);
  }

  /**
   * Start a team (begin execution)
   */
  startTeam(teamId: string): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }

    if (team.status !== "idle" && team.status !== "paused") {
      return null; // Can only start idle or paused teams
    }

    team.status = "running";
    team.startedAt = team.startedAt ?? new Date();

    // Update coordinator status
    team.coordinator.status = "running";
    team.coordinator.lastActivityAt = new Date();

    // For pipeline mode, start the first agent
    if (team.taskDistribution === "pipeline" && team.members.length > 0) {
      team.members[0].status = "running";
      team.members[0].lastActivityAt = new Date();
    }

    this.logActivity(teamId, team.coordinator.id, "started", "Team started execution");

    return this.deepCloneTeam(team);
  }

  /**
   * Pause a running team
   */
  pauseTeam(teamId: string): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }

    if (team.status !== "running") {
      return null; // Can only pause running teams
    }

    team.status = "paused";

    // Update all agent statuses to idle
    team.coordinator.status = "idle";
    team.members.forEach((member) => {
      member.status = "idle";
    });

    this.logActivity(teamId, team.coordinator.id, "completed", "Team paused");

    return this.deepCloneTeam(team);
  }

  /**
   * Stop a team
   */
  stopTeam(teamId: string, reason?: string): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }

    if (team.status === "idle" || team.status === "completed") {
      return null; // Can only stop running or paused teams
    }

    team.status = reason ? "failed" : "completed";
    team.completedAt = new Date();
    if (reason) team.error = reason;

    // Update all agent statuses
    team.coordinator.status = reason ? "failed" : "completed";
    team.members.forEach((member) => {
      member.status = reason ? "failed" : "completed";
    });

    const message = reason ? `Team stopped: ${reason}` : "Team stopped";
    this.logActivity(teamId, team.coordinator.id, "completed", message);

    return this.deepCloneTeam(team);
  }

  /**
   * Delete a team
   */
  deleteTeam(teamId: string): boolean {
    const deleted = this.storage.teams.delete(teamId);
    if (deleted) {
      this.storage.activityLogs.delete(teamId);
    }
    return deleted;
  }

  /**
   * Update agent status
   */
  updateAgentStatus(
    teamId: string,
    agentId: string,
    status: AgentStatus,
    message?: string
  ): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }

    // Find the agent
    const agent = this.findAgent(team, agentId);
    if (!agent) {
      return null;
    }

    agent.status = status;
    agent.lastActivityAt = new Date();

    // If agent completed iteration, increment counter
    if (status === "completed") {
      agent.iterationsCompleted++;

      // For pipeline mode, trigger next agent
      if (team.taskDistribution === "pipeline") {
        this.triggerNextAgentInPipeline(team);
      }

      // For parallel mode, check if all agents completed
      if (team.taskDistribution === "parallel") {
        this.updateTeamProgress(team);
      }
    }

    // Log the activity
    const activityType = status === "failed" ? "error" : status === "waiting" ? "waiting" : "completed";
    this.logActivity(teamId, agentId, activityType, message ?? `Agent status changed to ${status}`);

    return this.deepCloneTeam(team);
  }

  /**
   * Update shared context token count
   */
  updateSharedContext(teamId: string, tokenCount: number): AgentTeam | null {
    const team = this.storage.teams.get(teamId);
    if (!team) {
      return null;
    }

    team.sharedContextTokens = Math.min(tokenCount, team.maxSharedContextTokens);
    return this.deepCloneTeam(team);
  }

  /**
   * Get activity logs for a team
   */
  getActivityLogs(teamId: string, limit?: number): AgentActivityLog[] {
    const logs = this.storage.activityLogs.get(teamId) ?? [];
    if (limit) {
      return logs.slice(-limit);
    }
    return [...logs];
  }

  /**
   * Get team statistics
   */
  getStats(): TeamStats {
    const teams = Array.from(this.storage.teams.values());

    return {
      totalTeams: teams.length,
      activeTeams: teams.filter((t) => t.status === "running").length,
      completedTeams: teams.filter((t) => t.status === "completed").length,
      failedTeams: teams.filter((t) => t.status === "failed").length,
      totalIterations: teams.reduce((sum, team) => {
        return (
          sum +
          team.coordinator.iterationsCompleted +
          team.members.reduce((s, m) => s + m.iterationsCompleted, 0)
        );
      }, 0),
    };
  }

  /**
   * Get agent by ID within a team
   */
  private findAgent(team: AgentTeam, agentId: string): AgentRole | null {
    if (team.coordinator.id === agentId) {
      return team.coordinator;
    }
    return team.members.find((m) => m.id === agentId) ?? null;
  }

  /**
   * Trigger next agent in pipeline mode
   */
  private triggerNextAgentInPipeline(team: AgentTeam): void {
    // Find the current agent that just completed
    for (let i = 0; i < team.members.length; i++) {
      const member = team.members[i];
      if (member.status === "completed" && i < team.members.length - 1) {
        // Start the next agent
        team.members[i + 1].status = "running";
        team.members[i + 1].lastActivityAt = new Date();
        this.logActivity(
          team.id,
          team.members[i + 1].id,
          "started",
          `Agent started (pipeline phase ${i + 2})`
        );
        break;
      }
    }
  }

  /**
   * Update team progress based on agent completions
   */
  private updateTeamProgress(team: AgentTeam): void {
    const totalAgents = team.members.length + 1; // +1 for coordinator
    let completedAgents = 0;

    if (team.coordinator.status === "completed") {
      completedAgents++;
    }

    team.members.forEach((member) => {
      if (member.status === "completed") {
        completedAgents++;
      }
    });

    team.progress = Math.round((completedAgents / totalAgents) * 100);
  }

  /**
   * Log an activity for a team
   */
  private logActivity(
    teamId: string,
    agentId: string,
    activityType: "started" | "completed" | "error" | "waiting",
    message: string
  ): void {
    const logs = this.storage.activityLogs.get(teamId) ?? [];

    const entry: AgentActivityLog = {
      id: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      teamId,
      agentId,
      activityType,
      message,
      timestamp: new Date(),
    };

    logs.push(entry);

    // Keep only last 100 logs per team
    if (logs.length > 100) {
      logs.shift();
    }

    this.storage.activityLogs.set(teamId, logs);
  }

  /**
   * Generate a unique team ID
   */
  private generateTeamId(name: string): string {
    const sanitized = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `team-${sanitized}-${timestamp}-${random}`;
  }

  /**
   * Deep clone a team to prevent reference leaks
   */
  private deepCloneTeam(team: AgentTeam): AgentTeam {
    return {
      ...team,
      coordinator: { ...team.coordinator },
      members: team.members.map((m) => ({ ...m })),
      createdAt: new Date(team.createdAt),
      startedAt: team.startedAt ? new Date(team.startedAt) : null,
      completedAt: team.completedAt ? new Date(team.completedAt) : null,
    };
  }
}

/**
 * Default max shared context tokens (1M tokens)
 */
export const DEFAULT_MAX_SHARED_CONTEXT_TOKENS = 1_000_000;