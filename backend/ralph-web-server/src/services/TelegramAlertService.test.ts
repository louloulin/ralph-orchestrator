/**
 * TelegramAlertService Tests
 *
 * Tests for Telegram alert notifications (P4-3.4).
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  TelegramAlertService,
  TelegramAlertConfig,
  DEFAULT_TELEGRAM_ALERT_CONFIG,
} from "./TelegramAlertService.js";
import type { ActiveAlert, AlertSeverity } from "../types/metrics.js";

// Mock fetch globally
const originalFetch = global.fetch;

describe("TelegramAlertService", () => {
  let service: TelegramAlertService;
  let mockFetch: any;

  const createTestAlert = (
    overrides: Partial<ActiveAlert> = {}
  ): ActiveAlert => ({
    id: "alert-test-123",
    ruleId: "rule-test-123",
    ruleName: "Test Rule",
    state: "firing",
    severity: "warning",
    message: "Test alert message",
    labels: { env: "test" },
    value: 85,
    startedAt: new Date("2026-02-24T10:00:00Z"),
    lastFiredAt: new Date("2026-02-24T10:05:00Z"),
    ...overrides,
  });

  const baseConfig: Partial<TelegramAlertConfig> = {
    botToken: "test-bot-token",
    defaultChatId: "-1001234567890",
    enabled: true,
    verbose: false,
  };

  beforeEach(() => {
    mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            result: { message_id: 1 },
          }),
      })
    );
    global.fetch = mockFetch;
    service = new TelegramAlertService(baseConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should initialize with default config", () => {
      const svc = new TelegramAlertService();
      expect(svc.getConfig()).toEqual({
        botToken: "",
        defaultChatId: "",
        enabled: false,
        minSeverity: "warning",
        notifyResolved: true,
        rateLimitPerMinute: 10,
        verbose: false,
      });
    });

    it("should merge custom config with defaults", () => {
      const svc = new TelegramAlertService({
        botToken: "my-token",
        enabled: true,
      });
      const config = svc.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.botToken).toBe("***");
    });
  });

  describe("isEnabled", () => {
    it("should return false when disabled", () => {
      const svc = new TelegramAlertService({ ...baseConfig, enabled: false });
      expect(svc.isEnabled()).toBe(false);
    });

    it("should return false without bot token", () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        botToken: "",
      });
      expect(svc.isEnabled()).toBe(false);
    });

    it("should return false without chat ID", () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        defaultChatId: "",
      });
      expect(svc.isEnabled()).toBe(false);
    });

    it("should return true when properly configured", () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe("sendAlert", () => {
    it("should return false when disabled", async () => {
      const svc = new TelegramAlertService({ ...baseConfig, enabled: false });
      const alert = createTestAlert();
      const result = await svc.sendAlert(alert);
      expect(result).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should skip alerts below severity threshold", async () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        minSeverity: "critical",
      });
      const alert = createTestAlert({ severity: "info" });
      const result = await svc.sendAlert(alert);
      expect(result).toBe(false);
    });

    it("should send warning alerts when minSeverity is warning", async () => {
      const alert = createTestAlert({ severity: "warning" });
      const result = await service.sendAlert(alert);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalled();
    });

    it("should send critical alerts when minSeverity is warning", async () => {
      const alert = createTestAlert({ severity: "critical" });
      const result = await service.sendAlert(alert);
      expect(result).toBe(true);
    });

    it("should skip resolved alerts when notifyResolved is false", async () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        notifyResolved: false,
      });
      const alert = createTestAlert({ state: "resolved", resolvedAt: new Date() });
      const result = await svc.sendAlert(alert);
      expect(result).toBe(false);
    });

    it("should send resolved alerts when notifyResolved is true", async () => {
      const alert = createTestAlert({
        state: "resolved",
        resolvedAt: new Date("2026-02-24T10:10:00Z"),
      });
      const result = await service.sendAlert(alert);
      expect(result).toBe(true);
    });

    it("should call Telegram API with correct payload", async () => {
      const alert = createTestAlert();
      await service.sendAlert(alert);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain("sendMessage");

      const body = JSON.parse(options.body);
      expect(body.chat_id).toBe("-1001234567890");
      expect(body.parse_mode).toBe("MarkdownV2");
      expect(body.text).toContain("ALERT");
      expect(body.text).toContain("FIRING");
    });

    it("should include rule name in message", async () => {
      const alert = createTestAlert({ ruleName: "High CPU Usage" });
      await service.sendAlert(alert);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("High CPU Usage");
    });

    it("should include severity emoji in message", async () => {
      const criticalAlert = createTestAlert({ severity: "critical" });
      await service.sendAlert(criticalAlert);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("Critical");
    });

    it("should include labels in message", async () => {
      const alert = createTestAlert({
        labels: { env: "production", service: "api" },
      });
      await service.sendAlert(alert);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("env");
      expect(body.text).toContain("production");
    });

    it("should use custom chat ID", async () => {
      const alert = createTestAlert();
      await service.sendAlert(alert, "-1009999999999");

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.chat_id).toBe("-1009999999999");
    });

    it("should return false on API error", async () => {
      // Override fetch for this test
      global.fetch = mock(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: false,
              error_code: 403,
              description: "Forbidden: bot was blocked by the user",
            }),
        })
      );

      const alert = createTestAlert();
      const result = await service.sendAlert(alert);
      expect(result).toBe(false);
    });

    it("should retry on network error", async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Network error");
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, result: {} }),
        });
      });

      const alert = createTestAlert();
      const result = await service.sendAlert(alert);
      expect(result).toBe(true);
      expect(attempts).toBe(3);
    });
  });

  describe("rate limiting", () => {
    it("should allow messages up to rate limit", async () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        rateLimitPerMinute: 3,
      });

      for (let i = 0; i < 3; i++) {
        const alert = createTestAlert({ id: `alert-${i}` });
        const result = await svc.sendAlert(alert);
        expect(result).toBe(true);
      }
    });

    it("should block messages over rate limit", async () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        rateLimitPerMinute: 2,
      });

      // Send 2 (allowed)
      await svc.sendAlert(createTestAlert({ id: "alert-1" }));
      await svc.sendAlert(createTestAlert({ id: "alert-2" }));

      // Third should be blocked
      const alert = createTestAlert({ id: "alert-3" });
      const result = await svc.sendAlert(alert);
      expect(result).toBe(false);
    });

    it("should track rate limits per chat", async () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        rateLimitPerMinute: 1,
      });

      // First chat
      const result1 = await svc.sendAlert(
        createTestAlert({ id: "alert-1" }),
        "-1001111111111"
      );
      expect(result1).toBe(true);

      // Different chat - should be allowed
      const result2 = await svc.sendAlert(
        createTestAlert({ id: "alert-2" }),
        "-1002222222222"
      );
      expect(result2).toBe(true);
    });

    it("should reset rate limit after window", async () => {
      const svc = new TelegramAlertService({
        ...baseConfig,
        rateLimitPerMinute: 1,
      });

      // First message allowed
      await svc.sendAlert(createTestAlert({ id: "alert-1" }));

      // Manually clear rate limit to simulate time passing
      svc.clearRateLimits();

      // Should be allowed again
      const result = await svc.sendAlert(createTestAlert({ id: "alert-2" }));
      expect(result).toBe(true);
    });
  });

  describe("sendTestMessage", () => {
    it("should send test message when enabled", async () => {
      const result = await service.sendTestMessage();
      expect(result).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("Test");
    });

    it("should return false when disabled", async () => {
      const svc = new TelegramAlertService({ ...baseConfig, enabled: false });
      const result = await svc.sendTestMessage();
      expect(result).toBe(false);
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", () => {
      service.updateConfig({ enabled: false });
      expect(service.isEnabled()).toBe(false);

      service.updateConfig({ enabled: true });
      expect(service.isEnabled()).toBe(true);
    });

    it("should preserve existing config values", () => {
      service.updateConfig({ minSeverity: "critical" });
      const config = service.getConfig();
      expect(config.minSeverity).toBe("critical");
      expect(config.enabled).toBe(true);
    });
  });

  describe("getConfig", () => {
    it("should mask bot token", () => {
      const config = service.getConfig();
      expect(config.botToken).toBe("***");
    });

    it("should show empty string if no token", () => {
      const svc = new TelegramAlertService({ botToken: "" });
      const config = svc.getConfig();
      expect(config.botToken).toBe("");
    });
  });

  describe("message formatting", () => {
    it("should escape special MarkdownV2 characters", async () => {
      const alert = createTestAlert({
        ruleName: "Test [Rule] (1)",
        message: "Alert: 100% CPU! > 90%",
      });
      await service.sendAlert(alert);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Should contain escaped characters
      expect(body.text).toContain("\\[Rule\\]");
      expect(body.text).toContain("\\(1\\)");
      expect(body.text).toContain("\\!");
      expect(body.text).toContain("\\>");
    });

    it("should format duration for firing alerts", async () => {
      const alert = createTestAlert({
        startedAt: new Date("2026-02-24T10:00:00Z"),
        lastFiredAt: new Date("2026-02-24T10:05:30Z"),
      });
      await service.sendAlert(alert);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("Duration");
    });

    it("should show correct emoji for severity levels", async () => {
      const severities: AlertSeverity[] = ["info", "warning", "critical"];

      for (const severity of severities) {
        mockFetch.mockClear();
        const svc = new TelegramAlertService({
          ...baseConfig,
          minSeverity: "info",
        });
        const alert = createTestAlert({ severity });
        await svc.sendAlert(alert);

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        if (severity === "critical") {
          expect(body.text).toContain("Critical");
        } else if (severity === "warning") {
          expect(body.text).toContain("Warning");
        } else {
          expect(body.text).toContain("Info");
        }
      }
    });

    it("should show resolved emoji for resolved alerts", async () => {
      const alert = createTestAlert({
        state: "resolved",
        resolvedAt: new Date("2026-02-24T10:10:00Z"),
      });
      await service.sendAlert(alert);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toContain("RESOLVED");
    });
  });
});
