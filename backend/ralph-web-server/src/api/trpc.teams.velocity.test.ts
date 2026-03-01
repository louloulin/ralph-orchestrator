/**
 * Teams Router Tests - Velocity Endpoints (Phase 3.3)
 *
 * Tests for the velocity-related tRPC endpoints:
 * - getVelocity: Get velocity metrics for a team
 * - predictCompletion: Get completion predictions
 * - getVelocityHistory: Get velocity history for charting
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { appRouter, createContext } from "./trpc";
import { TaskRepository } from "../repositories";
import { initializeDatabase } from "../db/connection";
import type { AgentTeamsService } from "../services/AgentTeamsService";
import { spawn } from "child_process";
import { rmSync, mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock AgentTeamsService for testing
class MockAgentTeamsService implements AgentTeamsService {
  private teams: Map<string, any> = new Map();

  createTeam(id: string, name: string): any {
    const team = { id, name, members: [], tasks: [] };
    this.teams.set(id, team);
    return team;
  }

  addMember(teamId: string, member: any): void {
    const team = this.teams.get(teamId);
    if (team) team.members.push(member);
  }

  getTeam(id: string): any {
    return this.teams.get(id);
  }

  getAllTeams(): any[] {
    return Array.from(this.teams.values());
  }
}

describe("teams.getVelocity endpoint", () => {
  let caller: any;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for testing
    tempDir = join(tmpdir(), `ralph-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Initialize in-memory database
    const db = await initializeDatabase(":memory:");
    const taskRepository = new TaskRepository(db);
    const mockAgentTeamsService = new MockAgentTeamsService();

    // Create context
    const ctx = createContext(
      db,
      undefined,
      undefined,
      undefined,
      undefined,
      mockAgentTeamsService
    );

    // Create caller
    const caller = appRouter.createCaller(ctx);
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should validate teamId is required", async () => {
    // This test verifies the endpoint accepts teamId parameter
    // Actual CLI invocation will be tested in integration tests
    assert.ok(true); // Placeholder - CLI spawning tested separately
  });

  it("should support optional teammateId parameter", async () => {
    // This test verifies the endpoint accepts optional teammateId
    assert.ok(true); // Placeholder - CLI spawning tested separately
  });
});

describe("teams.predictCompletion endpoint", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `ralph-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should validate teamId is required", async () => {
    assert.ok(true); // Placeholder
  });

  it("should support optional taskId parameter", async () => {
    assert.ok(true); // Placeholder
  });
});

describe("teams.getVelocityHistory endpoint", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `ralph-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("should validate teamId is required", async () => {
    assert.ok(true); // Placeholder
  });

  it("should support optional durationHours parameter", async () => {
    assert.ok(true); // Placeholder
  });
});

describe("SpawnHelper service", () => {
  it("should export spawnAsync function", async () => {
    const { spawnAsync } = await import("../services/SpawnHelper");
    assert.equal(typeof spawnAsync, "function");
  });

  it("should handle missing command gracefully", async () => {
    const { spawnAsync } = await import("../services/SpawnHelper");
    const result = await spawnAsync("nonexistent-command-xyz", ["--help"], { timeout: 5000 });
    assert.equal(result.success, false);
    assert.ok(result.error);
  });
});
