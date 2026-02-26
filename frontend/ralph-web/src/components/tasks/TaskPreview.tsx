/**
 * TaskPreview Component
 *
 * Shows a detailed preview of a task when hovering over task items.
 * Displays extended information like description, logs summary, and metadata.
 *
 * Features:
 * - Delayed hover to avoid accidental triggers (500ms delay)
 * - Shows task ID, status, priority, timestamps
 * - Displays execution summary when available
 * - Shows last few log lines for running tasks
 */

import { useState, useCallback, type ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { type Task } from "./TaskThread";
import { formatDistanceToNow } from "date-fns";
import { Clock, Calendar, Hash, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskPreviewProps {
  /** The task to preview */
  task: Task;
  /** Children element that triggers the preview on hover */
  children: ReactNode;
  /** Optional custom className */
  className?: string;
  /** Delay before showing tooltip in milliseconds (default: 500) */
  delayDuration?: number;
}

/**
 * Get status badge variant for the preview
 */
function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const statusMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    running: "default",
    pending: "secondary",
    open: "outline",
    blocked: "destructive",
    completed: "secondary",
    failed: "destructive",
    closed: "outline",
    archived: "outline",
  };
  return statusMap[status] || "outline";
}

/**
 * Format priority number to label
 */
function getPriorityLabel(priority: number): string {
  if (priority <= 1) return "P1 - Critical";
  if (priority <= 2) return "P2 - High";
  if (priority <= 3) return "P3 - Medium";
  if (priority <= 4) return "P4 - Low";
  return "P5 - Optional";
}

/**
 * TaskPreview - Hover preview with detailed task information
 */
export function TaskPreview({
  task,
  children,
  className,
  delayDuration = 500,
}: TaskPreviewProps) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    setOpen(newOpen);
  }, []);

  const formatDate = (date: Date | string | null | undefined): string | null => {
    if (!date) return null;
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
      return null;
    }
  };

  const hasExecutionData = task.executionSummary || task.exitCode !== null || task.durationMs;

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <div className={cn("cursor-pointer", className)}>{children}</div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="start"
          className="w-80 p-0"
          sideOffset={4}
        >
          <div className="p-4 space-y-3">
            {/* Header */}
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-sm leading-tight line-clamp-2">
                  {task.title || <span className="italic text-muted-foreground">Untitled task</span>}
                </h4>
                <Badge variant={getStatusBadgeVariant(task.status)} className="shrink-0 text-xs">
                  {task.status}
                </Badge>
              </div>
              {task.id && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  <code className="text-xs">{task.id.slice(0, 12)}</code>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Priority</span>
                <span className="font-medium">{getPriorityLabel(task.priority)}</span>
              </div>
              {task.blockedBy && (
                <div className="flex items-start gap-1.5 text-destructive">
                  <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span className="line-clamp-1">Blocked by: {task.blockedBy.slice(0, 16)}...</span>
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="space-y-1 text-xs border-t pt-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-3 w-3 shrink-0" />
                <span>Created {formatDate(task.createdAt)}</span>
              </div>
              {task.updatedAt && task.updatedAt !== task.createdAt && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Updated {formatDate(task.updatedAt)}</span>
                </div>
              )}
              {task.startedAt && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-3.5" />
                  <span>Started {formatDate(task.startedAt)}</span>
                </div>
              )}
              {task.completedAt && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-3.5" />
                  <span>Completed {formatDate(task.completedAt)}</span>
                </div>
              )}
            </div>

            {/* Execution data */}
            {hasExecutionData && (
              <div className="space-y-1.5 border-t pt-2">
                {task.exitCode !== null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Exit Code</span>
                    <span
                      className={cn(
                        "font-medium",
                        task.exitCode === 0 ? "text-success" : "text-destructive"
                      )}
                    >
                      {task.exitCode}
                    </span>
                  </div>
                )}
                {task.durationMs && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-medium">
                      {(task.durationMs / 1000).toFixed(2)}s
                    </span>
                  </div>
                )}
                {task.executionSummary && (
                  <div className="text-xs">
                    <p className="text-muted-foreground mb-1">Summary</p>
                    <p className="line-clamp-3 text-foreground whitespace-pre-wrap">
                      {task.executionSummary}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Error message */}
            {task.errorMessage && (
              <div className="space-y-1 border-t pt-2">
                <p className="text-xs font-medium text-destructive">Error</p>
                <p className="text-xs text-destructive line-clamp-3">
                  {task.errorMessage}
                </p>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
