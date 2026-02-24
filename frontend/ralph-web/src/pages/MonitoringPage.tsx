/**
 * Monitoring Page
 *
 * Dedicated page for monitoring loop processes with the 24/7 Platform Daemon.
 * Displays process list, health indicators, and allows process management actions.
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Loader2, RefreshCw, AlertTriangle, Server } from "lucide-react";
import { trpc } from "@/trpc";
import {
  ProcessList,
  ProcessListHeader,
} from "@/components/monitoring";
import { type LoopStatus } from "@/types/process";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";

/**
 * Skeleton loader for the monitoring page
 */
function MonitoringPageSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 bg-muted animate-pulse rounded" />
        <div className="h-10 w-24 bg-muted animate-pulse rounded" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-64 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/**
 * Supervisor stats card component
 */
function SupervisorStatsCard({
  totalProcesses,
  runningProcesses,
  stoppedProcesses,
  crashedProcesses,
  isMonitoring,
  className,
}: {
  totalProcesses: number;
  runningProcesses: number;
  stoppedProcesses: number;
  crashedProcesses: number;
  isMonitoring: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Server className="h-4 w-4" />
          {t("monitoring.supervisorStats")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("monitoring.totalProcesses")}</span>
            <p className="font-mono text-lg">{totalProcesses}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("monitoring.running")}</span>
            <p className="font-mono text-lg text-green-500">{runningProcesses}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("monitoring.stopped")}</span>
            <p className="font-mono text-lg">{stoppedProcesses}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("monitoring.crashed")}</span>
            <p className={cn(
              "font-mono text-lg",
              crashedProcesses > 0 && "text-red-500"
            )}>
              {crashedProcesses}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              isMonitoring ? "bg-green-500 animate-pulse" : "bg-gray-500"
            )}
          />
          <span className="text-muted-foreground">
            {isMonitoring ? t("monitoring.monitoringActive") : t("monitoring.monitoringInactive")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Empty state component when no processes exist
 */
function EmptyState({ className }: { className?: string }) {
  const { t } = useTranslation();

  return (
    <Card className={cn("text-center py-12", className)}>
      <CardContent>
        <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t("monitoring.noProcesses")}</h3>
        <p className="text-muted-foreground text-sm">
          {t("monitoring.noProcessesDescription")}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Error state component when supervisor is unavailable
 */
function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card className={cn("text-center py-12 border-destructive", className)}>
      <CardContent>
        <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">{t("monitoring.errorTitle")}</h3>
        <p className="text-muted-foreground text-sm mb-4">{message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("common.retry")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * MonitoringPage Component
 *
 * Displays all loop processes with health monitoring and management controls.
 */
export function MonitoringPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = React.useState<LoopStatus | "all">("all");

  // Fetch processes
  const {
    data: processes,
    isLoading: processesLoading,
    error: processesError,
    refetch: refetchProcesses,
  } = trpc.process.list.useQuery();

  // Fetch supervisor stats
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = trpc.process.stats.useQuery();

  // Stop process mutation
  const stopMutation = trpc.process.stop.useMutation({
    onSuccess: () => {
      refetchProcesses();
      refetchStats();
    },
  });

  // Restart process mutation
  const restartMutation = trpc.process.restart.useMutation({
    onSuccess: () => {
      refetchProcesses();
      refetchStats();
    },
  });

  // Fetch health for each process
  const healthQueries = trpc.useQueries((t) =>
    processes?.map((p) => t.process.getHealth({ id: p.id })) ?? []
  );

  // Build health checks map
  const healthChecks = React.useMemo(() => {
    const map: Record<string, typeof healthQueries[number]["data"]> = {};
    processes?.forEach((p, i) => {
      if (healthQueries[i]?.data) {
        map[p.id] = healthQueries[i].data;
      }
    });
    return map;
  }, [processes, healthQueries]);

  // Handle actions
  const handleStop = (loopId: string) => {
    stopMutation.mutate({ id: loopId });
  };

  const handleRestart = (loopId: string) => {
    restartMutation.mutate({ id: loopId });
  };

  const handleViewDetails = (loopId: string) => {
    navigate(`/loops/${loopId}`);
  };

  const handleRetry = () => {
    refetchProcesses();
    refetchStats();
  };

  // Loading state
  if (processesLoading || statsLoading) {
    return <MonitoringPageSkeleton />;
  }

  // Error state
  if (processesError || statsError) {
    const errorMessage = processesError?.message || statsError?.message || t("monitoring.unknownError");
    return (
      <div className="p-6">
        <ErrorState message={errorMessage} onRetry={handleRetry} />
      </div>
    );
  }

  // Check if supervisor is not configured
  if (!processes || !stats) {
    return (
      <div className="p-6">
        <ErrorState message={t("monitoring.supervisorNotConfigured")} onRetry={handleRetry} />
      </div>
    );
  }

  const isMutating = stopMutation.isPending || restartMutation.isPending;

  return (
    <div className="space-y-6 p-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" />
            {t("monitoring.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("monitoring.subtitle")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          disabled={processesLoading}
        >
          {processesLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">{t("common.refresh")}</span>
        </Button>
      </div>

      {/* Supervisor stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SupervisorStatsCard
          totalProcesses={stats.totalProcesses}
          runningProcesses={stats.runningProcesses}
          stoppedProcesses={stats.stoppedProcesses}
          crashedProcesses={stats.crashedProcesses}
          isMonitoring={stats.isMonitoring}
        />
      </div>

      {/* Process list header */}
      {processes.length > 0 && (
        <ProcessListHeader
          total={processes.length}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
        />
      )}

      {/* Process list or empty state */}
      {processes.length === 0 ? (
        <EmptyState />
      ) : (
        <ProcessList
          processes={processes as any}
          healthChecks={healthChecks as any}
          onStop={handleStop}
          onRestart={handleRestart}
          onViewDetails={handleViewDetails}
          isLoading={isMutating}
          statusFilter={statusFilter}
        />
      )}
    </div>
  );
}

export default MonitoringPage;
