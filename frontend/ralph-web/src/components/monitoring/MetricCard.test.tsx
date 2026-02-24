/**
 * MetricCard Component Tests
 *
 * Tests for the MetricCard component which displays individual metrics.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "./MetricCard";
import type { CounterMetric, GaugeMetric, HistogramMetric } from "@/types/metrics";

// Mock useTranslation hook
vi.mock("@/hooks", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    locale: "en",
  }),
}));

describe("MetricCard", () => {
  const counterMetric: CounterMetric = {
    name: "http_requests_total",
    type: "counter",
    value: 1234,
    help: "Total number of HTTP requests",
    labels: [{ key: "method", value: "GET" }],
    timestamp: new Date("2026-02-24T12:00:00Z"),
  };

  const gaugeMetric: GaugeMetric = {
    name: "memory_usage_bytes",
    type: "gauge",
    value: 1048576, // 1 MB
    help: "Current memory usage in bytes",
    labels: [],
    timestamp: new Date("2026-02-24T12:00:00Z"),
  };

  const histogramMetric: HistogramMetric = {
    name: "http_request_duration_seconds",
    type: "histogram",
    sum: 12.5,
    count: 100,
    buckets: [
      { upperBound: 0.1, cumulativeCount: 50 },
      { upperBound: 0.5, cumulativeCount: 80 },
      { upperBound: 1, cumulativeCount: 95 },
      { upperBound: Infinity, cumulativeCount: 100 },
    ],
    help: "HTTP request duration in seconds",
    labels: [{ key: "endpoint", value: "/api" }],
    timestamp: new Date("2026-02-24T12:00:00Z"),
  };

  it("renders counter metric with value", () => {
    render(<MetricCard metric={counterMetric} />);
    expect(screen.getByText("http_requests_total")).toBeInTheDocument();
    expect(screen.getByText("1.23K")).toBeInTheDocument(); // Formatted value
    expect(screen.getByText("method=GET")).toBeInTheDocument();
  });

  it("renders gauge metric with formatted bytes", () => {
    render(<MetricCard metric={gaugeMetric} />);
    expect(screen.getByText("memory_usage_bytes")).toBeInTheDocument();
    expect(screen.getByText("1.0 MB")).toBeInTheDocument(); // Bytes formatting
  });

  it("renders histogram metric with sum and count", () => {
    render(<MetricCard metric={histogramMetric} />);
    expect(screen.getByText("http_request_duration_seconds")).toBeInTheDocument();
    expect(screen.getByText("12.500s")).toBeInTheDocument(); // Sum in seconds
    expect(screen.getByText("100")).toBeInTheDocument(); // Count
    expect(screen.getByText("observations")).toBeInTheDocument();
  });

  it("renders help text when provided", () => {
    render(<MetricCard metric={counterMetric} />);
    expect(screen.getByText("Total number of HTTP requests")).toBeInTheDocument();
  });

  it("renders multiple labels", () => {
    const multiLabelMetric: CounterMetric = {
      ...counterMetric,
      labels: [
        { key: "method", value: "GET" },
        { key: "status", value: "200" },
      ],
    };
    render(<MetricCard metric={multiLabelMetric} />);
    expect(screen.getByText("method=GET")).toBeInTheDocument();
    expect(screen.getByText("status=200")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<MetricCard metric={counterMetric} className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("formats large numbers correctly", () => {
    const largeMetric: CounterMetric = {
      ...counterMetric,
      name: "requests_total",
      value: 15000000, // 15M
    };
    render(<MetricCard metric={largeMetric} />);
    expect(screen.getByText("15.00M")).toBeInTheDocument();
  });

  it("formats percentages correctly", () => {
    const percentMetric: GaugeMetric = {
      ...gaugeMetric,
      name: "cpu_usage_percent",
      value: 0.75, // 75%
    };
    render(<MetricCard metric={percentMetric} />);
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });

  it("formats ratios correctly", () => {
    const ratioMetric: GaugeMetric = {
      ...gaugeMetric,
      name: "success_ratio",
      value: 0.985,
    };
    render(<MetricCard metric={ratioMetric} />);
    expect(screen.getByText("98.5%")).toBeInTheDocument();
  });
});
