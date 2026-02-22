/**
 * Diff Types
 *
 * TypeScript interfaces for the DiffViewer component that displays
 * code changes (diffs) in real-time, inspired by Vibe Kanban's diff renderer.
 *
 * @see .ralph/specs/web-dashboard/diff-viewer.spec.md
 */

/**
 * Types of file changes in a diff.
 */
export type FileChangeType =
  | "added"     // New file created
  | "modified"  // Existing file modified
  | "deleted"   // File deleted
  | "renamed"   // File renamed (may have content changes)
  | "copied";   // File copied

/**
 * Types of diff lines.
 */
export type DiffLineType =
  | "context"   // Unchanged context line
  | "add"       // Added line (green)
  | "delete"    // Deleted line (red)
  | "header";   // Hunk header

/**
 * Character-level diff highlight within a line.
 */
export interface DiffHighlight {
  /** Start column in the line */
  start: number;
  /** Length of highlighted region */
  length: number;
  /** Type of highlight */
  type: "add" | "delete";
}

/**
 * A single line in a diff.
 */
export interface DiffLine {
  /** Line type */
  type: DiffLineType;
  /** Original line number (for context/delete) */
  oldLineNumber?: number;
  /** New line number (for context/add) */
  newLineNumber?: number;
  /** Line content */
  content: string;
  /** Character-level diff highlights */
  highlights?: DiffHighlight[];
}

/**
 * A hunk/section of a diff.
 */
export interface DiffHunk {
  /** Hunk header (e.g., "@@ -1,5 +1,7 @@") */
  header: string;
  /** Old file start line */
  oldStart: number;
  /** Old file line count */
  oldLines: number;
  /** New file start line */
  newStart: number;
  /** New file line count */
  newLines: number;
  /** Section title (optional, from git) */
  section?: string;
  /** Lines in this hunk */
  lines: DiffLine[];
}

/**
 * Statistics for a single file diff.
 */
export interface DiffStats {
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Total number of changes */
  total: number;
}

/**
 * A diff for a single file.
 */
export interface FileDiff {
  /** Unique identifier for this diff */
  id: string;
  /** Original file path */
  oldPath: string;
  /** New file path (may differ for renames) */
  newPath: string;
  /** Type of change */
  changeType: FileChangeType;
  /** List of diff hunks */
  hunks: DiffHunk[];
  /** Statistics for this file */
  stats: DiffStats;
  /** File language for syntax highlighting */
  language?: string;
}

/**
 * Total statistics across all files in a diff session.
 */
export interface DiffTotalStats {
  /** Number of files changed */
  filesChanged: number;
  /** Total lines added */
  additions: number;
  /** Total lines deleted */
  deletions: number;
}

/**
 * A complete diff session for a task.
 */
export interface DiffSession {
  /** Task ID associated with this diff */
  taskId: string;
  /** All file diffs in this session */
  files: FileDiff[];
  /** Total statistics across all files */
  totalStats: DiffTotalStats;
  /** Timestamp of last update */
  updatedAt: Date;
}

/**
 * View mode for the diff display.
 */
export type DiffViewMode = "unified" | "split";

/**
 * Action types for diff updates.
 */
export type DiffAction = "add" | "update" | "remove";

/**
 * Event payload for diff updates from WebSocket.
 */
export interface DiffEvent {
  type: "diff";
  taskId: string;
  file: FileDiff;
  action: DiffAction;
}

/**
 * Color classes for file change type indicators.
 */
export const FILE_CHANGE_TYPE_COLORS: Record<FileChangeType, string> = {
  added: "text-green-500",
  modified: "text-blue-500",
  deleted: "text-red-500",
  renamed: "text-amber-500",
  copied: "text-purple-500",
};

/**
 * Background colors for line types.
 */
export const DIFF_LINE_BG_COLORS: Record<DiffLineType, string> = {
  context: "bg-zinc-900",
  add: "bg-green-900/30",
  delete: "bg-red-900/30",
  header: "bg-zinc-800",
};

/**
 * Text colors for line types.
 */
export const DIFF_LINE_TEXT_COLORS: Record<DiffLineType, string> = {
  context: "text-zinc-300",
  add: "text-green-100",
  delete: "text-red-100",
  header: "text-zinc-400",
};

/**
 * Human-readable labels for file change types.
 */
export const FILE_CHANGE_TYPE_LABELS: Record<FileChangeType, string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  renamed: "Renamed",
  copied: "Copied",
};

/**
 * All file change types as an array.
 */
export const FILE_CHANGE_TYPES: readonly FileChangeType[] = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
] as const;
