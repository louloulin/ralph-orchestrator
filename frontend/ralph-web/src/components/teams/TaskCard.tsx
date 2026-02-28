/**
 * Task Card Component
 *
 * Individual task card for the Kanban board
 */

import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { type TeamTask, TASK_STATUS_COLORS } from "../../types";
import { User, Calendar, AlertCircle } from "lucide-react";

interface TaskCardProps {
  task: TeamTask;
  isDragging?: boolean;
}

export function TaskCard({ task, isDragging = false }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusColor = TASK_STATUS_COLORS[task.status];

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "bg-gray-800 rounded-lg p-3 border border-gray-700 cursor-grab active:cursor-grabbing",
        isSortableDragging && "opacity-50",
        isDragging && "shadow-lg rotate-3"
      )}
    >
      {/* Task Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm flex-1">{task.title}</h4>
        <div className={clsx("w-2 h-2 rounded-full mt-1", statusColor)} />
      </div>

      {/* Task Description */}
      {task.description && (
        <p className="text-xs text-gray-400 mb-3 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Task Meta */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        {/* Assigned To */}
        {task.assignedTo ? (
          <div className="flex items-center gap-1">
            <User className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{task.assignedTo}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-gray-600">
            <User className="w-3 h-3" />
            <span>Unassigned</span>
          </div>
        )}

        {/* Dependencies */}
        {task.dependencies.length > 0 && (
          <div className="flex items-center gap-1 text-yellow-600">
            <AlertCircle className="w-3 h-3" />
            <span>{task.dependencies.length}</span>
          </div>
        )}
      </div>

      {/* Created Date */}
      <div className="mt-2 pt-2 border-t border-gray-700">
        <div className="flex items-center gap-1 text-xs text-gray-600">
          <Calendar className="w-3 h-3" />
          <span>{new Date(task.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
