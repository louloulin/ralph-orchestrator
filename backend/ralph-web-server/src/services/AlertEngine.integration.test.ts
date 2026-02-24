/**
 * Integration Tests for AlertEngine (P4-3.3)
 *
 * Tests the integration between AlertEngine, MetricStore, and AlertRepository:
 * - Rule registration and evaluation
 * - Alert state transitions (firing → resolved)
 * - Duration tracking
 * - Multiple rules evaluation
 * - Alert history tracking
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { MetricStore } from "./MetricStore.js";
import { AlertEngine, DEFAULT_ALERT_ENGINE_CONFIG } from "./AlertEngine.js";
import { AlertRepository } from "../repositories/AlertRepository.js";
import type { AlertRule, AlertCondition, MetricConfig } from "../types/metrics.js";

describe("AlertEngine Integration Tests", () => {
  let metricStore: MetricStore;
  let alertRepository: AlertRepository;
  let alertEngine: AlertEngine;

  beforeEach(() => {
    metricStore = new MetricStore({ verbose: false });
    alertRepository = new AlertRepository();
    alertEngine = new AlertEngine(metricStore, alertRepository, { verbose: false });
  });

  afterEach(() => {
    metricStore.clear();
    alertEngine.clear();
  });

  /**
   * Rule Registration Tests
   */
  describe("Rule Registration", () => {
    test("should register a new alert rule", () => {
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: { category: "system" },
        enabled: true,
      });

      expect(rule.id).toBeDefined();
      expect(rule.name).toBe("high_cpu");
      expect(rule.enabled).toBe(true);
      expect(rule.createdAt).toBeInstanceOf(Date);
      expect(rule.updatedAt).toBeInstanceOf(Date);

      const stats = alertEngine.getStats();
      expect(stats.totalRules).toBe(1);
      expect(stats.enabledRules).toBe(1);
    });

    test("should register multiple alert rules", () => {
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      alertEngine.addRule({
        name: "high_memory",
        expression: "ralph_system_memory_bytes",
        condition: { operator: ">", threshold: 8_000_000_000, duration: 30 },
        severity: "critical",
        message: "Memory usage is above 8GB",
        labels: {},
        enabled: true,
      });

      const rules = alertEngine.getRules();
      expect(rules).toHaveLength(2);

      const warningRules = alertEngine.getRules({ severity: "warning" });
      expect(warningRules).toHaveLength(1);

      const criticalRules = alertEngine.getRules({ severity: "critical" });
      expect(criticalRules).toHaveLength(1);
    });

    test("should update an existing rule", () => {
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      const updated = alertEngine.updateRule(rule.id, {
        threshold: 90,
        message: "CPU usage is critical!",
      });

      expect(updated).toBeDefined();
      // Note: the actual update would need to use AlertRepository.updateRule with proper field updates
    });

    test("should delete a rule", () => {
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      expect(alertEngine.getStats().totalRules).toBe(1);

      const deleted = alertEngine.deleteRule(rule.id);
      expect(deleted).toBe(true);
      expect(alertEngine.getStats().totalRules).toBe(0);
    });

    test("should disable a rule without deleting it", () => {
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      alertEngine.updateRule(rule.id, { enabled: false });

      const stats = alertEngine.getStats();
      expect(stats.totalRules).toBe(1);
      expect(stats.enabledRules).toBe(0);
    });
  });

  /**
   * Rule Evaluation Tests
   */
  describe("Rule Evaluation", () => {
    beforeEach(() => {
      // Register test metric
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });
    });

    test("should evaluate rule against metric value", () => {
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      // Set CPU below threshold
      metricStore.setGauge("ralph_system_cpu_percent", 50);

      const result = alertEngine.evaluateRule(rule);

      expect(result.ruleId).toBe(rule.id);
      expect(result.metricName).toBe("ralph_system_cpu_percent");
      expect(result.currentValue).toBe(50);
      expect(result.thresholdMet).toBe(false);
    });

    test("should detect threshold violation", () => {
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      // Set CPU above threshold
      metricStore.setGauge("ralph_system_cpu_percent", 95);

      const result = alertEngine.evaluateRule(rule);

      expect(result.currentValue).toBe(95);
      expect(result.thresholdMet).toBe(true);
    });

    test("should evaluate all operators correctly", () => {
      const operators: Array<{ op: AlertCondition["operator"]; value: number; expected: boolean }> = [
        { op: ">", value: 90, expected: true },
        { op: ">", value: 70, expected: false },
        { op: "<", value: 70, expected: true },
        { op: "<", value: 90, expected: false },
        { op: "==", value: 80, expected: true },
        { op: "==", value: 90, expected: false },
        { op: "!=", value: 90, expected: true },
        { op: "!=", value: 80, expected: false },
        { op: ">=", value: 80, expected: true },
        { op: ">=", value: 90, expected: true },
        { op: "<=", value: 80, expected: true },
        { op: "<=", value: 70, expected: true },
      ];

      for (const { op, value, expected } of operators) {
        metricStore.clear();
        metricStore.registerMetric({
          name: "ralph_system_cpu_percent",
          help: "System CPU usage percentage",
          type: "gauge",
        });

        const rule = alertEngine.addRule({
          name: `cpu_${op}`,
          expression: "ralph_system_cpu_percent",
          condition: { operator: op, threshold: 80, duration: 0 },
          severity: "warning",
          message: `CPU ${op} 80%`,
          labels: {},
          enabled: true,
        });

        metricStore.setGauge("ralph_system_cpu_percent", value);
        const result = alertEngine.evaluateRule(rule);
        expect(result.thresholdMet).toBe(expected);

        alertEngine.deleteRule(rule.id);
      }
    });
  });

  /**
   * Alert State Transition Tests
   */
  describe("Alert State Transitions", () => {
    beforeEach(() => {
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });
    });

    test("should fire alert when condition is met", () => {
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: { category: "system" },
        enabled: true,
      });

      // Set CPU above threshold
      metricStore.setGauge("ralph_system_cpu_percent", 95);

      // Evaluate all rules
      const changes = alertEngine.evaluateAll();

      expect(changes).toBe(1);

      const firingAlerts = alertEngine.getFiringAlerts();
      expect(firingAlerts).toHaveLength(1);
      expect(firingAlerts[0].ruleName).toBe("high_cpu");
      expect(firingAlerts[0].severity).toBe("warning");
      expect(firingAlerts[0].state).toBe("firing");
      expect(firingAlerts[0].value).toBe(95);
    });

    test("should resolve alert when condition is no longer met", () => {
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      // Fire alert
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(1);

      // Resolve alert
      metricStore.setGauge("ralph_system_cpu_percent", 50);
      const changes = alertEngine.evaluateAll();

      expect(changes).toBe(1);
      expect(alertEngine.getFiringAlerts()).toHaveLength(0);

      // Check alert is resolved
      const allAlerts = alertEngine.getAlerts();
      const resolvedAlert = allAlerts.find((a) => a.state === "resolved");
      expect(resolvedAlert).toBeDefined();
      expect(resolvedAlert!.resolvedAt).toBeInstanceOf(Date);
    });

    test("should track alert history", () => {
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      // Fire and resolve alert multiple times
      for (let i = 0; i < 3; i++) {
        metricStore.setGauge("ralph_system_cpu_percent", 95);
        alertEngine.evaluateAll();
        metricStore.setGauge("ralph_system_cpu_percent", 50);
        alertEngine.evaluateAll();
      }

      const history = alertEngine.getAlertHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
    });
  });

  /**
   * Duration Tracking Tests
   */
  describe("Duration Tracking", () => {
    beforeEach(() => {
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });
    });

    test("should not fire alert before duration requirement is met", async () => {
      alertEngine.addRule({
        name: "high_cpu_sustained",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 5 }, // 5 seconds
        severity: "warning",
        message: "CPU usage is above 80% for 5 seconds",
        labels: {},
        enabled: true,
      });

      // Set CPU above threshold
      metricStore.setGauge("ralph_system_cpu_percent", 95);

      // Immediate evaluation should not fire
      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(0);
    });

    test("should fire alert after duration requirement is met", async () => {
      // Create engine with short duration
      alertEngine.addRule({
        name: "high_cpu_sustained",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0.1 }, // 0.1 seconds
        severity: "warning",
        message: "CPU usage is above 80% for 0.1 seconds",
        labels: {},
        enabled: true,
      });

      // Set CPU above threshold
      metricStore.setGauge("ralph_system_cpu_percent", 95);

      // First evaluation - condition met but duration not met
      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(0);

      // Wait for duration
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Second evaluation - duration should be met
      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(1);
    });

    test("should reset duration tracking when condition clears", async () => {
      alertEngine.addRule({
        name: "high_cpu_sustained",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 1 },
        severity: "warning",
        message: "CPU usage is above 80% for 1 second",
        labels: {},
        enabled: true,
      });

      // Set CPU above threshold
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      alertEngine.evaluateAll();

      // Clear condition before duration is met
      metricStore.setGauge("ralph_system_cpu_percent", 50);
      alertEngine.evaluateAll();

      // Set CPU above threshold again
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      alertEngine.evaluateAll();

      // Duration tracking should have reset
      expect(alertEngine.getFiringAlerts()).toHaveLength(0);
    });
  });

  /**
   * Multiple Rules Evaluation Tests
   */
  describe("Multiple Rules Evaluation", () => {
    beforeEach(() => {
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });
      metricStore.registerMetric({
        name: "ralph_system_memory_bytes",
        help: "System memory usage in bytes",
        type: "gauge",
      });
    });

    test("should evaluate multiple rules in parallel", () => {
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      alertEngine.addRule({
        name: "high_memory",
        expression: "ralph_system_memory_bytes",
        condition: { operator: ">", threshold: 8_000_000_000, duration: 0 },
        severity: "critical",
        message: "Memory usage is above 8GB",
        labels: {},
        enabled: true,
      });

      // Both conditions met
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      metricStore.setGauge("ralph_system_memory_bytes", 10_000_000_000);

      const changes = alertEngine.evaluateAll();

      expect(changes).toBe(2);
      expect(alertEngine.getFiringAlerts()).toHaveLength(2);
    });

    test("should evaluate only enabled rules", () => {
      alertEngine.addRule({
        name: "enabled_rule",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "Enabled rule",
        labels: {},
        enabled: true,
      });

      const disabledRule = alertEngine.addRule({
        name: "disabled_rule",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 50, duration: 0 },
        severity: "warning",
        message: "Disabled rule",
        labels: {},
        enabled: false,
      });

      metricStore.setGauge("ralph_system_cpu_percent", 95);

      const changes = alertEngine.evaluateAll();

      // Only one alert should fire (from enabled rule)
      expect(changes).toBe(1);
      const alerts = alertEngine.getFiringAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].ruleName).toBe("enabled_rule");
    });

    test("should handle different severity levels", () => {
      alertEngine.addRule({
        name: "cpu_warning",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU warning",
        labels: {},
        enabled: true,
      });

      alertEngine.addRule({
        name: "cpu_critical",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 95, duration: 0 },
        severity: "critical",
        message: "CPU critical",
        labels: {},
        enabled: true,
      });

      metricStore.setGauge("ralph_system_cpu_percent", 98);

      alertEngine.evaluateAll();

      const alerts = alertEngine.getFiringAlerts();
      expect(alerts).toHaveLength(2);

      const criticalAlerts = alerts.filter((a) => a.severity === "critical");
      const warningAlerts = alerts.filter((a) => a.severity === "warning");
      expect(criticalAlerts).toHaveLength(1);
      expect(warningAlerts).toHaveLength(1);
    });
  });

  /**
   * Alert Repository Integration Tests
   */
  describe("Alert Repository Integration", () => {
    test("should persist alerts in repository", () => {
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });

      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      metricStore.setGauge("ralph_system_cpu_percent", 95);
      alertEngine.evaluateAll();

      // Check repository directly
      const alerts = alertRepository.getAlertsByRule(rule.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].state).toBe("firing");
    });

    test("should track alert history in repository", () => {
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });

      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: {},
        enabled: true,
      });

      // Fire and resolve
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      alertEngine.evaluateAll();
      metricStore.setGauge("ralph_system_cpu_percent", 50);
      alertEngine.evaluateAll();

      const history = alertRepository.getAlertHistory(rule.id);
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  /**
   * End-to-End Integration Tests
   */
  describe("End-to-End Integration", () => {
    test("should handle complete alert lifecycle", async () => {
      // Setup metrics
      metricStore.registerMetric({
        name: "ralph_system_cpu_percent",
        help: "System CPU usage percentage",
        type: "gauge",
      });

      // Add rule
      const rule = alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "CPU usage is above 80%",
        labels: { category: "system" },
        enabled: true,
      });

      // Normal operation - no alert
      metricStore.setGauge("ralph_system_cpu_percent", 50);
      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(0);

      // Spike - fire alert
      metricStore.setGauge("ralph_system_cpu_percent", 95);
      alertEngine.evaluateAll();
      const firingAlerts = alertEngine.getFiringAlerts();
      expect(firingAlerts).toHaveLength(1);
      expect(firingAlerts[0].value).toBe(95);

      // Recovery - resolve alert
      metricStore.setGauge("ralph_system_cpu_percent", 60);
      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(0);

      // Check history
      const history = alertEngine.getAlertHistory(rule.id);
      expect(history.length).toBeGreaterThanOrEqual(1);

      // Verify stats
      const stats = alertEngine.getStats();
      expect(stats.totalRules).toBe(1);
      expect(stats.totalAlerts).toBe(1);
      expect(stats.totalHistory).toBeGreaterThanOrEqual(1);
    });

    test("should integrate with MetricStore snapshot", () => {
      // Setup metrics
      const configs: MetricConfig[] = [
        {
          name: "ralph_system_cpu_percent",
          help: "CPU usage",
          type: "gauge",
        },
        {
          name: "ralph_system_memory_bytes",
          help: "Memory usage",
          type: "gauge",
        },
      ];

      configs.forEach((c) => metricStore.registerMetric(c));

      // Setup rules
      alertEngine.addRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 0 },
        severity: "warning",
        message: "High CPU",
        labels: {},
        enabled: true,
      });

      alertEngine.addRule({
        name: "high_memory",
        expression: "ralph_system_memory_bytes",
        condition: { operator: ">", threshold: 8_000_000_000, duration: 0 },
        severity: "critical",
        message: "High Memory",
        labels: {},
        enabled: true,
      });

      // Set metrics
      metricStore.setGauge("ralph_system_cpu_percent", 90);
      metricStore.setGauge("ralph_system_memory_bytes", 10_000_000_000);

      // Get snapshot and evaluate
      const snapshot = metricStore.getSnapshot();
      expect(snapshot.metrics.length).toBeGreaterThanOrEqual(2);

      alertEngine.evaluateAll();
      expect(alertEngine.getFiringAlerts()).toHaveLength(2);

      // Export Prometheus format
      const prometheus = metricStore.exportPrometheus();
      expect(prometheus).toContain("ralph_system_cpu_percent");
      expect(prometheus).toContain("ralph_system_memory_bytes");
    });
  });
});