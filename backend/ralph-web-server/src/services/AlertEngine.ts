/**
 * AlertEngine Service
 *
 * Evaluates alert rules against metrics and manages alert lifecycle (P4-3.3).
 *
 * Features:
 * - Rule evaluation against MetricStore
 * - Alert state transitions (firing → resolved)
 * - Duration tracking (for rule.duration)
 * - Alert deduplication
 * - Integration with AlertRepository for persistence
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import { MetricStore } from "../services/MetricStore.js";
import { AlertRepository } from "../repositories/AlertRepository.js";
import type {
  AlertRule,
  AlertCondition,
  AnyMetric,
  ActiveAlert,
  MetricLabel,
} from "../types/metrics.js";

/**
 * Configuration for the alert engine.
 */
export interface AlertEngineConfig {
  /** Enable verbose logging */
  verbose: boolean;
  /** Maximum number of alerts to retain per rule */
  maxAlertsPerRule: number;
}

/**
 * Alert notification callback type.
 * Called when an alert fires or resolves.
 */
export type AlertNotificationCallback = (alert: ActiveAlert) => void | Promise<void>;

/**
 * Default alert engine configuration.
 */
export const DEFAULT_ALERT_ENGINE_CONFIG: AlertEngineConfig = {
  verbose: false,
  maxAlertsPerRule: 100,
};

/**
 * Alert rule evaluation result.
 */
interface EvaluationResult {
  ruleId: string;
  ruleName: string;
  metricName: string;
  currentValue: number;
  condition: AlertCondition;
  thresholdMet: boolean;
  durationMet: boolean; // Condition has been true for required duration
}

/**
 * Alert state tracking for duration calculations.
 */
interface RuleState {
  ruleId: string;
  conditionMetSince: Date | null; // When condition first became true
  lastEvaluation: Date;
  lastValue: number;
  evaluationCount: number;
}

/**
 * AlertEngine Service
 *
 * Evaluates rules, manages alert lifecycle, and tracks state transitions.
 */
export class AlertEngine {
  private config: AlertEngineConfig;
  private metricStore: MetricStore;
  private repository: AlertRepository;
  private ruleStates: Map<string, RuleState> = new Map();
  private notificationCallbacks: AlertNotificationCallback[] = [];

  constructor(
    metricStore: MetricStore,
    repository: AlertRepository,
    config: Partial<AlertEngineConfig> = {}
  ) {
    this.config = { ...DEFAULT_ALERT_ENGINE_CONFIG, ...config };
    this.metricStore = metricStore;
    this.repository = repository;
  }

  /**
   * Register a notification callback to be called when alerts fire or resolve.
   */
  onAlert(callback: AlertNotificationCallback): void {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Unregister a notification callback.
   */
  offAlert(callback: AlertNotificationCallback): void {
    const index = this.notificationCallbacks.indexOf(callback);
    if (index !== -1) {
      this.notificationCallbacks.splice(index, 1);
    }
  }

  /**
   * Notify all registered callbacks of an alert event.
   */
  private async notifyAlert(alert: ActiveAlert): Promise<void> {
    for (const callback of this.notificationCallbacks) {
      try {
        const result = callback(alert);
        if (result instanceof Promise) {
          await result;
        }
      } catch (error) {
        if (this.config.verbose) {
          console.error("[AlertEngine] Notification callback error:", error);
        }
      }
    }
  }

  /**
   * Evaluate all enabled rules against current metrics.
   *
   * Returns the number of alerts that changed state.
   */
  evaluateAll(): number {
    const rules = this.repository.getEnabledRules();
    let stateChanges = 0;

    for (const rule of rules) {
      const result = this.evaluateRule(rule);
      stateChanges += this.processEvaluationResultSync(result);
    }

    return stateChanges;
  }

  /**
   * Evaluate all enabled rules and notify callbacks (async).
   *
   * Returns the number of alerts that changed state.
   */
  async evaluateAllAsync(): Promise<number> {
    const rules = this.repository.getEnabledRules();
    let stateChanges = 0;

    for (const rule of rules) {
      const result = this.evaluateRule(rule);
      stateChanges += await this.processEvaluationResult(result);
    }

    return stateChanges;
  }

  /**
   * Evaluate a single rule.
   */
  evaluateRule(rule: AlertRule): EvaluationResult {
    // Parse metric name from expression (e.g., "ralph_system_cpu_percent")
    const metricName = rule.expression.trim();

    // Get current metric value
    const metric = this.metricStore.getMetric(metricName);
    const currentValue = metric && (metric.type === "counter" || metric.type === "gauge")
      ? metric.value
      : 0;

    // Check if condition is met
    const thresholdMet = this.checkCondition(
      currentValue,
      rule.condition.operator,
      rule.condition.threshold
    );

    // Check if duration requirement is met
    const durationMet = this.checkDuration(rule.id, thresholdMet, rule.condition.duration);

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      metricName,
      currentValue,
      condition: rule.condition,
      thresholdMet,
      durationMet,
    };
  }

