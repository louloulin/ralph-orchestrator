/**
 * KanbanBoard Component
 *
 * A drag-and-drop Kanban board for task management.
 * Uses @dnd-kit for smooth drag interactions.
 * Columns: To Do, In Progress, In Review, Done
 *
 * @see https://docs.dndkit.com/
 */

import { useMemo, useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { trpc } from "@/trpc";
import { KanbanColumn } from "./KanbanColumn";
import { KanbanCard } from "./KanbanCard";
import { cn } from "@/lib/utils";
import type { Task } from "@/components/tasks/TaskThread";
import type { LoopDetailData } from "@/components/tasks/LoopDetail";

/**
 * Column configuration mapping statuses to Kanban columns
 */
export interface KanbanColumnConfig {
  id: string;
  title: string;
  statuses: string[];
  color: string;
}

const COLUMNS: KanbanColumnConfig[] = [
  {
    id: "todo",
    title: "To Do",
    statuses: ["open", "pending"],
    color: "bg-zinc-500/20",
  },
  {
    id: "in-progress",
    title: "In Progress",
    statuses: ["running"],
    color: "bg-blue-500/20",
  },
  {
    id: "in-review",
    title: "In Review",
    statuses: ["blocked"],
    color: "bg-yellow-500/20",
  },
  {
    id: "done",
    title: "Done",
    statuses: ["completed", "closed"],
    color: "bg-green-500/20",
  },
];

/**
 * Map a task status to a column ID
 */
function getColumnForStatus(status: string): string {
  for (const column of COLUMNS) {
    if (column.statuses.includes(status)) {
      return column.id;
    }
  }
  return "todo"; // Default to To Do
}

/**
 * Map a column ID to the primary status for new tasks dropped there
 */
function getStatusForColumn(columnId: string): string {
  const column = COLUMNS.find((c) => c.id === columnId);
  if (!column) return "open";
  return column.statuses[0];
}

interface KanbanBoardProps {
  /** Additional CSS classes */
  className?: string;
}

export function KanbanBoard({ className }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  // Fetch tasks with loop data
  const tasksQuery = trpc.task.list.useQuery(
    { includeArchived: false },
    { refetchInterval: 5000 }
  );

  // Fetch loops for worktree visualization
  const loopsQuery = trpc.loops.list.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // Task update mutation
  const utils = trpc.useUtils();
  const updateMutation = trpc.task.update.useMutation({
    onSuccess: () => {
      utils.task.list.invalidate();
    },
  });

  // Build loop map for task↔loop association
  const loopMap = useMemo(() => {
    const map = new Map<string, LoopDetailData>();
    if (loopsQuery.data) {
      for (const loop of loopsQuery.data) {
        map.set(loop.id, loop as LoopDetailData);
      }
    }
    return map;
  }, [loopsQuery.data]);

  // Group tasks by column
  const tasksByColumn = useMemo(() => {
    const grouped: Record<string, Task[]> = {
      todo: [],
      "in-progress": [],
      "in-review": [],
      done: [],
    };

    if (tasksQuery.data) {
      for (const task of tasksQuery.data) {
        const columnId = getColumnForStatus(task.status);
        grouped[columnId].push(task as Task);
      }
    }

    return grouped;
  }, [tasksQuery.data]);

  // DnD sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before starting drag
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const taskId = active.id as string;

    // Find the task being dragged
    for (const tasks of Object.values(tasksByColumn)) {
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        setActiveTask(task);
        break;
      }
    }
  }, [tasksByColumn]);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveTask(null);

      if (!over) return;

      const taskId = active.id as string;
      const overId = over.id as string;

      // Find the target column
      let targetColumn: string | null = null;

      // Check if dropped on a column directly
      for (const columnId of Object.keys(tasksByColumn)) {
        if (overId === columnId) {
          targetColumn = columnId;
          break;
        }
      }

      // Check if dropped on another task (use that task's column)
      if (!targetColumn) {
        for (const [columnId, tasks] of Object.entries(tasksByColumn)) {
          if (tasks.some((t) => t.id === overId)) {
            targetColumn = columnId;
            break;
          }
        }
      }

      // Update task status if moved to a different column
      if (targetColumn) {
        const newStatus = getStatusForColumn(targetColumn);
        updateMutation.mutate({
          id: taskId,
          status: newStatus,
        });
      }
    },
    [tasksByColumn, updateMutation]
  );

  // Loading state
  if (tasksQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (tasksQuery.isError) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        <p>Failed to load tasks. Please try again.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={cn("flex gap-4 overflow-x-auto pb-4", className)}>
        {COLUMNS.map((column) => {
          const columnTasks = tasksByColumn[column.id] || [];
          const taskIds = columnTasks.map((t) => t.id);

          return (
            <SortableContext
              key={column.id}
              items={taskIds}
              strategy={verticalListSortingStrategy}
            >
              <KanbanColumn
                id={column.id}
                title={column.title}
                tasks={columnTasks}
                loopMap={loopMap}
                color={column.color}
                isUpdating={updateMutation.isPending}
              />
            </SortableContext>
          );
        })}
      </div>

      {/* Drag overlay - shows the task being dragged */}
      <DragOverlay>
        {activeTask ? (
          <KanbanCard
            task={activeTask}
            loop={activeTask.loopId ? loopMap.get(activeTask.loopId) : undefined}
            isDragging
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
