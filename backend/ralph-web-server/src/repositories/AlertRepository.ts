/**
 * AlertRepository Service
 *
 * Handles persistence of alert rules and active alerts (P4-3.3).
 * In-memory storage with CRUD operations for alert management.
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import type {
  AlertRule,
  ActiveAlert,
  AlertHistoryRecord,
  AlertState,
} from "../types/metrics.js";

/**
 * AlertRepository stores and manages alert rules and alerts.
 */
export class AlertRepository {
  private rules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, ActiveAlert> = new Map();
  private alertHistory: Map<string, AlertHistoryRecord> = new Map();
  private historyByRule: Map<string, string[]> = new Map(); // ruleId -> history IDs

  /**
   * Create a new alert rule.
   */
  createRule(rule: Omit<AlertRule, "id" | "createdAt" | "updatedAt">): AlertRule {
    const id = `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();

    const newRule: AlertRule = {
      ...rule,
      id,
      createdAt: now,
      updatedAt: now,
    };

    this.rules.set(id, newRule);
    return newRule;
  }

  /**
   * Update an existing alert rule.
   */
  updateRule(id: string, updates: Partial<AlertRule>): AlertRule | null {
    const existing = this.rules.get(id);
    if (!existing) return null;

    // Ensure updatedAt is always newer than the existing updatedAt
    const updatedAt = new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1));

    const updated: AlertRule = {
      ...existing,
      ...updates,
      id, // Preserve ID
      createdAt: existing.createdAt, // Preserve creation time
      updatedAt,
    };

    this.rules.set(id, updated);
    return updated;
  }

  /**
   * Delete an alert rule.
   */
  deleteRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Get a single alert rule.
   */
  getRule(id: string): AlertRule | null {
    return this.rules.get(id) || null;
  }

  /**
   * List all alert rules, optionally filtered.
   */
  listRules(filter?: {
    enabled?: boolean;
    severity?: string;
  }): AlertRule[] {
    let rules = Array.from(this.rules.values());

    if (filter?.enabled !== undefined) {
      rules = rules.filter((r) => r.enabled === filter.enabled);
    }

    if (filter?.severity) {
      rules = rules.filter((r) => r.severity === filter.severity);
    }

    return rules;
  }

  /**
   * Get enabled rules only.
   */
  getEnabledRules(): AlertRule[] {
    return this.listRules({ enabled: true });
  }

  /**
   * Create a new active alert.
   */
  createAlert(alert: Omit<ActiveAlert, "id" | "startedAt" | "lastFiredAt">): ActiveAlert {
    const id = `alert-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();

    const newAlert: ActiveAlert = {
      ...alert,
      id,
      startedAt: now,
      lastFiredAt: now,
      state: alert.state, // Respect the passed state
    };

    this.activeAlerts.set(id, newAlert);

    // Create history record
    this.createHistoryRecord(newAlert);

    return newAlert;
  }

  /**
   * Update an existing active alert.
   */
  updateAlert(id: string, updates: Partial<ActiveAlert>): ActiveAlert | null {
    const existing = this.activeAlerts.get(id);
    if (!existing) return null;

    const updated: ActiveAlert = {
      ...existing,
      ...updates,
      id, // Preserve ID
      startedAt: existing.startedAt, // Preserve start time
    };

    this.activeAlerts.set(id, updated);

    // If state changed, update history
    if (updates.state && updates.state !== existing.state) {
      this.updateHistoryRecord(updated);
    }

    return updated;
  }

  /**
   * Get a single active alert.
   */
  getAlert(id: string): ActiveAlert | null {
    return this.activeAlerts.get(id) || null;
  }

  /**
   * Get active alerts by rule ID.
   */
  getAlertsByRule(ruleId: string): ActiveAlert[] {
    return Array.from(this.activeAlerts.values()).filter(
      (a) => a.ruleId === ruleId
    );
  }

