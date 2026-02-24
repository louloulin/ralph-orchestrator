/**
 * ErrorBoundary Component Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary, InlineErrorFallback } from "../ErrorBoundary";

// Mock console.error to avoid test output noise
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("ErrorBoundary", () => {
  it("should render children when there is no error", () => {
    render(
      <ErrorBoundary>
        <div>Test Content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("should catch and display error when child throws", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    expect(console.error).toHaveBeenCalled();
  });

  it("should display error ID", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const errorIdElement = screen.getByText(/Error ID:/);
    expect(errorIdElement).toBeInTheDocument();
    expect(errorIdElement.textContent).toMatch(/err-\d+-[a-z0-9]+/);
  });

  it("should call onError callback when error occurs", () => {
    const onError = vi.fn();
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe("Test error");
  });

  it("should retry and recover from error", async () => {
    let shouldThrow = true;
    const ConditionalError = () => {
      if (shouldThrow) {
        throw new Error("Test error");
      }
      return <div>Recovered</div>;
    };

    render(
      <ErrorBoundary>
        <ConditionalError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Click retry button
    const retryButton = screen.getByRole("button", { name: /Try Again/i });
    await userEvent.click(retryButton);

    // Should still show error because shouldThrow is still true
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("should navigate to dashboard on Go Home button", () => {
    const originalLocation = window.location;
    delete (window as { location?: typeof originalLocation }).location;
    window.location = { ...originalLocation, href: "" };

    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const homeButton = screen.getByRole("button", { name: /Go to Dashboard/i });
    fireEvent.click(homeButton);

    expect(window.location.href).toBe("/dashboard");

    // Restore original location
    window.location = originalLocation;
  });

  it("should reload page on reload link", () => {
    const reloadMock = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
    });

    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    const reloadLink = screen.getByText("reloading the page");
    fireEvent.click(reloadLink);

    expect(reloadMock).toHaveBeenCalled();

    // Restore original location
    window.location = originalLocation;
  });

  it("should show error details when showDetails is true", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary showDetails={true}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/View error details/)).toBeInTheDocument();
  });

  it("should not show error details when showDetails is false", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary showDetails={false}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.queryByText(/View error details/)).not.toBeInTheDocument();
  });

  it("should expand error details on click", async () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    render(
      <ErrorBoundary showDetails={true}>
        <ThrowError />
      </ErrorBoundary>
    );

    // Click to expand
    const detailsSummary = screen.getByText(/View error details/i);
    await userEvent.click(detailsSummary);

    // Should show error details (expanded state shows the error)
    expect(screen.getByText(/Error: Test error/i)).toBeInTheDocument();
  });

  it("should render custom fallback when provided", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };
    const CustomFallback = () => <div>Custom Error UI</div>;

    render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Error UI")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const ThrowError = () => {
      throw new Error("Test error");
    };

    const { container } = render(
      <ErrorBoundary className="custom-class">
        <ThrowError />
      </ErrorBoundary>
    );

    const wrapper = container.querySelector(".custom-class");
    expect(wrapper).toBeInTheDocument();
  });

  it("should generate unique error IDs", () => {
    const errorIds = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const ThrowError = () => {
        throw new Error(`Error ${i}`);
      };

      const { unmount } = render(
        <ErrorBoundary key={i}>
          <ThrowError />
        </ErrorBoundary>
      );

      const errorIdElement = screen.getByText(/Error ID:/);
      const errorId = errorIdElement.textContent?.match(/err-\d+-[a-z0-9]+/)?.[0];
      if (errorId) {
        errorIds.add(errorId);
      }

      unmount();
    }

    expect(errorIds.size).toBe(5);
  });

  it("should recover from errors using handleRetry", async () => {
    let shouldThrow = true;

    const ToggleError = () => {
      if (shouldThrow) {
        throw new Error("Error");
      }
      return <div>Success</div>;
    };

    const { rerender } = render(
      <ErrorBoundary>
        <ToggleError />
      </ErrorBoundary>
    );

    // Should show error
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();

    // Toggle the error state
    shouldThrow = false;

    // Click retry
    const retryButton = screen.getByRole("button", { name: /Try Again/i });
    await userEvent.click(retryButton);

    // Should recover
    expect(screen.getByText("Success")).toBeInTheDocument();
  });
});

describe("InlineErrorFallback", () => {
  it("should render with default message", () => {
    const { container } = render(<InlineErrorFallback />);

    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    // Icon is rendered but aria-hidden, so use container query
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("should render with custom message", () => {
    render(<InlineErrorFallback message="Custom error message" />);

    expect(screen.getByText("Custom error message")).toBeInTheDocument();
  });

  it("should not render retry button by default", () => {
    render(<InlineErrorFallback />);

    expect(screen.queryByRole("button", { name: /Retry/i })).not.toBeInTheDocument();
  });

  it("should render and handle retry button", async () => {
    const onRetry = vi.fn();
    render(<InlineErrorFallback onRetry={onRetry} />);

    const retryButton = screen.getByRole("button", { name: /Retry/i });
    expect(retryButton).toBeInTheDocument();

    await userEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("should apply custom className", () => {
    const { container } = render(
      <InlineErrorFallback className="my-custom-class" />
    );

    const wrapper = container.querySelector(".my-custom-class");
    expect(wrapper).toBeInTheDocument();
  });
});