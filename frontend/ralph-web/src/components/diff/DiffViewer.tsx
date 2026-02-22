/**
 * DiffViewer Component
 *
 * Displays code changes (diffs) in real-time, inspired by Vibe Kanban's diff renderer.
 * Provides visual representation of file modifications made by AI agents during task execution.
 *
 * @see .ralph/specs/web-dashboard/diff-viewer.spec.md
 */

import { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useDiffStore } from "@/stores/diffStore";
import type {
  FileDiff,
  DiffHunk as DiffHunkType,
  DiffLine as DiffLineType,
  DiffStats as DiffStatsType,
  DiffTotalStats,
  DiffViewMode,
  FileChangeType,
} from "@/types/diff";
import {
  FILE_CHANGE_TYPE_COLORS,
  FILE_CHANGE_TYPE_LABELS,
} from "@/types/diff";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  FileOutput,
  Copy,
  ExternalLink,
} from "lucide-react";

// ============================================================================
// DiffStats Component
// ============================================================================

interface DiffStatsProps {
  stats: DiffStatsType;
  className?: string;
}

function DiffStats({ stats, className }: DiffStatsProps) {
  return (
    <span className={cn("text-xs font-mono", className)}>
      <span className="text-green-500">+{stats.additions}</span>
      <span className="text-zinc-500 mx-1">/</span>
      <span className="text-red-500">-{stats.deletions}</span>
    </span>
  );
}

// ============================================================================
// TotalStats Component
// ============================================================================

interface TotalStatsProps {
  stats: DiffTotalStats;
  className?: string;
}

function TotalStats({ stats, className }: TotalStatsProps) {
  return (
    <div className={cn("flex items-center gap-3 text-sm", className)}>
      <span className="text-zinc-400">
        {stats.filesChanged} file{stats.filesChanged !== 1 ? "s" : ""} changed
      </span>
      <span className="text-green-500">+{stats.additions}</span>
      <span className="text-red-500">-{stats.deletions}</span>
    </div>
  );
}

// ============================================================================
// DiffToolbar Component
// ============================================================================

interface DiffToolbarProps {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  stats: DiffTotalStats;
  className?: string;
}

function DiffToolbar({
  viewMode,
  onViewModeChange,
  stats,
  className,
}: DiffToolbarProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700",
        className
      )}
    >
      <h3 className="text-sm font-medium text-zinc-200">Code Changes</h3>
      <div className="flex items-center gap-4">
        <TotalStats stats={stats} />
        <div className="flex items-center gap-1 bg-zinc-900 rounded-md p-0.5">
          <button
            onClick={() => onViewModeChange("unified")}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              viewMode === "unified"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            )}
            aria-label="Unified view"
          >
            Unified
          </button>
          <button
            onClick={() => onViewModeChange("split")}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              viewMode === "split"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-zinc-200"
            )}
            aria-label="Split view"
          >
            Split
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DiffLine Component
// ============================================================================

interface DiffLineProps {
  line: DiffLineType;
  viewMode: DiffViewMode;
  showLineNumbers: boolean;
  language?: string;
  className?: string;
}

