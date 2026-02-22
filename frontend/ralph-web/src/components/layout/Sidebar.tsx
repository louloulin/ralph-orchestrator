/**
 * Sidebar Component
 *
 * Collapsible navigation sidebar with nav items and toggle button.
 * Uses Zustand store for state persistence across page refreshes.
 * Navigation items use React Router NavLink for proper routing.
 */

import { LayoutDashboard, ListTodo, PanelLeftClose, PanelLeft, Workflow, Settings, Columns3 } from "lucide-react";
import { NavItem } from "./NavItem";
import { useUIStore } from "@/store";
import { ThemeToggleMinimal } from "@/components/shared/ThemeToggle";
import { cn } from "@/lib/utils";

/** Ralph hat logo matching favicon */
function RalphLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z" />
      <path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5" />
      <path d="M4 15v-3a6 6 0 0 1 6-6" />
      <path d="M14 6a6 6 0 0 1 6 6v3" />
    </svg>
  );
}

/** Navigation items configuration with route paths */
const NAV_ITEMS = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tasks", icon: ListTodo, label: "Tasks" },
  { to: "/kanban", icon: Columns3, label: "Kanban" },
  { to: "/builder", icon: Workflow, label: "Builder" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "flex flex-col h-full bg-card border-r border-border transition-all duration-200",
        sidebarOpen ? "w-56" : "w-14"
      )}
    >
      {/* Logo and brand */}
      <div
        className={cn(
          "flex items-center h-14 px-3 border-b border-border",
          sidebarOpen ? "gap-3 justify-between" : "justify-center"
        )}
      >
        <div className="flex items-center gap-3">
          <RalphLogo className="h-6 w-6 text-primary flex-shrink-0" />
          {sidebarOpen && <span className="font-bold text-lg tracking-tight">RO</span>}
        </div>
        {sidebarOpen && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
            Alpha
          </span>
        )}
      </div>

      {/* Navigation items */}
      <nav aria-label="Primary" className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            collapsed={!sidebarOpen}
          />
        ))}
      </nav>

      {/* Toggle button at bottom */}
      <div className="p-2 border-t border-border">
        <button
          onClick={toggleSidebar}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={sidebarOpen}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !sidebarOpen && "justify-center px-2"
          )}
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {sidebarOpen ? (
            <>
              <PanelLeftClose className="h-5 w-5 flex-shrink-0" />
              <span className="truncate">Collapse</span>
            </>
          ) : (
            <PanelLeft className="h-5 w-5 flex-shrink-0" />
          )}
        </button>

        {/* Theme toggle - only in collapsed mode */}
        {!sidebarOpen && (
          <ThemeToggleMinimal className="w-full mt-1" />
        )}
      </div>

      {/* Footer with theme toggle (expanded mode) and command palette hint */}
      {sidebarOpen && (
        <div className="p-3 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggleMinimal />
          </div>
          <div className="text-xs text-muted-foreground text-center">
            Press{" "}
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">
              ⌘K
            </kbd>{" "}
            to open command palette
          </div>
        </div>
      )}
    </aside>
  );
}
