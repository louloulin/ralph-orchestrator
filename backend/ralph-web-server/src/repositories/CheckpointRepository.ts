/**
 * Checkpoint Repository
 *
 * Interface for checkpoint storage operations.
 * This provides a clean separation between business logic and storage.
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import {
  type LoopCheckpoint,
  type CheckpointMeta,
  type RestoreResult,
  type CheckpointStats,
  type CheckpointType,
} from "../types/checkpoint";

/**
 * Checkpoint Repository Interface
 *
 * Defines the contract for checkpoint storage operations.
 * Implementations can use different backends (file system, database, etc.).
 */
export interface CheckpointRepository {
  /**
   * Creates a new checkpoint
   *
   * @param loopId - The loop identifier
   * @param checkpointType - Why this checkpoint is being created
   * @param cwd - Current working directory
   * @returns The created checkpoint metadata
   */
  create(
    loopId: string,
    checkpointType: CheckpointType,
    cwd: string
  ): Promise<{ id: string; checkpoint: LoopCheckpoint; meta: CheckpointMeta }>;

  /**
   * Lists all checkpoints for a loop, sorted newest first
   *
   * @param loopId - The loop identifier
   * @param cwd - Current working directory
   * @returns Array of checkpoint metadata
   */
  list(loopId: string, cwd: string): Promise<CheckpointMeta[]>;

  /**
   * Gets a specific checkpoint by ID
   *
   * @param checkpointId - The checkpoint identifier
   * @param cwd - Current working directory
   * @returns The checkpoint
   */
  get(checkpointId: string, cwd: string): Promise<LoopCheckpoint>;

  /**
   * Gets the latest checkpoint for a loop
   *
   * @param loopId - The loop identifier
   * @param cwd - Current working directory
   * @returns The latest checkpoint or null if none exist
   */
  getLatest(loopId: string, cwd: string): Promise<LoopCheckpoint | null>;

  /**
   * Restores from a checkpoint with validation
   *
   * @param checkpointId - The checkpoint identifier
   * @param cwd - Current working directory
   * @returns Restore result with warnings
   */
  restore(checkpointId: string, cwd: string): Promise<RestoreResult>;

  /**
   * Deletes a checkpoint
   *
   * @param checkpointId - The checkpoint identifier
   * @param cwd - Current working directory
   * @returns True if deleted, false if not found
   */
  delete(checkpointId: string, cwd: string): Promise<boolean>;

  /**
   * Gets checkpoint statistics
   *
   * @param cwd - Current working directory
   * @returns Checkpoint statistics
   */
  getStats(cwd: string): Promise<CheckpointStats>;

  /**
   * Prunes old checkpoints based on retention policy
   *
   * @param loopId - The loop identifier
   * @param maxCheckpoints - Maximum checkpoints to keep
   * @param maxAgeSeconds - Maximum age in seconds
   * @param cwd - Current working directory
   * @returns Number of checkpoints pruned
   */
  prune(
    loopId: string,
    maxCheckpoints: number,
    maxAgeSeconds: number,
    cwd: string
  ): Promise<number>;
}

/**
 * File-based implementation of checkpoint repository
 *
 * Stores checkpoints in `.ralph/checkpoints/{loop_id}/`
 */
