/**
 * AlertList Component Tests
 *
 * Tests for the AlertList component which displays active alerts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertList } from "./AlertList";
import { trpc } from "@/trpc";
import type { ActiveAlert } from "@/types/metrics";

// Mock tRPC
vi.mock("@/trpc", () => ({
  trpc: {
    monitoring: {
      getActiveAlerts: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock useTranslation hook
vi.mock("@/hooks", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}));

describe("AlertList", () => {
  const mockAlerts: ActiveAlert[] = [
    {
      id: "alert-1",
      ruleId: "rule-1",
      ruleName: "High CPU Usage",
      state: "firing",
      severity: "critical",
      message: "CPU usage above 90%",
      labels: { instance: "server-1" },
      value: 95,
      startedAt: new Date("2026-02-24T11:00:00Z"),
      lastFiredAt: new Date("2026-02-24T12:00:00Z"),
    },
    {
      id: "alert-2",
      ruleId: "rule-2",
      ruleName: "Memory Warning",
      state: "firing",
      severity: "warning",
      message: "Memory usage above 80%",
      labels: { instance: "server-2" },
      value: 85,
      startedAt: new Date("2026-02-24T10:00:00Z"),
      lastFiredAt: new Date("2026-02-24T11:00:00Z"),
    },
    {
      id: "alert-3",
      ruleId: "rule-3",
      ruleName: "Resolved Alert",
      state: "resolved",
      severity: "info",
      message: "This alert is resolved",
      labels: {},
      value: 0,
      startedAt: new Date("2026-02-24T09:00:00Z"),
      lastFiredAt: new Date("2026-02-24T10:00:00Z"),
      resolvedAt: new Date("2026-02-24T10:30:00Z"),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while loading", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: true,
      data: undefined,
    });

    render(<AlertList />);
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("displays alerts when loaded", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockAlerts,
    });

    render(<AlertList />);
    expect(screen.getByText("High CPU Usage")).toBeInTheDocument();
    expect(screen.getByText("Memory Warning")).toBeInTheDocument();
  });

  it("shows empty state when no alerts", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: [],
    });

    render(<AlertList />);
    expect(screen.getByText("monitoring.noAlerts")).toBeInTheDocument();
  });

  it("displays alert severity badge", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockAlerts,
    });

    render(<AlertList />);
    // Check for severity badges (they use capitalize class)
    expect(screen.getByText("critical")).toBeInTheDocument();
    // Note: "warning" appears both in alert name and badge, so just check for info badge
    expect(screen.getByText("info")).toBeInTheDocument();
  });

  it("shows alert messages", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockAlerts,
    });

    render(<AlertList />);
    expect(screen.getByText("CPU usage above 90%")).toBeInTheDocument();
    expect(screen.getByText("Memory usage above 80%")).toBeInTheDocument();
  });

  it("limits number of alerts displayed", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockAlerts,
    });

    render(<AlertList limit={2} />);
    expect(screen.getByText("High CPU Usage")).toBeInTheDocument();
    expect(screen.getByText("Memory Warning")).toBeInTheDocument();
    // Third alert should not be shown due to limit
    expect(screen.queryByText("Resolved Alert")).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: [],
    });

    const { container } = render(<AlertList className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("shows firing state styling for active alerts", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: [mockAlerts[0]],
    });

    const { container } = render(<AlertList />);
    // Check for destructive styling class
    expect(container.querySelector(".border-destructive\\/50")).toBeInTheDocument();
  });

  it("shows resolved state styling for resolved alerts", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: [mockAlerts[2]],
    });

    const { container } = render(<AlertList />);
    // Check for green styling class
    expect(container.querySelector(".border-green-500\\/50")).toBeInTheDocument();
  });

  it("displays alert count in header", () => {
    (trpc.monitoring.getActiveAlerts.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockAlerts,
    });

    render(<AlertList limit={10} />);
    // The count should be shown in the header
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
