/**
 * Kanban Components Tests
 *
 * Tests for KanbanBoard, KanbanColumn, and KanbanCard components.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KanbanPage } from "./KanbanPage";

// Mock tRPC hooks
vi.mock("@/trpc", () => ({
  trpc: {
    task: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          isError: false,
        }),
      },
      update: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
        }),
      },
    },
    loops: {
      list: {
        useQuery: () => ({
          data: [],
          isLoading: false,
        }),
      },
    },
    useUtils: () => ({
      task: {
        list: {
          invalidate: vi.fn(),
        },
      },
    }),
  },
}));

// Helper to render with router
function renderWithRouter() {
  return render(
    <MemoryRouter>
      <KanbanPage />
    </MemoryRouter>
  );
}

describe("KanbanPage", () => {
  it("renders the page title", () => {
    renderWithRouter();
    expect(screen.getByText("Kanban Board")).toBeInTheDocument();
  });

  it("renders the page description", () => {
    renderWithRouter();
    expect(
      screen.getByText("Drag and drop tasks between columns to update their status")
    ).toBeInTheDocument();
  });

  it("renders the card title", () => {
    renderWithRouter();
    expect(screen.getByText("Task Board")).toBeInTheDocument();
  });

  it("renders the card description", () => {
    renderWithRouter();
    expect(
      screen.getByText("Tasks organized by workflow stage. Drag cards to move between columns.")
    ).toBeInTheDocument();
  });

  it("renders all four columns", () => {
    renderWithRouter();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("renders empty state for each column", () => {
    renderWithRouter();
    // Each column should have "No tasks" text when empty
    const noTasksElements = screen.getAllByText("No tasks");
    expect(noTasksElements).toHaveLength(4);
  });
});

describe("KanbanBoard", () => {
  it("renders column headers with task counts", () => {
    renderWithRouter();
    // Each column should have a count badge showing "0"
    const countBadges = screen.getAllByText("0");
    expect(countBadges).toHaveLength(4);
  });
});
