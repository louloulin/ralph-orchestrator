/**
 * KanbanCard Component
 *
 * A draggable task card for the Kanban board.
 * Displays task title, status badge, priority, and worktree info.
 * Uses @dnd-kit/sortable for drag functionality.
 */

import { useMemo, forwardRef, memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  XCircle,
  Play,
  GripVertical,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WorktreeBadge } from "@/components/tasks/WorktreeBadge";
import { LoopBadge } from "@/components/tasks/LoopBadge";
import type { Task } from "@/components/tasks/TaskThread";

interface LoopData {
  id: string;
  status: string;
  location?: string;
}

interface KanbanCardProps {
  /** The task to display */
  task: Task;
  /** Optional loop data for worktree visualization */
  loop?: LoopData;
  /** Whether this card is being dragged */
  isDragging?: boolean;
  /** Whether an update mutation is in progress */
  isUpdating?: boolean;
}

/**
 * Status configuration for visual styling
 */
interface StatusConfig {
  icon: typeof Circle;
  color: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  label: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  open: {
    icon: Circle,
    color: "text-zinc-400",
    badgeVariant: "secondary",
    label: "Open",
  },
  pending: {
    icon: Clock,
    color: "text-yellow-500",
    badgeVariant: "outline",
    label: "Pending",
  },
  running: {
    icon: Play,
    color: "text-blue-500",
    badgeVariant: "default",
    label: "Running",
  },
  completed: {
    icon: CheckCircle2,
    color: "text-green-500",
    badgeVariant: "secondary",
    label: "Completed",
  },
  closed: {
    icon: CheckCircle2,
    color: "text-green-500",
    badgeVariant: "secondary",
    label: "Closed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    badgeVariant: "destructive",
    label: "Failed",
  },
  cancelled: {
    icon: XCircle,
    color: "text-orange-500",
    badgeVariant: "outline",
    label: "Cancelled",
  },
  blocked: {
    icon: Clock,
    color: "text-orange-500",
    badgeVariant: "outline",
    label: "Blocked",
  },
};

const DEFAULT_STATUS: StatusConfig = {
  icon: Circle,
  color: "text-zinc-400",
  badgeVariant: "outline",
  label: "Unknown",
};

/**
 * Priority indicator colors
 */
const PRIORITY_COLORS: Record<number, string> = {
  1: "bg-red-500", // Highest priority
  2: "bg-orange-500",
  3: "bg-yellow-500",
  4: "bg-blue-500",
  5: "bg-zinc-500", // Lowest priority
};

/**
 * Format a relative time string
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

const KanbanCardComponent = forwardRef<HTMLDivElement, KanbanCardProps>(
  function KanbanCard({ task, loop, isDragging, isUpdating: _isUpdating }, ref) {
    const navigate = useNavigate();

    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging: isSortableDragging,
    } = useSortable({
      id: task.id,
      data: {
        type: "task",
        task,
      },
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    };

    const statusConfig = useMemo(() => {
      return STATUS_MAP[task.status] || DEFAULT_STATUS;
    }, [task.status]);

    const StatusIcon = statusConfig.icon;
    const isRunning = task.status === "running";
    const isWorktreeLoop = loop && loop.location !== "(in-place)";

    const relativeTime = useMemo(
      () => formatRelativeTime(new Date(task.updatedAt)),
      [task.updatedAt]
    );

    const handleClick = useCallback(() => {
      navigate(`/tasks/${task.id}`);
    }, [task.id, navigate]);

    return (
      <div
        ref={(node) => {
          // Combine refs
          setNodeRef(node);
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        style={style}
        className={cn(
          "group relative bg-card border border-border rounded-lg p-3 cursor-pointer",
          "hover:shadow-md hover:border-primary/30 transition-all duration-150",
          (isDragging || isSortableDragging) && "opacity-50 shadow-lg scale-105",
          isRunning && "border-l-2 border-l-blue-500"
        )}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className={cn(
            "absolute left-0 top-0 bottom-0 w-6 flex items-center justify-center",
            "opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing",
            "text-muted-foreground hover:text-foreground"
          )}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Priority indicator */}
        <div
          className={cn(
            "absolute top-0 right-0 w-2 h-2 rounded-bl",
            PRIORITY_COLORS[task.priority] || PRIORITY_COLORS[3]
          )}
          title={`Priority ${task.priority}`}
        />

        {/* Content */}
        <div className="pl-4">
          {/* Title */}
          <h4 className="font-medium text-sm text-foreground line-clamp-2 mb-2">
            {task.title}
          </h4>

          {/* Metadata row */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
            {/* Status badge */}
            <Badge
              variant={statusConfig.badgeVariant}
              className="shrink-0 text-[10px] px-1.5 py-0"
            >
              <StatusIcon className="h-3 w-3 mr-1" />
              {statusConfig.label}
            </Badge>

            {/* Worktree badge */}
            {isWorktreeLoop && loop && (
              <WorktreeBadge loopId={loop.id} className="shrink-0 text-[10px]" />
            )}

            {/* Loop badge */}
            {loop && <LoopBadge status={loop.status} className="shrink-0 text-[10px]" />}

            {/* Time */}
            <span className="shrink-0 tabular-nums">{relativeTime}</span>
          </div>

          {/* Running indicator */}
          {isRunning && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running...</span>
            </div>
          )}

          {/* Blocked by indicator */}
          {task.blockedBy && (
            <div className="mt-2 text-xs text-orange-500">
              Blocked by: {task.blockedBy.slice(0, 8)}...
            </div>
          )}
        </div>
      </div>
    );
  }
);

// Memo for performance
const arePropsEqual = (prev: KanbanCardProps, next: KanbanCardProps): boolean => {
  return (
    prev.task.id === next.task.id &&
    prev.task.status === next.task.status &&
    prev.task.title === next.task.title &&
    prev.task.priority === next.task.priority &&
    prev.task.blockedBy === next.task.blockedBy &&
    prev.task.updatedAt === next.task.updatedAt &&
    prev.isDragging === next.isDragging &&
    prev.isUpdating === next.isUpdating &&
    prev.loop?.id === next.loop?.id &&
    prev.loop?.status === next.loop?.status
  );
};

export const KanbanCard = memo(KanbanCardComponent, arePropsEqual);
