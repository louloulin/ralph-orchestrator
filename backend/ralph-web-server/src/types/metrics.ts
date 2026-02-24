/**
 * Metrics types for monitoring system (P4-3)
 *
 * Supports three metric types:
 * - Counter: Cumulative value that only increases (e.g., requests total)
 * - Gauge: Point-in-time value that can go up or down (e.g., CPU usage)
 * - Histogram: Distribution of values with configurable buckets (e.g., latency)
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
  upperBound: number; // +Inf for last bucket
  cumulativeCount: number;
}

// Union type for all metrics
export type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric;

// Metric value for recording
export interface MetricValue {
  value: number;
  labels?: MetricLabel[];
  timestamp?: Date;
}

// Metric configuration
export interface MetricConfig {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram';
  labels?: string[]; // Label keys this metric accepts
  buckets?: number[]; // For histograms
}

// Aggregated metrics snapshot
export interface MetricsSnapshot {
  timestamp: Date;
  metrics: AnyMetric[];
  metadata: {
    collectionDurationMs: number;
    totalMetrics: number;
  };
}

// Predefined system metrics
export type SystemMetricName =
  // Loop metrics
  | 'ralph_loop_total'
  | 'ralph_loop_active'
  | 'ralph_loop_iterations_total'
  | 'ralph_loop_duration_seconds'
  // System metrics
  | 'ralph_system_cpu_percent'
  | 'ralph_system_memory_bytes'
  | 'ralph_system_uptime_seconds'
  // API metrics
  | 'ralph_api_requests_total'
  | 'ralph_api_request_duration_seconds'
  | 'ralph_api_errors_total'
  // Task metrics
  | 'ralph_tasks_total'
  | 'ralph_tasks_completed_total'
  | 'ralph_tasks_failed_total';

// Alert severity levels
export type AlertSeverity = 'info' | 'warning' | 'critical';

// Alert state
export type AlertState = 'firing' | 'resolved';

// Alert definition
export interface AlertRule {
  id: string;
  name: string;
  expression: string; // Metric query expression
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
  duration: number; // Seconds the condition must be true
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

// Metrics query for retrieving metrics
export interface MetricsQuery {
  names?: string[];
  labels?: MetricLabel[];
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

// Default histogram buckets for common use cases
export const DEFAULT_LATENCY_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10];
export const DEFAULT_SIZE_BUCKETS = [100, 1000, 10000, 100000, 1000000];
