/**
 * Monitoring Router Integration Tests (P4-3.5)
 *
 * Tests the tRPC monitoring endpoints for metrics and alerts:
 * - getMetrics: Retrieve all registered metrics
 * - getSnapshot: Get current metrics snapshot
 * - getMetricsByNames: Filter metrics by name
 * - getPrometheusMetrics: Export in Prometheus format
 * - getAlertRules: Retrieve alert rules
 * - getAlertRule: Get specific alert rule
 * - getActiveAlerts: Get active alerts
 * - getAlertsByRule: Get alerts for a rule
 * - getAlertHistory: Get alert history
 *
 * Also tests error handling when MetricStore/AlertEngine are not configured.
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MetricStore } from "../services/MetricStore.js";
import { AlertEngine } from "../services/AlertEngine.js";
import { AlertRepository } from "../repositories/AlertRepository.js";
import { appRouter, createContext } from "./trpc.js";
import { initializeDatabase, getDatabase } from "../db/connection.js";
import { tasks } from "../db/schema.js";
import type { MetricConfig, AlertRule } from "../types/metrics.js";

describe("Monitoring Router Integration Tests", () => {
  let metricStore: MetricStore;
  let alertRepository: AlertRepository;
  let alertEngine: AlertEngine;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    // Initialize database
    initializeDatabase(getDatabase(":memory:"));
    const db = getDatabase();
    db.delete(tasks).run();

    // Create services
    metricStore = new MetricStore({ verbose: false });
    alertRepository = new AlertRepository();
    alertEngine = new AlertEngine(metricStore, alertRepository, { verbose: false });

    // Create context with monitoring services
    const ctx = createContext(
      db,
      undefined, // taskBridge
      undefined, // loopsManager
      undefined, // planningService
      undefined, // loopSupervisor
      undefined, // agentTeamsService
      metricStore,
      alertEngine
    );

    caller = appRouter.createCaller(ctx);
  });

  afterEach(() => {
    metricStore.clear();
    alertEngine.clear();
  });

  /**
   * Metrics Endpoint Tests
   */
  describe("monitoring.getMetrics", () => {
    test("should return empty array when no metrics registered", async () => {
      const metrics = await caller.monitoring.getMetrics();
      expect(metrics).toEqual([]);
    });

    test("should return all registered metrics", async () => {
      // Register metrics
      metricStore.registerMetric({
        name: "ralph_loop_total",
        help: "Total number of loops",
        type: "counter",
      });

      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "CPU usage percentage",
        type: "gauge",
      });

      // Increment/set values
      metricStore.incrementCounter("ralph_loop_total", 5);
      metricStore.setGauge("ralph_system_cpu_percent", 75.5);

      const metrics = await caller.monitoring.getMetrics();

      expect(metrics.length).toBe(2);

      const loopMetric = metrics.find((m) => m.name === "ralph_loop_total");
      expect(loopMetric).toBeDefined();
      expect(loopMetric?.type).toBe("counter");
      expect(loopMetric?.value).toBe(5);

      const cpuMetric = metrics.find((m) => m.name === "ralph_system_cpu_percent");
      expect(cpuMetric).toBeDefined();
      expect(cpuMetric?.type).toBe("gauge");
      expect(cpuMetric?.value).toBe(75.5);
    });

    test("should return histogram metrics with bucket data", async () => {
      metricStore.registerMetric({
        name: "ralph_api_request_duration_seconds",
        help: "API request latency",
        type: "histogram",
        buckets: [0.01, 0.05, 0.1, 0.5, 1],
      });

      // Record some observations
      metricStore.observeHistogram("ralph_api_request_duration_seconds", 0.02);
      metricStore.observeHistogram("ralph_api_request_duration_seconds", 0.08);
      metricStore.observeHistogram("ralph_api_request_duration_seconds", 0.3);

      const metrics = await caller.monitoring.getMetrics();

      expect(metrics.length).toBe(1);
      const histogram = metrics[0];
      expect(histogram.type).toBe("histogram");
      expect(histogram.sum).toBe(0.4); // 0.02 + 0.08 + 0.3
      expect(histogram.count).toBe(3);
    });
  });

  describe("monitoring.getSnapshot", () => {
    test("should return snapshot with metadata", async () => {
      metricStore.registerMetric({
        name: "ralph_loop_active",
        help: "Active loops",
        type: "gauge",
      });
      metricStore.setGauge("ralph_loop_active", 3);

      const snapshot = await caller.monitoring.getSnapshot();

      expect(snapshot.timestamp).toBeInstanceOf(Date);
      expect(snapshot.metrics.length).toBe(1);
      expect(snapshot.metadata.totalMetrics).toBe(1);
      expect(snapshot.metadata.collectionDurationMs).toBeGreaterThanOrEqual(0);
    });

    test("should include all metric types in snapshot", async () => {
      // Counter
      metricStore.registerMetric({
        name: "counter_test",
        help: "Test counter",
        type: "counter",
      });
      metricStore.incrementCounter("counter_test", 10);

      // Gauge
      metricStore.registerMetric({
        name: "gauge_test",
        help: "Test gauge",
        type: "gauge",
      });
      metricStore.setGauge("gauge_test", 42);

      // Histogram
      metricStore.registerMetric({
        name: "histogram_test",
        help: "Test histogram",
        type: "histogram",
        buckets: [1, 5, 10],
      });
      metricStore.observeHistogram("histogram_test", 3);

      const snapshot = await caller.monitoring.getSnapshot();

      expect(snapshot.metrics.length).toBe(3);

      const counterMetric = snapshot.metrics.find((m) => m.name === "counter_test");
      expect(counterMetric?.type).toBe("counter");
      expect(counterMetric?.value).toBe(10);

      const gaugeMetric = snapshot.metrics.find((m) => m.name === "gauge_test");
      expect(gaugeMetric?.type).toBe("gauge");
      expect(gaugeMetric?.value).toBe(42);

      const histogramMetric = snapshot.metrics.find((m) => m.name === "histogram_test");
      expect(histogramMetric?.type).toBe("histogram");
    });
  });

  describe("monitoring.getMetricsByNames", () => {
    test("should filter metrics by names", async () => {
      metricStore.registerMetric({
        name: "ralph_loop_total",
        help: "Total loops",
        type: "counter",
      });
      metricStore.registerMetric({
        name: "ralph_loop_active",
        help: "Active loops",
        type: "gauge",
      });
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "CPU percent",
        type: "gauge",
      });

      metricStore.incrementCounter("ralph_loop_total", 5);
      metricStore.setGauge("ralph_loop_active", 2);
      metricStore.setGauge("ralph_system_cpu_percent", 50);

      const metrics = await caller.monitoring.getMetricsByNames({
        names: ["ralph_loop_total", "ralph_loop_active"],
      });

      expect(metrics.length).toBe(2);
      expect(metrics.map((m) => m.name).sort()).toEqual([
        "ralph_loop_active",
        "ralph_loop_total",
      ]);
    });

    test("should return empty array for non-existent names", async () => {
      const metrics = await caller.monitoring.getMetricsByNames({
        names: ["non_existent_metric"],
      });

      expect(metrics).toEqual([]);
    });
  });

  describe("monitoring.getPrometheusMetrics", () => {
    test("should return Prometheus-formatted metrics", async () => {
      metricStore.registerMetric({
        name: "ralph_loop_total",
        help: "Total number of loops",
        type: "counter",
      });
      metricStore.incrementCounter("ralph_loop_total", 10);

      const prometheusOutput = await caller.monitoring.getPrometheusMetrics();

      expect(typeof prometheusOutput).toBe("string");
      expect(prometheusOutput).toContain("# HELP ralph_loop_total");
      expect(prometheusOutput).toContain("# TYPE ralph_loop_total counter");
      expect(prometheusOutput).toContain("ralph_loop_total 10");
    });

    test("should format histogram metrics correctly", async () => {
      metricStore.registerMetric({
        name: "ralph_api_duration",
        help: "API duration",
        type: "histogram",
        buckets: [0.1, 0.5, 1],
      });
      metricStore.observeHistogram("ralph_api_duration", 0.3);
      metricStore.observeHistogram("ralph_api_duration", 0.7);

      const prometheusOutput = await caller.monitoring.getPrometheusMetrics();

      expect(prometheusOutput).toContain("# TYPE ralph_api_duration histogram");
      expect(prometheusOutput).toContain("ralph_api_duration_bucket");
      expect(prometheusOutput).toContain("ralph_api_duration_sum");
      expect(prometheusOutput).toContain("ralph_api_duration_count");
    });
  });

  /**
   * Alert Endpoint Tests
   */
  describe("monitoring.getAlertRules", () => {
    test("should return empty array when no rules exist", async () => {
      const rules = await caller.monitoring.getAlertRules();
      expect(rules).toEqual([]);
    });

    test("should return all alert rules", async () => {
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU is above 80%",
        labels: { category: "system" },
        enabled: true,
      });

      alertEngine.addRule({
        name: "high_memory",
        expression: "ralph_system_memory_bytes",
        condition: { operator: ">", threshold: 8_000_000_000, duration: 30 },
        severity: "critical",
        message: "Memory is above 8GB",
        labels: { category: "system" },
        enabled: true,
      });

      const rules = await caller.monitoring.getAlertRules();

      expect(rules.length).toBe(2);
      expect(rules.map((r) => r.name).sort()).toEqual(["high_cpu", "high_memory"]);
    });

    test("should include disabled rules", async () => {
      alertEngine.addRule({
        name: "disabled_rule",
        expression: "some_metric",
        condition: { operator: ">", threshold: 100, duration: 0 },
        severity: "info",
        message: "Test",
        labels: {},
        enabled: false,
      });

      const rules = await caller.monitoring.getAlertRules();

      expect(rules.length).toBe(1);
      expect(rules[0].enabled).toBe(false);
    });
  });

  describe("monitoring.getAlertRule", () => {
    test("should return specific rule by id", async () => {
      const rule = alertEngine.addRule({
        name: "test_rule",
        expression: "test_metric",
        condition: { operator: ">", threshold: 50, duration: 30 },
        severity: "warning",
        message: "Test alert",
        labels: {},
        enabled: true,
      });

      const retrieved = await caller.monitoring.getAlertRule({ id: rule.id });

      expect(retrieved.id).toBe(rule.id);
      expect(retrieved.name).toBe("test_rule");
      expect(retrieved.condition.threshold).toBe(50);
    });

    test("should throw NOT_FOUND for non-existent rule", async () => {
      await expect(
        caller.monitoring.getAlertRule({ id: "non-existent-id" })
      ).rejects.toThrow("not found");
    });
  });

  describe("monitoring.getActiveAlerts", () => {
    test("should return empty array when no alerts", async () => {
      const alerts = await caller.monitoring.getActiveAlerts();
      expect(alerts).toEqual([]);
    });

    test("should return firing alerts", async () => {
      // Setup metric and rule
      metricStore.registerMetric({
        name: "cpu_percent",
        help: "CPU percent",
        type: "gauge",
      });

      alertEngine.addRule({
        name: "high_cpu",
        expression: "cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "High CPU",
        labels: {},
        enabled: true,
      });

      // Set value above threshold
      metricStore.setGauge("cpu_percent", 95);

      // Evaluate rules
      alertEngine.evaluateAll();

      const alerts = await caller.monitoring.getActiveAlerts();

      expect(alerts.length).toBe(1);
      expect(alerts[0].ruleName).toBe("high_cpu");
      expect(alerts[0].state).toBe("firing");
      expect(alerts[0].value).toBe(95);
    });

    test("should include resolved alerts if still in active list", async () => {
      // Setup
      metricStore.registerMetric({
        name: "cpu_percent",
        help: "CPU percent",
        type: "gauge",
      });

      alertEngine.addRule({
        name: "high_cpu",
        expression: "cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "High CPU",
        labels: {},
        enabled: true,
      });

      // Trigger alert
      metricStore.setGauge("cpu_percent", 95);
      alertEngine.evaluateAll();

      // Resolve alert
      metricStore.setGauge("cpu_percent", 50);
      alertEngine.evaluateAll();

      const alerts = await caller.monitoring.getActiveAlerts();

      // Alert should be resolved
      const resolvedAlert = alerts.find((a) => a.ruleName === "high_cpu");
      expect(resolvedAlert?.state).toBe("resolved");
    });
  });

  describe("monitoring.getAlertsByRule", () => {
    test("should return alerts for specific rule", async () => {
      // Setup two rules
      metricStore.registerMetric({
        name: "cpu_percent",
        help: "CPU percent",
        type: "gauge",
      });
      metricStore.registerMetric({
        name: "memory_bytes",
        help: "Memory bytes",
        type: "gauge",
      });

      const cpuRule = alertEngine.addRule({
        name: "high_cpu",
        expression: "cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "High CPU",
        labels: {},
        enabled: true,
      });

      alertEngine.addRule({
        name: "high_memory",
        expression: "memory_bytes",
        condition: { operator: ">", threshold: 8_000_000_000, duration: 0 },
        severity: "critical",
        message: "High Memory",
        labels: {},
        enabled: true,
      });

      // Trigger CPU alert only
      metricStore.setGauge("cpu_percent", 90);
      metricStore.setGauge("memory_bytes", 4_000_000_000);
      alertEngine.evaluateAll();

      const cpuAlerts = await caller.monitoring.getAlertsByRule({
        ruleId: cpuRule.id,
      });

      expect(cpuAlerts.length).toBe(1);
      expect(cpuAlerts[0].ruleName).toBe("high_cpu");
    });

    test("should return empty array for rule with no alerts", async () => {
      const rule = alertEngine.addRule({
        name: "inactive_rule",
        expression: "some_metric",
        condition: { operator: ">", threshold: 1000, duration: 0 },
        severity: "info",
        message: "Never triggers",
        labels: {},
        enabled: true,
      });

      const alerts = await caller.monitoring.getAlertsByRule({ ruleId: rule.id });

      expect(alerts).toEqual([]);
    });
  });

  describe("monitoring.getAlertHistory", () => {
    test("should return empty history initially", async () => {
      const history = await caller.monitoring.getAlertHistory({});
      expect(history).toEqual([]);
    });

    test("should return alert history with limit", async () => {
      // Setup
      metricStore.registerMetric({
        name: "cpu_percent",
        help: "CPU percent",
        type: "gauge",
      });

      alertEngine.addRule({
        name: "high_cpu",
        expression: "cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "High CPU",
        labels: {},
        enabled: true,
      });

      // Fire and resolve alert
      metricStore.setGauge("cpu_percent", 95);
      alertEngine.evaluateAll();

      metricStore.setGauge("cpu_percent", 50);
      alertEngine.evaluateAll();

      const history = await caller.monitoring.getAlertHistory({ limit: 10 });

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].ruleName).toBe("high_cpu");
    });
  });

  /**
   * Error Handling Tests
   */
  describe("Error handling when services not configured", () => {
    test("should throw error when MetricStore is not configured", async () => {
      // Create context without metricStore
      const db = getDatabase();
      const ctxWithoutMetrics = createContext(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined, // No metricStore
        alertEngine
      );
      const callerWithoutMetrics = appRouter.createCaller(ctxWithoutMetrics);

      await expect(callerWithoutMetrics.monitoring.getMetrics()).rejects.toThrow(
        "MetricStore is not configured"
      );
    });

    test("should throw error when AlertEngine is not configured", async () => {
      // Create context without alertEngine
      const db = getDatabase();
      const ctxWithoutAlerts = createContext(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        metricStore,
        undefined // No alertEngine
      );
      const callerWithoutAlerts = appRouter.createCaller(ctxWithoutAlerts);

      await expect(callerWithoutAlerts.monitoring.getAlertRules()).rejects.toThrow(
        "AlertEngine is not configured"
      );
    });

    test("should throw error for getAlertRule when AlertEngine not configured", async () => {
      const db = getDatabase();
      const ctxWithoutAlerts = createContext(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        metricStore,
        undefined
      );
      const callerWithoutAlerts = appRouter.createCaller(ctxWithoutAlerts);

      await expect(
        callerWithoutAlerts.monitoring.getAlertRule({ id: "test" })
      ).rejects.toThrow("AlertEngine is not configured");
    });
  });

  /**
   * Integration Tests - Full Flow
   */
  describe("Full monitoring flow integration", () => {
    test("should collect metrics and trigger alerts", async () => {
      // Register system metrics
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "CPU usage percentage",
        type: "gauge",
      });

      metricStore.registerMetric({
        name: "ralph_loop_total",
        help: "Total loops",
        type: "counter",
      });

      // Setup alert rule
      alertEngine.addRule({
        name: "critical_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 90, duration: 0 },
        severity: "critical",
        message: "CPU usage is critically high",
        labels: { priority: "high" },
        enabled: true,
      });

      // Simulate normal operation
      metricStore.setGauge("ralph_system_cpu_percent", 50);
      metricStore.incrementCounter("ralph_loop_total", 5);

      // Check no alerts
      alertEngine.evaluateAll();
      let alerts = await caller.monitoring.getActiveAlerts();
      expect(alerts.length).toBe(0);

      // Simulate high load
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      metricStore.incrementCounter("ralph_loop_total", 3);

      // Check alert fires
      alertEngine.evaluateAll();
      alerts = await caller.monitoring.getActiveAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe("critical");
      expect(alerts[0].value).toBe(95);

      // Verify metrics snapshot
      const snapshot = await caller.monitoring.getSnapshot();
      expect(snapshot.metadata.totalMetrics).toBe(2);

      // Verify Prometheus export
      const prometheus = await caller.monitoring.getPrometheusMetrics();
      expect(prometheus).toContain("ralph_system_cpu_percent 95");
      expect(prometheus).toContain("ralph_loop_total 8");
    });

    test("should handle multiple alert rules with different severities", async () => {
      // Register metric
      metricStore.registerMetric({
        name: "memory_percent",
        help: "Memory usage",
        type: "gauge",
      });

      // Add warning rule
      alertEngine.addRule({
        name: "memory_warning",
        expression: "memory_percent",
        condition: { operator: ">", threshold: 70, duration: 0 },
        severity: "warning",
        message: "Memory usage is elevated",
        labels: {},
        enabled: true,
      });

      // Add critical rule
      alertEngine.addRule({
        name: "memory_critical",
        expression: "memory_percent",
        condition: { operator: ">", threshold: 90, duration: 0 },
        severity: "critical",
        message: "Memory usage is critical",
        labels: {},
        enabled: true,
      });

      // Trigger warning only
      metricStore.setGauge("memory_percent", 75);
      alertEngine.evaluateAll();

      let alerts = await caller.monitoring.getActiveAlerts();
      expect(alerts.length).toBe(1);
      expect(alerts[0].severity).toBe("warning");

      // Trigger critical
      metricStore.setGauge("memory_percent", 95);
      alertEngine.evaluateAll();

      alerts = await caller.monitoring.getActiveAlerts();
      expect(alerts.length).toBe(2);
      expect(alerts.some((a) => a.severity === "warning")).toBe(true);
      expect(alerts.some((a) => a.severity === "critical")).toBe(true);
    });
  });
});
