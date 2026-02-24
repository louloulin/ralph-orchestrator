/**
 * Metrics Dashboard Component
 *
 * Displays all metrics in a grid layout with filtering and search
 * for the monitoring dashboard (P4-3.5).
 */

import * as React from "react";
import { trpc } from "@/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "./MetricCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Activity,
  Search,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Filter,
} from "lucide-react";
import type { AnyMetric, MetricsSnapshot } from "@/types/metrics";
import { useTranslation } from "@/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface MetricsDashboardProps {
  /** Filter metrics by name prefix */
  namePrefix?: string;
  /** Show only specific metric types */
  metricType?: "counter" | "gauge" | "histogram" | "all";
  /** Maximum number of metrics to display */
  limit?: number;
  /** Auto-refresh interval in milliseconds */
  refreshInterval?: number;
  /** Additional CSS classes */
  className?: string;
  /** Show search input */
  showSearch?: boolean;
  /** Show refresh button */
  showRefresh?: boolean;
  /** Show metric type filter */
  showTypeFilter?: boolean;
}

/**
 * Metrics Dashboard Skeleton Loader
 */
function MetricsDashboardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-2">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </CardHeader>
          <CardContent>
            <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            <div className="h-3 w-48 bg-muted animate-pulse rounded mt-2" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Empty State Component
 */
function EmptyState({ message }: { message: string }) {
  return (
    <Card className="text-center py-12">
      <CardContent>
        <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No Metrics</h3>
        <p className="text-muted-foreground text-sm">{message}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Error State Component
 */
function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="text-center py-12 border-destructive">
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
 * Snapshot metadata card
 */
function SnapshotMetadataCard({
  snapshot,
  className,
}: {
  snapshot: MetricsSnapshot;
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {t("monitoring.metricsSnapshot")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">{t("monitoring.totalMetrics")}</span>
            <p className="font-mono text-lg">{snapshot.metadata.totalMetrics}</p>
          </div>
          <div>
            <span className="text-muted-foreground">{t("monitoring.collectionTime")}</span>
            <p className="font-mono text-lg">{snapshot.metadata.collectionDurationMs}ms</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {t("monitoring.lastCollected")}: {new Date(snapshot.timestamp).toLocaleTimeString()}
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * MetricsDashboard Component
 *
 * Displays all metrics in a filterable grid layout.
 */
export function MetricsDashboard({
  namePrefix,
  metricType = "all",
  limit,
  refreshInterval,
  className,
  showSearch = true,
  showRefresh = true,
  showTypeFilter = true,
}: MetricsDashboardProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<"all" | "counter" | "gauge" | "histogram">(
    metricType === "all" ? "all" : metricType
  );

  // Fetch metrics snapshot
  const {
    data: snapshot,
    isLoading,
    error,
    refetch,
  } = trpc.monitoring.getSnapshot.useQuery(undefined, {
    refetchInterval: refreshInterval,
  });

  // Filter and search metrics
  const filteredMetrics = React.useMemo(() => {
    if (!snapshot?.metrics) return [];

    let metrics = snapshot.metrics;

    // Filter by name prefix
    if (namePrefix) {
      metrics = metrics.filter((m) => m.name.startsWith(namePrefix));
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      metrics = metrics.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.help?.toLowerCase().includes(term) ||
          m.labels?.some((l) => l.value.toLowerCase().includes(term))
      );
    }

    // Filter by metric type
    if (typeFilter !== "all") {
      metrics = metrics.filter((m) => m.type === typeFilter);
    }

    // Apply limit
    if (limit) {
      metrics = metrics.slice(0, limit);
    }

    return metrics;
  }, [snapshot?.metrics, namePrefix, searchTerm, typeFilter, limit]);

  // Group metrics by name prefix
  const groupedMetrics = React.useMemo(() => {
    if (filteredMetrics.length === 0) return {};

    const groups: Record<string, AnyMetric[]> = {};
    for (const metric of filteredMetrics) {
      const prefix = metric.name.split("_")[0] || "other";
      if (!groups[prefix]) {
        groups[prefix] = [];
      }
      groups[prefix].push(metric);
    }
    return groups;
  }, [filteredMetrics]);

  const handleRetry = () => {
    refetch();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        {showSearch && (
          <div className="flex gap-2">
            <div className="h-10 w-64 bg-muted animate-pulse rounded" />
          </div>
        )}
        <MetricsDashboardSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={className}>
        <ErrorState message={error.message} onRetry={handleRetry} />
      </div>
    );
  }

  // Check if MetricStore is not configured
  if (!snapshot) {
    return (
      <div className={className}>
        <ErrorState message={t("monitoring.metricStoreNotConfigured")} onRetry={handleRetry} />
      </div>
    );
  }

  // Empty state
  if (snapshot.metrics.length === 0) {
    return (
      <div className={className}>
        <EmptyState message={t("monitoring.noMetrics")} />
      </div>
    );
  }

  const typeOptions: Array<"all" | "counter" | "gauge" | "histogram"> = [
    "all",
    "counter",
    "gauge",
    "histogram",
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Controls */}
      {(showSearch || showRefresh || showTypeFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          {showSearch && (
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder={t("monitoring.searchMetrics")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          )}

          {showTypeFilter && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1 flex-wrap">
                {typeOptions.map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={cn(
                      "px-2 py-1 text-xs rounded-md transition-colors capitalize",
                      typeFilter === type
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showRefresh && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2 hidden sm:inline">{t("common.refresh")}</span>
            </Button>
          )}
        </div>
      )}

      {/* Snapshot metadata */}
      <SnapshotMetadataCard snapshot={snapshot} />

      {/* Metrics count */}
      <div className="text-sm text-muted-foreground">
        {t("monitoring.showingMetrics", { count: filteredMetrics.length, total: snapshot.metrics.length })}
      </div>

      {/* No results after filtering */}
      {filteredMetrics.length === 0 && snapshot.metrics.length > 0 && (
        <EmptyState message={t("monitoring.noMatchingMetrics")} />
      )}

      {/* Metrics grid - grouped by prefix */}
      {filteredMetrics.length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedMetrics).map(([prefix, metrics]) => (
            <div key={prefix}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 capitalize">
                {prefix} ({metrics.length})
              </h3>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {metrics.map((metric, index) => (
                  <MetricCard
                    key={`${metric.name}-${index}`}
                    metric={metric}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MetricsDashboard;
