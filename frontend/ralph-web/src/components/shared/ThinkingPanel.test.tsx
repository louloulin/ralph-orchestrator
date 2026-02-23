/**
 * ThinkingPanel Component Tests
 *
 * Tests for the AI agent thinking display component.
 */

import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThinkingPanel } from "./ThinkingPanel";
import type { ThinkingStep, ThinkingStepType } from "@/types/thinking";

// Create a mock store state that will be used by the mock implementation
let mockStoreState: {
  getSteps: () => ThinkingStep[];
  getSessionDuration: () => number | null;
  getTotalTokens: () => number;
  hasSession: () => boolean;
};

// Mock the Zustand store
vi.mock("@/stores/thinkingStore", () => ({
  useThinkingStore: vi.fn((selector) => selector(mockStoreState)),
}));

// Helper to create mock thinking steps
function createMockStep(
  id: string,
  type: ThinkingStepType = "reasoning",
  content = "Test thinking content",
  overrides?: Partial<ThinkingStep>
): ThinkingStep {
  return {
    id,
    timestamp: new Date("2026-02-22T10:00:00.000Z"),
    type,
    content,
    ...overrides,
  };
}

// Helper to setup store mock
function mockStore(
  _taskId: string,
  steps: ThinkingStep[] = [],
  overrides?: { sessionDuration?: number | null; totalTokens?: number; hasSession?: boolean }
) {
  const mockGetSteps = vi.fn(() => steps);
  const mockGetSessionDuration = vi.fn(() => overrides?.sessionDuration ?? null);
  const mockGetTotalTokens = vi.fn(() => overrides?.totalTokens ?? 0);
  const mockHasSession = vi.fn(() => overrides?.hasSession ?? steps.length > 0);

  mockStoreState = {
    getSteps: mockGetSteps,
    getSessionDuration: mockGetSessionDuration,
    getTotalTokens: mockGetTotalTokens,
    hasSession: mockHasSession,
  };

  return { mockGetSteps, mockGetSessionDuration, mockGetTotalTokens, mockHasSession };
}

