/**
 * TaskContextMenu Component
 *
 * Right-click context menu for task items with quick actions.
 * Provides common operations like view details, copy ID, pause/resume, archive, delete.
 *
 * Features:
 * - Opens on right-click (or Shift+F10 / Menu key for keyboard users)
 * - Actions vary based on task status
 * - Keyboard accessible with proper ARIA support
 */

import { useCallback, type ReactNode, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Eye,
  Copy,
  Pause,
  Play,
  Archive,
  Trash2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/trpc";
import { type Task } from "./TaskThread";
import { toast } from "@/stores/toastStore";

interface TaskContextMenuProps {
  /** The task this menu operates on */
  task: Task;
  /** Children element that triggers the context menu */
  children: ReactNode;
  /** Optional callback when task is updated */
  onTaskUpdated?: () => void;
}

/**
 * TaskContextMenu - Right-click menu for task actions
 */
export function TaskContextMenu({ task, children, onTaskUpdated }: TaskContextMenuProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();

  // Mutations
  const archiveMutation = trpc.task.archive.useMutation();
  const deleteMutation = trpc.task.delete.useMutation();

  // Copy task ID to clipboard
  const handleCopyId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(task.id);
      toast.success("Copied to clipboard", `Task ID: ${task.id.slice(0, 12)}...`);
    } catch (error) {
      toast.error("Failed to copy", "Could not copy task ID to clipboard");
    }
  }, [task.id]);

  // Navigate to task detail
  const handleViewDetails = useCallback(() => {
    navigate(`/tasks/${task.id}`);
  }, [navigate, task.id]);

  // Open task in new tab
  const handleOpenInNewTab = useCallback((e: MouseEvent) => {
    e.preventDefault();
    window.open(`/tasks/${task.id}`, "_blank", "noopener,noreferrer");
  }, [task.id]);

  // Archive task
  const handleArchive = useCallback(async () => {
    try {
      await archiveMutation.mutateAsync({ id: task.id });
      utils.task.list.invalidate();
      onTaskUpdated?.();
      toast.success("Task archived", `"${task.title.slice(0, 30)}${task.title.length > 30 ? "..." : ""}" has been archived.`);
    } catch (error) {
      toast.error("Failed to archive", error instanceof Error ? error.message : "Unknown error");
    }
  }, [task.id, task.title, archiveMutation, utils, onTaskUpdated]);

  // Delete task permanently
  const handleDelete = useCallback(async () => {
    if (!confirm(`Are you sure you want to delete "${task.title}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: task.id });
      utils.task.list.invalidate();
      onTaskUpdated?.();
      toast.success("Task deleted", `"${task.title.slice(0, 30)}${task.title.length > 30 ? "..." : ""}" has been deleted.`);
    } catch (error) {
      toast.error("Failed to delete", error instanceof Error ? error.message : "Unknown error");
    }
  }, [task.id, task.title, deleteMutation, utils, onTaskUpdated]);

  // Check if task can be paused/resumed (running tasks)
  const canControlExecution = task.status === "running";
  const isArchived = !!task.archivedAt;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* View actions */}
        <ContextMenuItem onClick={handleViewDetails}>
          <Eye className="h-4 w-4 mr-2" />
          View Details
        </ContextMenuItem>
        <ContextMenuItem onClick={handleOpenInNewTab}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Open in New Tab
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Utility actions */}
        <ContextMenuItem onClick={handleCopyId}>
          <Copy className="h-4 w-4 mr-2" />
          Copy ID
        </ContextMenuItem>

        {/* Execution control - only for running tasks */}
        {canControlExecution && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem disabled>
              <Pause className="h-4 w-4 mr-2" />
              Pause (Coming Soon)
            </ContextMenuItem>
            <ContextMenuItem disabled>
              <Play className="h-4 w-4 mr-2" />
              Resume (Coming Soon)
            </ContextMenuItem>
          </>
        )}

        {/* Destructive actions */}
        {!isArchived && task.status !== "running" && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleArchive} disabled={archiveMutation.isPending}>
              <Archive className="h-4 w-4 mr-2" />
              {archiveMutation.isPending ? "Archiving..." : "Archive"}
            </ContextMenuItem>
          </>
        )}

        {isArchived && (
          <ContextMenuItem onClick={handleArchive} disabled={archiveMutation.isPending}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {archiveMutation.isPending ? "Restoring..." : "Unarchive"}
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {/* Delete - only available for non-running tasks */}
        {task.status !== "running" && (
          <ContextMenuItem
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
