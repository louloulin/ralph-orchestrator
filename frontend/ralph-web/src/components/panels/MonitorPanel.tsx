/**
 * MonitorPanel Component
 *
 * Side panel adaptation of the MonitoringPage for the chat-centric interface.
 * Provides system monitoring and process management within a slide-out panel.
 *
 * Features:
 * - Compact process list with status indicators
 * - Alert summary and metrics
 * - Real-time status updates
 * - Optimized for side panel width constraints
 */

import { useState } from "react";
import { Activity, Server, AlertTriangle, RefreshCw, Search, Filter, HeartPulse } from "lucide-react";
import { useTranslation } from "@/hooks";
import { usePanelStore } from "@/stores/panelStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/trpc";
import { cn } from "@/lib/utils";

/**
 * Status badge component for process display
 */
function ProcessStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();

  const statusConfig: Record<string, { className: string; icon: typeof Activity }> = {
    running: { className: "bg-green-500/10 text-green-500", icon: Activity },
    stopped: { className: "bg-gray-500/10 text-gray-500", icon: Server },
    crashed: { className: "bg-red-500/10 text-red-500", icon: AlertTriangle },
    starting: { className: "bg-blue-500/10 text-blue-500", icon: RefreshCw },
  };

  const config = statusConfig[status] || statusConfig.stopped;
  const Icon = config.icon;

  return (
    <Badge variant="secondary" className={cn(config.className, "gap-1")}>
      <Icon className="h-3 w-3" />
      {t(`monitoring.status.${status}`)}
    </Badge>
  );
}

/**
 * MonitorPanel - System monitoring within side panel
 */
export function MonitorPanel() {
  const { t } = useTranslation();
  const { closePanel } = usePanelStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch monitoring data
  const { data: processData, isLoading: isLoadingProcesses, refetch: refetchProcesses } =
    trpc.process.list.useQuery(undefined, {
      refetchInterval: autoRefresh ? 5000 : false,
    });

  const { data: alertsData, isLoading: isLoadingAlerts } = trpc.monitoring.getActiveAlerts.useQuery(undefined, {
    refetchInterval: autoRefresh ? 5000 : false,
  });

  const processes = processData?.processes ?? [];
  const alerts = alertsData?.alerts ?? [];

  // Filter processes based on search
  const filteredProcesses = processes.filter((p: { id: string; loopId?: string; status: string }) =>
    p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.loopId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Count processes by status
  const runningCount = processes.filter((p: { status: string }) => p.status === "running").length;
  const stoppedCount = processes.filter((p: { status: string }) => p.status === "stopped").length;
  const crashedCount = processes.filter((p: { status: string }) => p.status === "crashed").length;

  // Count alerts by severity
  const criticalAlerts = alerts.filter((a: { severity: string }) => a.severity === "critical").length;
  const warningAlerts = alerts.filter((a: { severity: string }) => a.severity === "warning").length;

  const handleRefresh = () => {
    refetchProcesses();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header with Stats */}
      <div className="space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{t("monitoring.title")}</h3>
            <Badge variant="secondary" className="text-xs">
              {processes.length}
            </Badge>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant={autoRefresh ? "default" : "outline"}
              onClick={() => setAutoRefresh(!autoRefresh)}
              title={autoRefresh ? t("monitoring.disableAutoRefresh") : t("monitoring.enableAutoRefresh")}
            >
              <RefreshCw className={cn("h-4 w-4", autoRefresh && "animate-spin")} />
            </Button>
            <Button size="icon" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Process Status Summary */}
        <div className="flex gap-2 flex-wrap">
          {runningCount > 0 && (
            <Badge className="bg-green-500/10 text-green-500">
              <Activity className="h-3 w-3 mr-1" />
              {runningCount} {t("monitoring.running")}
            </Badge>
          )}
          {stoppedCount > 0 && (
            <Badge variant="secondary" className="bg-gray-500/10 text-gray-500">
              {stoppedCount} {t("monitoring.stopped")}
            </Badge>
          )}
          {crashedCount > 0 && (
            <Badge className="bg-red-500/10 text-red-500">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {crashedCount} {t("monitoring.crashed")}
            </Badge>
          )}
        </div>

        {/* Alert Summary */}
        {alerts.length > 0 && (
          <Card className={cn(
            "border-l-2",
            criticalAlerts > 0 ? "border-l-red-500" : "border-l-yellow-500"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className={cn(
                  "h-4 w-4",
                  criticalAlerts > 0 ? "text-red-500" : "text-yellow-500"
                )} />
                <span className="font-medium">
                  {criticalAlerts > 0 ? t("monitoring.criticalAlerts") : t("monitoring.warnings")}
                </span>
                <Badge variant="secondary" className="ml-auto">
                  {alerts.length}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="border-b mb-4" />

      {/* Search and Filters */}
      <div className="space-y-3 pb-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("monitoring.searchPlaceholder") || "Search processes..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <div className="text-sm font-medium">{t("monitoring.filterByStatus")}</div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline">{t("monitoring.status.running")}</Button>
              <Button size="sm" variant="outline">{t("monitoring.status.stopped")}</Button>
              <Button size="sm" variant="outline">{t("monitoring.status.crashed")}</Button>
            </div>
          </div>
        )}
      </div>

      {/* Process List */}
      <div className="flex-1 -mx-4 px-4 overflow-y-auto">
        {isLoadingProcesses ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProcesses.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{searchQuery ? t("monitoring.noResults") : t("monitoring.noProcesses")}</p>
              <p className="text-sm mt-2">
                {t("monitoring.startLoopFirst") || "Start a loop to see monitoring data"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredProcesses.map((process: { id: string; loopId?: string; status: string; health?: string; pid?: number }) => (
              <Card
                key={process.id}
                className={cn(
                  "cursor-pointer hover:bg-accent/50 transition-colors",
                  "border-l-2",
                  process.status === "running" && "border-l-green-500",
                  process.status === "crashed" && "border-l-red-500",
                  process.status === "stopped" && "border-l-gray-500"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-sm truncate">{process.loopId || process.id}</h4>
                        {process.health === "healthy" && (
                          <HeartPulse className="h-3 w-3 text-green-500" />
                        )}
                      </div>
                      {process.pid && (
                        <p className="text-xs text-muted-foreground mt-1">
                          PID: {process.pid}
                        </p>
                      )}
                    </div>
                    <ProcessStatusBadge status={process.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Alert List (if alerts exist) */}
      {alerts.length > 0 && (
        <div className="border-t pt-4 mt-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {t("monitoring.activeAlerts")}
          </h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {alerts.slice(0, 3).map((alert: { id: string; severity: string; ruleName: string; message?: string }) => (
              <Card key={alert.id} className={cn(
                "p-2",
                alert.severity === "critical" ? "border-red-500/50" : "border-yellow-500/50"
              )}>
                <div className="flex items-start gap-2 text-xs">
                  <AlertTriangle className={cn(
                    "h-3 w-3 shrink-0 mt-0.5",
                    alert.severity === "critical" ? "text-red-500" : "text-yellow-500"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{alert.ruleName}</p>
                    {alert.message && (
                      <p className="text-muted-foreground truncate">{alert.message}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Panel Footer */}
      <div className="pt-4 border-t mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            {autoRefresh && <RefreshCw className="h-3 w-3 animate-spin" />}
            {isLoadingProcesses
              ? t("common.loading")
              : t("monitoring.showingCount", { count: filteredProcesses.length })
            }
          </span>
          <Button variant="ghost" size="sm" onClick={closePanel}>
            {t("common.close")}
          </Button>
        </div>
      </div>
    </div>
  );
}
