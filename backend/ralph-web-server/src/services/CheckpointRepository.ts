/**
 * Checkpoint Repository
 *
 * File-based storage operations for checkpoint management.
 * This module provides the low-level storage operations used by the
 * checkpoint tRPC router.
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
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

// Checkpoint storage path
const CHECKPOINTS_DIR = ".ralph/checkpoints";
const INDEX_FILE = "checkpoint-meta.json";

/**
 * Checkpoint index file structure
 */
interface CheckpointIndex {
  checkpoints: CheckpointMeta[];
  updatedAt: string;
}

/**
 * Gets the path to the checkpoints directory
 */
export function getCheckpointsDir(cwd: string): string {
  return path.join(cwd, CHECKPOINTS_DIR);
}

/**
 * Gets the path to the index file
 */
export function getIndexFilePath(cwd: string): string {
  return path.join(getCheckpointsDir(cwd), INDEX_FILE);
}

/**
 * Reads the checkpoint index
 */
export async function readIndex(cwd: string): Promise<CheckpointIndex> {
  const indexPath = getIndexFilePath(cwd);
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { checkpoints: [], updatedAt: new Date().toISOString() };
  }
}

/**
 * Writes the checkpoint index
 */
export async function writeIndex(cwd: string, index: CheckpointIndex): Promise<void> {
  const indexPath = getIndexFilePath(cwd);
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  index.updatedAt = new Date().toISOString();
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

/**
 * Calculates SHA-256 checksum
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Creates a new checkpoint ID based on current timestamp
 */
export function generateCheckpointId(): string {
  const now = new Date();
  return `cp-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now
    .toTimeString()
    .slice(0, 8)
    .replace(/:/g, "")}`;
}

/**
 * Creates a checkpoint for a loop
 */
export async function createCheckpoint(
  loopId: string,
  iteration: number,
  checkpointType: CheckpointType,
  cwd: string
): Promise<{
  id: string;
  checkpoint: LoopCheckpoint;
  meta: CheckpointMeta;
}> {
  const checkpointsDir = getCheckpointsDir(cwd);
  const now = new Date();
  const id = generateCheckpointId();

  // Create checkpoint object (simplified - in production this would capture actual state)
  const checkpoint: LoopCheckpoint = {
    id,
    loopId,
    createdAt: now.toISOString(),
    iteration,
    checkpointType,
    compressed: false,
    size: 0,
    checksum: "",
    state: {
      loopId,
      iteration,
      currentHat: null,
      status: "running",
      memories: [],
      tasks: [],
      currentTask: null,
      pendingEvents: [],
      lastPrompt: null,
      loopState: {
        iteration,
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
  checkpoint.checksum = calculateChecksum(content);

  // Save checkpoint file
  await fs.mkdir(path.join(checkpointsDir, loopId), { recursive: true });
  const checkpointPath = path.join(checkpointsDir, loopId, `${id}.json`);
  await fs.writeFile(checkpointPath, content);

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

  return { id, checkpoint, meta };
}

/**
 * Lists checkpoints for a loop
 */
export async function listCheckpoints(loopId: string, cwd: string): Promise<CheckpointMeta[]> {
  const index = await readIndex(cwd);

  return index.checkpoints
    .filter((m) => m.loopId === loopId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Loads a checkpoint by ID
 */
export async function loadCheckpoint(checkpointId: string, cwd: string): Promise<LoopCheckpoint> {
  const index = await readIndex(cwd);

  const meta = index.checkpoints.find((m) => m.id === checkpointId);
  if (!meta) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  const checkpointPath = path.join(getCheckpointsDir(cwd), meta.path);
  const content = await fs.readFile(checkpointPath, "utf-8");
  const checkpoint: LoopCheckpoint = JSON.parse(content);

  return checkpoint;
}

/**
 * Restores from a checkpoint with validation
 */
export async function restoreCheckpoint(
  checkpointId: string,
  cwd: string
): Promise<RestoreResult> {
  const index = await readIndex(cwd);

  const meta = index.checkpoints.find((m) => m.id === checkpointId);
  if (!meta) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  // Load checkpoint
  const checkpointPath = path.join(getCheckpointsDir(cwd), meta.path);
  const content = await fs.readFile(checkpointPath, "utf-8");

  // Verify checksum
  const actualChecksum = calculateChecksum(content);
  const warnings: string[] = [];

  if (actualChecksum !== meta.checksum) {
    warnings.push(`Checksum mismatch: expected ${meta.checksum}, got ${actualChecksum}`);
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
      await fs.access(path.join(cwd, filePath));
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
export async function deleteCheckpoint(checkpointId: string, cwd: string): Promise<boolean> {
  const index = await readIndex(cwd);

  const metaIndex = index.checkpoints.findIndex((m) => m.id === checkpointId);
  if (metaIndex === -1) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  const meta = index.checkpoints[metaIndex];
  const checkpointPath = path.join(getCheckpointsDir(cwd), meta.path);

  // Delete the file
  try {
    await fs.unlink(checkpointPath);
  } catch {
    // Ignore if file doesn't exist
  }

  // Update index
  index.checkpoints.splice(metaIndex, 1);
  await writeIndex(cwd, index);

  return true;
}

/**
 * Gets checkpoint statistics
 */
export async function getCheckpointStats(cwd: string): Promise<CheckpointStats> {
  const index = await readIndex(cwd);

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
