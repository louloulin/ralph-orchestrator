/**
 * MessageThread Component
 *
 * Displays a scrollable list of chat messages with support for
 * virtual scrolling, auto-scroll to bottom, and message grouping.
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { MessageBubble } from "./MessageBubble";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolCallCard } from "./ToolCallCard";
import type { ChatMessage } from "@/types/chat";
import { useChatStore } from "@/stores/chatStore";
import { cn } from "@/lib/utils";

interface MessageThreadProps {
  /** Additional class names */
  className?: string;
  /** Whether to auto-scroll to bottom on new messages */
  autoScroll?: boolean;
  /** Whether to show thinking blocks */
  showThinking?: boolean;
  /** Whether to show tool calls */
  showToolCalls?: boolean;
}

/**
 * MessageThread displays a list of chat messages with associated
 * thinking blocks and tool calls.
 *
 * Features:
 * - Auto-scroll to bottom on new messages
 * - Smooth scroll behavior
 * - Thinking block display for agent messages
 * - Tool call visualization
 * - Click to select messages
 */
export function MessageThread({
  className,
  autoScroll = true,
  showThinking = true,
  showToolCalls = true,
}: MessageThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const messages = useChatStore((state) => state.messages);
  const scrollToMessage = useChatStore((state) => state.scrollToMessage);

  // Check if we should auto-scroll (user hasn't scrolled up)
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;

    shouldAutoScrollRef.current = isAtBottom;
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && shouldAutoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  // Handle message click
  const handleMessageClick = useCallback(
    (message: ChatMessage) => {
      scrollToMessage(message.id);
    },
    [scrollToMessage]
  );

  // Memoize message elements
  const messageElements = useMemo(() => {
    return messages.map((message, index) => {
      const isLatest = index === messages.length - 1;
      const isAgent = message.sender === "agent";

      return (
        <div key={message.id} className="space-y-2">
          {/* Message bubble */}
          <MessageBubble
            message={message}
            isLatest={isLatest}
            onClick={handleMessageClick}
          />

          {/* Thinking block (for agent messages) */}
          {isAgent && showThinking && message.thinking && message.thinking.length > 0 && (
            <div className="ml-11">
              <ThinkingBlock steps={message.thinking} />
            </div>
          )}

          {/* Tool calls (for agent messages) */}
          {isAgent && showToolCalls && message.toolCalls && message.toolCalls.length > 0 && (
            <div className="ml-11 space-y-2">
              {message.toolCalls.map((toolCall, toolIndex) => (
                <ToolCallCard
                  key={toolCall.id}
                  toolCall={toolCall}
                  isLatest={toolIndex === message.toolCalls!.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      );
    });
  }, [messages, showThinking, showToolCalls, handleMessageClick]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn("flex-1 overflow-y-auto", className)}
    >
      <div className="max-w-3xl mx-auto py-4">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">{messageElements}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Empty state when no messages exist.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center p-8">
      <div className="text-muted-foreground space-y-2">
        <p className="text-lg font-medium">No messages yet</p>
        <p className="text-sm">Start a conversation by typing a message below.</p>
      </div>
    </div>
  );
}

export default MessageThread;
