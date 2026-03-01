/**
 * FileChangeApproval Component
 *
 * Approval controls for individual file changes in code review flow (P5-5).
 * Provides approve/reject buttons with visual feedback and status indicators.
 */

import { useState } from "react";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FileChangeApprovalStatus,
  type FileChangeApprovalProps,
} from "@/types/task";
import { trpc } from "@/trpc";

/**
 * FileChangeApproval - Approve/reject controls for file changes.
 *
 * Provides action buttons for approving or rejecting file changes
 * with optimistic updates and error handling.
 */
export function FileChangeApproval({
  taskId,
  filePath,
  currentStatus = "pending",
  onStatusChange,
}: FileChangeApprovalProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const utils = trpc.useUtils();

  const updateApprovalMutation = trpc.task.updateFileChangeApproval.useMutation({
    onSuccess: () => {
      // Invalidate file changes queries to refetch
      utils.task.getFileChanges.invalidate({ id: taskId });
      utils.task.getFileChangesStats.invalidate({ id: taskId });
    },
    onError: (error: Error) => {
      console.error("Failed to update approval status:", error);
      // Revert optimistic update on error
      onStatusChange?.(currentStatus);
    },
  });

  const handleApprove = async () => {
    if (isUpdating || currentStatus === "approved") return;

    setIsUpdating(true);
    // Optimistic update
    onStatusChange?.("approved");

    try {
      await updateApprovalMutation.mutateAsync({
        taskId,
        filePath,
        approvalStatus: "approved",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = async () => {
    if (isUpdating || currentStatus === "rejected") return;

    setIsUpdating(true);
    // Optimistic update
    onStatusChange?.("rejected");

    try {
      await updateApprovalMutation.mutateAsync({
        taskId,
        filePath,
        approvalStatus: "rejected",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const getStatusBadge = () => {
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

    const config = statusConfig[currentStatus];
    return (
      <span
        className={cn(
          "px-2 py-1 text-xs font-medium rounded-md border",
          config.className
        )}
      >
        {config.label}
      </span>
    );
  };

  return (
    <div className="flex items-center gap-2">
      {getStatusBadge()}

      {currentStatus === "pending" && !isUpdating && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleApprove}
            className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-500/10 hover:border-green-500/20"
            aria-label="Approve file change"
          >
            <Check className="h-3 w-3" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReject}
            className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-500/10 hover:border-red-500/20"
            aria-label="Reject file change"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {isUpdating && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
