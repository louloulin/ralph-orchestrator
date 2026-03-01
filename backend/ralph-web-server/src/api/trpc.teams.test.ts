/**
 * Teams Router Tests - Task Suggestion Integration
 *
 * Tests for the suggestTask tRPC endpoint which integrates:
 * - TeamStore (Rust core via AgentTeamsService)
 * - TaskRepository (SQLite backend)
 * - Priority-based load balancing
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TaskRepository } from "../repositories";
import { initializeDatabase, getDatabase } from "../db/connection";
import { tasks } from "../db/schema";
import { appRouter, createContext } from "./trpc";
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
}

describe("suggestTask endpoint integration tests", () => {
  let taskRepository: TaskRepository;
  let mockTeamsService: MockAgentTeamsService;

  beforeEach(() => {
    initializeDatabase(getDatabase(":memory:"));
    const db = getDatabase();
    db.delete(tasks).run();
    taskRepository = new TaskRepository(db);
    mockTeamsService = new MockAgentTeamsService();
  });

  it("returns highest priority task for available agent", async () => {
    // Setup team and agent
    mockTeamsService.createTeam("team-1", "Test Team");
    mockTeamsService.addMember("team-1", {
      id: "agent-1",
      name: "Test Agent",
      status: "idle",
    });

    // Create tasks with different priorities
    taskRepository.create({
      id: "task-low",
      title: "Low priority task",
      status: "open",
      priority: 3,
    });

    taskRepository.create({
      id: "task-high",
      title: "High priority task",
      status: "open",
      priority: 1,
    });

    taskRepository.create({
      id: "task-medium",
      title: "Medium priority task",
      status: "open",
      priority: 2,
    });

    // Call suggestTask
    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.suggestTask({
      teamId: "team-1",
      agentId: "agent-1",
    });

    // Should return highest priority task (priority: 1)
    assert.equal(result.taskId, "task-high");
    assert.equal(result.task?.priority, 1);
    assert.equal(result.reason, null);
  });

  it("returns null when agent is running", async () => {
    // Setup team with running agent
    mockTeamsService.createTeam("team-2", "Busy Team");
    mockTeamsService.addMember("team-2", {
      id: "agent-busy",
      name: "Busy Agent",
      status: "running",
    });

    // Create available task
    taskRepository.create({
      id: "task-available",
      title: "Available task",
      status: "open",
      priority: 1,
    });

    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.suggestTask({
      teamId: "team-2",
      agentId: "agent-busy",
    });

    // Should return null with reason
    assert.equal(result.taskId, null);
    assert.equal(result.reason, "Agent is currently running");
  });

  it("returns null when no tasks available", async () => {
    // Setup team with available agent
    mockTeamsService.createTeam("team-3", "Empty Team");
    mockTeamsService.addMember("team-3", {
      id: "agent-free",
      name: "Free Agent",
      status: "idle",
    });

    // No tasks created

    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.suggestTask({
      teamId: "team-3",
      agentId: "agent-free",
    });

    // Should return null with reason
    assert.equal(result.taskId, null);
    assert.equal(result.reason, "No available tasks");
  });

  it("only suggests open tasks (not running/done)", async () => {
    // Setup team
    mockTeamsService.createTeam("team-4", "Filter Team");
    mockTeamsService.addMember("team-4", {
      id: "agent-filter",
      name: "Filter Agent",
      status: "idle",
    });

    // Create tasks in different states
    taskRepository.create({
      id: "task-done",
      title: "Completed task",
      status: "done",
      priority: 0, // Highest priority but done
    });

    taskRepository.create({
      id: "task-running",
      title: "Running task",
      status: "running",
      priority: 1, // High priority but running
    });

    taskRepository.create({
      id: "task-open",
      title: "Open task",
      status: "open",
      priority: 2, // Lower priority but only one available
    });

    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.suggestTask({
      teamId: "team-4",
      agentId: "agent-filter",
    });

    // Should only return the open task
    assert.equal(result.taskId, "task-open");
    assert.equal(result.task?.status, "open");
  });

  it("throws NOT_FOUND for non-existent team", async () => {
    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    await assert.rejects(
      async () => {
        await caller.teams.suggestTask({
          teamId: "non-existent",
          agentId: "agent-1",
        });
      },
      {
        code: "NOT_FOUND",
        message: "Team with id 'non-existent' not found",
      }
    );
  });

  it("throws NOT_FOUND for agent not in team", async () => {
    mockTeamsService.createTeam("team-5", "Exclusive Team");

    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    await assert.rejects(
      async () => {
        await caller.teams.suggestTask({
          teamId: "team-5",
          agentId: "outsider-agent",
        });
      },
      {
        code: "NOT_FOUND",
        message: "Agent with id 'outsider-agent' not found in team 'team-5'",
      }
    );
  });

  it("handles default priority when not specified", async () => {
    // Setup team
    mockTeamsService.createTeam("team-6", "Default Priority Team");
    mockTeamsService.addMember("team-6", {
      id: "agent-default",
      name: "Default Agent",
      status: "idle",
    });

    // Create tasks without explicit priority
    taskRepository.create({
      id: "task-no-priority-1",
      title: "Task 1",
      status: "open",
      // No priority specified - should default to 2
    });

    taskRepository.create({
      id: "task-no-priority-2",
      title: "Task 2",
      status: "open",
      // No priority specified - should default to 2
    });

    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.suggestTask({
      teamId: "team-6",
      agentId: "agent-default",
    });

    // Should return one of the tasks (both have same priority)
    assert.ok(result.taskId);
    assert.ok(
      result.taskId === "task-no-priority-1" ||
        result.taskId === "task-no-priority-2"
    );
    // Default priority should be 2
    assert.equal(result.task?.priority ?? 2, 2);
  });

  it("prioritizes correctly across multiple priority levels", async () => {
    // Setup team
    mockTeamsService.createTeam("team-7", "Priority Test Team");
    mockTeamsService.addMember("team-7", {
      id: "agent-priority",
      name: "Priority Agent",
      status: "idle",
    });

    // Create tasks across all priority levels
    for (let i = 0; i <= 5; i++) {
      taskRepository.create({
        id: `task-p${i}`,
        title: `Priority ${i} task`,
        status: "open",
        priority: i,
      });
    }

    const caller = appRouter.createCaller({
      taskRepository,
      agentTeamsService: mockTeamsService as any,
    } as any);

    const result = await caller.teams.suggestTask({
      teamId: "team-7",
      agentId: "agent-priority",
    });

    // Should return P0 (highest priority)
    assert.equal(result.taskId, "task-p0");
    assert.equal(result.task?.priority, 0);
  });
});
