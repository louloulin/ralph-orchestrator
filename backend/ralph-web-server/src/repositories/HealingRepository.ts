/**
 * Healing Repository
 *
 * Interface for healing event storage operations.
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import {
  type HealingEvent,
  type HealingPolicy,
  type KnownFix,
  DEFAULT_HEALING_POLICY,
} from "../types/healing";

/**
 * Healing Repository Interface
 */
export interface HealingRepository {
  /**
   * Records a healing event
   */
  recordEvent(event: HealingEvent, cwd: string): Promise<void>;

  /**
   * Gets healing events for a loop
   */
  getEvents(loopId: string, cwd: string, limit?: number): Promise<HealingEvent[]>;

  /**
   * Gets the healing policy
   */
  getPolicy(cwd: string): Promise<HealingPolicy>;

  /**
   * Updates the healing policy
   */
  updatePolicy(policy: Partial<HealingPolicy>, cwd: string): Promise<void>;

  /**
   * Gets known fix patterns
   */
  getKnownFixes(cwd: string): Promise<KnownFix[]>;

  /**
   * Adds a known fix pattern
   */
  addKnownFix(fix: KnownFix, cwd: string): Promise<void>;
}

/**
 * File-based implementation of healing repository
 */
export class FileHealingRepository implements HealingRepository {
  async recordEvent(event: HealingEvent, cwd: string): Promise<void> {
    const eventsPath = this.getEventsPath(cwd, event.loopId);
    const fs = await import("fs/promises");
    const path = await import("path");

    await fs.mkdir(path.dirname(eventsPath), { recursive: true });

    // Append event to JSONL file
    const line = JSON.stringify(event) + "\n";
    await fs.appendFile(eventsPath, line);
  }

  async getEvents(
    loopId: string,
    cwd: string,
    limit?: number
  ): Promise<HealingEvent[]> {
    const eventsPath = this.getEventsPath(cwd, loopId);
    const fs = await import("fs/promises");

    try {
      const content = await fs.readFile(eventsPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const events = lines.map((line) => JSON.parse(line) as HealingEvent);

      // Sort by timestamp descending
      events.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return limit ? events.slice(0, limit) : events;
    } catch {
      return [];
    }
  }

  async getPolicy(cwd: string): Promise<HealingPolicy> {
    const policyPath = this.getPolicyPath(cwd);
    const fs = await import("fs/promises");

    try {
      const content = await fs.readFile(policyPath, "utf-8");
      return JSON.parse(content);
    } catch {
      // Return default policy
      const { DEFAULT_HEALING_POLICY } = await import("../types/healing");
      return { ...DEFAULT_HEALING_POLICY };
    }
  }

  async updatePolicy(
    policy: Partial<HealingPolicy>,
    cwd: string
  ): Promise<void> {
    const policyPath = this.getPolicyPath(cwd);
    const fs = await import("fs/promises");
    const path = await import("path");

    const current = await this.getPolicy(cwd);
    const updated = { ...current, ...policy };

    await fs.mkdir(path.dirname(policyPath), { recursive: true });
    await fs.writeFile(policyPath, JSON.stringify(updated, null, 2));
  }

  async getKnownFixes(cwd: string): Promise<KnownFix[]> {
    const fixesPath = this.getFixesPath(cwd);
    const fs = await import("fs/promises");

    try {
      const content = await fs.readFile(fixesPath, "utf-8");
      const fixes = JSON.parse(content);

      // Convert pattern strings back to RegExp
      return fixes.map((fix: any) => ({
        ...fix,
        pattern: new RegExp(fix.pattern, "i"),
      }));
    } catch {
      return this.getDefaultFixes();
    }
  }

  async addKnownFix(fix: KnownFix, cwd: string): Promise<void> {
    const fixesPath = this.getFixesPath(cwd);
    const fs = await import("fs/promises");
    const path = await import("path");

    const fixes = await this.getKnownFixes(cwd);
    fixes.push(fix);

    // Convert RegExp to string for serialization
    const serialized = fixes.map((f) => ({
      ...f,
      pattern: f.pattern.source,
    }));

    await fs.mkdir(path.dirname(fixesPath), { recursive: true });
    await fs.writeFile(fixesPath, JSON.stringify(serialized, null, 2));
  }

  private getDefaultFixes(): KnownFix[] {
    return [
      {
        id: "rate_limit_exceeded",
        pattern: /rate limit|429|too many requests/i,
        action: {
          type: "inject_context",
          content:
            "Rate limit detected. Wait 60 seconds before next API call. Consider reducing request frequency.",
        },
        description: "Handle API rate limits",
        successRate: 0.95,
      },
      {
        id: "context_too_long",
        pattern: /context length|token limit|maximum context/i,
        action: {
          type: "inject_context",
          content:
            "Context limit reached. Focus only on essential information. Summarize progress and continue with minimal context.",
        },
        description: "Handle context overflow",
        successRate: 0.85,
      },
      {
        id: "json_parse_error",
        pattern: /JSON parse|invalid JSON|unexpected token/i,
        action: {
          type: "inject_context",
          content:
            "JSON parsing failed. Output valid JSON only, no markdown blocks. Use simple structure without nested objects if possible.",
        },
        description: "Fix JSON output issues",
        successRate: 0.9,
      },
      {
        id: "tool_not_found",
        pattern: /tool not found|unknown tool|no such tool/i,
        action: {
          type: "inject_context",
          content:
            "Tool reference error. Only use available tools. Check tool name spelling and availability.",
        },
        description: "Fix tool invocation errors",
        successRate: 0.95,
      },
    ];
  }

  private getHealingDir(cwd: string): string {
    const path = require("path");
    return path.join(cwd, ".ralph/healing");
  }

  private getEventsPath(cwd: string, loopId: string): string {
    const path = require("path");
    return path.join(this.getHealingDir(cwd), "events", `${loopId}.jsonl`);
  }

  private getPolicyPath(cwd: string): string {
    const path = require("path");
    return path.join(this.getHealingDir(cwd), "policy.json");
  }

  private getFixesPath(cwd: string): string {
    const path = require("path");
    return path.join(this.getHealingDir(cwd), "known-fixes.json");
  }
}

/**
 * Default repository instance
 */
export const healingRepository = new FileHealingRepository();
