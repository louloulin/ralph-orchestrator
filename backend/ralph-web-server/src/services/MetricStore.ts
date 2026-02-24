/**
 * MetricStore Service
 *
 * Centralized metrics collection and storage for monitoring system (P4-3).
 * Supports counters, gauges, and histograms with label-based dimensions.
 *
 * Features:
 * - Thread-safe metric operations
 * - In-memory storage with configurable retention
 * - Query support for filtering and aggregation
 * - Export to Prometheus format
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import type {
  AnyMetric,
  CounterMetric,
  GaugeMetric,
  HistogramMetric,
  MetricConfig,
  MetricLabel,
  MetricValue,
  MetricsQuery,
  MetricsSnapshot,
  HistogramBucket,
} from "../types/metrics.js";

/**
 * Configuration for the metric store.
 */
export interface MetricStoreConfig {
  /** Maximum number of metric samples to retain */
  maxSamples: number;
  /** Metric retention duration in milliseconds */
  retentionMs: number;
  /** Default histogram buckets if not specified */
  defaultHistogramBuckets: number[];
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Default metric store configuration.
 */
export const DEFAULT_METRIC_STORE_CONFIG: MetricStoreConfig = {
  maxSamples: 10000,
  retentionMs: 3600000, // 1 hour
  defaultHistogramBuckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
  verbose: false,
};

/**
 * Internal metric storage
 */
interface StoredMetric {
  config: MetricConfig;
  samples: MetricSample[];
}

interface MetricSample {
  value: number;
  labels: MetricLabel[];
  timestamp: Date;
}

/**
 * Label key for deduplication
 */
function labelKey(labels: MetricLabel[]): string {
  return labels
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((l) => `${l.key}="${l.value}"`)
    .join(",");
}

/**
 * MetricStore Service
 *
 * Manages collection, storage, and retrieval of metrics.
 */
export class MetricStore {
  private config: MetricStoreConfig;
  private metrics: Map<string, StoredMetric> = new Map();
  private counters: Map<string, Map<string, number>> = new Map();
  private gauges: Map<string, Map<string, number>> = new Map();
  private histograms: Map<
    string,
    Map<string, { buckets: HistogramBucket[]; sum: number; count: number }>
  > = new Map();

  constructor(config: Partial<MetricStoreConfig> = {}) {
    this.config = { ...DEFAULT_METRIC_STORE_CONFIG, ...config };
  }

  /**
   * Register a new metric.
   */
  registerMetric(metricConfig: MetricConfig): void {
    const { name, type, buckets } = metricConfig;

    if (this.metrics.has(name)) {
      if (this.config.verbose) {
        console.log(`[MetricStore] Metric ${name} already registered, updating config`);
      }
    }

    this.metrics.set(name, {
      config: metricConfig,
      samples: [],
    });

    // Initialize type-specific storage
    if (type === "counter") {
      this.counters.set(name, new Map());
    } else if (type === "gauge") {
      this.gauges.set(name, new Map());
    } else if (type === "histogram") {
      this.histograms.set(name, new Map());
      // Pre-configure buckets if provided
      if (buckets) {
        const bucketBoundaries = [...buckets, Infinity];
        const defaultBuckets: HistogramBucket[] = bucketBoundaries.map((bound) => ({
          upperBound: bound,
          cumulativeCount: 0,
        }));
        this.histograms.get(name)!.set("", {
          buckets: defaultBuckets,
          sum: 0,
          count: 0,
        });
      }
    }

    if (this.config.verbose) {
      console.log(`[MetricStore] Registered ${type} metric: ${name}`);
    }
  }

