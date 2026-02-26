/**
 * NavItem Component
 *
 * Individual navigation item for the sidebar.
 * Supports two modes:
 * - Route navigation using React Router's NavLink
 * - Panel navigation using button click (for slide-out panels)
 *
 * Supports icons, labels, active state highlighting, and collapsed mode.
 */

import { NavLink } from "react-router-dom";
import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePanelStore } from "@/stores/panelStore";

interface NavItemProps {
  /** Icon component from lucide-react */
  icon: LucideIcon;
  /** Navigation item label */
  label: string;
  /** Route path to navigate to (for route nav) or panel identifier (for panel nav) */
  to: string;
  /** Whether the sidebar is collapsed (icon-only mode) */
  collapsed?: boolean;
  /** Optional click handler (for closing mobile menu or opening panels) */
  onClick?: () => void;
  /** If true, renders as button for panel navigation instead of NavLink */
  isPanelNav?: boolean;
}

export function NavItem({ icon: Icon, label, to, collapsed = false, onClick, isPanelNav = false }: NavItemProps) {
  const { activePanel } = usePanelStore();

  // Map route paths to panel IDs for active state checking
  const panelIdMap: Record<string, string> = {
    "/tasks": "tasks",
    "/plan": "plan",
    "/monitoring": "monitor",
    "/teams": "teams",
    "/projects": "projects",
  };

  // Check if this panel nav item is active
  const isPanelActive = isPanelNav && activePanel === panelIdMap[to];

  // For panel navigation, render a button instead of NavLink
  if (isPanelNav) {
    return (
      <button
        onClick={onClick}
        aria-label={collapsed ? label : undefined}
        aria-current={isPanelActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isPanelActive && "bg-accent text-accent-foreground",
          !isPanelActive && "text-muted-foreground",
          collapsed && "justify-center px-2"
        )}
        title={collapsed ? label : undefined}
      >
        <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
      </button>
    );
  }

  // For route navigation, render NavLink
  return (
    <NavLink
      to={to}
      aria-label={collapsed ? label : undefined}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive && "bg-accent text-accent-foreground",
          !isActive && "text-muted-foreground",
          collapsed && "justify-center px-2"
        )
      }
      title={collapsed ? label : undefined}
    >
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}
