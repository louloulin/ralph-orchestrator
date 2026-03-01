/**
 * Conflict Warnings Component
 *
 * Displays file conflict warnings for tasks.
 * Part of Phase 3.2: Proactive File-Level Conflict Detection
 */

import React from "react";
import { AlertTriangle, File, Users, Clock } from "lucide-react";
import { clsx } from "clsx";
import {
  type ConflictWarning,
  CONFLICT_SEVERITY_COLORS,
  CONFLICT_SEVERITY_ICONS,
} from "../../types";

interface ConflictWarningsProps {
  conflicts: ConflictWarning[];
  className?: string;
}

export function ConflictWarnings({ conflicts, className }: ConflictWarningsProps) {
  if (conflicts.length === 0) {
    return null;
  }

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
        <AlertTriangle className="w-4 h-4 text-yellow-400" />
        <span>File Conflicts Detected ({conflicts.length})</span>
      </div>

      <div className="space-y-2">
        {conflicts.map((conflict, index) => (
          <ConflictWarningCard key={`${conflict.filePath}-${index}`} conflict={conflict} />
        ))}
      </div>
    </div>
  );
}

interface ConflictWarningCardProps {
  conflict: ConflictWarning;
}

function ConflictWarningCard({ conflict }: ConflictWarningCardProps) {
  const severityColor = CONFLICT_SEVERITY_COLORS[conflict.severity];
  const severityIcon = CONFLICT_SEVERITY_ICONS[conflict.severity];

  return (
    <div className={clsx("rounded-lg border p-3", severityColor)}>
      {/* Header */}
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg">{severityIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <File className="w-4 h-4 flex-shrink-0" />
            <code className="text-sm font-mono truncate">{conflict.filePath}</code>
          </div>
          <span className="text-xs uppercase font-semibold opacity-75">
            {conflict.severity} Severity
          </span>
        </div>
      </div>

      {/* Conflicting Agents */}
      <div className="mb-2">
        <div className="flex items-center gap-1 text-xs text-gray-300 mb-1">
          <Users className="w-3 h-3" />
          <span>Conflicting Agents ({conflict.conflictingAgents.length})</span>
        </div>
        <div className="space-y-1">
          {conflict.conflictingAgents.map((agent, idx) => (
            <div
              key={`${agent.loopId}-${agent.taskId}`}
              className="flex items-center gap-2 text-xs bg-black/20 rounded px-2 py-1"
            >
              <span className="font-medium">{agent.taskTitle}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-400 font-mono text-xs">{agent.loopId.slice(0, 8)}</span>
              <span className="text-gray-400">•</span>
              <div className="flex items-center gap-1 text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{new Date(agent.reservedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestion */}
      <div className="text-xs text-gray-300 italic bg-black/10 rounded px-2 py-1">
        💡 {conflict.suggestion}
      </div>
    </div>
  );
}
