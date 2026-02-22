/**
 * CommandPalette Component
 *
 * Global command palette triggered by Cmd/Ctrl+K.
 * Uses cmdk library for fuzzy search and keyboard navigation.
 *
 * Features:
 * - Global keyboard shortcut (Cmd/Ctrl+K)
 * - Fuzzy search filtering
 * - Command groups with categories
 * - Recent commands history
 * - Natural language task input mode
 * - Full keyboard navigation
 */

import { useEffect, useCallback, useState, useMemo } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { Search, FileText, ArrowRight, Moon, Play, Trash2 } from "lucide-react";
import { useCommandPaletteStore } from "@/stores/commandPaletteStore";
import { createCommandGroups, findCommandById } from "@/lib/commands.tsx";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

// Placeholder functions - will be connected to actual implementations
const defaultCreateTask = (prompt: string) => {
  console.log("Create task:", prompt);
  // TODO: Connect to tRPC mutation
};

const defaultStartLoop = () => {
  console.log("Start loop");
  // TODO: Connect to actual loop start logic
};

const defaultCancelLoop = () => {
  console.log("Cancel loop");
  // TODO: Connect to actual loop cancel logic
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"command" | "task">("command");
  const [taskPrompt, setTaskPrompt] = useState("");
  const navigate = useNavigate();
  const { toggle: toggleTheme } = useTheme();

  const { recentCommands, addToHistory } = useCommandPaletteStore();

  // Create command groups with navigation functions
  const commandGroups = useMemo(
    () =>
      createCommandGroups(
        navigate,
        defaultCreateTask,
        defaultStartLoop,
        defaultCancelLoop,
        toggleTheme
      ),
    [navigate, toggleTheme]
  );

  // Global keyboard shortcut (Cmd/Ctrl+K)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Handle command selection
  const handleSelect = useCallback(
    (commandId: string) => {
      const command = findCommandById(commandGroups, commandId);
      if (command) {
        // Add to recent history (store only serializable data)
        addToHistory({
          id: command.id,
          label: command.label,
          icon: command.id.split(".")[0], // Store icon identifier
          shortcut: command.shortcut,
          keywords: command.keywords,
        });
        // Execute the command
        command.action();
      }
      setOpen(false);
    },
    [commandGroups, addToHistory]
  );

  // Handle task submission
  const handleTaskSubmit = useCallback(() => {
    if (taskPrompt.trim()) {
      defaultCreateTask(taskPrompt.trim());
      setTaskPrompt("");
      setOpen(false);
    }
  }, [taskPrompt]);

  // Handle keyboard events in task mode
  const handleTaskKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleTaskSubmit();
      }
    },
    [handleTaskSubmit]
  );

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <Command
        className={cn(
          "fixed top-[20%] left-1/2 -translate-x-1/2",
          "w-full max-w-xl rounded-lg border border-border bg-popover shadow-2xl"
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        {/* Mode Tabs */}
        <div className="flex border-b border-border" role="tablist" aria-label="Mode selection">
          <button
            onClick={() => setMode("command")}
            role="tab"
            aria-selected={mode === "command"}
            aria-controls="command-panel"
            className={cn(
              "flex items-center gap-2 flex-1 py-2.5 px-4 text-sm font-medium transition-colors",
              mode === "command"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Commands
          </button>
          <button
            onClick={() => setMode("task")}
            role="tab"
            aria-selected={mode === "task"}
            aria-controls="task-panel"
            className={cn(
              "flex items-center gap-2 flex-1 py-2.5 px-4 text-sm font-medium transition-colors",
              mode === "task"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            New Task
          </button>
        </div>

        {mode === "command" ? (
          <div id="command-panel" role="tabpanel">
            {/* Search Input */}
            <div className="flex items-center border-b border-border px-3">
              <Search className="h-4 w-4 text-muted-foreground mr-2" aria-hidden="true" />
              <Command.Input
                placeholder="Type a command or search..."
                className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
                aria-label="Search commands"
              />
            </div>

            {/* Command List */}
            <Command.List className="max-h-[320px] overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No commands found.
              </Command.Empty>

              {/* Recent Commands */}
              {recentCommands.length > 0 && (
                <Command.Group heading="Recent" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                  {recentCommands.map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={`${cmd.label} ${cmd.keywords?.join(" ") ?? ""}`}
                      onSelect={() => handleSelect(cmd.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <span className="text-muted-foreground text-sm">
                        {getIconForCommand(cmd.icon)}
                      </span>
                      <span className="flex-1 text-sm">{cmd.label}</span>
                      {cmd.shortcut && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {cmd.shortcut}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Command Groups */}
              {commandGroups.map((group) => (
                <Command.Group
                  key={group.id}
                  heading={group.label}
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  {group.commands.map((cmd) => (
                    <Command.Item
                      key={cmd.id}
                      value={`${cmd.label} ${cmd.keywords?.join(" ") ?? ""}`}
                      onSelect={() => handleSelect(cmd.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                    >
                      <span className="text-muted-foreground">{cmd.icon}</span>
                      <span className="flex-1 text-sm">{cmd.label}</span>
                      {cmd.shortcut && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {cmd.shortcut}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </div>
        ) : (
          /* Task Input Mode */
          <div id="task-panel" role="tabpanel" className="p-4">
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              onKeyDown={handleTaskKeyDown}
              placeholder="Describe your task... (Press Enter to submit)"
              className="w-full h-24 bg-transparent text-sm outline-none resize-none placeholder:text-muted-foreground"
              autoFocus
              aria-label="Task description"
            />
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                Press Enter to create task
              </span>
              <button
                onClick={handleTaskSubmit}
                disabled={!taskPrompt.trim()}
                aria-label="Create task"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                  taskPrompt.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                Create Task
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 bg-muted rounded">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-muted rounded">Enter</kbd> select
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> close
            </span>
          </div>
          <span>
            <kbd className="px-1 py-0.5 bg-muted rounded">⌘K</kbd> toggle
          </span>
        </div>
      </Command>
    </div>
  );
}

/**
 * Get icon element from icon identifier string
 */
function getIconForCommand(iconId: string): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    nav: <Search className="h-4 w-4" />,
    task: <FileText className="h-4 w-4" />,
    loop: <Play className="h-4 w-4" />,
    theme: <Moon className="h-4 w-4" />,
    storage: <Trash2 className="h-4 w-4" />,
  };
  return iconMap[iconId] || <Search className="h-4 w-4" />;
}
