/**
 * ChatPage Component
 *
 * AI-native chat-centric interface for Ralph.
 * This is the main entry point for interacting with Ralph agents.
 *
 * Features:
 * - Message thread with virtual scrolling
 * - Persistent chat input at bottom
 * - Real-time agent responses via WebSocket
 * - Tool call visualization
 * - Thinking blocks
 */

import { MessageThread, ChatInput } from "@/components/chat";

/**
 * ChatPage - Main chat interface for Ralph.
 *
 * This is the primary interface for interacting with Ralph agents.
 * It displays a message thread and provides a persistent input at the bottom.
 */
export function ChatPage() {
  return (
    <div className="flex flex-col h-full">
      {/* Message Thread */}
      <MessageThread className="flex-1" />

      {/* Chat Input */}
      <div className="border-t border-border bg-card">
        <div className="max-w-3xl mx-auto p-4">
          <ChatInput />
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
