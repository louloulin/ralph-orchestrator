/**
 * WorktreeService
 *
 * Service for managing Git worktrees.
 * Provides operations for creating, listing, and managing worktrees.
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface WorktreeInfo {
  /** Worktree path */
  path: string;
  /** Branch name */
  branch: string;
  /** Commit hash (short) */
  commit: string;
  /** Worktree status: clean or dirty */
  status: "clean" | "dirty";
  /** Whether this is the main worktree */
  isMain: boolean;
}

/**
 * Check if a directory is a git repository
 */
function isGitRepo(dirPath: string): boolean {
  try {
    return fs.existsSync(path.join(dirPath, ".git"));
  } catch {
    return false;
  }
}

/**
 * Run a git command in a directory
 */
function runGitCommand(dir: string, args: string[]): string {
  try {
    return execSync(args.join(" "), {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    return "";
  }
}

export class WorktreeService {
  /**
   * List all worktrees for a repository
   */
  listWorktrees(repoPath: string): WorktreeInfo[] {
    if (!isGitRepo(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    const worktrees: WorktreeInfo[] = [];

    try {
      // Get list of worktrees
      const worktreeList = runGitCommand(repoPath, [
        "git",
        "worktree",
        "list",
        "--porcelain",
      ]);

      if (!worktreeList) {
        // No worktrees found, return main only
        const mainBranch = runGitCommand(repoPath, ["git", "rev-parse", "--abbrev-ref", "HEAD"]);
        const mainCommit = runGitCommand(repoPath, ["git", "rev-parse", "HEAD"]).slice(0, 7);

        return [{
          path: repoPath,
          branch: mainBranch,
          commit: mainCommit,
          status: "clean",
          isMain: true,
        }];
      }

      let currentPath = "";
      let currentBranch = "";
      let currentCommit = "";
      let isMain = true;

      const lines = worktreeList.split("\n");
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          currentPath = line.replace("worktree ", "").trim();
        } else if (line.startsWith("branch ")) {
          currentBranch = line.replace("branch ", "").replace("refs/heads/", "").trim();
        } else if (line.startsWith("HEAD ")) {
          currentCommit = line.replace("HEAD ", "").slice(0, 7);
        } else if (line === "") {
          // End of current worktree entry
          if (currentPath) {
            const status = this.getWorktreeStatus(currentPath);
            worktrees.push({
              path: currentPath,
              branch: currentBranch || "(detached)",
              commit: currentCommit,
              status,
              isMain,
            });
            isMain = false;
          }
          currentPath = "";
          currentBranch = "";
          currentCommit = "";
        }
      }

      // Add the last worktree if exists
      if (currentPath) {
        const status = this.getWorktreeStatus(currentPath);
        worktrees.push({
          path: currentPath,
          branch: currentBranch || "(detached)",
          commit: currentCommit,
          status,
          isMain,
        });
      }
    } catch (error) {
      // Fallback: just return the main worktree
      const mainBranch = runGitCommand(repoPath, ["git", "rev-parse", "--abbrev-ref", "HEAD"]);
      const mainCommit = runGitCommand(repoPath, ["git", "rev-parse", "HEAD"]).slice(0, 7);

      return [{
        path: repoPath,
        branch: mainBranch,
        commit: mainCommit,
        status: "clean",
        isMain: true,
      }];
    }

    return worktrees;
  }

  /**
   * Get the status of a worktree (clean or dirty)
   */
  private getWorktreeStatus(worktreePath: string): "clean" | "dirty" {
    try {
      const status = runGitCommand(worktreePath, ["git", "status", "--porcelain"]);
      return status ? "dirty" : "clean";
    } catch {
      return "clean";
    }
  }

  /**
   * Create a new worktree
   */
  createWorktree(
    repoPath: string,
    worktreePath: string,
    branch: string,
    createBranch: boolean = false
  ): WorktreeInfo {
    if (!isGitRepo(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    // Ensure parent directory exists
    const parentDir = path.dirname(worktreePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Check if worktree already exists
    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree already exists: ${worktreePath}`);
    }

    const args = [
      "git",
      "worktree",
      "add",
    ];

    if (createBranch) {
      args.push("-b");
    }

    args.push(worktreePath);

    if (createBranch || branch) {
      args.push(branch);
    }

    runGitCommand(repoPath, args);

    // Return the new worktree info
    return {
      path: worktreePath,
      branch: branch || runGitCommand(worktreePath, ["git", "rev-parse", "--abbrev-ref", "HEAD"]),
      commit: runGitCommand(worktreePath, ["git", "rev-parse", "HEAD"]).slice(0, 7),
      status: "clean",
      isMain: false,
    };
  }

  /**
   * Remove a worktree
   */
  removeWorktree(repoPath: string, worktreePath: string, force: boolean = false): void {
    if (!isGitRepo(repoPath)) {
      throw new Error(`Not a git repository: ${repoPath}`);
    }

    // Don't allow removing main worktree
    if (worktreePath === repoPath) {
      throw new Error("Cannot remove the main worktree");
    }

    const args = [
      "git",
      "worktree",
      "remove",
    ];

    if (force) {
      args.push("--force");
    }

    args.push(worktreePath);

    runGitCommand(repoPath, args);
  }

  /**
   * Get status of a specific worktree
   */
  getWorktreeStatus(repoPath: string, worktreePath?: string): WorktreeInfo | null {
    const worktrees = this.listWorktrees(repoPath);

    if (worktreePath) {
      return worktrees.find((wt) => wt.path === worktreePath) || null;
    }

    // Return current worktree
    return worktrees.find((wt) => wt.path === repoPath) || null;
  }
}

// Singleton instance
export const worktreeService = new WorktreeService();
