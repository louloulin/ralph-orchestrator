/**
 * PageLoading Component Tests
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageLoading } from "./PageLoading";

describe("PageLoading", () => {
  it("renders loading spinner", () => {
    render(<PageLoading />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("has spinning animation class", () => {
    const { container } = render(<PageLoading />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});
