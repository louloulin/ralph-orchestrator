/**
 * ToolCallCard Component
 *
 * Displays a tool call made by the agent with its arguments and result.
 * Shows loading state, success, or error status.
 */

import { useState } from "react";
import {
  Terminal,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "@/types/chat";
import { useTranslation } from "@/hooks";
import { Button } from "@/components/ui/button";

interface ToolCallCardProps {
  /** The tool call to display */
  toolCall: ToolCall;
  /** Whether this is the latest tool call */
  isLatest?: boolean;
  /** Callback when the tool call is clicked */
  onClick?: (toolCall: ToolCall) => void;
}

/**
 * Format JSON arguments for display with syntax highlighting.
 */
function formatArguments(args: string): string {
  try {
    const parsed = JSON.parse(args);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return args;
  }
}

/**
 * Format execution duration.
 */
function formatDuration(startTime?: Date, endTime?: Date): string | null {
  if (!startTime || !endTime) return null;
  const duration = endTime.getTime() - startTime.getTime();
  if (duration < 1000) return `${duration}ms`;
  return `${(duration / 1000).toFixed(1)}s`;
}

/**
 * ToolCallCard displays a tool invocation with its status.
 *
 * Features:
 * - Expandable to show full arguments/result
 * - Status indicator (loading, success, error)
 * - Execution duration
 * - Copy arguments/result
 */
export function ToolCallCard({ toolCall, isLatest = false, onClick }: ToolCallCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(isLatest);
  const [copiedArgs, setCopiedArgs] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  const isLoading = toolCall.isLoading;
  const hasError = !!toolCall.error;
  const hasResult = !!toolCall.result;

  const handleCopyArgs = async () => {
    await navigator.clipboard.writeText(toolCall.arguments);
    setCopiedArgs(true);
    setTimeout(() => setCopiedArgs(false), 2000);
  };

  const handleCopyResult = async () => {
    if (!toolCall.result) return;
    await navigator.clipboard.writeText(toolCall.result);
    setCopiedResult(true);
    setTimeout(() => setCopiedResult(false), 2000);
  };

  const duration = formatDuration(toolCall.startTime, toolCall.endTime);

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-colors",
        isLoading
          ? "border-blue-500/30 bg-blue-500/5"
          : hasError
          ? "border-red-500/30 bg-red-500/5"
          : "border-green-500/30 bg-green-500/5"
      )}
    >
      {/* Header */}
      <button
        onClick={() => {
          setIsExpanded(!isExpanded);
          onClick?.(toolCall);
        }}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 text-left",
          "hover:bg-accent/50 transition-colors",
          isLatest && "animate-in fade-in duration-300"
        )}
      >
        {/* Status icon */}
        <div
          className={cn(
            "flex-shrink-0 w-6 h-6 rounded flex items-center justify-center",
            isLoading
              ? "bg-blue-500/20 text-blue-500"
              : hasError
              ? "bg-red-500/20 text-red-500"
              : "bg-green-500/20 text-green-500"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : hasError ? (
            <XCircle className="h-3 w-3" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
        </div>

        {/* Tool name and status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Terminal className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-sm font-medium truncate">
              {toolCall.toolName}
            </span>
          </div>
        </div>

        {/* Duration */}
        {duration && (
          <span className="text-xs text-muted-foreground">{duration}</span>
        )}

        {/* Expand icon */}
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Arguments */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">
                {t("chat.toolCall.arguments")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleCopyArgs}
              >
                {copiedArgs ? (
                  <Check className="h-3 w-3 text-green-500 mr-1" />
                ) : (
                  <Copy className="h-3 w-3 mr-1" />
                )}
                {t("common.copy")}
              </Button>
            </div>
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto font-mono">
              {formatArguments(toolCall.arguments)}
            </pre>
          </div>

          {/* Error */}
          {hasError && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded p-2">
              {toolCall.error}
            </div>
          )}

          {/* Result */}
          {hasResult && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">
                  {t("chat.toolCall.result")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={handleCopyResult}
                >
                  {copiedResult ? (
                    <Check className="h-3 w-3 text-green-500 mr-1" />
                  ) : (
                    <Copy className="h-3 w-3 mr-1" />
                  )}
                  {t("common.copy")}
                </Button>
              </div>
              <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto font-mono">
                {toolCall.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ToolCallCard;
