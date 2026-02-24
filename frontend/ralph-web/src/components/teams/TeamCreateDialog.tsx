/**
 * Team Create Dialog Component
 *
 * Dialog for creating a new agent team with configuration options.
 */

import React, { useState } from "react";
import { trpc } from "../../trpc";
import {
  type ContextSharingMode,
  type TaskDistributionMode,
  CONTEXT_SHARING_MODES,
  TASK_DISTRIBUTION_MODES,
} from "../../types";
import { Button } from "../ui/button";
import {
  X,
  Plus,
  Trash2,
  Users,
  Cpu,
  Network,
  ArrowRight,
} from "lucide-react";
import { clsx } from "clsx";

interface TeamCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

interface MemberInput {
  name: string;
  description: string;
  hatId: string;
}

export function TeamCreateDialog({ open, onClose }: TeamCreateDialogProps) {
  const utils = trpc.useContext();

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [coordinatorHatId, setCoordinatorHatId] = useState("planner");
  const [members, setMembers] = useState<MemberInput[]>([]);
  const [contextSharing, setContextSharing] = useState<ContextSharingMode>("selective");
  const [taskDistribution, setTaskDistribution] = useState<TaskDistributionMode>("pipeline");

  // Fetch available hats for selection
  const { data: hats } = trpc.hat.list.useQuery();

  // Create mutation
  const createTeam = trpc.teams.create.useMutation({
    onSuccess: () => {
      utils.teams.list.invalidate();
      utils.teams.stats.invalidate();
      handleClose();
    },
  });

  const handleAddMember = () => {
    setMembers([
      ...members,
      { name: `Agent ${members.length + 1}`, description: "", hatId: "coder" },
    ]);
  };

  const handleRemoveMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleUpdateMember = (index: number, field: keyof MemberInput, value: string) => {
    setMembers(
      members.map((member, i) =>
        i === index ? { ...member, [field]: value } : member
      )
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !prompt.trim()) {
      return;
    }

    createTeam.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      prompt: prompt.trim(),
      coordinatorHatId,
      members: members.map((m) => ({
        name: m.name.trim(),
        description: m.description.trim(),
        hatId: m.hatId,
      })),
      contextSharing,
      taskDistribution,
    });
  };

  const handleClose = () => {
    setName("");
    setDescription("");
    setPrompt("");
    setCoordinatorHatId("planner");
    setMembers([]);
    setContextSharing("selective");
    setTaskDistribution("pipeline");
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold">Create Agent Team</h2>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Team Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Feature Implementation Team"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Brief description of the team's purpose"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Task Prompt <span className="text-red-400">*</span>
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                placeholder="Describe the task the team should work on..."
                required
              />
            </div>
          </div>

          {/* Coordinator Selection */}
          <div>
            <label className="block text-sm font-medium mb-1">
              <Cpu className="w-4 h-4 inline mr-1" />
              Coordinator Hat
            </label>
            <select
              value={coordinatorHatId}
              onChange={(e) => setCoordinatorHatId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {hats?.map((hat) => (
                <option key={hat.key} value={hat.key}>
                  {hat.name} - {hat.description}
                </option>
              ))}
            </select>
          </div>

          {/* Team Members */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">
                <Users className="w-4 h-4 inline mr-1" />
                Team Members
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddMember}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Agent
              </Button>
            </div>

            {members.length > 0 ? (
              <div className="space-y-3">
                {members.map((member, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                  >
                    <ArrowRight className="w-4 h-4 mt-2 text-gray-500" />
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={member.name}
                        onChange={(e) =>
                          handleUpdateMember(index, "name", e.target.value)
                        }
                        className="px-2 py-1 bg-gray-800 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Agent name"
                      />
                      <select
                        value={member.hatId}
                        onChange={(e) =>
                          handleUpdateMember(index, "hatId", e.target.value)
                        }
                        className="px-2 py-1 bg-gray-800 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {hats?.map((hat) => (
                          <option key={hat.key} value={hat.key}>
                            {hat.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={member.description}
                        onChange={(e) =>
                          handleUpdateMember(index, "description", e.target.value)
                        }
                        className="col-span-2 px-2 py-1 bg-gray-800 border border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Description of this agent's role"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveMember(index)}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 text-center py-4 bg-gray-800/30 rounded-lg">
                No team members added yet. Click "Add Agent" to add members.
              </div>
            )}
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                <Network className="w-4 h-4 inline mr-1" />
                Context Sharing
              </label>
              <select
                value={contextSharing}
                onChange={(e) => setContextSharing(e.target.value as ContextSharingMode)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(CONTEXT_SHARING_MODES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {CONTEXT_SHARING_MODES[contextSharing].description}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Task Distribution
              </label>
              <select
                value={taskDistribution}
                onChange={(e) => setTaskDistribution(e.target.value as TaskDistributionMode)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(TASK_DISTRIBUTION_MODES).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {TASK_DISTRIBUTION_MODES[taskDistribution].description}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-700">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !prompt.trim() || createTeam.isLoading}
            >
              {createTeam.isLoading ? "Creating..." : "Create Team"}
            </Button>
          </div>

          {/* Error Display */}
          {createTeam.error && (
            <div className="p-3 bg-red-900/30 border border-red-800 rounded-md text-sm text-red-400">
              {createTeam.error.message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
