/**
 * Alert List Component
 *
 * Displays active alerts with severity badges for the monitoring dashboard (P4-3.5).
 */

import * as React from "react";
import { trpc } from "@/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Bell, CheckCircle } from "lucide-react";
import { AlertBadge } from "./AlertBadge";
import type { ActiveAlert } from "@/types/metrics";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return "just now";
}

interface AlertItemProps {
  alert: ActiveAlert;
}

function AlertItem({ alert }: AlertItemProps) {
  return (
    <div className={cn(
      "flex items-center justify-between p-3 rounded-lg border",
      alert.state === "firing" ? "border-destructive/50 bg-destructive/5" : "border-green-500/50 bg-green-500/5"
    )}>
      <div className="flex items-center gap-3">
        {alert.state === "firing" ? (
          <AlertTriangle className="h-4 w-4 text-red-500" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
        <div>
          <p className="font-medium text-sm">{alert.ruleName}</p>
          <p className="text-xs text-muted-foreground">{alert.message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-muted-foreground">
          {formatTimeAgo(alert.lastFiredAt)}
        </span>
        <AlertBadge severity={alert.severity} />
      </div>
    </div>
  );
}

export interface AlertListProps {
  className?: string;
  limit?: number;
}

export function AlertList({ className, limit = 10 }: AlertListProps) {
  const { t } = useTranslation();
  const { data: alerts, isLoading } = trpc.monitoring.getActiveAlerts.useQuery();

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("monitoring.alerts")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const displayAlerts = (alerts || []).slice(0, limit);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Bell className="h-4 w-4" />
          {t("monitoring.alerts")}
          {displayAlerts.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {displayAlerts.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {displayAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle className="h-8 w-8 mb-2 text-green-500" />
            <p className="text-sm">{t("monitoring.noAlerts")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayAlerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
