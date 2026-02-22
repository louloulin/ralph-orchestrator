/**
 * QuickAction Component
 *
 * A button-style quick action card for dashboard shortcuts.
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface QuickActionProps {
  /** Action label */
  label: string;
  /** Optional description */
  description?: string;
  /** Icon to display */
  icon: LucideIcon;
  /** Click handler */
  onClick: () => void;
  /** Visual variant */
  variant?: "default" | "primary" | "success" | "warning";
  /** Additional CSS classes */
  className?: string;
  /** Disabled state */
  disabled?: boolean;
}

const variantStyles = {
  default: {
    card: "hover:bg-accent/50",
    icon: "bg-muted text-muted-foreground",
  },
  primary: {
    card: "hover:bg-primary/10 border-primary/30",
    icon: "bg-primary/10 text-primary",
  },
  success: {
    card: "hover:bg-emerald-500/10 border-emerald-500/30",
    icon: "bg-emerald-500/10 text-emerald-500",
  },
  warning: {
    card: "hover:bg-amber-500/10 border-amber-500/30",
    icon: "bg-amber-500/10 text-amber-500",
  },
};

export function QuickAction({
  label,
  description,
  icon: Icon,
  onClick,
  variant = "default",
  className,
  disabled = false,
}: QuickActionProps) {
  const styles = variantStyles[variant];

  return (
    <Card
      className={cn(
        "p-4 cursor-pointer transition-all duration-200",
        styles.card,
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        className
      )}
      onClick={disabled ? undefined : onClick}
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", styles.icon)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          {description && (
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * QuickActionsGrid Component
 *
 * A grid of quick action cards for dashboard shortcuts.
 */

export interface QuickActionItem extends Omit<QuickActionProps, "onClick"> {
  /** Unique identifier */
  id: string;
  /** Click handler (optional for disabled items) */
  onClick?: () => void;
}

export interface QuickActionsGridProps {
  /** List of quick actions */
  actions: QuickActionItem[];
  /** Grid columns (2-4) */
  columns?: 2 | 3 | 4;
  /** Section title */
  title?: string;
  /** Additional CSS classes */
  className?: string;
}

export function QuickActionsGrid({
  actions,
  columns = 3,
  title = "Quick Actions",
  className,
}: QuickActionsGridProps) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <div className={cn("grid gap-3", gridCols[columns])}>
        {actions.map((action) => (
          <QuickAction
            key={action.id}
            {...action}
            onClick={action.onClick ?? (() => {})}
          />
        ))}
      </div>
    </div>
  );
}