  /**
   * Process evaluation result and update alert state (async with notifications).
   *
   * Returns 1 if alert state changed, 0 otherwise.
   */
  private async processEvaluationResult(result: EvaluationResult): Promise<number> {
    const { ruleId, ruleName, thresholdMet, durationMet, currentValue } = result;

    // Get existing alert for this rule
    const existingAlerts = this.repository.getAlertsByRule(ruleId);
    const activeAlert = existingAlerts.find((a) => a.state === "firing");

    if (durationMet) {
      // Condition met for required duration → fire alert
      if (!activeAlert) {
        // No active alert → create new one
        const rule = this.repository.getRule(ruleId);
        if (rule) {
          const newAlert = this.repository.createAlert({
            ruleId,
            ruleName,
            state: "firing",
            severity: rule.severity,
            message: rule.message,
            labels: rule.labels,
            value: currentValue,
          });

          if (this.config.verbose) {
            console.log(`[AlertEngine] Alert fired: ${ruleName} (value: ${currentValue})`);
          }

          // Notify callbacks
          await this.notifyAlert(newAlert);

          return 1;
        }
      } else {
        // Alert already firing → update lastFiredAt
        this.repository.updateAlert(activeAlert.id, {
          lastFiredAt: new Date(),
          value: currentValue,
        });
      }
    } else {
      // Condition not met → resolve any firing alert
      if (activeAlert) {
        const resolved = this.repository.resolveAlert(activeAlert.id);
        if (resolved) {
          // Get the updated alert with resolved state
          const resolvedAlert = this.repository.getAlert(activeAlert.id);

          if (this.config.verbose) {
            console.log(`[AlertEngine] Alert resolved: ${ruleName}`);
          }

          // Notify callbacks
          if (resolvedAlert) {
            await this.notifyAlert(resolvedAlert);
          }

          return 1;
        }
      }
    }

    return 0;
  }

  /**
   * Process evaluation result and update alert state (sync, no notifications).
   * For backwards compatibility.
   *
   * Returns 1 if alert state changed, 0 otherwise.
   */
  private processEvaluationResultSync(result: EvaluationResult): number {
    const { ruleId, ruleName, thresholdMet, durationMet, currentValue } = result;

    // Get existing alert for this rule
    const existingAlerts = this.repository.getAlertsByRule(ruleId);
    const activeAlert = existingAlerts.find((a) => a.state === "firing");

    if (durationMet) {
      // Condition met for required duration → fire alert
      if (!activeAlert) {
        // No active alert → create new one
        const rule = this.repository.getRule(ruleId);
        if (rule) {
          this.repository.createAlert({
            ruleId,
            ruleName,
            state: "firing",
            severity: rule.severity,
            message: rule.message,
            labels: rule.labels,
            value: currentValue,
          });

          if (this.config.verbose) {
            console.log(`[AlertEngine] Alert fired: ${ruleName} (value: ${currentValue})`);
          }

          return 1;
        }
      } else {
        // Alert already firing → update lastFiredAt
        this.repository.updateAlert(activeAlert.id, {
          lastFiredAt: new Date(),
          value: currentValue,
        });
      }
    } else {
      // Condition not met → resolve any firing alert
      if (activeAlert) {
        const resolved = this.repository.resolveAlert(activeAlert.id);
        if (resolved) {
          if (this.config.verbose) {
            console.log(`[AlertEngine] Alert resolved: ${ruleName}`);
          }
          return 1;
        }
      }
    }

    return 0;
  }

