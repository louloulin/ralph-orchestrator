/**
 * TeamVelocityCard and TeamVelocityBadge Component Tests
 *
 * Tests for the team velocity components which display:
 * - Team velocity metrics
 * - Completion predictions
 * - Velocity history
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamVelocityCard, TeamVelocityBadge } from "./TeamVelocityCard";
import { trpc } from "@/trpc";

// Mock tRPC
vi.mock("@/trpc", () => ({
  trpc: {
    teams: {
      getVelocity: {
        useQuery: vi.fn(),
      },
      predictCompletion: {
        useQuery: vi.fn(),
      },
      getVelocityHistory: {
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

// Helper to create mock velocity data
const createMockVelocityData = (overrides = {}) => ({
  success: true,
  data: {
    velocity: 2.5,
    total_completed: 42,
    tasks_last_hour: 3,
    tasks_last_24h: 15,
    tasks_last_7d: 42,
    ...overrides,
  },
});

// Helper to create mock prediction data
const createMockPredictionData = (overrides = {}) => ({
  success: true,
  data: {
    hours_remaining: 8.5,
    trend: 0.15,
    open_tasks: 5,
    ...overrides,
  },
});

// Helper to create mock history data
const createMockHistoryData = (overrides = {}) => ({
  success: true,
  data: {
    samples: [
      { timestamp: "2026-03-01T10:00:00Z", velocity: 2.0 },
      { timestamp: "2026-03-01T11:00:00Z", velocity: 2.5 },
      { timestamp: "2026-03-01T12:00:00Z", velocity: 3.0 },
    ],
    ...overrides,
  },
});

describe("TeamVelocityCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default mock for history - used in loading state tests
      (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });
    });

    it("shows skeleton while loading velocity", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: true,
        data: undefined,
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" />);

      // Check for skeleton elements
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("shows skeleton while loading prediction", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: true,
        data: undefined,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={true} />);

      // Check for skeleton elements
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default mock for history
      (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });
    });

    it("shows error message when velocity query fails", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: undefined,
        error: { message: "Failed to load" },
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" />);

      expect(screen.getByText("Unable to load velocity metrics")).toBeInTheDocument();
    });

    it("shows error message when data has success=false", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: { success: false, error: "Team not found" },
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" />);

      expect(screen.getByText("Unable to load velocity metrics")).toBeInTheDocument();
    });
  });

  describe("data display", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default mock for history
      (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });
    });

    it("displays velocity value", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData({ velocity: 3.5 }),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={false} />);

      expect(screen.getByText(/3.50/)).toBeInTheDocument();
      expect(screen.getByText("/hr")).toBeInTheDocument();
    });

    it("displays total completed tasks", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData({ total_completed: 100 }),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={false} />);

      expect(screen.getByText("100")).toBeInTheDocument();
    });

    it("displays time range stats", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData({
          tasks_last_hour: 5,
          tasks_last_24h: 20,
          tasks_last_7d: 80,
        }),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={false} />);

      expect(screen.getByText("Last Hour")).toBeInTheDocument();
      expect(screen.getByText("5 tasks")).toBeInTheDocument();
      expect(screen.getByText("Last 24h")).toBeInTheDocument();
      expect(screen.getByText("20 tasks")).toBeInTheDocument();
      expect(screen.getByText("Last 7d")).toBeInTheDocument();
      expect(screen.getByText("80 tasks")).toBeInTheDocument();
    });

    it("displays zero values when no data", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData({
          velocity: 0,
          total_completed: 0,
          tasks_last_hour: 0,
          tasks_last_24h: 0,
          tasks_last_7d: 0,
        }),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={false} />);

      expect(screen.getByText(/0.00/)).toBeInTheDocument();
      expect(screen.getAllByText("0 tasks").length).toBe(3); // 3 time ranges
    });
  });

  describe("prediction display", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Default mock for history
      (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });
    });

    it("shows prediction section when enabled and data available", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockPredictionData({ hours_remaining: 10.5 }),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={true} />);

      expect(screen.getByText("Prediction")).toBeInTheDocument();
      expect(screen.getByText("Hours Remaining")).toBeInTheDocument();
    });

    it("hides prediction section when showPrediction is false", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockPredictionData(),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={false} />);

      expect(screen.queryByText("Prediction")).not.toBeInTheDocument();
    });

    it("displays accelerating trend with up arrow", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockPredictionData({ trend: 0.5 }),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={true} />);

      expect(screen.getByText("Accelerating")).toBeInTheDocument();
    });

    it("displays decelerating trend with down arrow", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockPredictionData({ trend: -0.5 }),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={true} />);

      expect(screen.getByText("Decelerating")).toBeInTheDocument();
    });

    it("displays stable trend with minus", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockPredictionData({ trend: 0.05 }),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showPrediction={true} />);

      expect(screen.getByText("Stable")).toBeInTheDocument();
    });
  });

  describe("history display", () => {
    it("loads history when showHistory is true", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });
      (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockHistoryData(),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showHistory={true} />);

      // History data is loaded - verify hook was called
      expect(trpc.teams.getVelocityHistory.useQuery).toHaveBeenCalled();
    });

    it("does not load history when showHistory is false", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showHistory={false} />);

      // History hook should not be called with enabled: false
      const historyCall = (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>);
      // The query should have enabled: false when showHistory is false
      expect(historyCall).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ enabled: false })
      );
    });
  });

  describe("prop handling", () => {
    it("passes teamId to queries", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });

      render(<TeamVelocityCard teamId="test-team-id" />);

      // Verify teamId is passed to getVelocity
      expect(trpc.teams.getVelocity.useQuery).toHaveBeenCalledWith(
        { teamId: "test-team-id" },
        expect.any(Object)
      );
    });

    it("uses correct duration for history query", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: null,
        error: null,
      });
      (trpc.teams.getVelocityHistory.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockHistoryData(),
        error: null,
      });

      render(<TeamVelocityCard teamId="team-123" showHistory={true} />);

      // Verify default duration is 24 hours
      expect(trpc.teams.getVelocityHistory.useQuery).toHaveBeenCalledWith(
        { teamId: "team-123", durationHours: 24 },
        expect.any(Object)
      );
    });

    it("does not query when teamId is empty", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: true,
        data: undefined,
        error: null,
      });
      (trpc.teams.predictCompletion.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: true,
        data: undefined,
        error: null,
      });

      render(<TeamVelocityCard teamId="" />);

      // Queries should have enabled: false when teamId is empty/falsy
      expect(trpc.teams.getVelocity.useQuery).toHaveBeenCalledWith(
        { teamId: "" },
        expect.objectContaining({ enabled: false })
      );
    });
  });
});

describe("TeamVelocityBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("shows skeleton while loading", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: true,
        data: undefined,
        error: null,
      });

      render(<TeamVelocityBadge teamId="team-123" />);

      const skeleton = document.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
    });
  });

  describe("data display", () => {
    it("displays velocity value", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData({ velocity: 2.5 }),
        error: null,
      });

      render(<TeamVelocityBadge teamId="team-123" />);

      expect(screen.getByText(/2.5\/hr/)).toBeInTheDocument();
    });

    it("displays zero velocity", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData({ velocity: 0 }),
        error: null,
      });

      render(<TeamVelocityBadge teamId="team-123" />);

      expect(screen.getByText(/0.0\/hr/)).toBeInTheDocument();
    });

    it("handles missing data gracefully", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: undefined,
        error: null,
      });

      render(<TeamVelocityBadge teamId="team-123" />);

      expect(screen.getByText(/0.0\/hr/)).toBeInTheDocument();
    });

    it("handles null velocity in data", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: { success: true, data: { velocity: null } },
        error: null,
      });

      render(<TeamVelocityBadge teamId="team-123" />);

      // Should display "N/A" or handle null gracefully
      expect(screen.getByText(/0.0\/hr| N\/A/)).toBeInTheDocument();
    });
  });

  describe("prop handling", () => {
    it("passes teamId to query", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: false,
        data: createMockVelocityData(),
        error: null,
      });

      render(<TeamVelocityBadge teamId="badge-team-123" />);

      expect(trpc.teams.getVelocity.useQuery).toHaveBeenCalledWith(
        { teamId: "badge-team-123" },
        expect.any(Object)
      );
    });

    it("disables query when teamId is empty", () => {
      (trpc.teams.getVelocity.useQuery as ReturnType<typeof vi.fn>).mockReturnValue({
        isLoading: true,
        data: undefined,
        error: null,
      });

      render(<TeamVelocityBadge teamId="" />);

      expect(trpc.teams.getVelocity.useQuery).toHaveBeenCalledWith(
        { teamId: "" },
        expect.objectContaining({ enabled: false })
      );
    });
  });
});
