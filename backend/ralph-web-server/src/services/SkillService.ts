/**
 * Skill Service
 *
 * Service for managing skills in the web dashboard.
 * Provides access to built-in and user-defined skills.
 */

import type { SkillEntry, SkillDetail, SkillCategory } from "../types/skill";

/**
 * Skill Service
 *
 * Manages skill discovery, loading, and configuration.
 */
export class SkillService {
  /**
   * Lists all available skills
   */
  async listSkills(cwd: string): Promise<SkillEntry[]> {
    const skills: SkillEntry[] = [];

    // Built-in skills
    const builtinSkills = this.getBuiltinSkills();
    skills.push(...builtinSkills);

    // User-defined skills from .ralph/skills
    const userSkills = await this.getUserSkills(cwd);
    skills.push(...userSkills);

    return skills;
  }

  /**
   * Gets a specific skill by name
   */
  async getSkill(name: string, cwd: string): Promise<SkillDetail | null> {
    // Check built-in first
    const builtin = this.getBuiltinSkill(name);
    if (builtin) {
      return builtin;
    }

    // Check user-defined
    const userSkill = await this.getUserSkill(name, cwd);
    if (userSkill) {
      return userSkill;
    }

    return null;
  }

  /**
   * Gets skill content
   */
  async getSkillContent(name: string, cwd: string): Promise<string | null> {
    const skill = await this.getSkill(name, cwd);
    return skill?.content ?? null;
  }

  /**
   * Gets all skill categories
   */
  async getCategories(cwd: string): Promise<SkillCategory[]> {
    const skills = await this.listSkills(cwd);

    const categoryMap = new Map<string, SkillCategory>();

    // Group by tags or create default categories
    for (const skill of skills) {
      for (const tag of skill.tags) {
        const existing = categoryMap.get(tag);
        if (existing) {
          existing.skillCount++;
        } else {
          categoryMap.set(tag, {
            id: tag,
            name: this.formatCategoryName(tag),
            description: `Skills related to ${tag}`,
            skillCount: 1,
          });
        }
      }
    }

    // Add "All" category
    categoryMap.set("all", {
      id: "all",
      name: "All Skills",
      description: "All available skills",
      icon: "layers",
      skillCount: skills.length,
    });

    return Array.from(categoryMap.values());
  }

  /**
   * Gets built-in skills
   */
  private getBuiltinSkills(): SkillEntry[] {
    return [
      {
        name: "ralph-tools",
        description: "Ralph tools skill - runtime tasks and memories commands",
        source: "built_in",
        enabled: true,
        tags: ["core", "tasks", "memories"],
        author: "Ralph Team",
        version: "1.0.0",
      },
      {
        name: "robot-interaction",
        description: "RObot interaction skill - human-in-the-loop communication",
        source: "built_in",
        enabled: true,
        tags: ["core", "telegram", "human"],
        author: "Ralph Team",
        version: "1.0.0",
      },
      {
        name: "code-review",
        description: "Code review skill - automated code review patterns",
        source: "built_in",
        enabled: false,
        tags: ["development", "code", "review"],
        author: "Community",
        version: "1.0.0",
      },
      {
        name: "testing",
        description: "Testing skill - test writing patterns and strategies",
        source: "built_in",
        enabled: false,
        tags: ["development", "testing", "quality"],
        author: "Community",
        version: "1.0.0",
      },
    ];
  }

  /**
   * Gets a specific built-in skill
   */
  private getBuiltinSkill(name: string): SkillDetail | null {
    const skills = this.getBuiltinSkills();
    const skill = skills.find((s) => s.name === name);

    if (!skill) return null;

    return {
      ...skill,
      content: this.getBuiltinSkillContent(name),
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    };
  }

  /**
   * Gets content for built-in skills
   */
  private getBuiltinSkillContent(name: string): string {
    const contents: Record<string, string> = {
      "ralph-tools": `# Ralph Tools Skill

Quick reference for \`ralph tools task\` and \`ralph tools memory\` commands.

## Task Commands

\`\`\`bash
ralph tools task add "Title" -p 2 -d "description"
ralph tools task list [--status open|in_progress|closed]
ralph tools task ready
ralph tools task close <task-id>
\`\`\`

## Memory Commands

\`\`\`bash
ralph tools memory add "content" -t pattern --tags tag1,tag2
ralph tools memory list [-t type] [--tags tags]
ralph tools memory search "query"
\`\`\`
`,
      "robot-interaction": `# RObot Interaction Skill

Human-in-the-loop communication via Telegram.

## Events

- \`human.interact\`: Agent asks question
- \`human.response\`: Human responds
- \`human.guidance\`: Proactive human guidance
`,
    };

    return contents[name] || "Skill content not available";
  }

  /**
   * Gets user-defined skills from .ralph/skills
   */
  private async getUserSkills(cwd: string): Promise<SkillEntry[]> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const skillsDir = path.join(cwd, ".ralph", "skills");

    try {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skills: SkillEntry[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          const filePath = path.join(skillsDir, entry.name);
          const content = await fs.readFile(filePath, "utf-8");
          const parsed = this.parseSkillFile(entry.name, content);

          if (parsed) {
            skills.push(parsed);
          }
        }
      }

      return skills;
    } catch {
      return [];
    }
  }

  /**
   * Gets a specific user-defined skill
   */
  private async getUserSkill(
    name: string,
    cwd: string
  ): Promise<SkillDetail | null> {
    const fs = await import("fs/promises");
    const path = await import("path");

    const filePath = path.join(cwd, ".ralph", "skills", `${name}.md`);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const stats = await fs.stat(filePath);

      const parsed = this.parseSkillFile(`${name}.md`, content);
      if (!parsed) return null;

      return {
        ...parsed,
        content,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
      };
    } catch {
      return null;
    }
  }

  /**
   * Parses a skill file
   */
  private parseSkillFile(
    filename: string,
    content: string
  ): SkillEntry | null {
    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    let name = filename.replace(".md", "");
    let description = "";
    let tags: string[] = [];

    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      const nameMatch = yaml.match(/name:\s*(.+)/);
      const descMatch = yaml.match(/description:\s*(.+)/);
      const tagsMatch = yaml.match(/tags:\s*\[(.*?)\]/);

      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
      if (tagsMatch) {
        tags = tagsMatch[1].split(",").map((t) => t.trim().replace(/"/g, ""));
      }
    }

    return {
      name,
      description: description || `Skill: ${name}`,
      source: "user_defined",
      enabled: true,
      tags: tags.length > 0 ? tags : ["custom"],
    };
  }

  /**
   * Formats category name from tag
   */
  private formatCategoryName(tag: string): string {
    return tag
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }
}

/**
 * Default service instance
 */
export const skillService = new SkillService();
