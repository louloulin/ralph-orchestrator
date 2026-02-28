/**
 * Dashboard Page
 *
 * Main dashboard showing system status, task statistics, recent activity,
 * and quick actions for the Ralph orchestrator.
 */

import { useNavigate } from "react-router-dom";
import {
  ListTodo,
  Play,
  Plus,
  RefreshCw,
  Workflow,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { trpc } from "@/trpc";
import {
  StatCard,
  ActivityTimeline,
  QuickActionsGrid,
  SystemStatus,
  SystemStatusSkeleton,
  type Activity,
  type QuickActionItem,
  type SystemHealth,
} from "@/components/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMemo } from "react";
import { useTranslation } from "@/hooks";

export function DashboardPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Fetch tasks
  const { data: tasksData, isLoading: tasksLoading } = trpc.task.list.useQuery();

  // Fetch loops
  const { data: loopsData, isLoading: loopsLoading } = trpc.loops.list.useQuery();

  // Fetch manager status
  const { data: managerStatus } = trpc.loops.managerStatus.useQuery();

  // Calculate task statistics
  const taskStats = useMemo(() => {
    if (!tasksData) return { total: 0, open: 0, inProgress: 0, completed: 0, failed: 0 };

    const tasks = tasksData as unknown[] | undefined;
    return {
      total: tasks?.length ?? 0,
      open: tasks?.filter((t: unknown) => (t as { status: string }).status === "open").length ?? 0,
      inProgress: tasks?.filter((t: unknown) => {
        const status = (t as { status: string }).status;
        return status === "in_progress" || status === "pending";
      }).length ?? 0,
      completed: tasks?.filter((t: unknown) => (t as { status: string }).status === "closed").length ?? 0,
      failed: tasks?.filter((t: unknown) => (t as { status: string }).status === "failed").length ?? 0,
    };
  }, [tasksData]);

  // Calculate loop statistics
  const loopStats = useMemo(() => {
    if (!loopsData) return { total: 0, running: 0, pending: 0, completed: 0 };

    const loops = loopsData as unknown[] | undefined;
    return {
      total: loops?.length ?? 0,
      running: loops?.filter((l: unknown) => (l as { status: string }).status === "running").length ?? 0,
      pending: loops?.filter((l: unknown) => (l as { status: string }).status === "queued").length ?? 0,
      completed: loops?.filter((l: unknown) => (l as { status: string }).status === "completed").length ?? 0,
    };
  }, [loopsData]);

  // Determine system health
  const systemHealth: SystemHealth = useMemo(() => {
    if (loopsLoading || tasksLoading) return "unknown";
    if (loopStats.running > 0 && managerStatus?.running) return "healthy";
    if (loopStats.pending > 0 || taskStats.failed > 0) return "degraded";
    if (!managerStatus?.running && loopStats.total > 0) return "unhealthy";
    return "healthy";
  }, [loopsLoading, tasksLoading, loopStats, managerStatus, taskStats]);

  // Build recent activities from tasks and loops
  const activities: Activity[] = useMemo(() => {
    const items: Activity[] = [];

    // Add recent tasks
    if (tasksData) {
      (tasksData as unknown[]).slice(0, 5).forEach((taskItem: unknown) => {
        const task = taskItem as { id: string; title: string; status: string; updatedAt?: string; createdAt: string };
        items.push({
          id: `task-${task.id}`,
          title: task.title,
          timestamp: task.updatedAt || task.createdAt,
          status:
            task.status === "closed" ? "success" :
            task.status === "failed" ? "error" :
            task.status === "in_progress" ? "info" : "neutral",
          description: `${t("common.status")}: ${task.status}`,
        });
      });
    }

    // Add recent loops
    if (loopsData) {
      (loopsData as unknown[]).slice(0, 3).forEach((loop: unknown) => {
        const l = loop as { id: string; prompt?: string; status: string };
        items.push({
          id: `loop-${l.id}`,
          title: l.prompt?.slice(0, 50) || `Loop ${l.id}`,
          timestamp: new Date(),
          status:
            l.status === "completed" ? "success" :
            l.status === "failed" ? "error" :
            l.status === "running" ? "info" : "neutral",
          description: `Loop: ${l.status}`,
        });
      });
    }

    // Sort by timestamp (most recent first)
    return items.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeB - timeA;
    }).slice(0, 10);
  }, [tasksData, loopsData, t]);

  // Quick actions
  const quickActions: QuickActionItem[] = useMemo(() => [
    {
      id: "new-task",
      label: t("dashboard.newTask"),
      description: t("dashboard.newTaskDescription"),
      icon: Plus,
      variant: "primary",
      onClick: () => navigate("/tasks"),
    },
    {
      id: "run-all",
      label: t("dashboard.runPending"),
      description: t("dashboard.tasksWaiting", { count: taskStats.open }),
      icon: Play,
      variant: taskStats.open > 0 ? "success" : "default",
      disabled: taskStats.open === 0,
      onClick: () => navigate("/tasks"),
    },
    {
      id: "loops",
      label: t("dashboard.loops"),
      description: t("dashboard.loopsRunning", { count: loopStats.running }),
      icon: RefreshCw,
      variant: loopStats.running > 0 ? "primary" : "default",
      onClick: () => navigate("/tasks"),
    },
    {
      id: "builder",
      label: t("dashboard.builder"),
      description: t("dashboard.builderDescription"),
      icon: Workflow,
      onClick: () => navigate("/builder"),
    },
  ], [navigate, taskStats, loopStats, t]);

  return (
    <>
      {/* Page header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t("dashboard.welcome")}
        </p>
      </header>

      <div className="grid gap-6">
        {/* Top row: System status */}
        {tasksLoading || loopsLoading ? (
          <SystemStatusSkeleton />
        ) : (
          <SystemStatus
            health={systemHealth}
            wsConnected={loopStats.running > 0}
            activeLoops={loopStats.running}
            managerRunning={managerStatus?.running}
          />
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title={t("dashboard.totalTasks")}
            value={taskStats.total}
            description={t("dashboard.allTime")}
            icon={ListTodo}
            onClick={() => navigate("/tasks")}
          />
          <StatCard
            title={t("dashboard.openTasks")}
            value={taskStats.open}
            description={t("dashboard.waitingToRun")}
            icon={Play}
            trend={taskStats.open > 0 ? "up" : "neutral"}
            trendValue={taskStats.open > 0 ? t("dashboard.pendingCount", { count: taskStats.open }) : t("dashboard.allClear")}
          />
          <StatCard
            title={t("dashboard.activeLoops")}
            value={loopStats.running}
            description={t("dashboard.activeOrchestration")}
            icon={RefreshCw}
          />
          <StatCard
            title={t("dashboard.completedTasks")}
            value={taskStats.completed}
            description={t("dashboard.tasksFinished")}
            icon={CheckCircle}
          />
        </div>

        {/* Quick actions */}
        <QuickActionsGrid
          actions={quickActions}
          columns={4}
          title={t("dashboard.quickActions")}
        />

        {/* Activity timeline */}
        <div className="grid md:grid-cols-2 gap-6">
          <ActivityTimeline
            activities={activities}
            title={t("dashboard.recentActivity")}
            description={t("dashboard.latestTasksAndLoops")}
            maxItems={6}
            onViewAll={() => navigate("/tasks")}
          />

          {/* Task status breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.taskStatus")}</CardTitle>
              <CardDescription>{t("dashboard.breakdownByStatus")}</CardDescription>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : taskStats.total === 0 ? (
                <div className="text-center py-8">
                  <ListTodo className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">{t("tasks.noTasks")}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("tasks.noTasksDescription")}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Open */}
                  <StatusRow
                    icon={Play}
                    label={t("tasks.status.pending")}
                    count={taskStats.open}
                    total={taskStats.total}
                    color="bg-blue-500"
                  />
                  {/* In Progress */}
                  <StatusRow
                    icon={RefreshCw}
                    label={t("tasks.status.running")}
                    count={taskStats.inProgress}
                    total={taskStats.total}
                    color="bg-amber-500"
                  />
                  {/* Completed */}
                  <StatusRow
                    icon={CheckCircle}
                    label={t("tasks.status.completed")}
                    count={taskStats.completed}
                    total={taskStats.total}
                    color="bg-emerald-500"
                  />
                  {/* Failed */}
                  {taskStats.failed > 0 && (
                    <StatusRow
                      icon={XCircle}
                      label={t("tasks.status.failed")}
                      count={taskStats.failed}
                      total={taskStats.total}
                      color="bg-red-500"
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * StatusRow Component
 *
 * A single row in the task status breakdown.
 */
interface StatusRowProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
  color: string;
}

function StatusRow({ icon: Icon, label, count, total, color }: StatusRowProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span>{label}</span>
        </div>
        <span className="font-medium">{count}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default DashboardPage;
