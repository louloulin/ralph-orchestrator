/**
 * ProjectsPage Component
 *
 * Page for managing Ralph projects.
 * Allows creating, editing, deleting, and switching between projects.
 */

import { useState, useEffect } from "react";
import { Folder, Plus, Trash2, Edit2, Check, X, AlertCircle, GitBranch } from "lucide-react";
import { trpc } from "../trpc";
import { useProjectStore } from "../stores/projectStore";
import type { Project, ProjectType } from "../types/project";

export function ProjectsPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({
    name: "",
    path: "",
    description: "",
    type: "local" as ProjectType,
  });
  const [editProject, setEditProject] = useState({
    name: "",
    path: "",
    description: "",
    type: "local" as ProjectType,
  });
  const [formError, setFormError] = useState<string | null>(null);

  const { setActiveProject } = useProjectStore();

  // Fetch all projects
  const { data: projects, isLoading, refetch } = trpc.project.list.useQuery();

  // Create mutation
  const createMutation = trpc.project.create.useMutation();

  // Handle create mutation success
  useEffect(() => {
    if (createMutation.isSuccess && createMutation.data) {
      setIsCreating(false);
      setNewProject({ name: "", path: "", description: "", type: "local" });
      setFormError(null);
      refetch();
      // Auto-activate new project
      setActiveProject(createMutation.data);
    }
  }, [createMutation.isSuccess, createMutation.data, refetch, setActiveProject]);

  // Handle create mutation error
  useEffect(() => {
    if (createMutation.isError && createMutation.error) {
      setFormError(createMutation.error.message);
    }
  }, [createMutation.isError, createMutation.error]);

  // Update mutation
  const updateMutation = trpc.project.update.useMutation();

  // Handle update mutation success
  useEffect(() => {
    if (updateMutation.isSuccess) {
      setEditingId(null);
      setEditProject({ name: "", path: "", description: "", type: "local" });
      refetch();
    }
  }, [updateMutation.isSuccess, refetch]);

  // Handle update mutation error
  useEffect(() => {
    if (updateMutation.isError && updateMutation.error) {
      setFormError(updateMutation.error.message);
    }
  }, [updateMutation.isError, updateMutation.error]);

  // Delete mutation
  const deleteMutation = trpc.project.delete.useMutation();

  // Handle delete mutation success
  useEffect(() => {
    if (deleteMutation.isSuccess) {
      refetch();
    }
  }, [deleteMutation.isSuccess, refetch]);

  // Set active mutation
  const setActiveMutation = trpc.project.setActive.useMutation();

  // Handle set active mutation success
  useEffect(() => {
    if (setActiveMutation.isSuccess && setActiveMutation.data) {
      setActiveProject(setActiveMutation.data);
    }
  }, [setActiveMutation.isSuccess, setActiveMutation.data, setActiveProject]);

  // Validate path mutation
  const validatePathMutation = trpc.project.validatePath.useMutation();

  const handleCreate = async () => {
    setFormError(null);

    // Validate path
    const validation = await validatePathMutation.mutateAsync({ path: newProject.path });
    if (!validation.valid) {
      setFormError(validation.error || "Invalid path");
      return;
    }

    createMutation.mutate({
      name: newProject.name,
      path: newProject.path,
      description: newProject.description || undefined,
      type: newProject.type,
    });
  };

  const handleUpdate = (project: Project) => {
    updateMutation.mutate({
      id: project.id,
      name: editProject.name || undefined,
      path: editProject.path || undefined,
      description: editProject.description !== "" ? editProject.description : undefined,
      type: editProject.type,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this project?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSetActive = (id: string) => {
    setActiveMutation.mutate({ id });
  };

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setEditProject({
      name: project.name,
      path: project.path,
      description: project.description || "",
      type: project.type || "local",
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-slate-400 mt-1">
            Manage your Ralph project workspaces
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Project
        </button>
      </div>

      {/* Error message */}
      {formError && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg flex items-center gap-2 text-red-200">
          <AlertCircle className="w-4 h-4" />
          {formError}
        </div>
      )}

      {/* Create form */}
      {isCreating && (
        <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <h2 className="text-lg font-semibold mb-4">Add New Project</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name</label>
              <input
                type="text"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                placeholder="My Project"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Path</label>
              <input
                type="text"
                value={newProject.path}
                onChange={(e) => setNewProject({ ...newProject, path: e.target.value })}
                placeholder="/path/to/project"
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Project Type</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="projectType"
                    value="local"
                    checked={newProject.type === "local"}
                    onChange={() => setNewProject({ ...newProject, type: "local" })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 focus:ring-blue-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <Folder className="w-4 h-4 text-slate-400" />
                    Local
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="projectType"
                    value="worktree"
                    checked={newProject.type === "worktree"}
                    onChange={() => setNewProject({ ...newProject, type: "worktree" })}
                    className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 focus:ring-blue-500"
                  />
                  <span className="flex items-center gap-1.5">
                    <GitBranch className="w-4 h-4 text-purple-400" />
                    Worktree
                  </span>
                </label>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {newProject.type === "worktree"
                  ? "Uses Git worktree for isolated development"
                  : "Standard local project"}
              </p>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Description (optional)
              </label>
              <textarea
                value={newProject.description}
                onChange={(e) =>
                  setNewProject({ ...newProject, description: e.target.value })
                }
                placeholder="Project description..."
                rows={2}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setIsCreating(false);
                  setNewProject({ name: "", path: "", description: "", type: "local" });
                  setFormError(null);
                }}
                className="flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newProject.name || !newProject.path || createMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="w-4 h-4" />
                {createMutation.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Projects list */}
      {isLoading ? (
        <div className="text-center py-8 text-slate-400">Loading projects...</div>
      ) : projects && projects.length > 0 ? (
        <div className="space-y-3">
          {projects.map((project: { id: string; name: string; path: string; type: string; description: string | null; isActive: boolean; createdAt?: Date; updatedAt?: Date }) => (
            <div
              key={project.id}
              className={`p-4 bg-slate-800 rounded-lg border transition-colors ${
                project.isActive
                  ? "border-green-700"
                  : "border-slate-700 hover:border-slate-600"
              }`}
            >
              {editingId === project.id ? (
                /* Edit mode */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Name</label>
                      <input
                        type="text"
                        value={editProject.name}
                        onChange={(e) =>
                          setEditProject({ ...editProject, name: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">Path</label>
                      <input
                        type="text"
                        value={editProject.path}
                        onChange={(e) =>
                          setEditProject({ ...editProject, path: e.target.value })
                        }
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Project Type</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`projectType-${project.id}`}
                          value="local"
                          checked={editProject.type === "local"}
                          onChange={() => setEditProject({ ...editProject, type: "local" })}
                          className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 focus:ring-blue-500"
                        />
                        <span className="flex items-center gap-1.5">
                          <Folder className="w-4 h-4 text-slate-400" />
                          Local
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`projectType-${project.id}`}
                          value="worktree"
                          checked={editProject.type === "worktree"}
                          onChange={() => setEditProject({ ...editProject, type: "worktree" })}
                          className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-600 focus:ring-blue-500"
                        />
                        <span className="flex items-center gap-1.5">
                          <GitBranch className="w-4 h-4 text-purple-400" />
                          Worktree
                        </span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Description</label>
                    <textarea
                      value={editProject.description}
                      onChange={(e) =>
                        setEditProject({ ...editProject, description: e.target.value })
                      }
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setEditProject({ name: "", path: "", description: "", type: "local" });
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-400 hover:text-white transition-colors"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                    <button
                      onClick={() => handleUpdate(project as unknown as { id: string; name: string; path: string; type: "local" | "worktree"; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date })}
                      disabled={updateMutation.isPending}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" />
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                /* View mode */
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-slate-700 rounded-lg">
                      <Folder className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{project.name}</h3>
                        {project.isActive && (
                          <span className="px-2 py-0.5 text-xs bg-green-900/50 text-green-400 rounded-full">
                            Active
                          </span>
                        )}
                        {project.type === "worktree" && (
                          <span className="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-400 rounded-full flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            Worktree
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400 mt-0.5">{project.path}</p>
                      {project.description && (
                        <p className="text-sm text-slate-500 mt-1">{project.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!project.isActive && (
                      <button
                        onClick={() => handleSetActive(project.id)}
                        disabled={setActiveMutation.isPending}
                        className="p-2 text-slate-400 hover:text-green-400 transition-colors"
                        title="Set as active"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => startEditing(project as unknown as { id: string; name: string; path: string; type: "local" | "worktree"; description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date })}
                      className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Edit"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700 border-dashed">
          <Folder className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No projects yet</h3>
          <p className="text-slate-400 mb-4">
            Add your first Ralph project to get started
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Project
          </button>
        </div>
      )}
    </div>
  );
}
