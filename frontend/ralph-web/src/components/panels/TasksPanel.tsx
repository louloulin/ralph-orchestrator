/**
 * TasksPanel Component
 *
 * Side panel adaptation of the TasksPage for the chat-centric interface.
 * Provides task search, filtering, and thread list within a slide-out panel.
 *
 * Features:
 * - Compact task input for quick task creation
 * - Search and filter capabilities
 * - Real-time task list with polling
 * - Optimized for side panel width constraints
 */

import { useState } from "react";
import { Plus, Search, Filter, ListFilter } from "lucide-react";
import { useTranslation } from "@/hooks";
import { usePanelStore } from "@/stores/panelStore";
import { ThreadList } from "@/components/tasks/ThreadList";
import { TaskSearch } from "@/components/tasks/TaskSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/trpc";

/**
 * TasksPanel - Task management within side panel
 */
export function TasksPanel() {
  const { t } = useTranslation();
  const { closePanel } = usePanelStore();

  const [showFilters, setShowFilters] = useState(false);
  const [quickInput, setQuickInput] = useState("");

  // Fetch tasks for stats
  const { data: tasksData, isLoading } = trpc.task.list.useQuery({});
  const tasks = tasksData?.tasks ?? [];

  // Count tasks by status for badges
  const runningCount = tasks.filter((t: { status: string }) => t.status === "running").length;
  const pendingCount = tasks.filter((t: { status: string }) => t.status === "pending").length;
  const completedCount = tasks.filter((t: { status: string }) => t.status === "completed").length;

  const handleQuickCreate = () => {
    if (!quickInput.trim()) return;
    // TODO: Implement quick task creation via tRPC mutation
    setQuickInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header with Stats */}
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{t("tasks.title")}</h3>
            <Badge variant="secondary" className="text-xs">
              {tasks.length}
            </Badge>
          </div>
          <Button
            size="sm"
            onClick={() => {
              // TODO: Open task creation modal or expand input
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("tasks.create")}
          </Button>
        </div>

        {/* Status Summary */}
        <div className="flex gap-2 flex-wrap">
          {runningCount > 0 && (
            <Badge
              variant="default"
              className="bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
            >
              {runningCount} {t("tasks.status.running")}
            </Badge>
          )}
          {pendingCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20"
            >
              {pendingCount} {t("tasks.status.pending")}
            </Badge>
          )}
          <Badge variant="outline" className="text-muted-foreground">
            {completedCount} {t("tasks.status.completed")}
          </Badge>
        </div>
      </div>

      <div className="border-b mb-4" />

      {/* Quick Input */}
      <div className="space-y-3 pb-4">
        <div className="flex gap-2">
          <Input
            placeholder={t("tasks.quickAddPlaceholder") || "Quick add task..."}
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleQuickCreate();
            }}
            className="flex-1"
          />
          <Button
            size="icon"
            variant="secondary"
            onClick={handleQuickCreate}
            disabled={!quickInput.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-3 pb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <TaskSearch
              showFilters={false}
              placeholder={t("tasks.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button
            size="icon"
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {showFilters && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ListFilter className="h-4 w-4" />
              {t("tasks.filters")}
            </div>
            <TaskSearch showFilters={true} showDateFilter={false} />
          </div>
        )}
      </div>

      {/* Task List */}
      <div className="flex-1 -mx-4 px-4 overflow-y-auto">
        <ThreadList
          pollingInterval={5000}
          className="space-y-3"
        />
      </div>

      {/* Panel Footer */}
      <div className="pt-4 border-t mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isLoading
              ? t("common.loading")
              : t("tasks.showingCount", { count: tasks.length })}
          </span>
          <Button variant="ghost" size="sm" onClick={closePanel}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