  /**
   * Get all active alerts, optionally filtered.
   */
  getActiveAlerts(filter?: {
    state?: AlertState;
    severity?: string;
    ruleId?: string;
  }): ActiveAlert[] {
    let alerts = Array.from(this.activeAlerts.values());

    if (filter?.state) {
      alerts = alerts.filter((a) => a.state === filter.state);
    }

    if (filter?.severity) {
      alerts = alerts.filter((a) => a.severity === filter.severity);
    }

    if (filter?.ruleId) {
      alerts = alerts.filter((a) => a.ruleId === filter.ruleId);
    }

    return alerts;
  }

  /**
   * Get firing alerts only.
   */
  getFiringAlerts(): ActiveAlert[] {
    return this.getActiveAlerts({ state: "firing" });
  }

  /**
   * Resolve an active alert.
   */
  resolveAlert(id: string): boolean {
    const alert = this.activeAlerts.get(id);
    if (!alert || alert.state === "resolved") return false;

    const now = new Date();
    const updated = this.updateAlert(id, {
      state: "resolved",
      resolvedAt: now,
    });

    return updated !== null;
  }

  /**
   * Delete an active alert.
   */
  deleteAlert(id: string): boolean {
    return this.activeAlerts.delete(id);
  }

  /**
   * Get alert history for a rule.
   */
  getAlertHistory(ruleId?: string, limit: number = 100): AlertHistoryRecord[] {
    let records: AlertHistoryRecord[];

    if (ruleId) {
      const historyIds = this.historyByRule.get(ruleId) || [];
      records = historyIds
        .map((id) => this.alertHistory.get(id))
        .filter((r): r is AlertHistoryRecord => r !== undefined);
    } else {
      records = Array.from(this.alertHistory.values());
    }

    // Sort by firedAt descending
    records.sort((a, b) => b.firedAt.getTime() - a.firedAt.getTime());

    return records.slice(0, limit);
  }

  /**
   * Clear all data.
   */
  clear(): void {
    this.rules.clear();
    this.activeAlerts.clear();
    this.alertHistory.clear();
    this.historyByRule.clear();
  }

  // Private methods

  private createHistoryRecord(alert: ActiveAlert): void {
    const id = `history-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const record: AlertHistoryRecord = {
      id,
      ruleId: alert.ruleId,
      ruleName: alert.ruleName,
      state: alert.state,
      severity: alert.severity,
      message: alert.message,
      value: alert.value,
      firedAt: alert.startedAt,
    };

    this.alertHistory.set(id, record);

    // Index by rule
    const ruleHistory = this.historyByRule.get(alert.ruleId) || [];
    ruleHistory.push(id);
    this.historyByRule.set(alert.ruleId, ruleHistory);
  }

  private updateHistoryRecord(alert: ActiveAlert): void {
    if (!alert.resolvedAt) return;

    // Find the history record for this alert
    const ruleHistory = this.historyByRule.get(alert.ruleId) || [];
    const historyId = ruleHistory[ruleHistory.length - 1]; // Most recent

    if (historyId) {
      const record = this.alertHistory.get(historyId);
      if (record && record.state !== "resolved") {
        record.state = "resolved";
        record.resolvedAt = alert.resolvedAt;
      }
    }
  }

  /**
   * Get statistics about the repository.
   */
  getStats(): {
    totalRules: number;
    enabledRules: number;
    totalAlerts: number;
    firingAlerts: number;
    resolvedAlerts: number;
    totalHistory: number;
  } {
    const alerts = Array.from(this.activeAlerts.values());
    const firing = alerts.filter((a) => a.state === "firing").length;
    const resolved = alerts.filter((a) => a.state === "resolved").length;

    return {
      totalRules: this.rules.size,
      enabledRules: this.listRules({ enabled: true }).length,
      totalAlerts: this.activeAlerts.size,
      firingAlerts: firing,
      resolvedAlerts: resolved,
      totalHistory: this.alertHistory.size,
    };
  }
}