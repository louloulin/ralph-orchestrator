/**
 * Task types for code review and approval flow (P5-5)
 */

/**
 * File change status - what happened to the file
 */
export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed";

/**
 * Approval status for a file change
 */
export type FileChangeApprovalStatus = "pending" | "approved" | "rejected";

/**
 * Individual file change record
 *
 * Tracks a single file's modifications during task execution.
 */
export interface FileChange {
  /** Relative path from project root */
  path: string;
  /** Type of change that occurred */
  status: FileChangeStatus;
  /** Number of lines added (for modified/added files) */
  additions: number;
  /** Number of lines deleted (for modified/deleted files) */
  deletions: number;
  /** Unified diff content (if available) */
  diff?: string;
  /** Previous path (for renamed files) */
  oldPath?: string;
  /** Approval status for the change */
  approvalStatus?: FileChangeApprovalStatus;
}

/**
 * File changes summary statistics
 */
export interface FileChangesStats {
  /** Total number of files changed */
  filesChanged: number;
  /** Total lines added across all files */
  totalAdditions: number;
  /** Total lines deleted across all files */
  totalDeletions: number;
  /** Number of files pending approval */
  pendingApproval: number;
  /** Number of files approved */
  approved: number;
  /** Number of files rejected */
  rejected: number;
}

/**
 * Props for file change approval controls
 */
export interface FileChangeApprovalProps {
  /** Task ID */
  taskId: string;
  /** File path to approve/reject */
  filePath: string;
  /** Current approval status */
  currentStatus?: FileChangeApprovalStatus;
  /** Callback when status changes */
  onStatusChange?: (newStatus: FileChangeApprovalStatus) => void;
}

/**
 * Props for file changes list component
 */
export interface FileChangesListProps {
  /** Task ID to fetch changes for */
  taskId: string;
  /** Whether to show approval controls */
  showApprovals?: boolean;
  /** Whether to show diffs inline */
  showDiffs?: boolean;
  /** Callback when a file is selected */
  onFileSelect?: (fileChange: FileChange) => void;
}
