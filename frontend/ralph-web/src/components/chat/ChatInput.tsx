/**
 * ChatInput Component
 *
 * Enhanced chat input with auto-resizing, presets, file attachments, and keyboard shortcuts.
 * Integrates with the chatStore for state management.
 */

import { useRef, useEffect, useCallback, useState, type KeyboardEvent, type DragEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { trpc } from "@/trpc";
import { usePreferences } from "@/hooks";
import { Send, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import type { FileAttachment } from "@/stores/chatStore";

interface ChatInputProps {
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when message is sent */
  onMessageSent?: () => void;
}

/**
 * Detect if running on Mac for keyboard shortcut display
 */
const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

/**
 * Generate a unique message ID.
 */
function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatInput({
  placeholder = "Describe what you want Ralph to do...",
  className,
  onMessageSent,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Chat store state
  const inputValue = useChatStore((state) => state.inputValue);
  const isLoading = useChatStore((state) => state.isLoading);
  const isInputDisabled = useChatStore((state) => state.isInputDisabled);
  const messages = useChatStore((state) => state.messages);
  const attachments = useChatStore((state) => state.attachments);

  const setInputValue = useChatStore((state) => state.setInputValue);
  const clearInput = useChatStore((state) => state.clearInput);
  const addMessage = useChatStore((state) => state.addMessage);
  const setLoading = useChatStore((state) => state.setLoading);
  const setMessageStatus = useChatStore((state) => state.setMessageStatus);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const addAttachment = useChatStore((state) => state.addAttachment);
  const removeAttachment = useChatStore((state) => state.removeAttachment);
  const clearAttachments = useChatStore((state) => state.clearAttachments);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Handle file button click
  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Handle file selection via input
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        try {
          await addAttachment(file);
        } catch (error) {
          console.error("Failed to attach file:", error);
        }
      }

      // Reset input value to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [addAttachment]
  );

  // Handle drag and drop events
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      for (const file of Array.from(files)) {
        try {
          await addAttachment(file);
        } catch (error) {
          console.error("Failed to attach file:", error);
        }
      }
    },
    [addAttachment]
  );

  // Preferences for presets
  const { presetSelection, setPresetSelection } = usePreferences();
  const [selectedPreset, setSelectedPreset] = useState<string>(presetSelection || "default");

  // Presets query
  const presetsQuery = trpc.presets.list.useQuery();

  // Sync local state with hook when it changes
  useEffect(() => {
    if (presetSelection) {
      setSelectedPreset(presetSelection);
    }
  }, [presetSelection]);

  const handlePresetChange = (value: string) => {
    setSelectedPreset(value);
    setPresetSelection(value);
  };

  // Auto-resize textarea as content changes
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get correct scrollHeight
    textarea.style.height = "auto";
    // Set to scrollHeight to fit content
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [inputValue]);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Handle sending a message
  const handleSendMessage = useCallback(() => {
    if (!inputValue.trim() || isLoading || isInputDisabled) return;

    // Add user message
    addMessage("user", inputValue.trim());

    // Clear input
    clearInput();

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Set loading state
    setLoading(true);

    // Simulate agent response (placeholder for real WebSocket integration)
    // In production, this would connect to Ralph orchestrator via WebSocket
    const agentMessageId = addMessage("agent", "I'm analyzing your request...");

    setTimeout(() => {
      setMessageStatus(agentMessageId, "streaming");

      // Simulate streaming response
      const responses = [
        "I've received your request. This is a placeholder response - ",
        "the actual implementation will connect to the Ralph orchestrator ",
        "via WebSocket for real-time streaming responses.",
      ];

      let currentIndex = 0;
      const streamInterval = setInterval(() => {
        if (currentIndex >= responses.length) {
          clearInterval(streamInterval);
          setMessageStatus(agentMessageId, "completed");
          updateMessage(agentMessageId, {
            content: responses.join(""),
          });
          setLoading(false);
          onMessageSent?.();
          return;
        }

        const currentMsg = useChatStore.getState().getMessage(agentMessageId);
        if (currentMsg) {
          updateMessage(agentMessageId, {
            content: currentMsg.content + responses[currentIndex],
          });
        }
        currentIndex++;
      }, 300);
    }, 500);
  }, [
    inputValue,
    isLoading,
    isInputDisabled,
    addMessage,
    clearInput,
    setLoading,
    setMessageStatus,
    updateMessage,
    onMessageSent,
  ]);

  // Handle keyboard shortcut (Cmd/Ctrl + Enter to send)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const isSubmitKey = (isMac ? e.metaKey : e.ctrlKey) && e.key === "Enter";
      if (isSubmitKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage]
  );

  const hasValue = inputValue.trim().length > 0;
  const presetsDisabled = presetsQuery.isLoading || !presetsQuery.data;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Attachment preview area */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md group"
            >
              <Paperclip className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-medium truncate max-w-[200px]">
                  {attachment.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(attachment.size)}
                </span>
              </div>
              <Button
                onClick={() => removeAttachment(attachment.id)}
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            onClick={clearAttachments}
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Preset selector */}
      <div className="flex items-center gap-2">
        <select
          aria-label="Preset"
          value={selectedPreset ?? "default"}
          onChange={(e) => handlePresetChange(e.target.value)}
          disabled={presetsDisabled}
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            presetsDisabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <option value="default">Default (from config)</option>
          {presetsQuery.data?.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.source})
            </option>
          ))}
        </select>
      </div>

      {/* Input area with drag-drop */}
      <div
        className={cn(
          "relative rounded-md transition-colors",
          isDragging && "ring-2 ring-primary bg-accent/50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag-drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-md">
            <div className="text-center">
              <Paperclip className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium">Drop files to attach</p>
            </div>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileSelect}
          aria-label="Attach files"
        />

        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isInputDisabled}
          className={cn(
            "resize-none min-h-[60px] max-h-[200px] overflow-y-auto py-3",
            isInputDisabled && "opacity-50 cursor-not-allowed",
            attachments.length > 0 ? "pr-24" : "pr-12"
          )}
          rows={2}
          aria-label="Chat message"
        />

        {/* Action buttons */}
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          {/* File attachment button */}
          <Button
            onClick={handleFileButtonClick}
            disabled={isInputDisabled}
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            aria-label="Attach files"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          {/* Send button */}
          <Button
            onClick={handleSendMessage}
            disabled={!hasValue || isLoading || isInputDisabled}
            size="icon"
            className="h-8 w-8"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              <span>Ready</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {attachments.length > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip className="h-3 w-3" />
              {attachments.length} file{attachments.length > 1 ? "s" : ""}
            </span>
          )}

          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
              {isMac ? "⌘" : "Ctrl"}
            </kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Enter</kbd>
            <span>to send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
