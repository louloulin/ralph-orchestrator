/**
 * SystemStatus Component
 *
 * Displays the overall system health and connection status.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Activity, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react";

export type SystemHealth = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface SystemStatusProps {
  /** Overall system health status */
  health: SystemHealth;
  /** Whether the WebSocket is connected */
  wsConnected?: boolean;
  /** Number of active loops */
  activeLoops?: number;
  /** Whether the loops manager is running */
  managerRunning?: boolean;
  /** Additional status details */
  details?: Array<{
    label: string;
    value: string | number | boolean;
    status?: "ok" | "warning" | "error";
  }>;
  /** Additional CSS classes */
  className?: string;
}

const healthConfig = {
  healthy: {
    icon: CheckCircle,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
    label: "Healthy",
  },
  degraded: {
    icon: AlertCircle,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
    label: "Degraded",
  },
  unhealthy: {
    icon: XCircle,
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    label: "Unhealthy",
  },
  unknown: {
    icon: Activity,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    label: "Unknown",
  },
};

export function SystemStatus({
  health,
  wsConnected,
  activeLoops = 0,
  managerRunning,
  details = [],
  className,
}: SystemStatusProps) {
  const config = healthConfig[health];
  const HealthIcon = config.icon;

  // Build default details if not provided
  const statusDetails = details.length > 0 ? details : [
    {
      label: "WebSocket",
      value: wsConnected === undefined ? "Unknown" : wsConnected ? "Connected" : "Disconnected",
      status: wsConnected ? "ok" as const : "error" as const,
    },
    {
      label: "Active Loops",
      value: activeLoops,
      status: activeLoops > 0 ? "ok" as const : undefined,
    },
    {
      label: "Manager",
      value: managerRunning === undefined ? "Unknown" : managerRunning ? "Running" : "Stopped",
      status: managerRunning ? "ok" as const : "warning" as const,
    },
  ];

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall health indicator */}
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", config.bgColor)}>
            <HealthIcon className={cn("h-5 w-5", config.color)} />
          </div>
          <div>
            <p className={cn("font-medium", config.color)}>{config.label}</p>
            <p className="text-xs text-muted-foreground">
              All systems operational
            </p>
          </div>
        </div>

        {/* Status details */}
        <div className="grid grid-cols-3 gap-3">
          {statusDetails.map((detail, index) => (
            <div
              key={index}
              className={cn(
                "p-2 rounded-lg bg-muted/50 text-center",
                detail.status === "ok" && "bg-emerald-500/5",
                detail.status === "warning" && "bg-amber-500/5",
                detail.status === "error" && "bg-red-500/5"
              )}
            >
              <p className="text-xs text-muted-foreground">{detail.label}</p>
              <p
                className={cn(
                  "text-sm font-medium mt-0.5",
                  detail.status === "ok" && "text-emerald-500",
                  detail.status === "warning" && "text-amber-500",
                  detail.status === "error" && "text-red-500"
                )}
              >
                {typeof detail.value === "boolean"
                  ? detail.value
                    ? "Yes"
                    : "No"
                  : detail.value}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * LoadingState Component
 *
 * A loading indicator for the dashboard.
 */
export function SystemStatusSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          System Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted animate-pulse">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <div className="h-4 w-16 bg-muted rounded animate-pulse" />
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-2 rounded-lg bg-muted/50 animate-pulse">
              <div className="h-3 w-12 bg-muted rounded mx-auto mb-1" />
              <div className="h-4 w-8 bg-muted rounded mx-auto" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
