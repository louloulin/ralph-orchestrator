/**
 * MetricsDashboard Component Tests
 *
 * Tests for the MetricsDashboard component which displays all metrics.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MetricsDashboard } from "./MetricsDashboard";
import { trpc } from "@/trpc";
import type { MetricsSnapshot, CounterMetric, GaugeMetric } from "@/types/metrics";

// Mock tRPC
vi.mock("@/trpc", () => ({
  trpc: {
    monitoring: {
      getSnapshot: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock useTranslation hook
vi.mock("@/hooks", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`;
      }
      return key;
    },
    locale: "en",
  }),
}));

describe("MetricsDashboard", () => {
  const counterMetric: CounterMetric = {
    name: "http_requests_total",
    type: "counter",
    value: 1234,
    help: "Total HTTP requests",
    labels: [],
    timestamp: new Date("2026-02-24T12:00:00Z"),
  };

  const gaugeMetric: GaugeMetric = {
    name: "memory_usage_bytes",
    type: "gauge",
    value: 1048576,
    help: "Memory usage",
    labels: [],
    timestamp: new Date("2026-02-24T12:00:00Z"),
  };

  const mockSnapshot: MetricsSnapshot = {
    timestamp: new Date("2026-02-24T12:00:00Z"),
    metrics: [counterMetric, gaugeMetric],
    metadata: {
      collectionDurationMs: 15,
      totalMetrics: 2,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while loading", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: true,
      data: undefined,
      error: null,
    });

    render(<MetricsDashboard />);
    // Check for skeleton elements
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("displays metrics when loaded", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    render(<MetricsDashboard />);
    expect(screen.getByText("http_requests_total")).toBeInTheDocument();
    expect(screen.getByText("memory_usage_bytes")).toBeInTheDocument();
  });

  it("shows error state on error", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: undefined,
      error: { message: "Failed to load metrics" },
    });

    render(<MetricsDashboard />);
    expect(screen.getByText("Failed to load metrics")).toBeInTheDocument();
  });

  it("shows empty state when no metrics", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: {
        ...mockSnapshot,
        metrics: [],
      },
      error: null,
    });

    render(<MetricsDashboard />);
    expect(screen.getByText(/monitoring.noMetrics/)).toBeInTheDocument();
  });

  it("displays snapshot metadata", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    render(<MetricsDashboard />);
    expect(screen.getByText("2")).toBeInTheDocument(); // totalMetrics
    expect(screen.getByText("15ms")).toBeInTheDocument(); // collectionDurationMs
  });

  it("filters metrics by search term", async () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    render(<MetricsDashboard showSearch={true} />);

    const searchInput = screen.getByPlaceholderText(/monitoring.searchMetrics/);
    await userEvent.type(searchInput, "http");

    expect(screen.getByText("http_requests_total")).toBeInTheDocument();
    expect(screen.queryByText("memory_usage_bytes")).not.toBeInTheDocument();
  });

  it("filters metrics by type", async () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    render(<MetricsDashboard showTypeFilter={true} />);

    // Click on "counter" filter
    const counterButton = screen.getByRole("button", { name: "counter" });
    await userEvent.click(counterButton);

    expect(screen.getByText("http_requests_total")).toBeInTheDocument();
    expect(screen.queryByText("memory_usage_bytes")).not.toBeInTheDocument();
  });

  it("hides search when showSearch is false", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    render(<MetricsDashboard showSearch={false} />);
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("hides type filter when showTypeFilter is false", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    render(<MetricsDashboard showTypeFilter={false} />);
    expect(screen.queryByRole("button", { name: "counter" })).not.toBeInTheDocument();
  });

  it("applies custom className", () => {
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
    });

    const { container } = render(<MetricsDashboard className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("limits metrics when limit prop is set", () => {
    const manyMetrics = Array.from({ length: 20 }, (_, i) => ({
      ...counterMetric,
      name: `metric_${i}`,
    }));

    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: {
        ...mockSnapshot,
        metrics: manyMetrics,
        metadata: { ...mockSnapshot.metadata, totalMetrics: 20 },
      },
      error: null,
    });

    render(<MetricsDashboard limit={5} />);

    // Should show count text
    expect(screen.getByText(/monitoring.showingMetrics/)).toBeInTheDocument();
  });

  it("groups metrics by prefix", () => {
    const metrics = [
      { ...counterMetric, name: "http_requests" },
      { ...counterMetric, name: "http_responses" },
      { ...gaugeMetric, name: "cpu_usage" },
    ];

    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: {
        ...mockSnapshot,
        metrics,
      },
      error: null,
    });

    render(<MetricsDashboard />);

    // Should have group headers
    expect(screen.getByText("http (2)")).toBeInTheDocument();
    expect(screen.getByText("cpu (1)")).toBeInTheDocument();
  });

  it("calls refetch on refresh button click", async () => {
    const refetch = vi.fn();
    (trpc.monitoring.getSnapshot.useQuery as any).mockReturnValue({
      isLoading: false,
      data: mockSnapshot,
      error: null,
      refetch,
    });

    render(<MetricsDashboard showRefresh={true} />);

    const refreshButton = screen.getByRole("button", { name: /refresh/i });
    await userEvent.click(refreshButton);

    expect(refetch).toHaveBeenCalled();
  });
});