export class FileCheckpointRepository implements CheckpointRepository {
  /**
   * Creates a new checkpoint
   */
  async create(
    loopId: string,
    checkpointType: CheckpointType,
    cwd: string
  ): Promise<{ id: string; checkpoint: LoopCheckpoint; meta: CheckpointMeta }> {
    const checkpointsDir = this.getCheckpointsDir(cwd);
    const now = new Date();
    const id = this.generateCheckpointId();

    // Create checkpoint object
    const checkpoint: LoopCheckpoint = {
      id,
      loopId,
      createdAt: now.toISOString(),
      iteration: 0, // Will be populated from actual loop state
      checkpointType,
      compressed: false,
      size: 0,
      checksum: "",
      state: {
        loopId,
        iteration: 0,
        currentHat: null,
        status: "running",
        memories: [],
        tasks: [],
        currentTask: null,
        pendingEvents: [],
        lastPrompt: null,
        loopState: {
          iteration: 0,
          consecutiveFailures: 0,
          cumulativeCost: 0,
          startedAt: now.toISOString(),
          lastHat: null,
          consecutiveBlocked: 0,
          lastBlockedHat: null,
          taskBlockCounts: {},
          abandonedTasks: [],
          abandonedTaskRedispatches: 0,
          consecutiveMalformedEvents: 0,
          completionRequested: false,
          hatActivationCounts: {},
          exhaustedHats: [],
          lastCheckinAt: null,
          lastActiveHatIds: [],
        },
        startedAt: now.toISOString(),
        lastCheckpointAt: null,
        fileHashes: {},
      },
    };

    // Serialize checkpoint
    const content = JSON.stringify(checkpoint, null, 2);
    checkpoint.size = Buffer.byteLength(content, "utf-8");
    checkpoint.checksum = this.calculateChecksum(content);

    // Save checkpoint file
    await this.fs.mkdir(this.fs.path.join(checkpointsDir, loopId), {
      recursive: true,
    });
    const checkpointPath = this.fs.path.join(checkpointsDir, loopId, `${id}.json`);
    await this.fs.writeFile(checkpointPath, content);

    // Create metadata
    const meta: CheckpointMeta = {
      id,
      loopId,
      createdAt: checkpoint.createdAt,
      checkpointType: checkpoint.checkpointType,
      path: `${loopId}/${id}.json`,
      size: checkpoint.size,
      compressed: false,
      checksum: checkpoint.checksum,
    };

    // Update index
    await this.updateIndex(cwd, meta);

    return { id, checkpoint, meta };
  }

