/**
 * Unit Tests for AlertRepository (P4-3.3)
 *
 * Tests the in-memory persistence layer for alert rules and alerts.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { AlertRepository } from "../repositories/AlertRepository.js";
import type { AlertRule, ActiveAlert, AlertHistoryRecord } from "../types/metrics.js";

describe("AlertRepository", () => {
  let repository: AlertRepository;

  beforeEach(() => {
    repository = new AlertRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  describe("Rule Management", () => {
    test("should create a rule", () => {
      const rule = repository.createRule({
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
    });

    test("should update a rule", () => {
      const rule = repository.createRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage in above 80%",
        labels: {},
        enabled: true,
      });

      const updated = repository.updateRule(rule.id, {
        threshold: 90,
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated!.threshold).toBe(90);
      expect(updated!.enabled).toBe(false);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(rule.updatedAt.getTime());
    });

    test("should delete a rule", () => {
      const rule = repository.createRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage in above 80%",
        labels: {},
        enabled: true,
      });

      expect(repository.deleteRule(rule.id)).toBe(true);
      expect(repository.getRule(rule.id)).toBeNull();
    });

    test("should list rules with filters", () => {
      repository.createRule({
        name: "rule1",
        expression: "metric1",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "Rule 1",
        labels: {},
        enabled: true,
      });

      repository.createRule({
        name: "rule2",
        expression: "metric2",
        condition: { operator: ">", threshold: 90, duration: 30 },
        severity: "critical",
        message: "Rule 2",
        labels: {},
        enabled: false,
      });

      repository.createRule({
        name: "rule3",
        expression: "metric3",
        condition: { operator: "<", threshold: 10, duration: 60 },
        severity: "info",
        message: "Rule 3",
        labels: {},
        enabled: true,
      });

      const allRules = repository.listRules();
      expect(allRules).toHaveLength(3);

      const enabledRules = repository.listRules({ enabled: true });
      expect(enabledRules).toHaveLength(2);

      const criticalRules = repository.listRules({ severity: "critical" });
      expect(criticalRules).toHaveLength(1);
    });

    test("should get enabled rules only", () => {
      repository.createRule({
        name: "enabled_rule",
        expression: "metric1",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "Enabled",
        labels: {},
        enabled: true,
      });

      repository.createRule({
        name: "disabled_rule",
        expression: "metric2",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "Disabled",
        labels: {},
        enabled: false,
      });

      const enabled = repository.getEnabledRules();
      expect(enabled).toHaveLength(1);
      expect(enabled[0].name).toBe("enabled_rule");
    });
  });

  describe("Alert Management", () => {
    let rule: AlertRule;

    beforeEach(() => {
      rule = repository.createRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage in above 80%",
        labels: {},
        enabled: true,
      });
    });

    test("should create an alert", () => {
      const alert = repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      expect(alert.id).toBeDefined();
      expect(alert.ruleId).toBe(rule.id);
      expect(alert.state).toBe("firing");
      expect(alert.startedAt).toBeInstanceOf(Date);
      expect(alert.lastFiredAt).toBeInstanceOf(Date);
    });

    test("should update an alert", () => {
      const alert = repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      const updated = repository.updateAlert(alert.id, {
        value: 98,
        lastFiredAt: new Date(),
      });

      expect(updated).toBeDefined();
      expect(updated!.value).toBe(98);
    });

    test("should resolve an alert", () => {
      const alert = repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      expect(repository.resolveAlert(alert.id)).toBe(true);

      const resolved = repository.getAlert(alert.id);
      expect(resolved).toBeDefined();
      expect(resolved!.state).toBe("resolved");
      expect(resolved!.resolvedAt).toBeInstanceOf(Date);
    });

    test("should get alerts by rule", () => {
      repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      const alerts = repository.getAlertsByRule(rule.id);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].ruleId).toBe(rule.id);
    });

    test("should filter alerts", () => {
      const rule2 = repository.createRule({
        name: "high_memory",
        expression: "ralph_system_memory_bytes",
        condition: { operator: ">", threshold: 8_000_000_000, duration: 60 },
        severity: "critical",
        message: "High memory",
        labels: {},
        enabled: true,
      });

      repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      repository.createAlert({
        ruleId: rule2.id,
        ruleName: rule2.name,
        state: "firing",
        severity: rule2.severity,
        message: rule2.message,
        labels: rule2.labels,
        value: 10_000_000_000,
      });

      const firingAlerts = repository.getActiveAlerts({ state: "firing" });
      expect(firingAlerts).toHaveLength(2);

      const criticalAlerts = repository.getActiveAlerts({ severity: "critical" });
      expect(criticalAlerts).toHaveLength(1);

      const rule1Alerts = repository.getActiveAlerts({ ruleId: rule.id });
      expect(rule1Alerts).toHaveLength(1);
    });

    test("should get firing alerts only", () => {
      repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "resolved",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 50,
      });

      const firing = repository.getFiringAlerts();
      expect(firing).toHaveLength(1);
      expect(firing[0].state).toBe("firing");
    });
  });

  describe("Alert History", () => {
    let rule: AlertRule;

    beforeEach(() => {
      rule = repository.createRule({
        name: "high_cpu",
        expression: "ralph_system_cpu_percent",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "CPU usage in above 80%",
        labels: {},
        enabled: true,
      });
    });

    test("should create history record on alert creation", () => {
      repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      const history = repository.getAlertHistory(rule.id);
      expect(history).toHaveLength(1);
      expect(history[0].ruleId).toBe(rule.id);
      expect(history[0].state).toBe("firing");
    });

    test("should update history record on alert resolution", () => {
      const alert = repository.createAlert({
        ruleId: rule.id,
        ruleName: rule.name,
        state: "firing",
        severity: rule.severity,
        message: rule.message,
        labels: rule.labels,
        value: 95,
      });

      repository.resolveAlert(alert.id);

      const history = repository.getAlertHistory(rule.id);
      const resolvedRecord = history.find((h) => h.state === "resolved");
      expect(resolvedRecord).toBeDefined();
      expect(resolvedRecord!.resolvedAt).toBeDefined();
    });

    test("should limit history results", () => {
      for (let i = 0; i < 5; i++) {
        repository.createAlert({
          ruleId: rule.id,
          ruleName: rule.name,
          state: "firing",
          severity: rule.severity,
          message: `Alert ${i}`,
          labels: rule.labels,
          value: 95 + i,
        });
      }

      const history = repository.getAlertHistory(rule.id, 3);
      expect(history).toHaveLength(3);
    });
  });

  describe("Statistics", () => {
    test("should return correct statistics", () => {
      // Create rules
      repository.createRule({
        name: "rule1",
        expression: "metric1",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "Rule 1",
        labels: {},
        enabled: true,
      });

      repository.createRule({
        name: "rule2",
        expression: "metric2",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "critical",
        message: "Rule 2",
        labels: {},
        enabled: false,
      });

      // Create alerts
      repository.createAlert({
        ruleId: "rule1",
        ruleName: "rule1",
        state: "firing",
        severity: "warning",
        message: "Rule 1",
        labels: {},
        value: 95,
      });

      repository.createAlert({
        ruleId: "rule1",
        ruleName: "rule1",
        state: "resolved",
        severity: "warning",
        message: "Rule 1",
        labels: {},
        value: 50,
      });

      const stats = repository.getStats();

      expect(stats.totalRules).toBe(2);
      expect(stats.enabledRules).toBe(1);
      expect(stats.totalAlerts).toBe(2);
      expect(stats.firingAlerts).toBe(1);
      expect(stats.resolvedAlerts).toBe(1);
    });

    test("should clear all data", () => {
      repository.createRule({
        name: "rule1",
        expression: "metric1",
        condition: { operator: ">", threshold: 80, duration: 60 },
        severity: "warning",
        message: "Rule 1",
        labels: {},
        enabled: true,
      });

      repository.createAlert({
        ruleId: "rule1",
        ruleName: "rule1",
        state: "firing",
        severity: "warning",
        message: "Alert",
        labels: {},
        value: 95,
      });

      repository.clear();

      const stats = repository.getStats();
      expect(stats.totalRules).toBe(0);
      expect(stats.totalAlerts).toBe(0);
      expect(stats.totalHistory).toBe(0);
    });
  });
});