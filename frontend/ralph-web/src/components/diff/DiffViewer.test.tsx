/**
 * DiffViewer Component Tests
 *
 * Tests for the DiffViewer component that displays code changes in real-time.
 *
 * @see .ralph/specs/web-dashboard/diff-viewer.spec.md
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DiffViewer,
  DiffStats,
  DiffLine,
  DiffHunk,
  DiffFile,
  DiffFileTree,
  TotalStats,
  DiffToolbar,
  EmptyState,
} from "./DiffViewer";
import { useDiffStore } from "@/stores/diffStore";
import type { FileDiff, DiffHunk as DiffHunkType, DiffLine as DiffLineType, DiffTotalStats } from "@/types/diff";

// Mock the store
vi.mock("@/stores/diffStore", () => ({
  useDiffStore: vi.fn(),
}));

// Helper to create mock diff data
function createMockFileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    id: "file-1",
    oldPath: "src/test.ts",
    newPath: "src/test.ts",
    changeType: "modified",
    hunks: [
      {
        header: "@@ -1,5 +1,7 @@",
        oldStart: 1,
        oldLines: 5,
        newStart: 1,
        newLines: 7,
        lines: [
          { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "const x = 1;" },
          { type: "delete", oldLineNumber: 2, content: "const y = 2;" },
          { type: "add", newLineNumber: 2, content: "const y = 3;" },
          { type: "add", newLineNumber: 3, content: "const z = 4;" },
          { type: "context", oldLineNumber: 3, newLineNumber: 4, content: "console.log(x)" },
        ],
      },
    ],
    stats: { additions: 2, deletions: 1, total: 3 },
    language: "typescript",
    ...overrides,
  };
}

function createMockHunk(): DiffHunkType {
  return {
    header: "@@ -1,3 +1,3 @@",
    oldStart: 1,
    oldLines: 3,
    newStart: 1,
    newLines: 3,
    lines: [
      { type: "context", oldLineNumber: 1, newLineNumber: 1, content: "line 1" },
      { type: "delete", oldLineNumber: 2, content: "old line 2" },
      { type: "add", newLineNumber: 2, content: "new line 2" },
    ],
  };
}

describe("DiffViewer", () => {
  let mockStore: {
    getFiles: ReturnType<typeof vi.fn>;
    getTotalStats: ReturnType<typeof vi.fn>;
    hasSession: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockStore = {
      getFiles: vi.fn().mockReturnValue([]),
      getTotalStats: vi.fn().mockReturnValue({ filesChanged: 0, additions: 0, deletions: 0 }),
      hasSession: vi.fn().mockReturnValue(false),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useDiffStore as any).mockImplementation((selector: (state: typeof mockStore) => unknown) => {
      if (typeof selector === "function") {
        return selector(mockStore);
      }
      return mockStore;
    });
  });

  describe("Empty state", () => {
    it("renders empty state when no session exists", () => {
      mockStore.hasSession.mockReturnValue(false);

      render(<DiffViewer taskId="task-1" />);

      expect(screen.getByText("No code changes yet")).toBeInTheDocument();
    });

    it("renders empty state when files array is empty", () => {
      mockStore.hasSession.mockReturnValue(true);
      mockStore.getFiles.mockReturnValue([]);

      render(<DiffViewer taskId="task-1" />);

      expect(screen.getByText("No code changes yet")).toBeInTheDocument();
    });
  });

  describe("With files", () => {
    beforeEach(() => {
      mockStore.hasSession.mockReturnValue(true);
      mockStore.getFiles.mockReturnValue([createMockFileDiff()]);
      mockStore.getTotalStats.mockReturnValue({
        filesChanged: 1,
        additions: 2,
        deletions: 1,
      });
    });

    it("renders file list correctly", () => {
      render(<DiffViewer taskId="task-1" />);

      expect(screen.getByText("src/test.ts")).toBeInTheDocument();
    });

    it("shows diff statistics for each file", () => {
      render(<DiffViewer taskId="task-1" />);

      // Check total stats in toolbar
      const greenStats = screen.getAllByText(/\+2/);
      expect(greenStats.length).toBeGreaterThan(0);
      const redStats = screen.getAllByText(/-1/);
      expect(redStats.length).toBeGreaterThan(0);
    });

    it("switches between unified and split view", async () => {
      const user = userEvent.setup();

      render(<DiffViewer taskId="task-1" />);

      // Default is unified
      const unifiedButton = screen.getByRole("button", { name: "Unified view" });
      expect(unifiedButton).toHaveClass("bg-zinc-700");

      // Switch to split
      await user.click(screen.getByRole("button", { name: "Split view" }));

      // Split should now be active
      expect(screen.getByRole("button", { name: "Split view" })).toHaveClass("bg-zinc-700");
    });

    it("collapses and expands file sections", async () => {
      const user = userEvent.setup();

      render(<DiffViewer taskId="task-1" />);

      // File content should be visible initially
      const fileHeader = screen.getByRole("button", { expanded: true });

      // Collapse
      await user.click(fileHeader);

      // Should now be collapsed
      expect(fileHeader).toHaveAttribute("aria-expanded", "false");
    });

    it("shows file tree when showFileTree is true", () => {
      render(<DiffViewer taskId="task-1" showFileTree={true} />);

      expect(screen.getByText(/Files \(1\)/)).toBeInTheDocument();
    });

    it("hides file tree when showFileTree is false", () => {
      render(<DiffViewer taskId="task-1" showFileTree={false} />);

      expect(screen.queryByText(/Files/)).not.toBeInTheDocument();
    });

    it("filters files when filePaths is provided", () => {
      const file1 = createMockFileDiff({ id: "file-1", newPath: "src/a.ts" });
      const file2 = createMockFileDiff({ id: "file-2", newPath: "src/b.ts" });
      mockStore.getFiles.mockReturnValue([file1, file2]);

      render(<DiffViewer taskId="task-1" filePaths={["src/a.ts"]} />);

      expect(screen.getByText("src/a.ts")).toBeInTheDocument();
      expect(screen.queryByText("src/b.ts")).not.toBeInTheDocument();
    });

    it("calls onOpenInEditor when open button is clicked", async () => {
      const user = userEvent.setup();
      const onOpenInEditor = vi.fn();

      render(<DiffViewer taskId="task-1" onOpenInEditor={onOpenInEditor} />);

      const openButton = screen.getByRole("button", { name: /Open.*in editor/ });
      await user.click(openButton);

      expect(onOpenInEditor).toHaveBeenCalledWith("src/test.ts");
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      mockStore.hasSession.mockReturnValue(true);
      mockStore.getFiles.mockReturnValue([createMockFileDiff()]);
      mockStore.getTotalStats.mockReturnValue({
        filesChanged: 1,
        additions: 2,
        deletions: 1,
      });
    });

    it("has correct keyboard navigation for file tree", async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(
        <DiffFileTree
          files={[createMockFileDiff(), createMockFileDiff({ id: "file-2", newPath: "src/other.ts" })]}
          selectedIndex={0}
          onSelect={onSelect}
        />
      );

      const firstFile = screen.getByRole("button", { name: /test\.ts/ });
      firstFile.focus();

      // Arrow down should select next file
      await user.keyboard("{ArrowDown}");
      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("has correct aria-expanded attribute", () => {
      render(<DiffViewer taskId="task-1" />);

      const fileHeader = screen.getByRole("button", { expanded: true });
      expect(fileHeader).toHaveAttribute("aria-expanded", "true");
    });
  });
});

describe("DiffStats", () => {
  it("displays additions and deletions", () => {
    render(<DiffStats stats={{ additions: 5, deletions: 3, total: 8 }} />);

    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByText("-3")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DiffStats stats={{ additions: 1, deletions: 1, total: 2 }} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });
});

describe("TotalStats", () => {
  it("displays file count and totals", () => {
    const stats: DiffTotalStats = { filesChanged: 3, additions: 10, deletions: 5 };
    render(<TotalStats stats={stats} />);

    expect(screen.getByText(/3 files changed/)).toBeInTheDocument();
    expect(screen.getByText("+10")).toBeInTheDocument();
    expect(screen.getByText("-5")).toBeInTheDocument();
  });

  it("uses singular form for single file", () => {
    const stats: DiffTotalStats = { filesChanged: 1, additions: 1, deletions: 0 };
    render(<TotalStats stats={stats} />);

    expect(screen.getByText(/1 file changed/)).toBeInTheDocument();
  });
});

describe("DiffLine", () => {
  const baseProps = {
    viewMode: "unified" as const,
    showLineNumbers: true,
  };

  describe("Context line", () => {
    it("renders context line correctly", () => {
      const line: DiffLineType = {
        type: "context",
        oldLineNumber: 1,
        newLineNumber: 1,
        content: "const x = 1;",
      };

      render(<DiffLine line={line} {...baseProps} />);

      expect(screen.getByText("const x = 1;")).toBeInTheDocument();
      // Line numbers appear twice (old and new), both showing "1"
      const lineNumbers = screen.getAllByText("1");
      expect(lineNumbers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Add line", () => {
    it("renders add line with green styling", () => {
      const line: DiffLineType = {
        type: "add",
        newLineNumber: 2,
        content: "const y = 2;",
      };

      const { container } = render(<DiffLine line={line} {...baseProps} />);

      expect(screen.getByText("const y = 2;")).toBeInTheDocument();
      expect(container.firstChild).toHaveClass("bg-green-900/30");
    });
  });

  describe("Delete line", () => {
    it("renders delete line with red styling", () => {
      const line: DiffLineType = {
        type: "delete",
        oldLineNumber: 2,
        content: "const old = 0;",
      };

      const { container } = render(<DiffLine line={line} {...baseProps} />);

      expect(screen.getByText("const old = 0;")).toBeInTheDocument();
      expect(container.firstChild).toHaveClass("bg-red-900/30");
    });
  });

  describe("Header line", () => {
    it("renders header line", () => {
      const line: DiffLineType = {
        type: "header",
        content: "@@ -1,5 +1,7 @@",
      };

      render(<DiffLine line={line} {...baseProps} />);

      expect(screen.getByText("@@ -1,5 +1,7 @@")).toBeInTheDocument();
    });
  });

  describe("Split view", () => {
    it("renders split view correctly for add line", () => {
      const line: DiffLineType = {
        type: "add",
        newLineNumber: 2,
        content: "const y = 2;",
      };

      const { container } = render(
        <DiffLine line={line} viewMode="split" showLineNumbers={true} />
      );

      expect(screen.getByText("const y = 2;")).toBeInTheDocument();
      // Should have two sides
      const sides = container.querySelectorAll(".flex-1");
      expect(sides.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Hidden line numbers", () => {
    it("hides line numbers when showLineNumbers is false", () => {
      const line: DiffLineType = {
        type: "context",
        oldLineNumber: 1,
        newLineNumber: 1,
        content: "test",
      };

      const { container } = render(
        <DiffLine line={line} viewMode="unified" showLineNumbers={false} />
      );

      // No line number columns should be present
      expect(container.querySelector(".w-10")).not.toBeInTheDocument();
    });
  });
});

describe("DiffHunk", () => {
  const baseProps = {
    viewMode: "unified" as const,
    showLineNumbers: true,
    enableHighlighting: false,
  };

  it("renders hunk header and lines", () => {
    const hunk = createMockHunk();

    render(<DiffHunk hunk={hunk} {...baseProps} />);

    expect(screen.getByText("@@ -1,3 +1,3 @@")).toBeInTheDocument();
    expect(screen.getByText("line 1")).toBeInTheDocument();
    expect(screen.getByText("old line 2")).toBeInTheDocument();
    expect(screen.getByText("new line 2")).toBeInTheDocument();
  });
});

describe("DiffFile", () => {
  const baseProps = {
    viewMode: "unified" as const,
    showLineNumbers: true,
    enableHighlighting: false,
  };

  it("renders file header with path and stats", () => {
    const file = createMockFileDiff();

    render(<DiffFile file={file} {...baseProps} />);

    expect(screen.getByText("src/test.ts")).toBeInTheDocument();
    expect(screen.getByText("Modified")).toBeInTheDocument();
  });

  it("shows renamed file with old path", () => {
    const file = createMockFileDiff({
      changeType: "renamed",
      oldPath: "src/old.ts",
      newPath: "src/new.ts",
    });

    render(<DiffFile file={file} {...baseProps} />);

    expect(screen.getByText(/from src\/old\.ts/)).toBeInTheDocument();
  });

  it("expands/collapses on click", async () => {
    const user = userEvent.setup();
    const file = createMockFileDiff();

    render(<DiffFile file={file} {...baseProps} />);

    const header = screen.getByRole("button", { expanded: true });

    // Collapse
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");

    // Expand
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
  });

  it("starts collapsed when defaultCollapsed is true", () => {
    const file = createMockFileDiff();

    render(<DiffFile file={file} {...baseProps} defaultCollapsed={true} />);

    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();
  });

  it("shows empty state for deleted file with no hunks", () => {
    const file = createMockFileDiff({
      changeType: "deleted",
      hunks: [],
    });

    render(<DiffFile file={file} {...baseProps} defaultCollapsed={false} />);

    expect(screen.getByText("File was deleted")).toBeInTheDocument();
  });

  it("calls onOpenInEditor when button is clicked", async () => {
    const user = userEvent.setup();
    const onOpenInEditor = vi.fn();
    const file = createMockFileDiff();

    render(
      <DiffFile file={file} {...baseProps} onOpenInEditor={onOpenInEditor} />
    );

    await user.click(screen.getByRole("button", { name: /Open.*in editor/ }));

    expect(onOpenInEditor).toHaveBeenCalledWith("src/test.ts");
  });

  describe("Change type icons", () => {
    it("shows add icon for added file", () => {
      const file = createMockFileDiff({ changeType: "added" });
      const { container } = render(<DiffFile file={file} {...baseProps} />);

      expect(container.querySelector(".text-green-500")).toBeInTheDocument();
    });

    it("shows delete icon for deleted file", () => {
      const file = createMockFileDiff({ changeType: "deleted" });
      const { container } = render(<DiffFile file={file} {...baseProps} />);

      expect(container.querySelector(".text-red-500")).toBeInTheDocument();
    });

    it("shows rename icon for renamed file", () => {
      const file = createMockFileDiff({ changeType: "renamed" });
      const { container } = render(<DiffFile file={file} {...baseProps} />);

      expect(container.querySelector(".text-amber-500")).toBeInTheDocument();
    });
  });
});

describe("DiffFileTree", () => {
  it("renders list of files", () => {
    const files = [
      createMockFileDiff({ id: "file-1", newPath: "src/a.ts" }),
      createMockFileDiff({ id: "file-2", newPath: "src/b.ts" }),
    ];

    render(
      <DiffFileTree files={files} selectedIndex={0} onSelect={() => {}} />
    );

    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("b.ts")).toBeInTheDocument();
    expect(screen.getByText(/Files \(2\)/)).toBeInTheDocument();
  });

  it("highlights selected file", () => {
    const files = [
      createMockFileDiff({ id: "file-1", newPath: "src/a.ts" }),
      createMockFileDiff({ id: "file-2", newPath: "src/b.ts" }),
    ];

    render(
      <DiffFileTree files={files} selectedIndex={1} onSelect={() => {}} />
    );

    // Find buttons that are file items (not the header)
    const fileButtons = screen.getAllByRole("button").filter(
      btn => btn.textContent?.includes(".ts")
    );

    // Second file (index 1) should be selected
    expect(fileButtons[1]).toHaveClass("border-l-2");
  });

  it("calls onSelect when file is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const files = [
      createMockFileDiff({ id: "file-1", newPath: "src/a.ts" }),
      createMockFileDiff({ id: "file-2", newPath: "src/b.ts" }),
    ];

    render(
      <DiffFileTree files={files} selectedIndex={0} onSelect={onSelect} />
    );

    await user.click(screen.getByText("b.ts"));

    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe("DiffToolbar", () => {
  const defaultStats: DiffTotalStats = {
    filesChanged: 2,
    additions: 10,
    deletions: 5,
  };

  it("displays stats", () => {
    render(
      <DiffToolbar
        viewMode="unified"
        onViewModeChange={() => {}}
        stats={defaultStats}
      />
    );

    expect(screen.getByText(/2 files changed/)).toBeInTheDocument();
  });

  it("shows view mode buttons", () => {
    render(
      <DiffToolbar
        viewMode="unified"
        onViewModeChange={() => {}}
        stats={defaultStats}
      />
    );

    expect(screen.getByRole("button", { name: "Unified view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Split view" })).toBeInTheDocument();
  });

  it("highlights active view mode", () => {
    const { rerender } = render(
      <DiffToolbar
        viewMode="unified"
        onViewModeChange={() => {}}
        stats={defaultStats}
      />
    );

    expect(screen.getByRole("button", { name: "Unified view" })).toHaveClass("bg-zinc-700");

    rerender(
      <DiffToolbar
        viewMode="split"
        onViewModeChange={() => {}}
        stats={defaultStats}
      />
    );

    expect(screen.getByRole("button", { name: "Split view" })).toHaveClass("bg-zinc-700");
  });

  it("calls onViewModeChange when button is clicked", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();

    render(
      <DiffToolbar
        viewMode="unified"
        onViewModeChange={onViewModeChange}
        stats={defaultStats}
      />
    );

    await user.click(screen.getByRole("button", { name: "Split view" }));

    expect(onViewModeChange).toHaveBeenCalledWith("split");
  });
});

describe("EmptyState", () => {
  it("renders empty state message", () => {
    render(<EmptyState />);

    expect(screen.getByText("No code changes yet")).toBeInTheDocument();
    expect(screen.getByText(/Changes will appear here/)).toBeInTheDocument();
  });
});
