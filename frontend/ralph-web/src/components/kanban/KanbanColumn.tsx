/**
 * KanbanColumn Component
 *
 * A droppable column in the Kanban board.
 * Contains a header with title and task count,
 * and a scrollable list of task cards.
 */

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { KanbanCard } from "./KanbanCard";
import type { Task } from "@/components/tasks/TaskThread";
import type { LoopDetailData } from "@/components/tasks/LoopDetail";

interface KanbanColumnProps {
  /** Column ID (used as droppable ID) */
  id: string;
  /** Column title */
  title: string;
  /** Tasks in this column */
  tasks: Task[];
  /** Loop map for task↔loop association */
  loopMap: Map<string, LoopDetailData>;
  /** Column header color */
  color: string;
  /** Whether an update is in progress */
  isUpdating?: boolean;
}

export function KanbanColumn({
  id,
  title,
  tasks,
  loopMap,
  color,
  isUpdating,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      className={cn(
        "flex flex-col min-w-[280px] max-w-[320px] flex-1 rounded-lg border border-border bg-muted/30",
        isOver && "ring-2 ring-primary/50 bg-primary/5"
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          "flex items-center justify-between px-3 py-2 rounded-t-lg border-b border-border",
          color
        )}
      >
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">{title}</h3>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {tasks.length}
          </span>
        </div>
      </div>

      {/* Tasks container */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 p-2 overflow-y-auto min-h-[200px] space-y-2",
          "max-h-[calc(100vh-220px)]"
        )}
      >
        {tasks.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            loop={task.loopId ? loopMap.get(task.loopId) : undefined}
            isUpdating={isUpdating}
          />
        ))}

        {/* Empty state */}
        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No tasks
          </div>
        )}
      </div>
    </div>
  );
}
