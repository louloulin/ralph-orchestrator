/**
 * Task Card Component
 *
 * Individual task card for the Kanban board
 */

import React, { useState, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { type TeamTask, TASK_STATUS_COLORS, type ConflictWarning } from "../../types";
import { User, Calendar, AlertCircle, AlertTriangle } from "lucide-react";
import { trpc } from "../../trpc";

interface TaskCardProps {
  task: TeamTask;
  teamId: string;
  isDragging?: boolean;
}

export function TaskCard({ task, teamId, isDragging = false }: TaskCardProps) {
  const [showConflicts, setShowConflicts] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictWarning[]>([]);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: task.id });

  // Check for conflicts when task is assigned or in progress
  const { data: taskConflicts } = trpc.teams.checkConflicts.useQuery(
    {
      teamId,
      filePaths: extractFilesFromTask(task)
    },
    {
      enabled: (task.status === "in_progress" || task.status === "review") && !!task.assignedTo,
      refetchInterval: 10000, // Poll every 10 seconds
    }
  );

  useEffect(() => {
    if (taskConflicts) {
      setConflicts(taskConflicts);
    }
  }, [taskConflicts]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusColor = TASK_STATUS_COLORS[task.status];
  const hasConflicts = conflicts.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(
        "bg-gray-800 rounded-lg p-3 border cursor-grab active:cursor-grabbing",
        hasConflicts ? "border-orange-700" : "border-gray-700",
        isSortableDragging && "opacity-50",
        isDragging && "shadow-lg rotate-3"
      )}
    >
      {/* Task Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="font-medium text-sm flex-1">{task.title}</h4>
        <div className="flex items-center gap-1">
          {hasConflicts && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConflicts(!showConflicts);
              }}
              className="text-orange-400 hover:text-orange-300 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
          )}
          <div className={clsx("w-2 h-2 rounded-full mt-1", statusColor)} />
        </div>
      </div>

      {/* Conflict Warnings */}
      {showConflicts && hasConflicts && (
        <div className="mb-3 p-2 bg-orange-900/20 border border-orange-800 rounded text-xs">
          <div className="flex items-center gap-1 text-orange-400 font-medium mb-1">
            <AlertTriangle className="w-3 h-3" />
            <span>{conflicts.length} File Conflict{conflicts.length > 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-1">
            {conflicts.map((c, i) => (
              <div key={i} className="text-orange-300 font-mono text-xs truncate">
                {c.filePath}
              </div>
            ))}
          </div>
        </div>
      )}

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

/**
 * Extract file paths from task description
 * Simple extraction - looks for common file patterns
 */
function extractFilesFromTask(task: TeamTask): string[] {
  const files: string[] = [];
  const text = `${task.title} ${task.description}`;

  // Match file paths with extensions
  const filePattern = /\b[\w\-/.]+\.(rs|ts|tsx|js|jsx|py|go|java|c|cpp|h|md|json|yaml|yml|toml)\b/g;
  const matches = text.match(filePattern);

  if (matches) {
    files.push(...matches);
  }

  return [...new Set(files)]; // Remove duplicates
}
