/**
 * Team Card Component
 *
 * Displays a single agent team with status, progress, and quick actions.
 */

import React, { useEffect } from "react";
import { trpc } from "../../trpc";
import {
  type AgentTeam,
  AGENT_STATUS_COLORS,
  TEAM_STATUS_COLORS,
} from "../../types";
import { Button } from "../ui/button";
import {
  Play,
  Pause,
  StopCircle,
  Trash2,
  Users,
  Activity,
} from "lucide-react";
import { clsx } from "clsx";

interface TeamCardProps {
  team: AgentTeam;
  onClick?: () => void;
}

export function TeamCard({ team, onClick }: TeamCardProps) {
  const utils = trpc.useContext();

  // Mutations
  const startTeam = trpc.teams.start.useMutation();
  const pauseTeam = trpc.teams.pause.useMutation();
  const stopTeam = trpc.teams.stop.useMutation();
  const deleteTeam = trpc.teams.delete.useMutation();

  // Handle start team mutation success
  useEffect(() => {
    if (startTeam.isSuccess) {
      utils.teams.list.invalidate();
      utils.teams.get.invalidate({ id: team.id });
    }
  }, [startTeam.isSuccess, utils.teams.list, utils.teams.get, team.id]);

  // Handle pause team mutation success
  useEffect(() => {
    if (pauseTeam.isSuccess) {
      utils.teams.list.invalidate();
      utils.teams.get.invalidate({ id: team.id });
    }
  }, [pauseTeam.isSuccess, utils.teams.list, utils.teams.get, team.id]);

  // Handle stop team mutation success
  useEffect(() => {
    if (stopTeam.isSuccess) {
      utils.teams.list.invalidate();
      utils.teams.get.invalidate({ id: team.id });
    }
  }, [stopTeam.isSuccess, utils.teams.list, utils.teams.get, team.id]);

  // Handle delete team mutation success
  useEffect(() => {
    if (deleteTeam.isSuccess) {
      utils.teams.list.invalidate();
    }
  }, [deleteTeam.isSuccess, utils.teams.list]);

  const handleStart = () => {
    startTeam.mutate({ id: team.id });
  };

  const handlePause = () => {
    pauseTeam.mutate({ id: team.id });
  };

  const handleStop = () => {
    stopTeam.mutate({ id: team.id });
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete team "${team.name}"?`)) {
      deleteTeam.mutate({ id: team.id });
    }
  };

  const statusColor = TEAM_STATUS_COLORS[team.status];

  return (
    <div
      className={clsx(
        "bg-gray-800/50 rounded-lg border border-gray-700 p-4 cursor-pointer hover:border-gray-600 transition-colors",
        onClick && "hover:bg-gray-800"
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1">{team.name}</h3>
          <p className="text-sm text-gray-400 line-clamp-2">
            {team.description || team.prompt}
          </p>
        </div>
        <div
          className={clsx(
            "w-2 h-2 rounded-full",
            statusColor
          )}
          title={team.status}
        />
      </div>

      {/* Team Stats */}
      <div className="space-y-2 mb-4">
        {/* Progress Bar */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-16">Progress</span>
          <div className="flex-1 bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${team.progress}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 w-8 text-right">
            {team.progress}%
          </span>
        </div>

        {/* Context Tokens */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Shared Context</span>
          <span className="text-gray-300">
            {team.sharedContextTokens.toLocaleString()} /{" "}
            {team.maxSharedContextTokens.toLocaleString()} tokens
          </span>
        </div>

        {/* Agent Count */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Agents</span>
          <span className="text-gray-300 flex items-center gap-1">
            <Users className="w-3 h-3" />
            {team.members.length + 1}
          </span>
        </div>
      </div>

      {/* Agent Status Indicators */}
      <div className="flex items-center gap-2 mb-4">
        <AgentIndicator agent={team.coordinator} label="Coord" />
        {team.members.slice(0, 3).map((member) => (
          <AgentIndicator key={member.id} agent={member} />
        ))}
        {team.members.length > 3 && (
          <div className="text-xs text-gray-500">
            +{team.members.length - 3} more
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {team.status === "idle" && (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              handleStart();
            }}
            disabled={startTeam.isLoading}
          >
            <Play className="w-3 h-3 mr-1" />
            Start
          </Button>
        )}
        {team.status === "running" && (
          <>
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                handlePause();
              }}
              disabled={pauseTeam.isLoading}
            >
              <Pause className="w-3 h-3 mr-1" />
              Pause
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                handleStop();
              }}
              disabled={stopTeam.isLoading}
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          </>
        )}
        {team.status === "paused" && (
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={(e) => {
              e.stopPropagation();
              handleStart();
            }}
            disabled={startTeam.isLoading}
          >
            <Play className="w-3 h-3 mr-1" />
            Resume
          </Button>
        )}
        {(team.status === "completed" || team.status === "failed") && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            disabled={deleteTeam.isLoading}
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Agent Status Indicator
 */
function AgentIndicator({
  agent,
  label,
}: {
  agent: { status: string };
  label?: string;
}) {
  const statusColor = AGENT_STATUS_COLORS[agent.status as keyof typeof AGENT_STATUS_COLORS];

  return (
    <div
      className={clsx(
        "flex items-center gap-1 px-2 py-1 rounded-full text-xs",
        "bg-gray-700/50"
      )}
      title={agent.status}
    >
      <div className={clsx("w-2 h-2 rounded-full", statusColor)} />
      {label && <span className="text-gray-400">{label}</span>}
    </div>
  );
}
