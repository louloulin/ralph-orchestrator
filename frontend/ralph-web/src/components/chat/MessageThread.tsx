/**
 * MessageThread Component
 *
 * Displays a scrollable list of chat messages with support for
 * virtual scrolling (using @tanstack/react-virtual), auto-scroll to bottom,
 * and message grouping.
 *
 * Virtual scrolling improves performance by only rendering visible messages,
 * making it suitable for long conversations with hundreds or thousands of messages.
 */

import { useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
 * - Virtual scrolling for performance (renders only visible messages)
 * - Auto-scroll to bottom on new messages (when user is at bottom)
 * - Smooth scroll behavior
 * - Thinking block display for agent messages
 * - Tool call visualization
 * - Click to select messages
 *
 * @remarks
 * Virtual scrolling is implemented using @tanstack/react-virtual,
 * which maintains scroll position based on estimated item sizes.
 * This provides excellent performance even with thousands of messages.
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

  // Set up virtual scrolling for message list
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 150, // Estimated height per message group (message + thinking + tools)
    overscan: 5, // Render 5 extra items above/below viewport for smooth scrolling
  });

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

  // Scroll to bottom when user sends a message or when new agent message starts
  useEffect(() => {
    if (messages.length > 0 && autoScroll && shouldAutoScrollRef.current) {
      const lastMessage = messages[messages.length - 1];
      // Scroll to bottom on new user messages or when agent starts thinking
      if (lastMessage.sender === "user" || lastMessage.status === "thinking") {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      }
    }
  }, [messages.length, autoScroll]);

  // Handle message click
  const handleMessageClick = useCallback(
    (message: ChatMessage) => {
      scrollToMessage(message.id);
    },
    [scrollToMessage]
  );

  // Get virtual items to render
  const virtualItems = rowVirtualizer.getVirtualItems();

  // Render a single message group (message + thinking + tool calls)
  const renderMessageGroup = useCallback((message: ChatMessage, index: number) => {
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
  }, [messages.length, showThinking, showToolCalls, handleMessageClick]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={cn("flex-1 overflow-y-auto", className)}
    >
      {messages.length === 0 ? (
        <div className="h-full">
          <EmptyState />
        </div>
      ) : (
        <div
          className="relative w-full"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {/* Virtual spacer for content above visible area */}
          <div
            style={{
              height: `${virtualItems[0]?.start ?? 0}px`,
            }}
          />

          {/* Render only visible messages */}
          <div className="max-w-3xl mx-auto py-4 space-y-4">
            {virtualItems.map((virtualRow) => {
              const message = messages[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                >
                  {renderMessageGroup(message, virtualRow.index)}
                </div>
              );
            })}
          </div>
        </div>
      )}
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
