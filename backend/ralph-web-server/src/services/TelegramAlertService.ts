/**
 * Telegram Alert Service
 *
 * Sends alert notifications via Telegram Bot API (P4-3.4).
 *
 * Features:
 * - Send alert notifications on firing/resolved events
 * - MarkdownV2 formatted messages
 * - Rate limiting and retry logic
 * - Configurable chat targets
 *
 * @see .ralph/specs/web-dashboard/phase4-24-7-platform.spec.md
 */

import type { ActiveAlert, AlertSeverity } from "../types/metrics.js";

/**
 * Configuration for Telegram alerting.
 */
export interface TelegramAlertConfig {
  /** Bot token from @BotFather */
  botToken: string;
  /** Default chat ID to send alerts to */
  defaultChatId: string;
  /** Enable/disable alerting */
  enabled: boolean;
  /** Minimum severity to send alerts (info < warning < critical) */
  minSeverity: AlertSeverity;
  /** Include resolved alerts */
  notifyResolved: boolean;
  /** Rate limit: max alerts per minute per chat */
  rateLimitPerMinute: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_TELEGRAM_ALERT_CONFIG: TelegramAlertConfig = {
  botToken: "",
  defaultChatId: "",
  enabled: false,
  minSeverity: "warning",
  notifyResolved: true,
  rateLimitPerMinute: 10,
  verbose: false,
};

/**
 * Severity priority for comparison.
 */
const SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

/**
 * Rate limit tracker.
 */
interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

/**
 * Message payload for Telegram API.
 */
interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode: "MarkdownV2";
  disable_notification?: boolean;
}

/**
 * Telegram Bot API response.
 */
interface TelegramResponse {
  ok: boolean;
  result?: any;
  description?: string;
  error_code?: number;
}

/**
 * TelegramAlertService sends alert notifications via Telegram.
 */
export class TelegramAlertService {
  private config: TelegramAlertConfig;
  private rateLimitMap: Map<string, RateLimitEntry> = new Map();
  private baseUrl: string;

  constructor(config: Partial<TelegramAlertConfig> = {}) {
    this.config = { ...DEFAULT_TELEGRAM_ALERT_CONFIG, ...config };
    this.baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<TelegramAlertConfig>): void {
    this.config = { ...this.config, ...updates };
    this.baseUrl = `https://api.telegram.org/bot${this.config.botToken}`;
  }

  /**
   * Check if service is enabled and configured.
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.config.botToken && !!this.config.defaultChatId;
  }

  /**
   * Send an alert notification.
   *
   * @param alert - The alert to send
   * @param chatId - Optional override chat ID
   * @returns true if sent successfully
   */
  async sendAlert(alert: ActiveAlert, chatId?: string): Promise<boolean> {
    if (!this.isEnabled()) {
      if (this.config.verbose) {
        console.log("[TelegramAlert] Service disabled or not configured");
      }
      return false;
    }

    // Check severity threshold
    if (!this.meetsSeverityThreshold(alert.severity)) {
      if (this.config.verbose) {
        console.log(`[TelegramAlert] Alert severity ${alert.severity} below threshold ${this.config.minSeverity}`);
      }
      return false;
    }

    // Skip resolved alerts if configured
    if (alert.state === "resolved" && !this.config.notifyResolved) {
      if (this.config.verbose) {
        console.log("[TelegramAlert] Skipping resolved alert notification");
      }
      return false;
    }

    const targetChatId = chatId || this.config.defaultChatId;

    // Check rate limit
    if (!this.checkRateLimit(targetChatId)) {
      if (this.config.verbose) {
        console.log(`[TelegramAlert] Rate limit exceeded for chat ${targetChatId}`);
      }
      return false;
    }

    // Build message
    const message = this.buildAlertMessage(alert);

    // Send with retry
    return this.sendWithRetry(targetChatId, message);
  }

  /**
   * Send a test message to verify configuration.
   */
  async sendTestMessage(chatId?: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const targetChatId = chatId || this.config.defaultChatId;
    const message = `🧪 *Ralph Monitoring Test*\n\n_This is a test message from Ralph alerting system\\._`;

    return this.sendMessage(targetChatId, this.escapeMarkdown(message));
  }