describe("ThinkingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("Rendering", () => {
    it("renders nothing when no session exists", () => {
      mockStore("task-1", [], { hasSession: false });
      const { container } = render(<ThinkingPanel taskId="task-1" />);
      expect(container.firstChild).toBeNull();
    });

    it("renders collapsed by default when defaultCollapsed=true", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" defaultCollapsed={true} />);

      expect(screen.getByText("Agent Thinking")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Search thoughts...")).not.toBeInTheDocument();
    });

    it("renders expanded by default", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" />);

      expect(screen.getByText("Agent Thinking")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search thoughts...")).toBeInTheDocument();
    });

    it("displays step count in header", () => {
      mockStore("task-1", [
        createMockStep("step-1"),
        createMockStep("step-2"),
        createMockStep("step-3"),
      ]);
      render(<ThinkingPanel taskId="task-1" />);

      // The step count appears in both header badge and footer - use more specific selector
      const badge = screen.getByRole("button", { name: /agent thinking/i }).querySelector(".bg-secondary");
      expect(badge).toHaveTextContent("3 steps");
    });

    it("displays singular 'step' for single step", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" />);

      // The step count appears in both header badge and footer - use more specific selector
      const badge = screen.getByRole("button", { name: /agent thinking/i }).querySelector(".bg-secondary");
      expect(badge).toHaveTextContent("1 step");
    });

    it("displays session duration when available", () => {
      mockStore("task-1", [createMockStep("step-1")], { sessionDuration: 2500 });
      render(<ThinkingPanel taskId="task-1" />);

      expect(screen.getByText("2.5s")).toBeInTheDocument();
    });
  });

  describe("Expand/Collapse", () => {
    it("expands and collapses on header click", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" defaultCollapsed={true} />);

      // Initially collapsed
      expect(screen.queryByPlaceholderText("Search thoughts...")).not.toBeInTheDocument();

      // Click header to expand
      fireEvent.click(screen.getByText("Agent Thinking"));

      expect(screen.getByPlaceholderText("Search thoughts...")).toBeInTheDocument();

      // Click header to collapse again
      fireEvent.click(screen.getByText("Agent Thinking"));

      expect(screen.queryByPlaceholderText("Search thoughts...")).not.toBeInTheDocument();
    });

    it("has proper aria attributes for accessibility", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" defaultCollapsed={true} />);

      const button = screen.getByRole("button", { name: /agent thinking/i });
      expect(button).toHaveAttribute("aria-expanded", "false");

      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
    });
  });

  describe("Step Display", () => {
    it("displays thinking step content", () => {
      mockStore("task-1", [createMockStep("step-1", "reasoning", "My analysis here")]);
      render(<ThinkingPanel taskId="task-1" />);

      expect(screen.getByText("My analysis here")).toBeInTheDocument();
    });

    it("displays timestamps when showTimestamps=true", () => {
      // Use a date that has recognizable time components
      const testDate = new Date("2026-02-22T10:30:45.123Z");
      mockStore("task-1", [
        createMockStep("step-1", "reasoning", "content", {
          timestamp: testDate,
        }),
      ]);
      render(<ThinkingPanel taskId="task-1" showTimestamps={true} />);

      // Check that timestamp is displayed (format varies by timezone, check for time parts)
      const timestampElement = document.querySelector(".font-mono.text-muted-foreground");
      expect(timestampElement).toBeInTheDocument();
      expect(timestampElement?.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it("hides timestamps when showTimestamps=false", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" showTimestamps={false} />);

      const timestampElement = document.querySelector(".font-mono.text-muted-foreground");
      expect(timestampElement).not.toBeInTheDocument();
    });

    it("displays type badges when showTypeBadges=true", () => {
      mockStore("task-1", [createMockStep("step-1", "analysis")]);
      render(<ThinkingPanel taskId="task-1" showTypeBadges={true} />);

      expect(screen.getByText("ANALYSIS")).toBeInTheDocument();
    });

    it("hides type badges when showTypeBadges=false", () => {
      mockStore("task-1", [createMockStep("step-1", "analysis")]);
      render(<ThinkingPanel taskId="task-1" showTypeBadges={false} />);

      expect(screen.queryByText("ANALYSIS")).not.toBeInTheDocument();
    });

    it("displays duration when step has duration", () => {
      mockStore("task-1", [
        createMockStep("step-1", "reasoning", "content", { duration: 1700 }),
      ]);
      render(<ThinkingPanel taskId="task-1" />);

      expect(screen.getByText("1.7s")).toBeInTheDocument();
    });

    it("displays metadata (hat, iteration, tokens)", () => {
      mockStore("task-1", [
        createMockStep("step-1", "reasoning", "content", {
          metadata: {
            hat: "architect",
            iteration: 3,
            tokens: 1500,
          },
        }),
      ]);
      render(<ThinkingPanel taskId="task-1" />);

      expect(screen.getByText(/architect/)).toBeInTheDocument();
      expect(screen.getByText(/3/)).toBeInTheDocument();
      expect(screen.getByText(/1,500/)).toBeInTheDocument();
    });
  });

  describe("Search", () => {
    it("filters steps by search query", async () => {
      mockStore("task-1", [
        createMockStep("step-1", "reasoning", "Finding authentication"),
        createMockStep("step-2", "planning", "Planning database schema"),
        createMockStep("step-3", "analysis", "Analyzing auth flow"),
      ]);
      render(<ThinkingPanel taskId="task-1" showSearch={true} />);

      const searchInput = screen.getByPlaceholderText("Search thoughts...");
      fireEvent.change(searchInput, { target: { value: "auth" } });

      await waitFor(() => {
        expect(screen.getByText("Finding authentication")).toBeInTheDocument();
        expect(screen.getByText("Analyzing auth flow")).toBeInTheDocument();
        expect(screen.queryByText("Planning database schema")).not.toBeInTheDocument();
      });
    });

    it("shows empty state when no matches", async () => {
      mockStore("task-1", [createMockStep("step-1", "reasoning", "content")]);
      render(<ThinkingPanel taskId="task-1" showSearch={true} />);

      const searchInput = screen.getByPlaceholderText("Search thoughts...");
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });

      await waitFor(() => {
        expect(screen.getByText("No steps match your search")).toBeInTheDocument();
      });
    });

    it("clears search when X is clicked", async () => {
      mockStore("task-1", [createMockStep("step-1", "reasoning", "content")]);
      render(<ThinkingPanel taskId="task-1" showSearch={true} />);

      const searchInput = screen.getByPlaceholderText("Search thoughts...");
      fireEvent.change(searchInput, { target: { value: "test" } });

      await waitFor(() => {
        expect(searchInput).toHaveValue("test");
      });

      // Click clear button
      const clearButton = screen.getByLabelText("Clear search");
      fireEvent.click(clearButton);

      expect(searchInput).toHaveValue("");
    });

    it("hides search bar when showSearch=false", () => {
      mockStore("task-1", [createMockStep("step-1")]);
      render(<ThinkingPanel taskId="task-1" showSearch={false} />);

      expect(screen.queryByPlaceholderText("Search thoughts...")).not.toBeInTheDocument();
    });
  });

  describe("Type Filter", () => {
    it("filters by step type using dropdown", async () => {
      mockStore("task-1", [
        createMockStep("step-1", "reasoning"),
        createMockStep("step-2", "planning"),
        createMockStep("step-3", "error"),
      ]);
      render(<ThinkingPanel taskId="task-1" showSearch={true} />);

      // Open dropdown and select "Error"
      const select = screen.getByLabelText("Filter by type");
      fireEvent.change(select, { target: { value: "error" } });

      await waitFor(() => {
        expect(screen.getByText("ERROR")).toBeInTheDocument();
        expect(screen.queryByText("REASONING")).not.toBeInTheDocument();
        expect(screen.queryByText("PLANNING")).not.toBeInTheDocument();
      });
    });

    it("respects filterTypes prop", () => {
      mockStore("task-1", [
        createMockStep("step-1", "reasoning"),
        createMockStep("step-2", "planning"),
        createMockStep("step-3", "error"),
      ]);
      render(
        <ThinkingPanel taskId="task-1" filterTypes={["reasoning", "planning"]} />
      );

      expect(screen.getByText("REASONING")).toBeInTheDocument();
      expect(screen.getByText("PLANNING")).toBeInTheDocument();
      expect(screen.queryByText("ERROR")).not.toBeInTheDocument();
    });
  });

  describe("Click Handling", () => {
    it("calls onStepClick when step is clicked", () => {
      const step = createMockStep("step-1", "reasoning", "clickable content");
      mockStore("task-1", [step]);
      const onStepClick = vi.fn();

      render(<ThinkingPanel taskId="task-1" onStepClick={onStepClick} />);

      fireEvent.click(screen.getByText("clickable content"));

      expect(onStepClick).toHaveBeenCalledWith(step);
    });
  });

  describe("Footer Stats", () => {
    it("displays filtered count when filtering", async () => {
      mockStore("task-1", [
        createMockStep("step-1"),
        createMockStep("step-2"),
        createMockStep("step-3"),
      ]);
      render(<ThinkingPanel taskId="task-1" showSearch={true} />);

      const searchInput = screen.getByPlaceholderText("Search thoughts...");
      fireEvent.change(searchInput, { target: { value: "nonexistent" } });

      await waitFor(() => {
        expect(screen.getByText(/0 of 3 steps/)).toBeInTheDocument();
      });
    });

    it("displays total tokens when available", () => {
      mockStore("task-1", [createMockStep("step-1")], { totalTokens: 5000 });
      render(<ThinkingPanel taskId="task-1" />);

      expect(screen.getByText(/5,000 tokens/)).toBeInTheDocument();
    });
  });
});