function DiffLine({
  line,
  viewMode,
  showLineNumbers,
  className,
}: DiffLineProps) {
  const lineTypeClass = {
    context: "bg-zinc-900 text-zinc-300",
    add: "bg-green-900/30 text-green-100",
    delete: "bg-red-900/30 text-red-100",
    header: "bg-zinc-800 text-zinc-400",
  }[line.type];

  const linePrefix = {
    context: " ",
    add: "+",
    delete: "-",
    header: "@",
  }[line.type];

  if (line.type === "header") {
    return (
      <div
        className={cn(
          "px-4 py-1 font-mono text-xs border-y border-zinc-700",
          lineTypeClass,
          className
        )}
      >
        {line.content}
      </div>
    );
  }

  if (viewMode === "split") {
    return (
      <div
        className={cn(
          "flex font-mono text-xs",
          line.type === "add" && "bg-green-900/30",
          line.type === "delete" && "bg-red-900/30",
          line.type === "context" && "bg-zinc-900",
          className
        )}
      >
        {/* Old line side */}
        <div className="flex-1 flex">
          {showLineNumbers && (
            <span className="w-10 px-2 text-right text-zinc-600 select-none bg-zinc-800/50">
              {line.oldLineNumber ?? ""}
            </span>
          )}
          <span
            className={cn(
              "w-6 text-center select-none",
              line.type === "delete" ? "text-red-400" : "text-zinc-600"
            )}
          >
            {line.type === "delete" || line.type === "context" ? linePrefix : ""}
          </span>
          <span
            className={cn(
              "flex-1 px-2",
              line.type === "delete" ? "text-red-100" : "text-zinc-300"
            )}
          >
            {(line.type === "delete" || line.type === "context") && line.content}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px bg-zinc-700" />

        {/* New line side */}
        <div className="flex-1 flex">
          {showLineNumbers && (
            <span className="w-10 px-2 text-right text-zinc-600 select-none bg-zinc-800/50">
              {line.newLineNumber ?? ""}
            </span>
          )}
          <span
            className={cn(
              "w-6 text-center select-none",
              line.type === "add" ? "text-green-400" : "text-zinc-600"
            )}
          >
            {line.type === "add" || line.type === "context" ? linePrefix : ""}
          </span>
          <span
            className={cn(
              "flex-1 px-2",
              line.type === "add" ? "text-green-100" : "text-zinc-300"
            )}
          >
            {(line.type === "add" || line.type === "context") && line.content}
          </span>
        </div>
      </div>
    );
  }

  // Unified view
  return (
    <div className={cn("flex font-mono text-xs", lineTypeClass, className)}>
      {showLineNumbers && (
        <>
          <span className="w-10 px-2 text-right text-zinc-600 select-none border-r border-zinc-700/50">
            {line.oldLineNumber ?? ""}
          </span>
          <span className="w-10 px-2 text-right text-zinc-600 select-none border-r border-zinc-700/50">
            {line.newLineNumber ?? ""}
          </span>
        </>
      )}
      <span
        className={cn(
          "w-6 text-center select-none",
          line.type === "add" && "text-green-400",
          line.type === "delete" && "text-red-400",
          line.type === "context" && "text-zinc-600"
        )}
      >
        {linePrefix}
      </span>
      <span className="flex-1 px-2 whitespace-pre-wrap break-all">
        {line.content}
      </span>
    </div>
  );
}

// ============================================================================
// DiffHunk Component
// ============================================================================

interface DiffHunkProps {
  hunk: DiffHunkType;
  viewMode: DiffViewMode;
  showLineNumbers: boolean;
  enableHighlighting: boolean;
  language?: string;
  className?: string;
}

function DiffHunk({
  hunk,
  viewMode,
  showLineNumbers,
  enableHighlighting,
  language,
  className,
}: DiffHunkProps) {
  return (
    <div className={cn("diff-hunk", className)}>
      {/* Hunk header */}
      <DiffLine
        line={{ type: "header", content: hunk.header }}
        viewMode={viewMode}
        showLineNumbers={showLineNumbers}
        language={language}
      />

      {/* Lines */}
      {hunk.lines.map((line, index) => (
        <DiffLine
          key={`${line.oldLineNumber ?? "old"}-${line.newLineNumber ?? "new"}-${index}`}
          line={line}
          viewMode={viewMode}
          showLineNumbers={showLineNumbers}
          language={enableHighlighting ? language : undefined}
        />
      ))}
    </div>
  );
}

// ============================================================================
// getFileIcon helper
// ============================================================================

function getFileIcon(changeType: FileChangeType, className?: string) {
  const iconClass = cn("w-4 h-4", className);

  switch (changeType) {
    case "added":
      return <FilePlus className={cn(iconClass, "text-green-500")} />;
    case "deleted":
      return <FileMinus className={cn(iconClass, "text-red-500")} />;
    case "renamed":
      return <FileOutput className={cn(iconClass, "text-amber-500")} />;
    case "copied":
      return <Copy className={cn(iconClass, "text-purple-500")} />;
    case "modified":
    default:
      return <FileEdit className={cn(iconClass, "text-blue-500")} />;
  }
}

// ============================================================================
// DiffFile Component
// ============================================================================

