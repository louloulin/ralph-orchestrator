/**
 * AlertBadge Component Tests
 *
 * Tests for the AlertBadge component which displays alert severity.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlertBadge } from "./AlertBadge";

describe("AlertBadge", () => {
  it("renders info severity badge", () => {
    render(<AlertBadge severity="info" />);
    // Note: capitalize is CSS, text content is lowercase
    expect(screen.getByText("info")).toBeInTheDocument();
  });

  it("renders warning severity badge", () => {
    render(<AlertBadge severity="warning" />);
    expect(screen.getByText("warning")).toBeInTheDocument();
  });

  it("renders critical severity badge", () => {
    render(<AlertBadge severity="critical" />);
    expect(screen.getByText("critical")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<AlertBadge severity="info" className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("has blue styling for info", () => {
    const { container } = render(<AlertBadge severity="info" />);
    expect(container.querySelector(".bg-blue-500")).toBeInTheDocument();
  });

  it("has yellow styling for warning", () => {
    const { container } = render(<AlertBadge severity="warning" />);
    expect(container.querySelector(".bg-yellow-500")).toBeInTheDocument();
  });

  it("has red styling for critical", () => {
    const { container } = render(<AlertBadge severity="critical" />);
    expect(container.querySelector(".bg-red-500")).toBeInTheDocument();
  });

  it("has capitalize class for text styling", () => {
    const { container } = render(<AlertBadge severity="critical" />);
    expect(container.querySelector(".capitalize")).toBeInTheDocument();
  });
});
