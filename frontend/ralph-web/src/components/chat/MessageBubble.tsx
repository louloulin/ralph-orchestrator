/**
 * MessageBubble Component
 *
 * Displays a single chat message with appropriate styling for user or agent messages.
 * Supports markdown content, timestamps, and status indicators.
 */

import { useMemo } from "react";
import { User, Bot, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, MessageStatus } from "@/types/chat";
import { useTranslation } from "@/hooks";

interface MessageBubbleProps {
  /** The message to display */
  message: ChatMessage;
  /** Whether this is the most recent message */
  isLatest?: boolean;
  /** Callback when message is clicked */
  onClick?: (message: ChatMessage) => void;
}

/**
 * Get status icon and color based on message status.
 */
function getStatusDisplay(status: MessageStatus | undefined, t: (key: string) => string) {
  switch (status) {
    case "thinking":
      return {
        icon: Loader2,
        text: t("chat.status.thinking"),
        color: "text-purple-500",
        animate: true,
      };
    case "streaming":
      return {
        icon: Loader2,
        text: t("chat.status.streaming"),
        color: "text-blue-500",
        animate: true,
      };
    case "completed":
      return {
        icon: CheckCircle2,
        text: t("chat.status.completed"),
        color: "text-green-500",
        animate: false,
      };
    case "error":
      return {
        icon: AlertCircle,
        text: t("chat.status.error"),
        color: "text-red-500",
        animate: false,
      };
    default:
      return null;
  }
}

/**
 * Format timestamp for display.
 */
function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * MessageBubble displays a single chat message.
 *
 * Features:
 * - Different styling for user vs agent messages
 * - Status indicator for agent messages
 * - Timestamp display
 * - Avatar icon
 * - Click handler for selection
 */
export function MessageBubble({ message, isLatest = false, onClick }: MessageBubbleProps) {
  const { t } = useTranslation();
  const isUser = message.sender === "user";

  const statusDisplay = useMemo(
    () => getStatusDisplay(message.status, t),
    [message.status, t]
  );

  return (
    <div
      id={`message-${message.id}`}
      className={cn(
        "group flex gap-3 p-4 transition-colors hover:bg-accent/50",
        isLatest && "animate-in fade-in slide-in-from-bottom-2 duration-300"
      )}
      onClick={() => onClick?.(message)}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-primary/10 text-primary"
            : "bg-purple-500/10 text-purple-500"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-2">
        {/* Header: Sender name, status, timestamp */}
        <div className="flex items-center gap-2 text-sm">
          <span className={cn("font-medium", isUser ? "text-primary" : "text-purple-500")}>
            {isUser ? t("chat.message.user") : t("chat.message.agent")}
          </span>

          {statusDisplay && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className={cn("flex items-center gap-1", statusDisplay.color)}>
                {statusDisplay.animate ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <statusDisplay.icon className="h-3 w-3" />
                )}
                <span className="text-xs">{statusDisplay.text}</span>
              </span>
            </>
          )}

          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground text-xs">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>

        {/* Message content */}
        <div
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none",
            "prose-p:my-1 prose-pre:m-0 prose-code:text-sm",
            message.isStreaming && "animate-pulse"
          )}
        >
          {message.content || (message.isStreaming ? "..." : "")}
        </div>
      </div>
    </div>
  );
}

export default MessageBubble;
