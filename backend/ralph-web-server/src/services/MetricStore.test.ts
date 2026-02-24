/**
 * Tests for MetricStore Service
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  MetricStore,
  DEFAULT_METRIC_STORE_CONFIG,
} from "./MetricStore.js";
import type { MetricConfig, MetricLabel, MetricsQuery } from "../types/metrics.js";

describe("MetricStore", () => {
  let store: MetricStore;

  beforeEach(() => {
    store = new MetricStore();
  });

  describe("constructor", () => {
    test("should use default config", () => {
      expect(store).toBeDefined();
      const stats = store.getStats();
      expect(stats.registeredMetrics).toBe(0);
    });

    test("should accept custom config", () => {
      const customStore = new MetricStore({
        maxSamples: 100,
        retentionMs: 60000,
        verbose: true,
      });

      expect(customStore).toBeDefined();
    });
  });

  describe("registerMetric", () => {
    test("should register a counter metric", () => {
      const config: MetricConfig = {
        name: "test_counter",
        help: "A test counter",
        type: "counter",
      };

      store.registerMetric(config);

      const stats = store.getStats();
      expect(stats.countersCount).toBe(1);
      expect(stats.registeredMetrics).toBe(1);
    });

    test("should register a gauge metric", () => {
      const config: MetricConfig = {
        name: "test_gauge",
        help: "A test gauge",
        type: "gauge",
      };

      store.registerMetric(config);

      const stats = store.getStats();
      expect(stats.gaugesCount).toBe(1);
      expect(stats.registeredMetrics).toBe(1);
    });

    test("should register a histogram metric", () => {
      const config: MetricConfig = {
        name: "test_histogram",
        help: "A test histogram",
        type: "histogram",
        buckets: [0.1, 0.5, 1.0],
      };

      store.registerMetric(config);

      const stats = store.getStats();
      expect(stats.histogramsCount).toBe(1);
      expect(stats.registeredMetrics).toBe(1);
    });

    test("should allow re-registering existing metric", () => {
      const config: MetricConfig = {
        name: "test_counter",
        help: "Original help",
        type: "counter",
      };

      store.registerMetric(config);
      store.registerMetric({ ...config, help: "Updated help" });

      const stats = store.getStats();
      expect(stats.countersCount).toBe(1); // Still just 1 counter
    });
  });

  describe("counter operations", () => {
    beforeEach(() => {
      store.registerMetric({
        name: "requests_total",
        help: "Total requests",
        type: "counter",
        labels: ["method", "path"],
      });
    });

    test("should increment counter by default value", () => {
      store.incrementCounter("requests_total");

      const metric = store.getMetric("requests_total");
      expect(metric).toBeDefined();
      if (metric && metric.type === "counter") {
        expect(metric.value).toBe(1);
        expect(metric.labels).toHaveLength(0);
      }
    });

    test("should increment counter by custom value", () => {
      store.incrementCounter("requests_total", 5);

      const metric = store.getMetric("requests_total");
      expect(metric).toBeDefined();
      if (metric && metric.type === "counter") {
        expect(metric.value).toBe(5);
      }
    });

    test("should increment counter with labels", () => {
      const labels: MetricLabel[] = [
        { key: "method", value: "GET" },
        { key: "path", value: "/api/tasks" },
      ];

      store.incrementCounter("requests_total", 1, labels);

      const metric = store.getMetric("requests_total", labels);
      expect(metric).toBeDefined();
      if (metric && metric.type === "counter") {
        expect(metric.value).toBe(1);
        expect(metric.labels).toEqual(labels);
      }
    });

    test("should accumulate counter increments", () => {
      store.incrementCounter("requests_total", 3);
      store.incrementCounter("requests_total", 2);

      const metric = store.getMetric("requests_total");
      expect(metric).toBeDefined();
      if (metric && metric.type === "counter") {
        expect(metric.value).toBe(5);
      }
    });

    test("should track separate counter instances by labels", () => {
      const labels1: MetricLabel[] = [{ key: "method", value: "GET" }];
      const labels2: MetricLabel[] = [{ key: "method", value: "POST" }];

      store.incrementCounter("requests_total", 1, labels1);
      store.incrementCounter("requests_total", 2, labels2);

      const metric1 = store.getMetric("requests_total", labels1);
      const metric2 = store.getMetric("requests_total", labels2);

      expect(metric1).toBeDefined();
      expect(metric2).toBeDefined();

      if (metric1 && metric1.type === "counter") {
        expect(metric1.value).toBe(1);
      }
      if (metric2 && metric2.type === "counter") {
        expect(metric2.value).toBe(2);
      }
    });

    test("should throw error for unregistered counter", () => {
      expect(() => {
        store.incrementCounter("unknown_counter");
      }).toThrow("unknown_counter not registered");
    });

    test("should throw error when incrementing non-counter", () => {
      store.registerMetric({
        name: "test_gauge",
        help: "Test gauge",
        type: "gauge",
      });

      expect(() => {
        store.incrementCounter("test_gauge");
      }).toThrow("is not a counter");
    });
  });

  describe("gauge operations", () => {
    beforeEach(() => {
      store.registerMetric({
        name: "temperature_celsius",
        help: "Temperature in Celsius",
        type: "gauge",
        labels: ["location"],
      });
    });

    test("should set gauge value", () => {
      store.setGauge("temperature_celsius", 23.5);

      const metric = store.getMetric("temperature_celsius");
      expect(metric).toBeDefined();
      if (metric && metric.type === "gauge") {
        expect(metric.value).toBe(23.5);
      }
    });

    test("should set gauge with labels", () => {
      const labels: MetricLabel[] = [{ key: "location", value: "server-room" }];

      store.setGauge("temperature_celsius", 20.0, labels);

      const metric = store.getMetric("temperature_celsius", labels);
      expect(metric).toBeDefined();
      if (metric && metric.type === "gauge") {
        expect(metric.value).toBe(20.0);
        expect(metric.labels).toEqual(labels);
      }
    });

    test("should overwrite gauge value", () => {
      store.setGauge("temperature_celsius", 20.0);
      store.setGauge("temperature_celsius", 25.0);

      const metric = store.getMetric("temperature_celsius");
      expect(metric).toBeDefined();
      if (metric && metric.type === "gauge") {
        expect(metric.value).toBe(25.0);
      }
    });

    test("should track separate gauge instances by labels", () => {
      const labels1: MetricLabel[] = [{ key: "location", value: "room-a" }];
      const labels2: MetricLabel[] = [{ key: "location", value: "room-b" }];

      store.setGauge("temperature_celsius", 20.0, labels1);
      store.setGauge("temperature_celsius", 22.0, labels2);

      const metric1 = store.getMetric("temperature_celsius", labels1);
      const metric2 = store.getMetric("temperature_celsius", labels2);

      expect(metric1).toBeDefined();
      expect(metric2).toBeDefined();

      if (metric1 && metric1.type === "gauge") {
        expect(metric1.value).toBe(20.0);
      }
      if (metric2 && metric2.type === "gauge") {
        expect(metric2.value).toBe(22.0);
      }
    });

    test("should throw error for unregistered gauge", () => {
      expect(() => {
        store.setGauge("unknown_gauge", 10);
      }).toThrow("unknown_gauge not registered");
    });

    test("should throw error when setting non-gauge", () => {
      store.registerMetric({
        name: "test_counter",
        help: "Test counter",
        type: "counter",
      });

      expect(() => {
        store.setGauge("test_counter", 10);
      }).toThrow("is not a gauge");
    });
  });

  describe("histogram operations", () => {
    beforeEach(() => {
      store.registerMetric({
        name: "request_duration_seconds",
        help: "Request duration in seconds",
        type: "histogram",
        buckets: [0.1, 0.5, 1.0, 5.0],
      });
    });

    test("should observe histogram value", () => {
      store.observeHistogram("request_duration_seconds", 0.25);

      const metric = store.getMetric("request_duration_seconds");
      expect(metric).toBeDefined();
      if (metric && metric.type === "histogram") {
        expect(metric.count).toBe(1);
        expect(metric.sum).toBe(0.25);
      }
    });

    test("should calculate bucket counts correctly", () => {
      const values = [0.05, 0.15, 0.75, 1.5, 10.0];
      values.forEach((v) => store.observeHistogram("request_duration_seconds", v));

      const metric = store.getMetric("request_duration_seconds");
      expect(metric).toBeDefined();
      if (metric && metric.type === "histogram") {
        expect(metric.count).toBe(5);

        // Check buckets (cumulative)
        // 0.05 <= 0.1: count 1
        // 0.15 <= 0.5: count 2
        // 0.75 <= 1.0: count 3
        // 1.5 <= 5.0: count 4
        // 10.0 <= Inf: count 5
        expect(metric.buckets[0].cumulativeCount).toBe(1); // <= 0.1
        expect(metric.buckets[1].cumulativeCount).toBe(2); // <= 0.5
        expect(metric.buckets[2].cumulativeCount).toBe(3); // <= 1.0
        expect(metric.buckets[3].cumulativeCount).toBe(4); // <= 5.0
        expect(metric.buckets[4].cumulativeCount).toBe(5); // <= Inf
      }
    });

    test("should observe histogram with labels", () => {
      const labels: MetricLabel[] = [{ key: "endpoint", value: "/api/tasks" }];

      store.observeHistogram("request_duration_seconds", 0.5, labels);

      const metric = store.getMetric("request_duration_seconds", labels);
      expect(metric).toBeDefined();
      if (metric && metric.type === "histogram") {
        expect(metric.count).toBe(1);
        expect(metric.labels).toEqual(labels);
      }
    });

    test("should track separate histogram instances by labels", () => {
      const labels1: MetricLabel[] = [{ key: "endpoint", value: "/api/fast" }];
      const labels2: MetricLabel[] = [{ key: "endpoint", value: "/api/slow" }];

      store.observeHistogram("request_duration_seconds", 0.1, labels1);
      store.observeHistogram("request_duration_seconds", 2.0, labels2);

      const metric1 = store.getMetric("request_duration_seconds", labels1);
      const metric2 = store.getMetric("request_duration_seconds", labels2);

      expect(metric1).toBeDefined();
      expect(metric2).toBeDefined();

      if (metric1 && metric1.type === "histogram") {
        expect(metric1.count).toBe(1);
        expect(metric1.sum).toBe(0.1);
      }
      if (metric2 && metric2.type === "histogram") {
        expect(metric2.count).toBe(1);
        expect(metric2.sum).toBe(2.0);
      }
    });

    test("should use default buckets when not specified", () => {
      store.registerMetric({
        name: "latency_no_buckets",
        help: "Latency without custom buckets",
        type: "histogram",
      });

      store.observeHistogram("latency_no_buckets", 0.5);

      const metric = store.getMetric("latency_no_buckets");
      expect(metric).toBeDefined();
      if (metric && metric.type === "histogram") {
        expect(metric.count).toBe(1);
        expect(metric.buckets).toBeDefined();
        expect(metric.buckets.length).toBeGreaterThan(0);
      }
    });

    test("should throw error for unregistered histogram", () => {
      expect(() => {
        store.observeHistogram("unknown_histogram", 1.0);
      }).toThrow("unknown_histogram not registered");
    });
  });

  describe("getSnapshot", () => {
    test("should return snapshot of all metrics", () => {
      store.registerMetric({
        name: "test_counter",
        help: "Test counter",
        type: "counter",
      });
      store.registerMetric({
        name: "test_gauge",
        help: "Test gauge",
        type: "gauge",
      });

      store.incrementCounter("test_counter", 5);
      store.setGauge("test_gauge", 42);

      const snapshot = store.getSnapshot();

      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.metrics).toHaveLength(2);
      expect(snapshot.metadata.totalMetrics).toBe(2);
      expect(snapshot.metadata.collectionDurationMs).toBeGreaterThanOrEqual(0);
    });

    test("should include metadata in snapshot", () => {
      store.registerMetric({
        name: "test_counter",
        help: "Test counter",
        type: "counter",
      });
      store.incrementCounter("test_counter", 1);

      const snapshot = store.getSnapshot();

      expect(snapshot.metadata.collectionDurationMs).toBeGreaterThanOrEqual(0);
      expect(snapshot.metadata.totalMetrics).toBe(1);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      store.registerMetric({
        name: "http_requests_total",
        help: "HTTP requests",
        type: "counter",
        labels: ["method", "status"],
      });
      store.registerMetric({
        name: "db_connections",
        help: "Database connections",
        type: "gauge",
      });

      store.incrementCounter("http_requests_total", 10, [
        { key: "method", value: "GET" },
        { key: "status", value: "200" },
      ]);
      store.incrementCounter("http_requests_total", 5, [
        { key: "method", value: "POST" },
        { key: "status", value: "201" },
      ]);
      store.setGauge("db_connections", 5);
    });

    test("should query all metrics when no filters", () => {
      const results = store.query({});

      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    test("should filter by metric names", () => {
      const results = store.query({ names: ["http_requests_total"] });

      expect(results.length).toBe(2);
      expect(results.every((m) => m.name === "http_requests_total")).toBe(true);
    });

    test("should filter by labels", () => {
      const results = store.query({
        labels: [{ key: "method", value: "GET" }],
      });

      expect(results.length).toBe(1);
      expect(results[0].labels.some((l) => l.value === "GET")).toBe(true);
    });

    test("should apply limit", () => {
      const results = store.query({ limit: 1 });

      expect(results.length).toBe(1);
    });

    test("should combine multiple filters", () => {
      const results = store.query({
        names: ["http_requests_total"],
        labels: [{ key: "status", value: "200" }],
      });

      expect(results.length).toBe(1);
      expect(results[0].labels.some((l) => l.value === "200")).toBe(true);
    });
  });

  describe("getMetric", () => {
    test("should return null for unregistered metric", () => {
      const metric = store.getMetric("unknown");
      expect(metric).toBeNull();
    });

    test("should return null for non-existent label combination", () => {
      store.registerMetric({
        name: "test_counter",
        help: "Test counter",
        type: "counter",
      });

      const metric = store.getMetric("test_counter", [{ key: "foo", value: "bar" }]);
      expect(metric).toBeNull();
    });
  });

  describe("exportPrometheus", () => {
    test("should export counter in Prometheus format", () => {
      store.registerMetric({
        name: "test_counter",
        help: "A test counter",
        type: "counter",
      });
      store.incrementCounter("test_counter", 42);

      const exported = store.exportPrometheus();

      expect(exported).toContain("# HELP test_counter A test counter");
      expect(exported).toContain("# TYPE test_counter counter");
      expect(exported).toContain("test_counter 42");
    });

    test("should export gauge in Prometheus format", () => {
      store.registerMetric({
        name: "test_gauge",
        help: "A test gauge",
        type: "gauge",
      });
      store.setGauge("test_gauge", 23.5);

      const exported = store.exportPrometheus();

      expect(exported).toContain("# HELP test_gauge A test gauge");
      expect(exported).toContain("# TYPE test_gauge gauge");
      expect(exported).toContain("test_gauge 23.5");
    });

    test("should export histogram in Prometheus format", () => {
      store.registerMetric({
        name: "test_histogram",
        help: "A test histogram",
        type: "histogram",
        buckets: [0.1, 0.5, 1.0],
      });
      store.observeHistogram("test_histogram", 0.25);
      store.observeHistogram("test_histogram", 0.75);

      const exported = store.exportPrometheus();

      expect(exported).toContain("# HELP test_histogram A test histogram");
      expect(exported).toContain("# TYPE test_histogram histogram");
      expect(exported).toContain("test_histogram_bucket{le=\"0.1\"} 0");
      expect(exported).toContain("test_histogram_bucket{le=\"0.5\"} 1");
      expect(exported).toContain("test_histogram_bucket{le=\"1\"} 2"); // JavaScript converts 1.0 to 1
      expect(exported).toContain("test_histogram_sum{} 1"); // Empty labels when no labels provided
      expect(exported).toContain("test_histogram_count{} 2");
    });

    test("should export metrics with labels", () => {
      store.registerMetric({
        name: "http_requests_total",
        help: "HTTP requests",
        type: "counter",
        labels: ["method", "status"],
      });
      store.incrementCounter("http_requests_total", 10, [
        { key: "method", value: "GET" },
        { key: "status", value: "200" },
      ]);

      const exported = store.exportPrometheus();

      expect(exported).toContain('http_requests_total{method="GET",status="200"} 10');
    });
  });

  describe("clear", () => {
    test("should clear all metrics", () => {
      store.registerMetric({
        name: "test_counter",
        help: "Test counter",
        type: "counter",
      });
      store.incrementCounter("test_counter", 5);

      expect(store.getStats().registeredMetrics).toBe(1);

      store.clear();

      expect(store.getStats().registeredMetrics).toBe(0);
      expect(store.getMetric("test_counter")).toBeNull();
    });
  });

  describe("getStats", () => {
    test("should return statistics about the store", () => {
      store.registerMetric({
        name: "counter1",
        help: "Counter 1",
        type: "counter",
      });
      store.registerMetric({
        name: "counter2",
        help: "Counter 2",
        type: "counter",
      });
      store.registerMetric({
        name: "gauge1",
        help: "Gauge 1",
        type: "gauge",
      });
      store.registerMetric({
        name: "histogram1",
        help: "Histogram 1",
        type: "histogram",
      });

      store.incrementCounter("counter1", 1);
      store.incrementCounter("counter2", 1);

      const stats = store.getStats();

      expect(stats.registeredMetrics).toBe(4);
      expect(stats.countersCount).toBe(2);
      expect(stats.gaugesCount).toBe(1);
      expect(stats.histogramsCount).toBe(1);
      expect(stats.totalSamples).toBeGreaterThanOrEqual(2);
    });
  });

  describe("prune", () => {
    test("should prune old samples", async () => {
      const storeWithShortRetention = new MetricStore({
        maxSamples: 1000,
        retentionMs: 100, // 100ms retention
      });

      storeWithShortRetention.registerMetric({
        name: "test_counter",
        help: "Test counter",
        type: "counter",
      });

      // Add samples
      storeWithShortRetention.incrementCounter("test_counter", 1);
      storeWithShortRetention.incrementCounter("test_counter", 1);

      // Wait for samples to age
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Add fresh sample
      storeWithShortRetention.incrementCounter("test_counter", 1);

      // Prune
      storeWithShortRetention.prune();

      const stats = storeWithShortRetention.getStats();
      // Should have fewer samples after pruning
      expect(stats.totalSamples).toBeLessThanOrEqual(2);
    });
  });
});
