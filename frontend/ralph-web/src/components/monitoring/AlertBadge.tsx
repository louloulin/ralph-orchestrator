/**
 * Alert Badge Component
 *
 * Displays an alert severity badge with appropriate color coding
 * for the monitoring dashboard (P4-3.5).
 */

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Info } from "lucide-react";
import type { AlertSeverity } from "@/types/metrics";

export interface AlertBadgeProps {
  severity: AlertSeverity;
  className?: string;
}

export function AlertBadge({ severity, className }: AlertBadgeProps) {
  const variants = {
    info: {
      variant: "default" as const,
      icon: Info,
      className: "bg-blue-500 hover:bg-blue-600 text-white",
    },
    warning: {
      variant: "default" as const,
      icon: AlertTriangle,
      className: "bg-yellow-500 hover:bg-yellow-600 text-black",
    },
    critical: {
      variant: "default" as const,
      icon: AlertTriangle,
      className: "bg-red-500 hover:bg-red-600 text-white",
    },
  };

  const config = variants[severity];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`flex items-center gap-1 ${config.className} ${className}`}>
      <Icon className="h-3 w-3" />
      <span className="capitalize">{severity}</span>
    </Badge>
  );
}