  /**
   * Build a formatted alert message.
   */
  private buildAlertMessage(alert: ActiveAlert): string {
    const emoji = this.getStateEmoji(alert.state, alert.severity);
    const stateLabel = alert.state === "firing" ? "🔥 FIRING" : "✅ RESOLVED";
    const severityLabel = this.formatSeverity(alert.severity);
    const timestamp = this.formatTimestamp(alert.state === "resolved" ? alert.resolvedAt! : alert.lastFiredAt);

    let message = `${emoji} *ALERT ${stateLabel}*\n\n`;
    message += `*Rule:* ${this.escapeMarkdown(alert.ruleName)}\n`;
    message += `*Severity:* ${severityLabel}\n`;
    message += `*Value:* ${alert.value}\n`;
    message += `*Message:* ${this.escapeMarkdown(alert.message)}\n`;
    message += `*Time:* ${this.escapeMarkdown(timestamp)}\n`;

    // Add labels if present
    if (alert.labels && Object.keys(alert.labels).length > 0) {
      message += `\n*Labels:*\n`;
      for (const [key, value] of Object.entries(alert.labels)) {
        message += `  • ${this.escapeMarkdown(key)}: ${this.escapeMarkdown(value)}\n`;
      }
    }

    // Add duration for firing alerts
    if (alert.state === "firing") {
      const duration = this.formatDuration(alert.startedAt, alert.lastFiredAt);
      message += `\n*Duration:* ${this.escapeMarkdown(duration)}\n`;
    }

    return message;
  }

  /**
   * Get emoji for alert state and severity.
   */
  private getStateEmoji(state: string, severity: AlertSeverity): string {
    if (state === "resolved") {
      return "✅";
    }
    switch (severity) {
      case "critical":
        return "🚨";
      case "warning":
        return "⚠️";
      case "info":
      default:
        return "ℹ️";
    }
  }

  /**
   * Format severity with emoji.
   */
  private formatSeverity(severity: AlertSeverity): string {
    switch (severity) {
      case "critical":
        return "🔴 Critical";
      case "warning":
        return "🟡 Warning";
      case "info":
      default:
        return "🟢 Info";
    }
  }

  /**
   * Format a date for display.
   */
  private formatTimestamp(date: Date): string {
    return date.toISOString().replace("T", " ").substring(0, 19) + " UTC";
  }

  /**
   * Format duration between two dates.
   */
  private formatDuration(start: Date, end: Date): string {
    const diffMs = end.getTime() - start.getTime();
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Escape special characters for MarkdownV2.
   */
  private escapeMarkdown(text: string): string {
    const specialChars = /[_*[\]()~`>#+\-=|{}.!\\]/g;
    return text.replace(specialChars, "\\$&");
  }

  /**
   * Check if severity meets the configured threshold.
   */
  private meetsSeverityThreshold(severity: AlertSeverity): boolean {
    return SEVERITY_PRIORITY[severity] >= SEVERITY_PRIORITY[this.config.minSeverity];
  }

  /**
   * Check and update rate limit.
   */
  private checkRateLimit(chatId: string): boolean {
    const now = Date.now();
    const entry = this.rateLimitMap.get(chatId);

    if (!entry || now > entry.resetAt) {
      // Reset or create new window
      this.rateLimitMap.set(chatId, {
        count: 1,
        resetAt: now + 60000, // 1 minute window
      });
      return true;
    }

    if (entry.count >= this.config.rateLimitPerMinute) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Send message with retry logic.
   */
  private async sendWithRetry(chatId: string, text: string, maxRetries: number = 3): Promise<boolean> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const success = await this.sendMessage(chatId, text);
        if (success) {
          return true;
        }
      } catch (error) {
        if (this.config.verbose) {
          console.error(`[TelegramAlert] Attempt ${attempt}/${maxRetries} failed:`, error);
        }
      }

      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await this.sleep(delay);
      }
    }

    if (this.config.verbose) {
      console.error(`[TelegramAlert] All ${maxRetries} attempts failed for chat ${chatId}`);
    }
    return false;
  }

  /**
   * Send a message via Telegram API.
   */
  private async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.config.botToken) {
      throw new Error("Bot token not configured");
    }

    const payload: TelegramMessage = {
      chat_id: chatId,
      text,
      parse_mode: "MarkdownV2",
    };

    const url = `${this.baseUrl}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as TelegramResponse;

      if (!data.ok) {
        if (this.config.verbose) {
          console.error(`[TelegramAlert] API error: ${data.error_code} - ${data.description}`);
        }
        return false;
      }

      if (this.config.verbose) {
        console.log(`[TelegramAlert] Message sent to chat ${chatId}`);
      }
      return true;
    } catch (error) {
      if (this.config.verbose) {
        console.error("[TelegramAlert] Network error:", error);
      }
      throw error;
    }
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clear rate limit state.
   */
  clearRateLimits(): void {
    this.rateLimitMap.clear();
  }

  /**
   * Get current configuration (without sensitive data).
   */
  getConfig(): Omit<TelegramAlertConfig, "botToken"> & { botToken: string } {
    const { botToken: _, ...safe } = this.config;
    return {
      ...safe,
      botToken: this.config.botToken ? "***" : "",
    };
  }
}
