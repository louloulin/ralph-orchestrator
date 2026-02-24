/**
 * Teams List Component
 *
 * Displays a grid of agent teams with status, progress, and actions.
 * Part of P4.5-1: Agent Teams Architecture
 */

import React from "react";
import { trpc } from "../../trpc";
import { TeamCard } from "./TeamCard";
import { TeamCreateDialog } from "./TeamCreateDialog";
import { Button } from "../ui/button";
import { Plus, Users, Activity, CheckCircle, AlertCircle } from "lucide-react";
import {
  AGENT_STATUS_COLORS,
  TEAM_STATUS_COLORS,
  type AgentTeam,
  type TeamStats,
} from "../../types";

interface TeamsListProps {
  onSelectTeam?: (team: AgentTeam) => void;
}

export function TeamsList({ onSelectTeam }: TeamsListProps) {
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  // Fetch teams list
  const { data: teams, isLoading: teamsLoading } = trpc.teams.list.useQuery();

  // Fetch team statistics
  const { data: stats } = trpc.teams.stats.useQuery();

  if (teamsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Header */}
      {stats && <TeamsStatsBar stats={stats} />}

      {/* Actions Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Agent Teams</h2>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Team
        </Button>
      </div>

      {/* Teams Grid */}
      {teams && teams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              onClick={() => onSelectTeam?.(team)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-800/50 rounded-lg border border-gray-700">
          <Users className="w-12 h-12 mx-auto text-gray-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-400">No teams yet</h3>
          <p className="text-sm text-gray-500 mt-2">
            Create your first agent team to start multi-agent collaboration
          </p>
          <Button className="mt-4" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Team
          </Button>
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <TeamCreateDialog
          open={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
}

/**
 * Teams Stats Bar Component
 */
function TeamsStatsBar({ stats }: { stats: TeamStats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      <StatsCard
        icon={<Users className="w-5 h-5" />}
        label="Total Teams"
        value={stats.totalTeams}
        color="text-blue-400"
      />
      <StatsCard
        icon={<Activity className="w-5 h-5" />}
        label="Active"
        value={stats.activeTeams}
        color="text-green-400"
      />
      <StatsCard
        icon={<CheckCircle className="w-5 h-5" />}
        label="Completed"
        value={stats.completedTeams}
        color="text-emerald-400"
      />
      <StatsCard
        icon={<AlertCircle className="w-5 h-5" />}
        label="Failed"
        value={stats.failedTeams}
        color="text-red-400"
      />
      <StatsCard
        icon={<Activity className="w-5 h-5" />}
        label="Total Iterations"
        value={stats.totalIterations}
        color="text-purple-400"
      />
    </div>
  );
}

/**
 * Stats Card Component
 */
function StatsCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center gap-3">
        <div className={`${color}`}>{icon}</div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-gray-400">{label}</p>
        </div>
      </div>
    </div>
  );
}