  /**
   * Increment a counter metric.
   */
  incrementCounter(name: string, value: number = 1, labels: MetricLabel[] = []): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Counter metric ${name} not registered`);
    }
    if (metric.config.type !== "counter") {
      throw new Error(`Metric ${name} is not a counter`);
    }

    const key = labelKey(labels);
    const counterMap = this.counters.get(name)!;
    const current = counterMap.get(key) || 0;
    counterMap.set(key, current + value);

    // Store sample
    this.addSample(name, { value: current + value, labels, timestamp: new Date() });
  }

  /**
   * Set a gauge metric value.
   */
  setGauge(name: string, value: number, labels: MetricLabel[] = []): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Gauge metric ${name} not registered`);
    }
    if (metric.config.type !== "gauge") {
      throw new Error(`Metric ${name} is not a gauge`);
    }

    const key = labelKey(labels);
    const gaugeMap = this.gauges.get(name)!;
    gaugeMap.set(key, value);

    // Store sample
    this.addSample(name, { value, labels, timestamp: new Date() });
  }

  /**
   * Observe a value for histogram metric.
   */
  observeHistogram(name: string, value: number, labels: MetricLabel[] = []): void {
    const metric = this.metrics.get(name);
    if (!metric) {
      throw new Error(`Histogram metric ${name} not registered`);
    }
    if (metric.config.type !== "histogram") {
      throw new Error(`Metric ${name} is not a histogram`);
    }

    const key = labelKey(labels);
    const histogramMap = this.histograms.get(name)!;
    let histogram = histogramMap.get(key);

    if (!histogram) {
      // Initialize histogram with default buckets
      const buckets = metric.config.buckets || this.config.defaultHistogramBuckets;
      const bucketBoundaries = [...buckets, Infinity];
      histogram = {
        buckets: bucketBoundaries.map((bound) => ({
          upperBound: bound,
          cumulativeCount: 0,
        })),
        sum: 0,
        count: 0,
      };
      histogramMap.set(key, histogram);
    }

    // Update histogram
    histogram.sum += value;
    histogram.count += 1;

    // Update buckets
    for (const bucket of histogram.buckets) {
      if (value <= bucket.upperBound) {
        bucket.cumulativeCount += 1;
      }
    }

    // Store sample
    this.addSample(name, { value, labels, timestamp: new Date() });
  }

  /**
   * Get all metrics as a snapshot.
   */
  getSnapshot(): MetricsSnapshot {
    const startTime = Date.now();
    const allMetrics: AnyMetric[] = [];

    // Collect counters
    for (const [name, counterMap] of this.counters) {
      const config = this.metrics.get(name)!.config;
      for (const [key, value] of counterMap) {
        const labels = this.parseLabelKey(key);
        allMetrics.push({
          name,
          help: config.help,
          type: "counter",
          labels,
          value,
          timestamp: new Date(),
        });
      }
    }

    // Collect gauges
    for (const [name, gaugeMap] of this.gauges) {
      const config = this.metrics.get(name)!.config;
      for (const [key, value] of gaugeMap) {
        const labels = this.parseLabelKey(key);
        allMetrics.push({
          name,
          help: config.help,
          type: "gauge",
          labels,
          value,
          timestamp: new Date(),
        });
      }
    }

    // Collect histograms
    for (const [name, histogramMap] of this.histograms) {
      const config = this.metrics.get(name)!.config;
      for (const [key, histogram] of histogramMap) {
        const labels = this.parseLabelKey(key);
        allMetrics.push({
          name,
          help: config.help,
          type: "histogram",
          labels,
          buckets: histogram.buckets,
          sum: histogram.sum,
          count: histogram.count,
          timestamp: new Date(),
        });
      }
    }

    const collectionDurationMs = Date.now() - startTime;

    return {
      timestamp: new Date(),
      metrics: allMetrics,
      metadata: {
        collectionDurationMs,
        totalMetrics: allMetrics.length,
      },
    };
  }

  /**
   * Query metrics with filters.
   */
  query(query: MetricsQuery): AnyMetric[] {
    const snapshot = this.getSnapshot();
    let results = snapshot.metrics;

    // Filter by names
    if (query.names && query.names.length > 0) {
      const nameSet = new Set(query.names);
      results = results.filter((m) => nameSet.has(m.name));
    }

    // Filter by labels
    if (query.labels && query.labels.length > 0) {
      results = results.filter((m) =>
        query.labels!.every((ql) =>
          m.labels.some((ml) => ml.key === ql.key && ml.value === ql.value)
        )
      );
    }

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Get a specific metric value.
   */
  getMetric(name: string, labels: MetricLabel[] = []): AnyMetric | null {
    const metric = this.metrics.get(name);
    if (!metric) {
      return null;
    }

    const key = labelKey(labels);
    const { type } = metric.config;

    if (type === "counter") {
      const value = this.counters.get(name)?.get(key);
      if (value === undefined) return null;
      return {
        name,
        help: metric.config.help,
        type: "counter",
        labels,
        value,
        timestamp: new Date(),
      };
    } else if (type === "gauge") {
      const value = this.gauges.get(name)?.get(key);
      if (value === undefined) return null;
      return {
        name,
        help: metric.config.help,
        type: "gauge",
        labels,
        value,
        timestamp: new Date(),
      };
    } else if (type === "histogram") {
      const histogram = this.histograms.get(name)?.get(key);
      if (!histogram) return null;
      return {
        name,
        help: metric.config.help,
        type: "histogram",
        labels,
        buckets: histogram.buckets,
        sum: histogram.sum,
        count: histogram.count,
        timestamp: new Date(),
      };
    }

    return null;
  }

  /**
   * Export metrics in Prometheus text format.
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    const snapshot = this.getSnapshot();

    // Group by metric name
    const grouped = new Map<string, AnyMetric[]>();
    for (const metric of snapshot.metrics) {
      const existing = grouped.get(metric.name) || [];
      existing.push(metric);
      grouped.set(metric.name, existing);
    }

    // Export each metric group
    for (const [name, metrics] of grouped) {
      const config = this.metrics.get(name)?.config;
      if (!config) continue;

      lines.push(`# HELP ${name} ${config.help}`);
      lines.push(`# TYPE ${name} ${config.type}`);

      for (const metric of metrics) {
        if (metric.type === "counter" || metric.type === "gauge") {
          const labelStr =
            metric.labels.length > 0
              ? `{${metric.labels.map((l) => `${l.key}="${l.value}"`).join(",")}}`
              : "";
          lines.push(`${name}${labelStr} ${metric.value}`);
        } else if (metric.type === "histogram") {
          const baseLabelStr =
            metric.labels.length > 0
              ? `${metric.labels.map((l) => `${l.key}="${l.value}"`).join(",")},`
              : "";

          // Export buckets
          for (const bucket of metric.buckets) {
            const le = bucket.upperBound === Infinity ? "+Inf" : bucket.upperBound;
            lines.push(
              `${name}_bucket{${baseLabelStr}le="${le}"} ${bucket.cumulativeCount}`
            );
          }

          // Export sum and count
          lines.push(`${name}_sum{${baseLabelStr}} ${metric.sum}`);
          lines.push(`${name}_count{${baseLabelStr}} ${metric.count}`);
        }
      }
    }

    return lines.join("\n");
  }

  /**
   * Clear all metrics.
   */
  clear(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();

    if (this.config.verbose) {
      console.log("[MetricStore] Cleared all metrics");
    }
  }

  /**
   * Prune old samples based on retention policy.
   */
  prune(): void {
    const cutoff = new Date(Date.now() - this.config.retentionMs);
    let pruned = 0;

    for (const [name, stored] of this.metrics) {
      const originalLength = stored.samples.length;
      stored.samples = stored.samples.filter((s) => s.timestamp >= cutoff);
      pruned += originalLength - stored.samples.length;
    }

    if (this.config.verbose && pruned > 0) {
      console.log(`[MetricStore] Pruned ${pruned} old samples`);
    }
  }

  /**
   * Get statistics about the metric store.
   */
  getStats(): {
    registeredMetrics: number;
    totalSamples: number;
    countersCount: number;
    gaugesCount: number;
    histogramsCount: number;
  } {
    let totalSamples = 0;
    for (const stored of this.metrics.values()) {
      totalSamples += stored.samples.length;
    }

    return {
      registeredMetrics: this.metrics.size,
      totalSamples,
      countersCount: this.counters.size,
      gaugesCount: this.gauges.size,
      histogramsCount: this.histograms.size,
    };
  }

  // Private helper methods

  private addSample(name: string, sample: MetricSample): void {
    const stored = this.metrics.get(name);
    if (!stored) return;

    stored.samples.push(sample);

    // Enforce max samples limit
    if (stored.samples.length > this.config.maxSamples) {
      stored.samples = stored.samples.slice(-this.config.maxSamples);
    }
  }

  private parseLabelKey(key: string): MetricLabel[] {
    if (!key) return [];

    return key.split(",").map((pair) => {
      const [key, value] = pair.split("=");
      return { key, value: value.slice(1, -1) }; // Remove quotes
    });
  }
}
