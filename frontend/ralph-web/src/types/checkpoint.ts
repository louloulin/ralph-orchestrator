/**
 * Checkpoint Types
 *
 * Type definitions for the Checkpoint System frontend.
 * Matches the backend CheckpointRepository types.
 */

import { z } from "zod";

/**
 * Why a checkpoint was created
 */
export const CheckpointTypeSchema = z.enum([
  "interval",
  "pre_task",
  "post_task",
  "manual",
  "pre_restart",
]);

export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

/**
 * Checkpoint metadata returned from list endpoint
 */
export const CheckpointMetaSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  createdAt: z.string(),
  checkpointType: CheckpointTypeSchema,
  size: z.number(),
  compressed: z.boolean(),
  checksum: z.string(),
});

export type CheckpointMeta = z.infer<typeof CheckpointMetaSchema>;

/**
 * Full checkpoint with state
 */
export const CheckpointSchema = z.object({
  id: z.string(),
  loopId: z.string(),
  createdAt: z.string(),
  iteration: z.number(),
  checkpointType: CheckpointTypeSchema,
  size: z.number(),
  checksum: z.string(),
  compressed: z.boolean(),
  state: z.any().optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

/**
 * Result of a checkpoint restore operation
 */
export const RestoreResultSchema = z.object({
  success: z.boolean(),
  checkpointId: z.string(),
  restoredAt: z.string(),
  restoredIteration: z.number(),
  message: z.string().optional(),
});

export type RestoreResult = z.infer<typeof RestoreResultSchema>;

/**
 * Checkpoint statistics
 */
export const CheckpointStatsSchema = z.object({
  total: z.number(),
  totalSize: z.number(),
  oldestAt: z.string().nullable(),
  newestAt: z.string().nullable(),
  loopCount: z.number(),
});

export type CheckpointStats = z.infer<typeof CheckpointStatsSchema>;

/**
 * Checkpoint type labels for display
 */
export const CHECKPOINT_TYPE_LABELS: Record<CheckpointType, string> = {
  interval: "Interval",
  pre_task: "Pre-Task",
  post_task: "Post-Task",
  manual: "Manual",
  pre_restart: "Pre-Restart",
};

/**
 * Checkpoint type colors for badges
 */
export const CHECKPOINT_TYPE_COLORS: Record<CheckpointType, string> = {
  interval: "bg-blue-500/20 text-blue-400",
  pre_task: "bg-purple-500/20 text-purple-400",
  post_task: "bg-green-500/20 text-green-400",
  manual: "bg-yellow-500/20 text-yellow-400",
  pre_restart: "bg-orange-500/20 text-orange-400",
};

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format date for display
 */
export function formatCheckpointDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}
