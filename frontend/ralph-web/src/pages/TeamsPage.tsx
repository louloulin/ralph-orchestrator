/**
 * Teams Page Component
 *
 * Main page for viewing and managing agent teams.
 * Part of P4.5-1: Agent Teams Architecture
 */

import React, { useState } from "react";
import { TeamsList } from "../components/teams";
import { TeamDetail } from "../components/teams/TeamDetail";
import { type AgentTeam } from "../types";

export function TeamsPage() {
  const [selectedTeam, setSelectedTeam] = useState<AgentTeam | null>(null);

  return (
    <div className="h-full overflow-auto">
      <div className="container mx-auto p-6">
        {selectedTeam ? (
          <TeamDetail
            team={selectedTeam}
            onBack={() => setSelectedTeam(null)}
          />
        ) : (
          <TeamsList onSelectTeam={setSelectedTeam} />
        )}
      </div>
    </div>
  );
}
