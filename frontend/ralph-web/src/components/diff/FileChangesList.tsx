/**
 * FileChangesList Component
 *
 * Displays list of file changes with approval controls for code review flow (P5-5).
 * Integrates with tRPC to fetch file changes and provides approve/reject functionality.
 */

import { useState } from "react";
import { Check, X, FileCode, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc";
import { Button } from "@/components/ui/button";
import type { FileChange, FileChangeApprovalStatus } from "@/types/task";

export interface FileChangesListProps {
  /** Task ID to fetch changes for */
  taskId: string;
  /** Whether to show approval controls */
  showApprovals?: boolean;
  /** Callback when a file is selected */
  onFileSelect?: (filePath: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * FileChangesList - List of file changes with approval controls.
 *
 * Fetches file changes from tRPC and displays them with approve/reject buttons.
 * Shows file statistics and approval status badges.
 */
export function FileChangesList({
  taskId,
  showApprovals = true,
  onFileSelect,
  className,
}: FileChangesListProps) {
  const utils = trpc.useUtils();

  // Fetch file changes
  const fileChangesQuery = trpc.task.getFileChanges.useQuery({ id: taskId });

  // Update approval mutation
  const updateApprovalMutation = trpc.task.updateFileChangeApproval.useMutation({
    onSuccess: () => {
      // Invalidate queries to refetch
      utils.task.getFileChanges.invalidate({ id: taskId });
      utils.task.getFileChangesStats.invalidate({ id: taskId });
    },
  });

  const handleApprove = async (filePath: string) => {
    await updateApprovalMutation.mutateAsync({
      taskId,
      filePath,
      approvalStatus: "approved",
    });
  };

  const handleReject = async (filePath: string) => {
    await updateApprovalMutation.mutateAsync({
      taskId,
      filePath,
      approvalStatus: "rejected",
    });
  };

  const getStatusBadge = (status?: FileChangeApprovalStatus) => {
    const statusConfig = {
      pending: {
        label: "Pending",
        className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
      },
      approved: {
        label: "Approved",
        className: "bg-green-500/10 text-green-600 border-green-500/20",
      },
      rejected: {
        label: "Rejected",
        className: "bg-red-500/10 text-red-600 border-red-500/20",
      },
    };

    const config = statusConfig[status || "pending"];
    return (
      <span
        className={cn(
          "px-2 py-0.5 text-xs font-medium rounded border",
          config.className
        )}
      >
        {config.label}
      </span>
    );
  };

  const getChangeTypeIcon = (status: string) => {
    switch (status) {
      case "added":
        return <span className="text-green-500 text-xs font-mono">A</span>;
      case "modified":
        return <span className="text-blue-500 text-xs font-mono">M</span>;
      case "deleted":
        return <span className="text-red-500 text-xs font-mono">D</span>;
      case "renamed":
        return <span className="text-amber-500 text-xs font-mono">R</span>;
      default:
        return <FileCode className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (fileChangesQuery.isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Loading file changes...
        </span>
      </div>
    );
  }

  if (fileChangesQuery.error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-8 text-center",
          className
        )}
      >
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-sm text-red-600">Failed to load file changes</p>
        <p className="text-xs text-muted-foreground mt-1">
          {fileChangesQuery.error.message}
        </p>
      </div>
    );
  }

  if (!fileChangesQuery.data || fileChangesQuery.data.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center py-8 text-center",
          className
        )}
      >
        <FileCode className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
        <p className="text-sm text-muted-foreground">No file changes detected</p>
        <p className="text-xs text-muted-foreground mt-1">
          File changes appear when tasks modify the codebase
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      {fileChangesQuery.data.map((file: FileChange, index: number) => (
        <div
          key={`${file.path}-${index}`}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg border border-border",
            "hover:bg-accent/50 transition-colors cursor-pointer"
          )}
          onClick={() => onFileSelect?.(file.path)}
        >
          {/* Change type icon */}
          <div className="flex-shrink-0 w-6 flex justify-center">
            {getChangeTypeIcon(file.status)}
          </div>

          {/* File path */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono truncate">{file.path}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span className="text-green-500">+{file.additions}</span>
              <span className="text-red-500">-{file.deletions}</span>
              {file.oldPath && (
                <span className="text-xs">from: {file.oldPath}</span>
              )}
            </div>
          </div>

          {/* Approval status and controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {getStatusBadge(file.approvalStatus)}

            {showApprovals && file.approvalStatus === "pending" && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApprove(file.path);
                  }}
                  disabled={updateApprovalMutation.isLoading}
                  className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-500/10 hover:border-green-500/20"
                  aria-label="Approve file change"
                >
                  <Check className="h-3 w-3" />
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReject(file.path);
                  }}
                  disabled={updateApprovalMutation.isLoading}
                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/20"
                  aria-label="Reject file change"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {updateApprovalMutation.isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