interface DiffFileProps {
  file: FileDiff;
  viewMode: DiffViewMode;
  showLineNumbers: boolean;
  enableHighlighting: boolean;
  defaultCollapsed?: boolean;
  onOpenInEditor?: (filePath: string, line?: number) => void;
  className?: string;
}

function DiffFile({
  file,
  viewMode,
  showLineNumbers,
  enableHighlighting,
  defaultCollapsed = false,
  onOpenInEditor,
  className,
}: DiffFileProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const handleOpenInEditor = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onOpenInEditor?.(file.newPath);
    },
    [file.newPath, onOpenInEditor]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    },
    [collapsed]
  );

  return (
    <div
      className={cn(
        "diff-file border border-zinc-700 rounded-lg overflow-hidden",
        className
      )}
      data-change-type={file.changeType}
    >
      {/* File header */}
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 bg-zinc-800 cursor-pointer",
          "hover:bg-zinc-750 transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        )}
        onClick={() => setCollapsed(!collapsed)}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-expanded={!collapsed}
      >
        {/* Collapse toggle */}
        {collapsed ? (
          <ChevronRight className="w-4 h-4 text-zinc-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        )}

        {/* File icon */}
        {getFileIcon(file.changeType)}

        {/* File path */}
        <span className="text-sm font-mono text-zinc-200 flex-1 truncate">
          {file.newPath}
          {file.changeType === "renamed" && file.oldPath !== file.newPath && (
            <span className="text-zinc-500 text-xs ml-2">
              (from {file.oldPath})
            </span>
          )}
        </span>

        {/* Change type badge */}
        <span
          className={cn(
            "text-xs px-2 py-0.5 rounded",
            FILE_CHANGE_TYPE_COLORS[file.changeType],
            "bg-zinc-700/50"
          )}
        >
          {FILE_CHANGE_TYPE_LABELS[file.changeType]}
        </span>

        {/* Stats */}
        <DiffStats stats={file.stats} />

        {/* Open in editor button */}
        {onOpenInEditor && (
          <button
            onClick={handleOpenInEditor}
            className={cn(
              "p-1 rounded hover:bg-zinc-700 transition-colors",
              "text-zinc-500 hover:text-zinc-200"
            )}
            aria-label={`Open ${file.newPath} in editor`}
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* File content */}
      {!collapsed && file.hunks.length > 0 && (
        <div className="diff-file-content border-t border-zinc-700">
          {file.hunks.map((hunk, index) => (
            <DiffHunk
              key={`hunk-${hunk.oldStart}-${hunk.newStart}-${index}`}
              hunk={hunk}
              viewMode={viewMode}
              showLineNumbers={showLineNumbers}
              enableHighlighting={enableHighlighting}
              language={file.language}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!collapsed && file.hunks.length === 0 && (
        <div className="px-4 py-8 text-center text-zinc-500 text-sm border-t border-zinc-700">
          {file.changeType === "deleted"
            ? "File was deleted"
            : file.changeType === "added"
              ? "New file (no content)"
              : "No changes to display"}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// DiffFileTree Component
// ============================================================================

interface DiffFileTreeProps {
  files: FileDiff[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}

function DiffFileTree({
  files,
  selectedIndex,
  onSelect,
  className,
}: DiffFileTreeProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      if (e.key === "ArrowDown" && currentIndex < files.length - 1) {
        e.preventDefault();
        onSelect(currentIndex + 1);
      } else if (e.key === "ArrowUp" && currentIndex > 0) {
        e.preventDefault();
        onSelect(currentIndex - 1);
      }
    },
    [files.length, onSelect]
  );

  return (
    <div
      className={cn(
        "w-64 border-r border-zinc-700 bg-zinc-900 overflow-y-auto",
        className
      )}
    >
      <div className="px-3 py-2 text-xs font-medium text-zinc-500 uppercase tracking-wider border-b border-zinc-700">
        Files ({files.length})
      </div>
      <div className="py-1">
        {files.map((file, index) => (
          <button
            key={file.id}
            onClick={() => onSelect(index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "w-full px-3 py-1.5 text-left flex items-center gap-2",
              "hover:bg-zinc-800 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset",
              index === selectedIndex &&
                "bg-zinc-800 border-l-2 border-blue-500"
            )}
          >
            {getFileIcon(file.changeType, "w-3 h-3")}
            <span className="text-xs font-mono text-zinc-300 flex-1 truncate">
              {file.newPath.split("/").pop()}
            </span>
            <DiffStats stats={file.stats} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// EmptyState Component
// ============================================================================

interface EmptyStateProps {
  className?: string;
}

function EmptyState({ className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-zinc-500",
        className
      )}
    >
      <FileCode className="w-12 h-12 mb-4 opacity-50" />
      <p className="text-sm">No code changes yet</p>
      <p className="text-xs text-zinc-600 mt-1">
        Changes will appear here when files are modified
      </p>
    </div>
  );
}

// ============================================================================
// DiffViewer Main Component
// ============================================================================

export interface DiffViewerProps {
  /** Task ID to associate with diff session */
  taskId: string;

  /** View mode */
  viewMode?: DiffViewMode;

  /** Show file tree navigation */
  showFileTree?: boolean;

  /** Show line numbers */
  showLineNumbers?: boolean;

  /** Enable syntax highlighting */
  enableHighlighting?: boolean;

  /** Wrap long lines */
  wrapLines?: boolean;

  /** Maximum height before scrolling */
  maxHeight?: string;

  /** Filter to specific files */
  filePaths?: string[];

  /** Additional CSS classes */
  className?: string;

  /** Callback when file is clicked */
  onFileClick?: (file: FileDiff) => void;

  /** Callback when "open in editor" is clicked */
  onOpenInEditor?: (filePath: string, line?: number) => void;
}

export function DiffViewer({
  taskId,
  viewMode = "unified",
  showFileTree = true,
  showLineNumbers = true,
  enableHighlighting = true,
  wrapLines = false,
  maxHeight = "600px",
  filePaths,
  className,
  onFileClick,
  onOpenInEditor,
}: DiffViewerProps) {
  // State
  const [currentViewMode, setCurrentViewMode] = useState<DiffViewMode>(viewMode);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  // Connect to store
  const files = useDiffStore((state) => state.getFiles(taskId));
  const totalStats = useDiffStore((state) => state.getTotalStats(taskId));
  const hasSession = useDiffStore((state) => state.hasSession(taskId));

  // Filter files if specified
  const displayFiles = useMemo(() => {
    if (!filePaths) return files;
    return files.filter((f) => filePaths.includes(f.newPath));
  }, [files, filePaths]);

  // Handle file selection
  const handleFileSelect = useCallback(
    (index: number) => {
      setSelectedFileIndex(index);
      onFileClick?.(displayFiles[index]);
    },
    [displayFiles, onFileClick]
  );

  // Empty state
  if (!hasSession || displayFiles.length === 0) {
    return (
      <div
        className={cn(
          "diff-viewer border border-zinc-700 rounded-lg overflow-hidden",
          className
        )}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "diff-viewer border border-zinc-700 rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Toolbar */}
      <DiffToolbar
        viewMode={currentViewMode}
        onViewModeChange={setCurrentViewMode}
        stats={totalStats}
      />

      {/* Content area */}
      <div
        className="diff-content flex"
        style={{ maxHeight }}
      >
        {/* File tree */}
        {showFileTree && (
          <DiffFileTree
            files={displayFiles}
            selectedIndex={selectedFileIndex}
            onSelect={handleFileSelect}
          />
        )}

        {/* Diff files */}
        <div
          className={cn(
            "flex-1 overflow-y-auto p-4 space-y-4",
            wrapLines && "overflow-x-hidden"
          )}
        >
          {displayFiles.map((file, index) => (
            <DiffFile
              key={file.id}
              file={file}
              viewMode={currentViewMode}
              showLineNumbers={showLineNumbers}
              enableHighlighting={enableHighlighting}
              defaultCollapsed={showFileTree && index !== selectedFileIndex}
              onOpenInEditor={onOpenInEditor}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// Export sub-components for testing
export { DiffStats, DiffLine, DiffHunk, DiffFile, DiffFileTree, TotalStats, DiffToolbar, EmptyState };
