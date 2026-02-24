/**
 * Checkpoint Types for State Persistence and Crash Recovery
 *
 * These types support the Phase 4 P4-2 checkpoint system:
 * - CheckpointManager: creates and manages checkpoints
 * - StateSerializer: serializes loop state for persistence
 * - RecoveryManager: restores loops from checkpoints
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

/**
 * Why a checkpoint was created.
 */
export type CheckpointType =
  | "interval" // Periodic checkpoint
  | "pre_task" // Before starting a task
  | "post_task" // After completing a task
  | "manual" // User-requested
  | "pre_restart"; // Before restart

/**
 * Configuration for checkpoint behavior.
 */
export interface CheckpointConfig {
  /** Whether checkpointing is enabled */
  enabled: boolean;
  /** Interval between automatic checkpoints in seconds */
  intervalSeconds: number;
  /** Maximum checkpoints to keep per loop */
  maxCheckpoints: number;
  /** Maximum age in seconds before checkpoints are pruned */
  maxAgeSeconds: number;
  /** Compress checkpoints larger than this many bytes */
  compressThreshold: number;
}

/**
 * Default checkpoint configuration.
 */
export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  enabled: true,
  intervalSeconds: 300, // 5 minutes
  maxCheckpoints: 10,
  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
  compressThreshold: 100_000, // 100KB
};

/**
 * Serializable loop state for checkpointing.
 * This is a snapshot of the event loop's internal state.
 */
export interface SerializableLoopState {
  /** Current iteration number (1-indexed) */
  iteration: number;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Cumulative cost in USD */
  cumulativeCost: number;
  /** When the loop started (ISO 8601) */
  startedAt: string;
  /** The last hat that executed */
  lastHat: string | null;
  /** Consecutive blocked events from the same hat */
  consecutiveBlocked: number;
  /** Hat that emitted the last blocked event */
  lastBlockedHat: string | null;
  /** Per-task block counts */
  taskBlockCounts: Record<string, number>;
  /** Tasks that have been abandoned */
  abandonedTasks: string[];
  /** Count of abandoned task redispatches */
  abandonedTaskRedispatches: number;
  /** Consecutive malformed events */
  consecutiveMalformedEvents: number;
  /** Whether completion was requested */
  completionRequested: boolean;
  /** Per-hat activation counts */
  hatActivationCounts: Record<string, number>;
  /** Exhausted hat IDs */
  exhaustedHats: string[];
  /** When the last Telegram check-in was sent */
  lastCheckinAt: string | null;
  /** Last active hat IDs */
  lastActiveHatIds: string[];
}

/**
 * Memory entry in a checkpoint.
 */
export interface CheckpointMemory {
  /** Unique identifier (format: mem-{timestamp}-{4hex}) */
  id: string;
  /** Classification of this memory */
  memoryType: "pattern" | "decision" | "fix" | "context";
  /** The actual memory content */
  content: string;
  /** Tags for categorization and search */
  tags: string[];
  /** Creation date (format: YYYY-MM-DD) */
  created: string;
}

/**
 * Task status in a checkpoint.
 */
export type CheckpointTaskStatus = "open" | "in_progress" | "closed" | "failed";

/**
 * Task entry in a checkpoint.
 */
export interface CheckpointTask {
  /** Unique ID */
  id: string;
  /** Short description */
  title: string;
  /** Optional detailed description */
  description?: string;
  /** Current state */
  status: CheckpointTaskStatus;
  /** Priority 1-5 (1 = highest) */
  priority: number;
  /** Tasks that must complete before this one */
  blockedBy: string[];
  /** Loop ID that created this task */
  loopId?: string;
  /** Creation timestamp (ISO 8601) */
  created: string;
  /** Completion timestamp (ISO 8601), if closed */
  closed?: string;
}

/**
 * The state contained within a checkpoint.
 */
export interface CheckpointState {
  /** Core loop metadata */
  loopId: string;
  /** Iteration number */
  iteration: number;
  /** Current hat (if any) */
  currentHat: string | null;
  /** Loop status string */
  status: string;
  /** Memories at checkpoint time */
  memories: CheckpointMemory[];
  /** Tasks at checkpoint time */
  tasks: CheckpointTask[];
  /** Currently active task ID (if any) */
  currentTask: string | null;
  /** Pending events (if any) */
  pendingEvents: string[];
  /** The last prompt sent to the agent */
  lastPrompt: string | null;
  /** Loop internal state */
  loopState: SerializableLoopState;
  /** When this loop started */
  startedAt: string;
  /** When the last checkpoint was created */
  lastCheckpointAt: string | null;
  /** File hashes for integrity (path -> hash) */
  fileHashes: Record<string, string>;
}

/**
 * Complete checkpoint for a loop.
 */
export interface LoopCheckpoint {
  /** Unique checkpoint ID (format: cp-{YYYYMMDD}-{HHMMSS}) */
  id: string;
  /** Associated loop ID */
  loopId: string;
  /** When the checkpoint was created */
  createdAt: string;
  /** Iteration number at checkpoint time */
  iteration: number;
  /** Why this checkpoint was created */
  checkpointType: CheckpointType;
  /** Size of the serialized checkpoint in bytes */
  size: number;
  /** SHA-256 checksum for integrity verification */
  checksum: string;
  /** Whether the checkpoint is compressed */
  compressed: boolean;
  /** The actual loop state */
  state: CheckpointState;
}

/**
 * Metadata entry for the checkpoint index.
 */
export interface CheckpointMeta {
  /** Checkpoint ID */
  id: string;
  /** Loop ID */
  loopId: string;
  /** When created */
  createdAt: string;
  /** Checkpoint type */
  checkpointType: CheckpointType;
  /** File path relative to checkpoints directory */
  path: string;
  /** Size in bytes */
  size: number;
  /** Whether compressed */
  compressed: boolean;
  /** Checksum */
  checksum: string;
}

/**
 * Result of a checkpoint restore operation.
 */
export interface RestoreResult {
  /** The restored checkpoint */
  checkpoint: LoopCheckpoint;
  /** Whether the restore was successful */
  success: boolean;
  /** Any warnings encountered during restore */
  warnings: string[];
  /** Timestamp of the restore */
  restoredAt: string;
}

/**
 * Summary statistics for checkpoints.
 */
export interface CheckpointStats {
  /** Total number of checkpoints */
  total: number;
  /** Total size in bytes */
  totalSize: number;
  /** Oldest checkpoint date */
  oldestAt: string | null;
  /** Newest checkpoint date */
  newestAt: string | null;
  /** Number of loops with checkpoints */
  loopCount: number;
}
