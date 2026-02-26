/**
 * ThinkingBlock Component
 *
 * Displays agent reasoning/thinking process in an expandable/collapsible block.
 * Inspired by Claude Code's thinking display.
 */

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ThinkingStep } from "@/types/thinking";
import { useTranslation } from "@/hooks";
import {
  THINKING_TYPE_LABELS,
  THINKING_TYPE_BADGE_VARIANTS,
} from "@/types/thinking";
import { Badge } from "@/components/ui/badge";

interface ThinkingBlockProps {
  /** Thinking steps to display */
  steps: ThinkingStep[];
  /** Whether the block is expanded by default */
  defaultExpanded?: boolean;
  /** Whether to show the header */
  showHeader?: boolean;
  /** Callback when a step is clicked */
  onStepClick?: (step: ThinkingStep) => void;
}

/**
 * Format a thinking step's content for display.
 */
function formatStepContent(content: string): string {
  // Convert markdown-like formatting to display
  return content
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^(\d+)\.\s+/gm, "$1. ")
    .replace(/`([^`]+)`/g, '"$1"')
    .trim();
}

/**
 * ThinkingBlock displays agent reasoning in an expandable block.
 *
 * Features:
 * - Expandable/collapsible with smooth animation
 * - Step type badges with color coding
 * - Copy all thinking content
 * - Individual step selection
 */
export function ThinkingBlock({
  steps,
  defaultExpanded = true,
  showHeader = true,
  onStepClick,
}: ThinkingBlockProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const allContent = useMemo(
    () => steps.map((s) => `[${s.type}] ${s.content}`).join("\n\n"),
    [steps]
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(allContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="border border-purple-500/20 rounded-lg bg-purple-500/5 overflow-hidden">
      {/* Header */}
      {showHeader && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-purple-500/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-purple-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-purple-500" />
            )}
            <span className="font-medium text-purple-500">
              {t("chat.thinking.title")}
            </span>
            <span className="text-muted-foreground text-xs">
              ({steps.length} {steps.length === 1 ? "step" : "steps"})
            </span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="p-1 hover:bg-purple-500/20 rounded transition-colors"
            title={t("chat.thinking.copy")}
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </button>
      )}

      {/* Steps */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-3 pb-3 space-y-2">
          {steps.map((step, index) => (
            <button
              key={step.id || index}
              onClick={() => onStepClick?.(step)}
              className={cn(
                "w-full text-left p-2 rounded border-l-2 transition-colors",
                "hover:bg-purple-500/10 border-l-purple-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              )}
            >
              {/* Step type badge */}
              <div className="flex items-center gap-2 mb-1">
                <Badge
                  variant={THINKING_TYPE_BADGE_VARIANTS[step.type]}
                  className="text-xs py-0 px-1.5"
                >
                  {THINKING_TYPE_LABELS[step.type]}
                </Badge>
                {step.timestamp && (
                  <span className="text-xs text-muted-foreground">
                    {step.timestamp.toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Step content */}
              <div className="text-sm text-foreground font-mono whitespace-pre-wrap">
                {formatStepContent(step.content)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ThinkingBlock;
