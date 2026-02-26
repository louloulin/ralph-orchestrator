/**
 * Chat Types
 *
 * TypeScript interfaces for the AI-native chat interface.
 * Supports message threads, streaming, and tool call visualization.
 */

import type { ThinkingStep } from "./thinking";

/**
 * Sender type for chat messages.
 */
export type MessageSender = "user" | "agent";

/**
 * Message status for agent responses.
 */
export type MessageStatus = "thinking" | "streaming" | "completed" | "error";

/**
 * A tool call made by the agent.
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Name of the tool being called */
  toolName: string;
  /** Arguments passed to the tool (JSON string for display) */
  arguments: string;
  /** Result of the tool call (if completed) */
  result?: string;
  /** Whether the tool call is currently executing */
  isLoading?: boolean;
  /** Error message if the tool call failed */
  error?: string;
  /** When the tool call started */
  startTime?: Date;
  /** When the tool call completed */
  endTime?: Date;
}

/**
 * A single chat message in the thread.
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Who sent the message */
  sender: MessageSender;
  /** The message content (markdown supported) */
  content: string;
  /** Timestamp when the message was sent */
  timestamp: Date;
  /** Status for agent messages */
  status?: MessageStatus;
  /** Thinking steps for agent messages */
  thinking?: ThinkingStep[];
  /** Tool calls made while generating this message */
  toolCalls?: ToolCall[];
  /** Parent message ID for threading (if any) */
  parentId?: string;
  /** Whether this message is streaming (content being updated) */
  isStreaming?: boolean;
  /** Task ID associated with this message (if any) */
  taskId?: string;
  /** Iteration number when this message was generated */
  iteration?: number;
}

/**
 * A chat session containing multiple messages.
 */
export interface ChatSession {
  /** Unique session identifier */
  id: string;
  /** All messages in this session */
  messages: ChatSessionMessage[];
  /** When the session started */
  startTime: Date;
  /** When the session ended (if applicable) */
  endTime?: Date;
  /** Session title (usually first user message) */
  title?: string;
}

/**
 * A message within a chat session (for database storage).
 */
export interface ChatSessionMessage {
  id: string;
  sessionId: string;
  sender: MessageSender;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Input options for creating a new chat message.
 */
export interface CreateMessageInput {
  /** Message content */
  content: string;
  /** Sender type */
  sender: MessageSender;
  /** Optional parent message ID */
  parentId?: string;
  /** Associated task ID */
  taskId?: string;
}

/**
 * WebSocket event types for chat streaming.
 */
export type ChatEventType =
  | "message_start"
  | "message_content"
  | "message_end"
  | "thinking_start"
  | "thinking_step"
  | "thinking_end"
  | "tool_call_start"
  | "tool_call_update"
  | "tool_call_end"
  | "error";

/**
 * Chat WebSocket event payload.
 */
export interface ChatWebSocketEvent {
  /** Event type */
  type: ChatEventType;
  /** Associated message ID */
  messageId?: string;
  /** Event data */
  data?: unknown;
  /** Timestamp */
  timestamp: string;
}
