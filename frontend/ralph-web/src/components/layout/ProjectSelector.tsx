/**
 * ProjectSelector Component
 *
 * A dropdown component for selecting the active project.
 * Displayed in the sidebar header.
 */

import { useState } from "react";
import { ChevronDown, Folder, Plus, Check } from "lucide-react";
import { trpc } from "@/trpc";
import { useProjectStore } from "@/stores/projectStore";
import type { Project } from "@/types/project";

export function ProjectSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { activeProject, setActiveProject, setLoaded } = useProjectStore();

  // Fetch all projects
  const { data: projects, isLoading } = trpc.project.list.useQuery(undefined, {
    onSuccess: (data) => {
      if (!useProjectStore.getState().isLoaded) {
        // Set active project from server if not set locally
        const serverActive = data?.find((p) => p.isActive);
        if (serverActive) {
          setActiveProject(serverActive);
        }
        setLoaded(true);
      }
    },
  });

  // Mutation to set active project
  const setActiveMutation = trpc.project.setActive.useMutation({
    onSuccess: (data) => {
      if (data) {
        setActiveProject(data);
      }
    },
  });

  const handleSelect = (project: Project) => {
    setActiveMutation.mutate({ id: project.id });
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <span className="truncate">
            {isLoading
              ? "Loading..."
              : activeProject?.name || "Select Project"}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
            {projects && projects.length > 0 ? (
              <div className="py-1">
                {projects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => handleSelect(project)}
                    disabled={setActiveMutation.isPending}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="truncate">{project.name}</span>
                    </div>
                    {project.isActive && (
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-3 py-4 text-sm text-slate-400 text-center">
                No projects yet
              </div>
            )}

            {/* Add project link */}
            <div className="border-t border-slate-700 py-1">
              <a
                href="/projects"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-slate-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Manage Projects</span>
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
