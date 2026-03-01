/**
 * Teams Router Tests - Conflict Detection Integration
 *
 * Tests for the checkConflicts tRPC endpoint which integrates:
 * - TeamStore (Rust core via AgentTeamsService)
 * - File reservation system
 * - Conflict warning generation
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { appRouter } from "./trpc";
import type { AgentTeamsService } from "../services/AgentTeamsService";

// Mock AgentTeamsService for testing
class MockAgentTeamsService implements AgentTeamsService {
  private teams: Map<string, any> = new Map();

  createTeam(id: string, name: string): any {
    const team = {
      id,
      name,
      members: [],
      tasks: [],
    };
    this.teams.set(id, team);
    return team;
  }

  addMember(teamId: string, member: any): void {
    const team = this.teams.get(teamId);
    if (team) {
      team.members.push(member);
    }
  }

  getTeam(id: string): any {
    return this.teams.get(id);
  }

  getAllTeams(): any[] {
    return Array.from(this.teams.values());
  }

  // Placeholder implementations for interface compliance
  listTeams(input?: any): any[] {
    return Array.from(this.teams.values());
  }

  updateTeam(id: string, updates: any): any {
    const team = this.teams.get(id);
    if (team) {
      Object.assign(team, updates);
    }
    return team;
  }

  startTeam(id: string): any {
    const team = this.teams.get(id);
    if (team) {
      team.status = "running";
    }
    return team;
  }

  pauseTeam(id: string): any {
    const team = this.teams.get(id);
    if (team) {
      team.status = "paused";
    }
    return team;
  }

  stopTeam(id: string, reason?: string): any {
    const team = this.teams.get(id);
    if (team) {
      team.status = "completed";
    }
    return team;
  }

  deleteTeam(id: string): boolean {
    return this.teams.delete(id);
  }

  updateAgentStatus(teamId: string, agentId: string, status: any, message?: string): any {
    const team = this.teams.get(teamId);
    if (team) {
      const agent = team.members.find((m: any) => m.id === agentId);
      if (agent) {
        agent.status = status;
      }
    }
    return team;
  }

  updateSharedContext(teamId: string, tokenCount: number): any {
    return this.teams.get(teamId);
  }

  getActivityLogs(teamId: string, limit?: number): any[] {
    return [];
  }

  getStats(): any {
    return {
      totalTeams: this.teams.size,
      activeTeams: 0,
      completedTeams: 0,
      failedTeams: 0,
      totalIterations: 0,
    };
  }

  checkConflicts(teamId: string, filePaths: string[]): any[] {
    // Mock implementation - return empty array
    const team = this.teams.get(teamId);
    if (!team) {
      return [];
    }
    // In a real implementation, this would call Rust TeamStore
    return [];
  }
}

describe("checkConflicts endpoint integration tests", () => {
  let mockTeamsService: MockAgentTeamsService;

  beforeEach(() => {
    mockTeamsService = new MockAgentTeamsService();
  });

  it("returns empty array when team has no conflicts", async () => {
    // Setup team
    mockTeamsService.createTeam("team-1", "Test Team");

    // Call checkConflicts
    const caller = appRouter.createCaller({
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.checkConflicts({
      teamId: "team-1",
      filePaths: ["src/main.rs", "src/lib.rs"],
    });

    // Should return empty array (no conflicts)
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it("throws NOT_FOUND for non-existent team", async () => {
    const caller = appRouter.createCaller({
      agentTeamsService: mockTeamsService as any,
    } as any);

    await assert.rejects(
      async () => {
        await caller.teams.checkConflicts({
          teamId: "non-existent",
          filePaths: ["src/main.rs"],
        });
      },
      {
        code: "NOT_FOUND",
        message: "Team with id 'non-existent' not found",
      }
    );
  });

  it("accepts empty file paths array", async () => {
    // Setup team
    mockTeamsService.createTeam("team-2", "Empty Files Team");

    const caller = appRouter.createCaller({
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.checkConflicts({
      teamId: "team-2",
      filePaths: [],
    });

    // Should return empty array
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 0);
  });

  it("handles multiple file paths", async () => {
    // Setup team
    mockTeamsService.createTeam("team-3", "Multi-File Team");

    const caller = appRouter.createCaller({
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.checkConflicts({
      teamId: "team-3",
      filePaths: [
        "src/main.rs",
        "src/lib.rs",
        "tests/test_main.rs",
        "Cargo.toml",
      ],
    });

    // Should return array (empty for now)
    assert.ok(Array.isArray(result));
  });

  it("returns error when AgentTeamsService not configured", async () => {
    const caller = appRouter.createCaller({} as any);

    await assert.rejects(
      async () => {
        await caller.teams.checkConflicts({
          teamId: "team-1",
          filePaths: ["src/main.rs"],
        });
      },
      {
        code: "INTERNAL_SERVER_ERROR",
        message: "AgentTeamsService is not configured",
      }
    );
  });
});
