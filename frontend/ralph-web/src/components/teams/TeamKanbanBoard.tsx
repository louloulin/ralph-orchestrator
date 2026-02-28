/**
 * Team Kanban Board Component
 *
 * Displays team tasks in a Kanban board with drag-and-drop support
 */

import React, { useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { clsx } from "clsx";
import {
  type TeamTask,
  type TeamTaskStatus,
  TASK_STATUS_COLORS,
} from "../../types";
import { TaskCard } from "./TaskCard";
import { Plus, ClipboardList } from "lucide-react";
import { Button } from "../ui/button";

interface TeamKanbanBoardProps {
  tasks: TeamTask[];
  onTaskStatusChange: (taskId: string, newStatus: TeamTaskStatus) => void;
  onCreateTask: () => void;
}

const COLUMNS: { id: TeamTaskStatus; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

export function TeamKanbanBoard({
  tasks,
  onTaskStatusChange,
  onCreateTask,
}: TeamKanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<TeamTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TeamTaskStatus;

    // Check if dropped on a column
    const isColumn = COLUMNS.some((col) => col.id === newStatus);
    if (!isColumn) return;

    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== newStatus) {
      onTaskStatusChange(taskId, newStatus);
    }
  };

  const getTasksByStatus = (status: TeamTaskStatus) => {
    return tasks.filter((task) => task.status === status);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold">Task Board</h2>
          <span className="text-sm text-gray-500">({tasks.length} tasks)</span>
        </div>
        <Button size="sm" onClick={onCreateTask}>
          <Plus className="w-4 h-4 mr-2" />
          Add Task
        </Button>
      </div>

      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {COLUMNS.map((column) => {
            const columnTasks = getTasksByStatus(column.id);
            const statusColor = TASK_STATUS_COLORS[column.id];

            return (
              <div
                key={column.id}
                className="bg-gray-800/30 rounded-lg border border-gray-700 flex flex-col"
              >
                {/* Column Header */}
                <div className="p-3 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={clsx("w-2 h-2 rounded-full", statusColor)} />
                      <h3 className="font-medium text-sm">{column.title}</h3>
                    </div>
                    <span className="text-xs text-gray-500">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>

                {/* Column Content - Drop Zone */}
                <div
                  className="flex-1 p-2 min-h-[200px]"
                  id={column.id}
                >
                  <SortableContext
                    items={columnTasks.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2">
                      {columnTasks.map((task) => (
                        <TaskCard key={task.id} task={task} />
                      ))}
                      {columnTasks.length === 0 && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          No tasks
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
