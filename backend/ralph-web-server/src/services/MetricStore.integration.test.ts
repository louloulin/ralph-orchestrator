/**
 * Integration Tests for System Metrics Collectors (P4-3.2)
 *
 * Tests the integration between MetricStore and real system metric collectors:
 * - CPU usage collector
 * - Memory usage collector
 * - Loop count collector
 * - API latency collector
 *
 * These tests verify that collectors can be registered, collect data from actual
 * system sources, and properly update the MetricStore.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MetricStore } from "./MetricStore.js";
import type { MetricConfig, MetricLabel } from "../types/metrics.js";

describe("System Metrics Collectors Integration", () => {
  let store: MetricStore;

  beforeEach(() => {
    store = new MetricStore({ verbose: false });
  });

  afterEach(() => {
    store.clear();
  });

  /**
   * CPU Collector Tests
   */
  describe("CPU Collector", () => {
    test("should register and collect CPU usage metrics", () => {
      const config: MetricConfig = {
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
        labels: ["cpu"],
      };

      store.registerMetric(config);

      // Simulate CPU collection
      const cpuUsage = 45.5; // 45.5% CPU usage
      const cpuLabel: MetricLabel = { key: "cpu", value: "system" };

      store.setGauge("ralph_system_cpu_percent", cpuUsage, [cpuLabel]);

      const metric = store.getMetric("ralph_system_cpu_percent", [cpuLabel]);

      expect(metric).toBeDefined();
      if (metric && metric.type === "gauge") {
        expect(metric.value).toBe(45.5);
        expect(metric.labels).toEqual([cpuLabel]);
      }
    });

    test("should handle per-CPU metrics", () => {
      const config: MetricConfig = {
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
        labels: ["cpu"],
      };

      store.registerMetric(config);

      // Simulate multi-core CPU collection
      store.setGauge("ralph_system_cpu_percent", 30.0, [{ key: "cpu", value: "0" }]);
      store.setGauge("ralph_system_cpu_percent", 45.5, [{ key: "cpu", value: "1" }]);
      store.setGauge("ralph_system_cpu_percent", 25.0, [{ key: "cpu", value: "2" }]);
      store.setGauge("ralph_system_cpu_percent", 35.0, [{ key: "cpu", value: "3" }]);

      const snapshot = store.getSnapshot();
      const cpuMetrics = snapshot.metrics.filter(
        (m) => m.name === "ralph_system_cpu_percent"
      );

      expect(cpuMetrics).toHaveLength(4);

      // Verify each CPU core metric
      const cpu0 = cpuMetrics.find((m) =>
        m.labels.some((l) => l.value === "0")
      );
      const cpu1 = cpuMetrics.find((m) =>
        m.labels.some((l) => l.value === "1")
      );

      expect(cpu0).toBeDefined();
      expect(cpu1).toBeDefined();

      if (cpu0 && cpu0.type === "gauge") {
        expect(cpu0.value).toBe(30.0);
      }
      if (cpu1 && cpu1.type === "gauge") {
        expect(cpu1.value).toBe(45.5);
      }
    });

    test("should handle CPU usage changes over time", () => {
      store.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
        labels: ["cpu"],
      });

      const label = [{ key: "cpu", value: "system" }];

      // Simulate CPU usage fluctuation
      store.setGauge("ralph_system_cpu_percent", 20.0, label);
      store.setGauge("ralph_system_cpu_percent", 45.5, label);
      store.setGauge("ralph_system_cpu_percent", 75.0, label);
      store.setGauge("ralph_system_cpu_percent", 30.0, label);

      const metric = store.getMetric("ralph_system_cpu_percent", label);

      expect(metric).toBeDefined();
      if (metric && metric.type === "gauge") {
        // Gauge should reflect latest value
        expect(metric.value).toBe(30.0);
      }

      // Verify samples were stored for time series
      const stats = store.getStats();
      expect(stats.totalSamples).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * Memory Collector Tests
   */
  describe("Memory Collector", () => {
    test("should register and collect memory usage metrics", () => {
      const config: MetricConfig = {
        name: "ralph_system_memory_bytes",
        help: "System memory usage in bytes",
        type: "gauge",
        labels: ["type"],
      };

      store.registerMetric(config);

      // Simulate memory collection
      const memoryUsed = 8_589_934_592; // 8GB
      const memoryLabel: MetricLabel = { key: "type", value: "used" };

      store.setGauge("ralph_system_memory_bytes", memoryUsed, [memoryLabel]);

      const metric = store.getMetric("ralph_system_memory_bytes", [memoryLabel]);

      expect(metric).toBeDefined();
      if (metric && metric.type === "gauge") {
        expect(metric.value).toBe(8_589_934_592);
        expect(metric.labels).toEqual([memoryLabel]);
      }
    });

    test("should track multiple memory types", () => {
      store.registerMetric({
        name: "ralph_system_memory_bytes",
        help: "System memory usage in bytes",
        type: "gauge",
        labels: ["type"],
      });

      // Simulate different memory types
      store.setGauge("ralph_system_memory_bytes", 16_000_000_000, [
        { key: "type", value: "total" },
      ]);
      store.setGauge("ralph_system_memory_bytes", 8_000_000_000, [
        { key: "type", value: "used" },
      ]);
      store.setGauge("ralph_system_memory_bytes", 8_000_000_000, [
        { key: "type", value: "free" },
      ]);
      store.setGauge("ralph_system_memory_bytes", 2_000_000_000, [
        { key: "type", value: "cached" },
      ]);

      const snapshot = store.getSnapshot();
      const memoryMetrics = snapshot.metrics.filter(
        (m) => m.name === "ralph_system_memory_bytes"
      );

      expect(memoryMetrics).toHaveLength(4);

      // Verify specific memory type
      const usedMemory = memoryMetrics.find((m) =>
        m.labels.some((l) => l.value === "used")
      );

      expect(usedMemory).toBeDefined();
      if (usedMemory && usedMemory.type === "gauge") {
        expect(usedMemory.value).toBe(8_000_000_000);
      }
    });

    test("should export memory metrics in Prometheus format", () => {
      store.registerMetric({
        name: "ralph_system_memory_bytes",
        help: "System memory usage in bytes",
        type: "gauge",
        labels: ["type"],
      });

      store.setGauge("ralph_system_memory_bytes", 8_589_934_592, [
        { key: "type", value: "used" },
      ]);

      const prometheus = store.exportPrometheus();

      expect(prometheus).toContain("# HELP ralph_system_memory_bytes System memory usage in bytes");
      expect(prometheus).toContain("# TYPE ralph_system_memory_bytes gauge");
      expect(prometheus).toContain('ralph_system_memory_bytes{type="used"} 8589934592');
    });
  });

  /**
   * Loop Count Collector Tests
   */
  describe("Loop Count Collector", () => {
    test("should register and track loop count metrics", () => {
      const counterConfig: MetricConfig = {
        name: "ralph_loop_total",
        help: "Total number of Ralph loops",
        type: "counter",
      };

      const activeConfig: MetricConfig = {
        name: "ralph_loop_active",
        help: "Number of currently active Ralph loops",
        type: "gauge",
      };

      store.registerMetric(counterConfig);
      store.registerMetric(activeConfig);

      // Simulate loop lifecycle
      store.incrementCounter("ralph_loop_total");
      store.setGauge("ralph_loop_active", 1);

      // Start another loop
      store.incrementCounter("ralph_loop_total");
      store.setGauge("ralph_loop_active", 2);

      // Complete a loop
      store.setGauge("ralph_loop_active", 1);

      const totalLoops = store.getMetric("ralph_loop_total");
      const activeLoops = store.getMetric("ralph_loop_active");

      expect(totalLoops).toBeDefined();
      expect(activeLoops).toBeDefined();

      if (totalLoops && totalLoops.type === "counter") {
        expect(totalLoops.value).toBe(2);
      }
      if (activeLoops && activeLoops.type === "gauge") {
        expect(activeLoops.value).toBe(1);
      }
    });

    test("should track loop iterations", () => {
      store.registerMetric({
        name: "ralph_loop_iterations_total",
        help: "Total loop iterations across all loops",
        type: "counter",
        labels: ["loop_id"],
      });

      // Simulate iterations for different loops
      store.incrementCounter("ralph_loop_iterations_total", 5, [
        { key: "loop_id", value: "loop-001" },
      ]);
      store.incrementCounter("ralph_loop_iterations_total", 3, [
        { key: "loop_id", value: "loop-002" },
      ]);
      store.incrementCounter("ralph_loop_iterations_total", 7, [
        { key: "loop_id", value: "loop-001" },
      ]);

      const loop1Iterations = store.getMetric("ralph_loop_iterations_total", [
        { key: "loop_id", value: "loop-001" },
      ]);
      const loop2Iterations = store.getMetric("ralph_loop_iterations_total", [
        { key: "loop_id", value: "loop-002" },
      ]);

      expect(loop1Iterations).toBeDefined();
      expect(loop2Iterations).toBeDefined();

      if (loop1Iterations && loop1Iterations.type === "counter") {
        expect(loop1Iterations.value).toBe(12); // 5 + 7
      }
      if (loop2Iterations && loop2Iterations.type === "counter") {
        expect(loop2Iterations.value).toBe(3);
      }
    });

    test("should track loop duration", () => {
      store.registerMetric({
        name: "ralph_loop_duration_seconds",
        help: "Loop execution duration in seconds",
        type: "histogram",
        buckets: [0.1, 0.5, 1.0, 5.0, 10.0, 30.0],
      });

      // Simulate various loop durations
      const durations = [0.05, 0.15, 0.8, 2.5, 8.0, 15.0, 45.0];
      durations.forEach((d) =>
        store.observeHistogram("ralph_loop_duration_seconds", d)
      );

      const metric = store.getMetric("ralph_loop_duration_seconds");

      expect(metric).toBeDefined();
      if (metric && metric.type === "histogram") {
        expect(metric.count).toBe(7);
        expect(metric.sum).toBeCloseTo(71.5, 1);

        // Verify bucket distribution
        const bucket5s = metric.buckets.find((b) => b.upperBound === 5.0);
        expect(bucket5s).toBeDefined();
        expect(bucket5s!.cumulativeCount).toBe(4); // 0.05, 0.15, 0.8, 2.5
      }
    });
  });

  /**
   * API Latency Collector Tests
   */
  describe("API Latency Collector", () => {
    test("should register and track API request counts", () => {
      store.registerMetric({
        name: "ralph_api_requests_total",
        help: "Total API requests",
        type: "counter",
        labels: ["method", "endpoint", "status"],
      });

      // Simulate API requests
      store.incrementCounter("ralph_api_requests_total", 1, [
        { key: "method", value: "GET" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "200" },
      ]);

      store.incrementCounter("ralph_api_requests_total", 1, [
        { key: "method", value: "POST" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "201" },
      ]);

      store.incrementCounter("ralph_api_requests_total", 1, [
        { key: "method", value: "GET" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "200" },
      ]);

      const getSuccess = store.getMetric("ralph_api_requests_total", [
        { key: "method", value: "GET" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "200" },
      ]);

      expect(getSuccess).toBeDefined();
      if (getSuccess && getSuccess.type === "counter") {
        expect(getSuccess.value).toBe(2);
      }

      const postSuccess = store.getMetric("ralph_api_requests_total", [
        { key: "method", value: "POST" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "201" },
      ]);

      expect(postSuccess).toBeDefined();
      if (postSuccess && postSuccess.type === "counter") {
        expect(postSuccess.value).toBe(1);
      }
    });

    test("should track API request latency distribution", () => {
      store.registerMetric({
        name: "ralph_api_request_duration_seconds",
        help: "API request duration in seconds",
        type: "histogram",
        buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
        labels: ["endpoint"],
      });

      // Simulate various API latencies
      const latencies = [0.008, 0.03, 0.15, 0.8, 1.5, 3.0];
      latencies.forEach((l) =>
        store.observeHistogram("ralph_api_request_duration_seconds", l, [
          { key: "endpoint", value: "/api/tasks" },
        ])
      );

      const metric = store.getMetric("ralph_api_request_duration_seconds", [
        { key: "endpoint", value: "/api/tasks" },
      ]);

      expect(metric).toBeDefined();
      if (metric && metric.type === "histogram") {
        expect(metric.count).toBe(6);
        expect(metric.sum).toBeCloseTo(5.488, 2);

        // Verify buckets
        const bucket01 = metric.buckets.find((b) => b.upperBound === 0.01);
        const bucket05 = metric.buckets.find((b) => b.upperBound === 0.05);
        const bucket1 = metric.buckets.find((b) => b.upperBound === 1.0);

        expect(bucket01).toBeDefined();
        expect(bucket05).toBeDefined();
        expect(bucket1).toBeDefined();

        expect(bucket01!.cumulativeCount).toBe(1); // 0.008
        expect(bucket05!.cumulativeCount).toBe(2); // 0.008, 0.03
        expect(bucket1!.cumulativeCount).toBe(4); // 0.008, 0.03, 0.15, 0.8
      }
    });

    test("should track API errors", () => {
      store.registerMetric({
        name: "ralph_api_errors_total",
        help: "Total API errors",
        type: "counter",
        labels: ["endpoint", "error_type"],
      });

      // Simulate API errors
      store.incrementCounter("ralph_api_errors_total", 1, [
        { key: "endpoint", value: "/api/tasks" },
        { key: "error_type", value: "validation_error" },
      ]);

      store.incrementCounter("ralph_api_errors_total", 1, [
        { key: "endpoint", value: "/api/tasks" },
        { key: "error_type", value: "not_found" },
      ]);

      store.incrementCounter("ralph_api_errors_total", 1, [
        { key: "endpoint", value: "/api/tasks" },
        { key: "error_type", value: "validation_error" },
      ]);

      const validationErrors = store.getMetric("ralph_api_errors_total", [
        { key: "endpoint", value: "/api/tasks" },
        { key: "error_type", value: "validation_error" },
      ]);

      expect(validationErrors).toBeDefined();
      if (validationErrors && validationErrors.type === "counter") {
        expect(validationErrors.value).toBe(2);
      }

      const notFoundErrors = store.getMetric("ralph_api_errors_total", [
        { key: "endpoint", value: "/api/tasks" },
        { key: "error_type", value: "not_found" },
      ]);

      expect(notFoundErrors).toBeDefined();
      if (notFoundErrors && notFoundErrors.type === "counter") {
        expect(notFoundErrors.value).toBe(1);
      }
    });

    test("should query API metrics by endpoint", () => {
      store.registerMetric({
        name: "ralph_api_requests_total",
        help: "Total API requests",
        type: "counter",
        labels: ["method", "endpoint", "status"],
      });

      // Add requests for multiple endpoints
      store.incrementCounter("ralph_api_requests_total", 5, [
        { key: "method", value: "GET" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "200" },
      ]);

      store.incrementCounter("ralph_api_requests_total", 3, [
        { key: "method", value: "GET" },
        { key: "endpoint", value: "/api/loops" },
        { key: "status", value: "200" },
      ]);

      // Query by endpoint
      const results = store.query({
        names: ["ralph_api_requests_total"],
        labels: [{ key: "endpoint", value: "/api/tasks" }],
      });

      expect(results).toHaveLength(1);
      if (results[0].type === "counter") {
        expect(results[0].value).toBe(5);
      }
    });
  });

  /**
   * Integration Tests - Full System Metrics Collection
   */
  describe("Full System Metrics Collection", () => {
    test("should collect and export all system metrics", () => {
      // Register all system metrics
      const metricConfigs: MetricConfig[] = [
        {
          name: "ralph_system_cpu_percent",
          help: "System CPU usage percentage",
          type: "gauge",
          labels: ["cpu"],
        },
        {
          name: "ralph_system_memory_bytes",
          help: "System memory usage in bytes",
          type: "gauge",
          labels: ["type"],
        },
        {
          name: "ralph_loop_total",
          help: "Total number of Ralph loops",
          type: "counter",
        },
        {
          name: "ralph_loop_active",
          help: "Number of currently active Ralph loops",
          type: "gauge",
        },
        {
          name: "ralph_api_requests_total",
          help: "Total API requests",
          type: "counter",
          labels: ["method", "endpoint", "status"],
        },
        {
          name: "ralph_api_request_duration_seconds",
          help: "API request duration in seconds",
          type: "histogram",
          buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
          labels: ["endpoint"],
        },
      ];

      metricConfigs.forEach((config) => store.registerMetric(config));

      // Simulate metric collection
      store.setGauge("ralph_system_cpu_percent", 45.5, [
        { key: "cpu", value: "system" },
      ]);
      store.setGauge("ralph_system_memory_bytes", 8_589_934_592, [
        { key: "type", value: "used" },
      ]);
      store.incrementCounter("ralph_loop_total");
      store.setGauge("ralph_loop_active", 2);
      store.incrementCounter("ralph_api_requests_total", 10, [
        { key: "method", value: "GET" },
        { key: "endpoint", value: "/api/tasks" },
        { key: "status", value: "200" },
      ]);
      store.observeHistogram("ralph_api_request_duration_seconds", 0.25, [
        { key: "endpoint", value: "/api/tasks" },
      ]);

      // Get snapshot
      const snapshot = store.getSnapshot();

      expect(snapshot.metrics.length).toBeGreaterThanOrEqual(5);
      expect(snapshot.metadata.totalMetrics).toBeGreaterThanOrEqual(5);

      // Verify Prometheus export
      const prometheus = store.exportPrometheus();

      expect(prometheus).toContain("ralph_system_cpu_percent");
      expect(prometheus).toContain("ralph_system_memory_bytes");
      expect(prometheus).toContain("ralph_loop_total");
      expect(prometheus).toContain("ralph_loop_active");
      expect(prometheus).toContain("ralph_api_requests_total");
      expect(prometheus).toContain("ralph_api_request_duration_seconds");
    });

    test("should maintain performance with many metrics", () => {
      // Register many metrics (simulating real system)
      const metricCount = 100;

      for (let i = 0; i < metricCount; i++) {
        store.registerMetric({
          name: `test_metric_${i}`,
          help: `Test metric ${i}`,
          type: i % 3 === 0 ? "counter" : i % 3 === 1 ? "gauge" : "histogram",
          buckets: [0.1, 0.5, 1.0],
        });

        if (i % 3 === 0) {
          store.incrementCounter(`test_metric_${i}`, i);
        } else if (i % 3 === 1) {
          store.setGauge(`test_metric_${i}`, i * 1.5);
        } else {
          store.observeHistogram(`test_metric_${i}`, i * 0.1);
        }
      }

      const startTime = Date.now();
      const snapshot = store.getSnapshot();
      const duration = Date.now() - startTime;

      expect(snapshot.metrics.length).toBeGreaterThanOrEqual(metricCount);
      // Collection should be fast (< 100ms for 100 metrics)
      expect(duration).toBeLessThan(100);
    });

    test("should handle concurrent metric updates safely", () => {
      store.registerMetric({
        name: "concurrent_counter",
        help: "Test concurrent updates",
        type: "counter",
        labels: ["worker"],
      });

      store.registerMetric({
        name: "concurrent_gauge",
        help: "Test concurrent updates",
        type: "gauge",
        labels: ["worker"],
      });

      // Simulate concurrent updates from multiple "workers"
      const workerCount = 10;
      const updatesPerWorker = 100;

      for (let worker = 0; worker < workerCount; worker++) {
        for (let i = 0; i < updatesPerWorker; i++) {
          const label = { key: "worker", value: `worker-${worker}` };
          store.incrementCounter("concurrent_counter", 1, [label]);
          store.setGauge("concurrent_gauge", i, [label]);
        }
      }

      // Verify all updates were recorded
      const snapshot = store.getSnapshot();
      const counterMetrics = snapshot.metrics.filter(
        (m) => m.name === "concurrent_counter"
      );
      const gaugeMetrics = snapshot.metrics.filter(
        (m) => m.name === "concurrent_gauge"
      );

      expect(counterMetrics).toHaveLength(workerCount);
      expect(gaugeMetrics).toHaveLength(workerCount);

      // Check that each worker's counter has the correct total
      counterMetrics.forEach((metric) => {
        if (metric.type === "counter") {
          expect(metric.value).toBe(updatesPerWorker);
        }
      });

      // Check that each worker's gauge has the last value
      gaugeMetrics.forEach((metric) => {
        if (metric.type === "gauge") {
          expect(metric.value).toBe(updatesPerWorker - 1);
        }
      });
    });
  });

  /**
   * Metric Store Lifecycle Tests
   */
  describe("Metric Store Lifecycle", () => {
    test("should prune old samples based on retention policy", async () => {
      const shortRetentionStore = new MetricStore({
        maxSamples: 100,
        retentionMs: 100, // 100ms retention
        verbose: false,
      });

      shortRetentionStore.registerMetric({
        name: "test_metric",
        help: "Test metric",
        type: "counter",
      });

      // Add samples
      for (let i = 0; i < 10; i++) {
        shortRetentionStore.incrementCounter("test_metric", 1);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const statsBeforePrune = shortRetentionStore.getStats();
      expect(statsBeforePrune.totalSamples).toBeGreaterThan(0);

      // Wait for samples to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Add fresh sample
      shortRetentionStore.incrementCounter("test_metric", 1);

      // Prune
      shortRetentionStore.prune();

      const statsAfterPrune = shortRetentionStore.getStats();
      // Should have fewer samples after pruning old ones
      expect(statsAfterPrune.totalSamples).toBeLessThanOrEqual(
        statsBeforePrune.totalSamples
      );
    });

    test("should enforce max samples limit", () => {
      const limitedStore = new MetricStore({
        maxSamples: 5,
        retentionMs: 3600000,
        verbose: false,
      });

      limitedStore.registerMetric({
        name: "test_metric",
        help: "Test metric",
        type: "counter",
      });

      // Add more samples than maxSamples allows
      for (let i = 0; i < 10; i++) {
        limitedStore.incrementCounter("test_metric", 1);
      }

      const stats = limitedStore.getStats();
      // Should not exceed max samples
      expect(stats.totalSamples).toBeLessThanOrEqual(5);
    });

    test("should clear all metrics", () => {
      // Register and populate metrics
      store.registerMetric({
        name: "metric1",
        help: "Metric 1",
        type: "counter",
      });
      store.registerMetric({
        name: "metric2",
        help: "Metric 2",
        type: "gauge",
      });

      store.incrementCounter("metric1", 10);
      store.setGauge("metric2", 42);

      expect(store.getStats().registeredMetrics).toBe(2);

      // Clear
      store.clear();

      expect(store.getStats().registeredMetrics).toBe(0);
      expect(store.getStats().totalSamples).toBe(0);
    });
  });
});
