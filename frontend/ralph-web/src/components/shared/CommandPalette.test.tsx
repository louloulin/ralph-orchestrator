/**
 * CommandPalette Component Tests
 *
 * Tests for the global command palette component.
 */

import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandPalette } from "./CommandPalette";

// Mock ResizeObserver for cmdk library
const ResizeObserverMock = vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

// Mock scrollIntoView for cmdk library
Element.prototype.scrollIntoView = vi.fn();

// Mock the Zustand store
vi.mock("@/stores/commandPaletteStore", () => ({
  useCommandPaletteStore: vi.fn(() => ({
    recentCommands: [],
    addToHistory: vi.fn(),
    clearHistory: vi.fn(),
  })),
}));

// Mock tRPC hooks
vi.mock("@/trpc", () => {
  const noop = () => {};
  const createMockMutation = () => ({
    mutate: noop,
    mutateAsync: async () => ({}),
    isPending: false,
    isError: false,
    error: null,
  });

  return {
    trpc: {
      task: {
        create: { useMutation: () => createMockMutation() },
        run: { useMutation: () => createMockMutation() },
        list: {
          useQuery: () => ({
            data: [],
            isLoading: false,
            isError: false,
          }),
        },
      },
      loops: {
        list: {
          useQuery: () => ({
            data: [],
            isLoading: false,
            isError: false,
          }),
        },
      },
      useUtils: () => ({
        task: { list: { invalidate: noop } },
        loops: { list: { invalidate: noop } },
      }),
    },
  };
});

function createTestWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}

// Helper to render with router context
function renderWithRouter(ui: React.ReactElement) {
  const wrapper = createTestWrapper();
  return render(ui, { wrapper });
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
    cleanup();
  });

  it("is hidden by default", () => {
    renderWithRouter(<CommandPalette />);
    expect(screen.queryByPlaceholderText("Type a command or search...")).not.toBeInTheDocument();
  });

  it("opens on Cmd+K (Mac)", async () => {
    renderWithRouter(<CommandPalette />);

    // Simulate Cmd+K
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });
  });

  it("opens on Ctrl+K (Windows/Linux)", async () => {
    renderWithRouter(<CommandPalette />);

    // Simulate Ctrl+K
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });
  });

  it("closes on Escape", async () => {
    renderWithRouter(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });

    // Close with Escape
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Type a command or search...")).not.toBeInTheDocument();
    });
  });

  it("closes when clicking the backdrop", async () => {
    renderWithRouter(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });

    // Click the backdrop (the overlay div with onClick handler)
    // The backdrop is the parent div with fixed inset-0
    const container = document.querySelector(".fixed.inset-0.z-50");
    if (container) {
      fireEvent.click(container);
    }

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Type a command or search...")).not.toBeInTheDocument();
    });
  });

  it("toggles between command and task mode", async () => {
    renderWithRouter(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });

    // Click on "New Task" tab (using role="tab" for specificity)
    const taskTab = screen.getByRole("tab", { name: /new task/i });
    fireEvent.click(taskTab);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Describe your task... (Press Enter to submit)")).toBeInTheDocument();
    });

    // Click back on "Commands" tab
    const commandsTab = screen.getByRole("tab", { name: /commands/i });
    fireEvent.click(commandsTab);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });
  });

  it("displays command groups", async () => {
    renderWithRouter(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      // Check for group headings
      expect(screen.getByText("Navigation")).toBeInTheDocument();
      expect(screen.getByText("Tasks")).toBeInTheDocument();
      expect(screen.getByText("Actions")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });
  });

  it("shows empty state when no commands match", async () => {
    renderWithRouter(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a command or search...")).toBeInTheDocument();
    });

    // Type a non-matching query
    const input = screen.getByPlaceholderText("Type a command or search...");
    fireEvent.change(input, { target: { value: "zzzzzzzzz" } });

    await waitFor(() => {
      expect(screen.getByText("No commands found.")).toBeInTheDocument();
    });
  });

  it("has keyboard shortcut hints in footer", async () => {
    renderWithRouter(<CommandPalette />);

    // Open the palette
    fireEvent.keyDown(document, { key: "k", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText(/navigate/i)).toBeInTheDocument();
      expect(screen.getByText(/select/i)).toBeInTheDocument();
      expect(screen.getByText(/close/i)).toBeInTheDocument();
    });
  });
});