  /**
   * Lists checkpoints for a loop
   */
  async list(loopId: string, cwd: string): Promise<CheckpointMeta[]> {
    const index = await this.readIndex(cwd);

    return index.checkpoints
      .filter((m) => m.loopId === loopId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  /**
   * Gets a checkpoint by ID
   */
  async get(checkpointId: string, cwd: string): Promise<LoopCheckpoint> {
    const index = await this.readIndex(cwd);

    const meta = index.checkpoints.find((m) => m.id === checkpointId);
    if (!meta) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const checkpointPath = this.fs.path.join(
      this.getCheckpointsDir(cwd),
      meta.path
    );
    const content = await this.fs.readFile(checkpointPath, "utf-8");
    const checkpoint: LoopCheckpoint = JSON.parse(content);

    return checkpoint;
  }

  /**
   * Gets the latest checkpoint for a loop
   */
  async getLatest(
    loopId: string,
    cwd: string
  ): Promise<LoopCheckpoint | null> {
    const checkpoints = await this.list(loopId, cwd);
    if (checkpoints.length === 0) {
      return null;
    }

    return this.get(checkpoints[0].id, cwd);
  }

  /**
   * Restores from a checkpoint with validation
   */
  async restore(
    checkpointId: string,
    cwd: string
  ): Promise<RestoreResult> {
    const index = await this.readIndex(cwd);

    const meta = index.checkpoints.find((m) => m.id === checkpointId);
    if (!meta) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    // Load checkpoint
    const checkpointPath = this.fs.path.join(
      this.getCheckpointsDir(cwd),
      meta.path
    );
    const content = await this.fs.readFile(checkpointPath, "utf-8");

    // Verify checksum
    const actualChecksum = this.calculateChecksum(content);
    const warnings: string[] = [];

    if (actualChecksum !== meta.checksum) {
      warnings.push(
        `Checksum mismatch: expected ${meta.checksum}, got ${actualChecksum}`
      );
    }

    const checkpoint: LoopCheckpoint = JSON.parse(content);

    // Validate state
    if (checkpoint.state.iteration !== checkpoint.iteration) {
      warnings.push(
        `Iteration mismatch: checkpoint says ${checkpoint.iteration}, state says ${checkpoint.state.iteration}`
      );
    }

    // Check for missing files
    for (const [filePath] of Object.entries(checkpoint.state.fileHashes)) {
      try {
        await this.fs.access(this.fs.path.join(cwd, filePath));
      } catch {
        warnings.push(`Referenced file no longer exists: ${filePath}`);
      }
    }

    return {
      checkpoint,
      success: warnings.length === 0 || !warnings.some((w) => w.includes("Checksum")),
      warnings,
      restoredAt: new Date().toISOString(),
    };
  }

  /**
   * Deletes a checkpoint
   */
  async delete(checkpointId: string, cwd: string): Promise<boolean> {
    const index = await this.readIndex(cwd);

    const metaIndex = index.checkpoints.findIndex((m) => m.id === checkpointId);
    if (metaIndex === -1) {
      return false;
    }

    const meta = index.checkpoints[metaIndex];
    const checkpointPath = this.fs.path.join(
      this.getCheckpointsDir(cwd),
      meta.path
    );

    // Delete the file
    try {
      await this.fs.unlink(checkpointPath);
    } catch {
      // Ignore if file doesn't exist
    }

    // Update index
    index.checkpoints.splice(metaIndex, 1);
    await this.writeIndex(cwd, index);

    return true;
  }

  /**
   * Gets checkpoint statistics
   */
  async getStats(cwd: string): Promise<CheckpointStats> {
    const index = await this.readIndex(cwd);

    return {
      total: index.checkpoints.length,
      totalSize: index.checkpoints.reduce((sum, m) => sum + m.size, 0),
      oldestAt:
        index.checkpoints.length > 0
          ? index.checkpoints.map((m) => m.createdAt).sort()[0]
          : null,
      newestAt:
        index.checkpoints.length > 0
          ? index.checkpoints.map((m) => m.createdAt).sort().reverse()[0]
          : null,
      loopCount: new Set(index.checkpoints.map((m) => m.loopId)).size,
    };
  }

  /**
   * Prunes old checkpoints based on retention policy
   */
  async prune(
    loopId: string,
    maxCheckpoints: number,
    maxAgeSeconds: number,
    cwd: string
  ): Promise<number> {
    const checkpoints = await this.list(loopId, cwd);
    const now = new Date();
    let pruned = 0;

    // Prune by count (keep newest N)
    if (checkpoints.length > maxCheckpoints) {
      const toPrune = checkpoints.slice(maxCheckpoints);
      for (const meta of toPrune) {
        await this.delete(meta.id, cwd);
        pruned++;
      }
    }

    // Prune by age
    const maxAgeDate = new Date(now.getTime() - maxAgeSeconds * 1000);
    const index = await this.readIndex(cwd);

    for (const meta of index.checkpoints) {
      if (meta.loopId === loopId) {
        const createdAt = new Date(meta.createdAt);
        if (createdAt < maxAgeDate) {
          await this.delete(meta.id, cwd);
          pruned++;
        }
      }
    }

    return pruned;
  }

  // Private helper methods

  private fs = {
    readFile: import("fs/promises").then((mod) => mod.readFile),
    writeFile: import("fs/promises").then((mod) => mod.writeFile),
    mkdir: import("fs/promises").then((mod) => mod.mkdir),
    unlink: import("fs/promises").then((mod) => mod.unlink),
    access: import("fs/promises").then((mod) => mod.access),
    path,
  };

  private getCheckpointsDir(cwd: string): string {
    return this.fs.path.join(cwd, ".ralph/checkpoints");
  }

  private getIndexFilePath(cwd: string): string {
    return this.fs.path.join(this.getCheckpointsDir(cwd), "checkpoint-meta.json");
  }

  private async readIndex(cwd: string): Promise<{
    checkpoints: CheckpointMeta[];
    updatedAt: string;
  }> {
    const indexPath = this.getIndexFilePath(cwd);
    try {
      const readFile = await this.fs.readFile;
      const content = await readFile(indexPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return { checkpoints: [], updatedAt: new Date().toISOString() };
    }
  }

  private async writeIndex(
    cwd: string,
    index: { checkpoints: CheckpointMeta[]; updatedAt: string }
  ): Promise<void> {
    const indexPath = this.getIndexFilePath(cwd);
    const [mkdir, writeFile] = await Promise.all([
      this.fs.mkdir,
      this.fs.writeFile,
    ]);
    await mkdir(this.fs.path.dirname(indexPath), { recursive: true });
    index.updatedAt = new Date().toISOString();
    await writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  private async updateIndex(cwd: string, meta: CheckpointMeta): Promise<void> {
    const index = await this.readIndex(cwd);
    index.checkpoints.push(meta);
    // Sort and deduplicate by keeping newest version of each ID
    index.checkpoints = index.checkpoints
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .filter(
        (value, index, self) =>
          index === self.findIndex((t) => t.id === value.id)
      );
    await this.writeIndex(cwd, index);
  }

  private calculateChecksum(content: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  private generateCheckpointId(): string {
    const now = new Date();
    return `cp-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now
      .toTimeString()
      .slice(0, 8)
      .replace(/:/g, "")}`;
  }
}

/**
 * Default repository instance (file-based)
 */
export const checkpointRepository = new FileCheckpointRepository();