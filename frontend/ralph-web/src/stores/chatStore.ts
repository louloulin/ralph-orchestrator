/**
 * Chat Store
 *
 * Zustand store for managing chat state, message threads, and streaming.
 * Provides reactive state management for the AI-native chat interface.
 */

import { create } from "zustand";
import type { ChatMessage, MessageSender, ToolCall, MessageStatus } from "@/types/chat";

/**
 * File attachment metadata
 */
export interface FileAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string; // Base64 encoded content for small files
}

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique tool call ID.
 */
function generateToolCallId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique attachment ID.
 */
function generateAttachmentId(): string {
  return `attach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

interface ChatStore {
  /** All messages in the current chat thread */
  messages: ChatMessage[];

  /** Current input value in the chat input */
  inputValue: string;

  /** Whether the chat is currently loading/streaming */
  isLoading: boolean;

  /** Current streaming message ID (if any) */
  streamingMessageId: string | null;

  /** Selected task ID for this chat session */
  activeTaskId: string | null;

  /** Whether the input is disabled */
  isInputDisabled: boolean;

  /** File attachments for the current message */
  attachments: FileAttachment[];

  // Actions

  /**
   * Add a new message to the thread.
   */
  addMessage: (sender: MessageSender, content: string, options?: Partial<ChatMessage>) => string;

  /**
   * Update an existing message's content.
   */
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void;

  /**
   * Append content to an existing message (for streaming).
   */
  appendToMessage: (messageId: string, content: string) => void;

  /**
   * Set the status of an agent message.
   */
  setMessageStatus: (messageId: string, status: MessageStatus) => void;

  /**
   * Add a tool call to a message.
   */
  addToolCall: (messageId: string, toolName: string, arguments_: string) => string;

  /**
   * Update a tool call's result.
   */
  updateToolCall: (messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;

  /**
   * Set the input value.
   */
  setInputValue: (value: string) => void;

  /**
   * Clear the input value.
   */
  clearInput: () => void;

  /**
   * Set loading state.
   */
  setLoading: (loading: boolean) => void;

  /**
   * Set streaming message ID.
   */
  setStreamingMessageId: (messageId: string | null) => void;

  /**
   * Set the active task ID.
   */
  setActiveTaskId: (taskId: string | null) => void;

  /**
   * Set input disabled state.
   */
  setInputDisabled: (disabled: boolean) => void;

  /**
   * Clear all messages.
   */
  clearMessages: () => void;

  /**
   * Get a message by ID.
   */
  getMessage: (messageId: string) => ChatMessage | undefined;

  /**
   * Scroll to and highlight a specific message.
   */
  scrollToMessage: (messageId: string) => void;

  /**
   * Add a file attachment.
   */
  addAttachment: (file: File) => void;

  /**
   * Remove a file attachment by ID.
   */
  removeAttachment: (attachmentId: string) => void;

  /**
   * Clear all attachments.
   */
  clearAttachments: () => void;
}

/**
 * Chat store for managing message threads and streaming state.
 *
 * Usage:
 *   const messages = useChatStore(state => state.messages);
 *   const addMessage = useChatStore(state => state.addMessage);
 */
export const useChatStore = create<ChatStore>()((set, get) => ({
  messages: [],
  inputValue: "",
  isLoading: false,
  streamingMessageId: null,
  activeTaskId: null,
  isInputDisabled: false,
  attachments: [],

  addMessage: (sender, content, options = {}) => {
    const id = generateMessageId();
    const message: ChatMessage = {
      id,
      sender,
      content,
      timestamp: new Date(),
      status: sender === "agent" ? "thinking" : undefined,
      isStreaming: sender === "agent",
      ...options,
    };

    set((state) => ({
      messages: [...state.messages, message],
    }));

    return id;
  },

  updateMessage: (messageId, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      ),
    }));
  },

  appendToMessage: (messageId, content) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, content: msg.content + content }
          : msg
      ),
    }));
  },

  setMessageStatus: (messageId, status) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? { ...msg, status, isStreaming: status === "streaming" || status === "thinking" }
          : msg
      ),
    }));
  },

  addToolCall: (messageId, toolName, arguments_) => {
    const toolCallId = generateToolCallId();
    const toolCall: ToolCall = {
      id: toolCallId,
      toolName,
      arguments: arguments_,
      isLoading: true,
      startTime: new Date(),
    };

    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              toolCalls: [...(msg.toolCalls || []), toolCall],
            }
          : msg
      ),
    }));

    return toolCallId;
  },

  updateToolCall: (messageId, toolCallId, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              toolCalls: msg.toolCalls?.map((tc) =>
                tc.id === toolCallId ? { ...tc, ...updates } : tc
              ),
            }
          : msg
      ),
    }));
  },

  setInputValue: (value) => {
    set({ inputValue: value });
  },

  clearInput: () => {
    set({ inputValue: "" });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setStreamingMessageId: (messageId) => {
    set({ streamingMessageId: messageId });
  },

  setActiveTaskId: (taskId) => {
    set({ activeTaskId: taskId });
  },

  setInputDisabled: (disabled) => {
    set({ isInputDisabled: disabled });
  },

  clearMessages: () => {
    set({
      messages: [],
      inputValue: "",
      isLoading: false,
      streamingMessageId: null,
      activeTaskId: null,
    });
  },

  getMessage: (messageId) => {
    return get().messages.find((msg) => msg.id === messageId);
  },

  scrollToMessage: (messageId) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  addAttachment: (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const attachment: FileAttachment = {
        id: generateAttachmentId(),
        name: file.name,
        size: file.size,
        type: file.type,
        content: reader.result as string,
      };

      set((state) => ({
        attachments: [...state.attachments, attachment],
      }));
    };

    // Read file as base64 (for small files)
    if (file.size < 1024 * 1024) { // 1MB limit
      reader.readAsDataURL(file);
    } else {
      // For larger files, just store metadata
      const attachment: FileAttachment = {
        id: generateAttachmentId(),
        name: file.name,
        size: file.size,
        type: file.type,
      };

      set((state) => ({
        attachments: [...state.attachments, attachment],
      }));
    }
  },

  removeAttachment: (attachmentId) => {
    set((state) => ({
      attachments: state.attachments.filter((att) => att.id !== attachmentId),
    }));
  },

  clearAttachments: () => {
    set({ attachments: [] });
  },
}));