  /**
   * Check if a metric value meets a condition.
   */
  private checkCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case ">":
        return value > threshold;
      case "<":
        return value < threshold;
      case "==":
        return value === threshold;
      case "!=":
        return value !== threshold;
      case ">=":
        return value >= threshold;
      case "<=":
        return value <= threshold;
      default:
        return false;
    }
  }

  /**
   * Check if condition has been true for required duration.
   */
  private checkDuration(ruleId: string, conditionMet: boolean, durationSeconds: number): boolean {
    const now = new Date();
    const state = this.ruleStates.get(ruleId) || {
      ruleId,
      conditionMetSince: null,
      lastEvaluation: now,
      lastValue: 0,
      evaluationCount: 0,
    };

    // Update state
    state.lastEvaluation = now;
    state.evaluationCount++;

    if (conditionMet) {
      if (!state.conditionMetSince) {
        // Condition just became true
        state.conditionMetSince = now;
      }

      // Check if duration requirement is met
      if (state.conditionMetSince) {
        const elapsedMs = now.getTime() - state.conditionMetSince.getTime();
        const elapsedSeconds = elapsedMs / 1000;
        return elapsedSeconds >= durationSeconds;
      }
    } else {
      // Condition not met → reset
      state.conditionMetSince = null;
    }

    this.ruleStates.set(ruleId, state);
    return false;
  }

  /**
   * Add a new alert rule.
   */
  addRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt">): AlertRule {
    const newRule = this.repository.createRule(rule);

    // Initialize rule state
    this.ruleStates.set(newRule.id, {
      ruleId: newRule.id,
      conditionMetSince: null,
      lastEvaluation: new Date(),
      lastValue: 0,
      evaluationCount: 0,
    });

    if (this.config.verbose) {
      console.log(`[AlertEngine] Rule added: ${newRule.name}`);
    }

    return newRule;
  }

  /**
   * Update an existing alert rule.
   */
  updateRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
    const updated = this.repository.updateRule(id, updates);

    if (updated && this.config.verbose) {
      console.log(`[AlertEngine] Rule updated: ${updated.name}`);
    }

    return updated;
  }

  /**
   * Delete an alert rule.
   */
  deleteRule(id: string): boolean {
    // Clean up rule state
    this.ruleStates.delete(id);

    // Resolve any firing alerts for this rule
    const alerts = this.repository.getAlertsByRule(id);
    alerts.forEach((alert) => this.repository.resolveAlert(alert.id));

    // Delete rule
    const deleted = this.repository.deleteRule(id);

    if (deleted && this.config.verbose) {
      console.log(`[AlertEngine] Rule deleted: ${id}`);
    }

    return deleted;
  }

  /**
   * Get all alert rules.
   */
  getRules(filter?: { enabled?: boolean; severity?: string }): AlertRule[] {
    return this.repository.listRules(filter);
  }

  /**
   * Get a single rule.
   */
  getRule(id: string): AlertRule | null {
    return this.repository.getRule(id);
  }

  /**
   * Get all active alerts.
   */
  getAlerts(filter?: { state?: string; severity?: string; ruleId?: string }): ActiveAlert[] {
    return this.repository.getActiveAlerts(filter);
  }

  /**
   * Get firing alerts only.
   */
  getFiringAlerts(): ActiveAlert[] {
    return this.repository.getFiringAlerts();
  }

  /**
   * Get alert history.
   */
  getAlertHistory(ruleId?: string, limit?: number): any[] {
    return this.repository.getAlertHistory(ruleId, limit);
  }

  /**
   * Resolve an alert manually.
   */
  resolveAlert(alertId: string): boolean {
    return this.repository.resolveAlert(alertId);
  }

  /**
   * Get statistics about the alert engine.
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    totalAlerts: number;
    firingAlerts: number;
    resolvedAlerts: number;
    totalHistory: number;
  } {
    return this.repository.getStats();
  }

  /**
   * Clear all rules, alerts, and state.
   */
  clear(): void {
    this.repository.clear();
    this.ruleStates.clear();

    if (this.config.verbose) {
      console.log("[AlertEngine] Cleared all rules and alerts");
    }
  }
}