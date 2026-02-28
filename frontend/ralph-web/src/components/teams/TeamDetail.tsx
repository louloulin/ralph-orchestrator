/**
 * Team Detail Component
 *
 * Displays detailed view of a single agent team with activity logs.
 */

import React, { useEffect, useState } from "react";
import { trpc } from "../../trpc";
import {
  type AgentTeam,
  type TeamTask,
  type TeamTaskStatus,
  AGENT_STATUS_COLORS,
  TEAM_STATUS_COLORS,
  CONTEXT_SHARING_MODES,
  TASK_DISTRIBUTION_MODES,
} from "../../types";
import { Button } from "../ui/button";
import {
  ArrowLeft,
  Play,
  Pause,
  StopCircle,
  Trash2,
  Clock,
  Users,
  Activity,
  Network,
  RefreshCw,
} from "lucide-react";
import { clsx } from "clsx";
import { TeamKanbanBoard } from "./TeamKanbanBoard";

interface TeamDetailProps {
  team: AgentTeam;
  onBack: () => void;
}

export function TeamDetail({ team: initialTeam, onBack }: TeamDetailProps) {
  const utils = trpc.useUtils();

  // Fetch latest team data
  const { data: team } = trpc.teams.get.useQuery(
    { id: initialTeam.id },
    { initialData: initialTeam }
  );

  // Fetch activity logs (using get query with logs data)
  const { data: logs } = trpc.teams.get.useQuery(
    { id: team.id },
    { refetchInterval: 5000 }
  );

  // Mock tasks for now - backend endpoints come in subtask 2.4.6
  const [tasks, setTasks] = useState<TeamTask[]>([
    {
      id: "task-1",
      teamId: team.id,
      title: "Setup project structure",
      description: "Initialize project with dependencies and folder structure",
      status: "done",
      assignedTo: team.coordinator.name,
      dependencies: [],
      createdAt: new Date().toISOString(),
      claimedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    {
      id: "task-2",
      teamId: team.id,
      title: "Implement authentication",
      description: "Add user authentication with JWT tokens",
      status: "in_progress",
      assignedTo: team.members[0]?.name || null,
      dependencies: ["task-1"],
      createdAt: new Date().toISOString(),
      claimedAt: new Date().toISOString(),
      completedAt: null,
    },
    {
      id: "task-3",
      teamId: team.id,
      title: "Design database schema",
      description: "Create database models and migrations",
      status: "review",
      assignedTo: team.members[1]?.name || null,
      dependencies: ["task-1"],
      createdAt: new Date().toISOString(),
      claimedAt: new Date().toISOString(),
      completedAt: null,
    },
    {
      id: "task-4",
      teamId: team.id,
      title: "Write API documentation",
      description: "Document all REST API endpoints",
      status: "todo",
      assignedTo: null,
      dependencies: ["task-2", "task-3"],
      createdAt: new Date().toISOString(),
      claimedAt: null,
      completedAt: null,
    },
    {
      id: "task-5",
      teamId: team.id,
      title: "Add unit tests",
      description: "Write comprehensive unit tests for core modules",
      status: "todo",
      assignedTo: null,
      dependencies: ["task-2"],
      createdAt: new Date().toISOString(),
      claimedAt: null,
      completedAt: null,
    },
  ]);

  // Mutations
  const startTeam = trpc.teams.start.useMutation();
  const pauseTeam = trpc.teams.pause.useMutation();
  const stopTeam = trpc.teams.stop.useMutation();
  const deleteTeam = trpc.teams.delete.useMutation();

  // Handle start team mutation success
  useEffect(() => {
    if (startTeam.isSuccess) {
      utils.teams.get.invalidate({ id: team.id });
      utils.teams.list.invalidate();
    }
  }, [startTeam.isSuccess, utils.teams.get, utils.teams.list, team.id]);

  // Handle pause team mutation success
  useEffect(() => {
    if (pauseTeam.isSuccess) {
      utils.teams.get.invalidate({ id: team.id });
      utils.teams.list.invalidate();
    }
  }, [pauseTeam.isSuccess, utils.teams.get, utils.teams.list, team.id]);

  // Handle stop team mutation success
  useEffect(() => {
    if (stopTeam.isSuccess) {
      utils.teams.get.invalidate({ id: team.id });
      utils.teams.list.invalidate();
    }
  }, [stopTeam.isSuccess, utils.teams.get, utils.teams.list, team.id]);

  // Handle delete team mutation success
  useEffect(() => {
    if (deleteTeam.isSuccess) {
      utils.teams.list.invalidate();
      onBack();
    }
  }, [deleteTeam.isSuccess, utils.teams.list, onBack]);

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

  const handleTaskStatusChange = (taskId: string, newStatus: TeamTaskStatus) => {
    // Mock implementation - backend endpoints come in subtask 2.4.6
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: newStatus,
              completedAt: newStatus === "done" ? new Date().toISOString() : null,
            }
          : task
      )
    );
  };

  const handleCreateTask = () => {
    // Mock implementation - backend endpoints come in subtask 2.4.6
    const newTask: TeamTask = {
      id: `task-${Date.now()}`,
      teamId: team.id,
      title: "New Task",
      description: "Task description",
      status: "todo",
      assignedTo: null,
      dependencies: [],
      createdAt: new Date().toISOString(),
      claimedAt: null,
      completedAt: null,
    };
    setTasks((prev) => [...prev, newTask]);
  };

  const statusColor = TEAM_STATUS_COLORS[team.status];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{team.name}</h1>
            <p className="text-gray-400">{team.description || team.prompt}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={clsx(
              "px-3 py-1 rounded-full text-sm font-medium capitalize",
              statusColor,
              "text-white"
            )}
          >
            {team.status}
          </div>

          {team.status === "idle" && (
            <Button onClick={handleStart} disabled={startTeam.isLoading}>
              <Play className="w-4 h-4 mr-2" />
              Start
            </Button>
          )}
          {team.status === "running" && (
            <>
              <Button variant="secondary" onClick={handlePause} disabled={pauseTeam.isLoading}>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
              <Button variant="ghost" onClick={handleStop} disabled={stopTeam.isLoading}>
                <StopCircle className="w-4 h-4 mr-2" />
                Stop
              </Button>
            </>
          )}
          {team.status === "paused" && (
            <Button onClick={handleStart} disabled={startTeam.isLoading}>
              <Play className="w-4 h-4 mr-2" />
              Resume
            </Button>
          )}
          {(team.status === "completed" || team.status === "failed") && (
            <Button variant="ghost" onClick={handleDelete} disabled={deleteTeam.isLoading}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Error Display */}
      {team.error && (
        <div className="p-4 bg-red-900/30 border border-red-800 rounded-lg text-red-400">
          <strong>Error:</strong> {team.error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Progress"
          value={`${team.progress}%`}
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Shared Context"
          value={`${(team.sharedContextTokens / 1000).toFixed(1)}K / ${(team.maxSharedContextTokens / 1_000_000).toFixed(0)}M`}
        />
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="Agents"
          value={team.members.length + 1}
        />
        <StatCard
          icon={<RefreshCw className="w-5 h-5" />}
          label="Distribution"
          value={TASK_DISTRIBUTION_MODES[team.taskDistribution].label}
        />
      </div>

      {/* Progress Bar */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Overall Progress</span>
          <span className="text-sm text-gray-400">{team.progress}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-3">
          <div
            className="bg-blue-500 h-3 rounded-full transition-all"
            style={{ width: `${team.progress}%` }}
          />
        </div>
      </div>

      {/* Agents Section */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold">Team Agents</h2>
        </div>
        <div className="p-4 space-y-4">
          {/* Coordinator */}
          <AgentRow agent={team.coordinator} isCoordinator />

          {/* Members */}
          {team.members.map((member) => (
            <AgentRow key={member.id} agent={member} />
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <TeamKanbanBoard
        tasks={tasks}
        onTaskStatusChange={handleTaskStatusChange}
        onCreateTask={handleCreateTask}
      />

      {/* Activity Logs */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold">Activity Log</h2>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {logs && logs.length > 0 ? (
            <div className="divide-y divide-gray-700">
              {logs.map((log) => (
                <div key={log.id} className="p-3 flex items-start gap-3">
                  <div
                    className={clsx(
                      "w-2 h-2 rounded-full mt-1.5",
                      log.activityType === "error"
                        ? "bg-red-500"
                        : log.activityType === "completed"
                        ? "bg-green-500"
                        : log.activityType === "waiting"
                        ? "bg-yellow-500"
                        : "bg-blue-500"
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm">{log.message}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              No activity logs yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Stat Card Component
 */
function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-3">
        <div className="text-gray-400">{icon}</div>
        <div>
          <p className="text-lg font-bold">{value}</p>
          <p className="text-xs text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Agent Row Component
 */
function AgentRow({
  agent,
  isCoordinator = false,
}: {
  agent: { id: string; name: string; description: string; status: string; iterationsCompleted: number; lastActivityAt: string | null };
  isCoordinator?: boolean;
}) {
  const statusColor = AGENT_STATUS_COLORS[agent.status as keyof typeof AGENT_STATUS_COLORS];

  return (
    <div className="flex items-center gap-4 p-3 bg-gray-800/30 rounded-lg">
      <div className={clsx("w-3 h-3 rounded-full", statusColor)} />

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{agent.name}</span>
          {isCoordinator && (
            <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded">
              Coordinator
            </span>
          )}
        </div>
        <p className="text-sm text-gray-400">{agent.description}</p>
      </div>

      <div className="text-right text-sm">
        <p className="text-gray-300 capitalize">{agent.status}</p>
        <p className="text-gray-500">
          {agent.iterationsCompleted} iterations
        </p>
      </div>

      {agent.lastActivityAt && (
        <div className="text-xs text-gray-500">
          {new Date(agent.lastActivityAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
