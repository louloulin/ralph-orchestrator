/**
 * NavSection Component
 *
 * Section header for grouped navigation items in the sidebar.
 * Displays a label and optional icon for visual grouping.
 */

import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavSectionProps {
  /** Section label */
  label: string;
  /** Optional icon */
  icon?: LucideIcon;
  /** Whether sidebar is collapsed */
  collapsed?: boolean;
  /** Optional click handler to expand/collapse */
  onClick?: () => void;
  /** Whether the section is expanded (for collapsible sections) */
  isExpanded?: boolean;
}

export function NavSection({ label, icon: Icon, collapsed = false, onClick, isExpanded = true }: NavSectionProps) {
  const content = (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider",
        "text-muted-foreground/70",
        onClick && "cursor-pointer hover:text-muted-foreground",
        collapsed && "justify-center"
      )}
      title={collapsed ? label : undefined}
    >
      {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {onClick && <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />}
        </>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="w-full"
        aria-expanded={isExpanded}
      >
        {content}
      </button>
    );
  }

  return content;
}
