/**
 * Metric Card Component
 *
 * Displays a single metric with its value, type, and labels
 * for the monitoring dashboard (P4-3.5).
 */

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, BarChart3 } from "lucide-react";
import type { AnyMetric, CounterMetric, GaugeMetric, HistogramMetric } from "@/types/metrics";
import { cn } from "@/lib/utils";

export interface MetricCardProps {
  metric: AnyMetric;
  className?: string;
}

/**
 * Format a metric value for display
 */
function formatValue(value: number, name: string): string {
  // Handle common metric patterns
  if (name.includes("bytes") || name.includes("_bytes")) {
    return formatBytes(value);
  }
  if (name.includes("seconds") || name.includes("_seconds")) {
    return `${value.toFixed(3)}s`;
  }
  if (name.includes("percent") || name.includes("_percent") || name.includes("ratio")) {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  if (Number.isInteger(value)) {
    return value.toString();
  }
  return value.toFixed(2);
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Get icon based on metric type
 */
function getMetricIcon(type: string) {
  switch (type) {
    case "counter":
      return TrendingUp;
    case "gauge":
      return Activity;
    case "histogram":
      return BarChart3;
    default:
      return TrendingDown;
  }
}

/**
 * MetricCard Component
 *
 * Displays a single metric in a card format with value, type, and labels.
 */
export function MetricCard({ metric, className }: MetricCardProps) {
  const Icon = getMetricIcon(metric.type);

  // Render based on metric type
  const renderValue = () => {
    switch (metric.type) {
      case "counter":
      case "gauge":
        return (
          <span className="font-mono text-2xl font-bold">
            {formatValue((metric as CounterMetric | GaugeMetric).value, metric.name)}
          </span>
        );
      case "histogram": {
        const hist = metric as HistogramMetric;
        return (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-bold">
                {formatValue(hist.sum, metric.name)}
              </span>
              <span className="text-xs text-muted-foreground">sum</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-sm">
                {hist.count.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">observations</span>
            </div>
          </div>
        );
      }
      default:
        return <span className="font-mono text-2xl">N/A</span>;
    }
  };

  // Format labels for display
  const renderLabels = () => {
    if (!metric.labels || metric.labels.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {metric.labels.map((label, index) => (
          <span
            key={`${label.key}-${index}`}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground"
          >
            {label.key}={label.value}
          </span>
        ))}
      </div>
    );
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="truncate flex-1" title={metric.name}>
            {metric.name}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {renderValue()}
        {renderLabels()}
        {metric.help && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2" title={metric.help}>
            {metric.help}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default MetricCard;
