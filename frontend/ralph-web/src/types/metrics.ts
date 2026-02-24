/**
 * Metrics types for monitoring system (P4-3)
 *
 * These types match the backend metrics types from backend/ralph-web-server/src/types/metrics.ts
 */

// Metric name with optional labels
export interface MetricLabel {
  key: string;
  value: string;
}

// Base metric interface
export interface Metric {
  name: string;
  help: string;
  labels: MetricLabel[];
  timestamp: Date;
}

// Counter: Only increases, resets on restart
export interface CounterMetric extends Metric {
  type: 'counter';
  value: number;
}

// Gauge: Can increase or decrease
export interface GaugeMetric extends Metric {
  type: 'gauge';
  value: number;
}

// Histogram: Distribution with bucketed counts
export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface HistogramBucket {
  upperBound: number;
  cumulativeCount: number;
}

// Union type for all metrics
export type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric;

// Aggregated metrics snapshot
export interface MetricsSnapshot {
  timestamp: Date;
  metrics: AnyMetric[];
  metadata: {
    collectionDurationMs: number;
    totalMetrics: number;
  };
}

// Alert severity levels
export type AlertSeverity = 'info' | 'warning' | 'critical';

// Alert state
export type AlertState = 'firing' | 'resolved';

// Alert definition
export interface AlertRule {
  id: string;
  name: string;
  expression: string;
  condition: AlertCondition;
  severity: AlertSeverity;
  message: string;
  labels: Record<string, string>;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Alert condition
export interface AlertCondition {
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  threshold: number;
  duration: number;
}

// Active alert
export interface ActiveAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  state: AlertState;
  severity: AlertSeverity;
  message: string;
  labels: Record<string, string>;
  value: number;
  startedAt: Date;
  lastFiredAt: Date;
  resolvedAt?: Date;
}

// Alert history record
export interface AlertHistoryRecord {
  id: string;
  ruleId: string;
  ruleName: string;
  state: AlertState;
  severity: AlertSeverity;
  message: string;
  value: number;
  firedAt: Date;
  resolvedAt?: Date;
}
