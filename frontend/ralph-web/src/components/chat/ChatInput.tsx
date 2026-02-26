/**
 * ChatInput Component
 *
 * Enhanced chat input with auto-resizing, presets, and keyboard shortcuts.
 * Integrates with the chatStore for state management.
 */

import { useRef, useEffect, useCallback, useState, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chatStore";
import { trpc } from "@/trpc";
import { usePreferences } from "@/hooks";
import { Send, Loader2, Paperclip, Sparkles } from "lucide-react";

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

  const setInputValue = useChatStore((state) => state.setInputValue);
  const clearInput = useChatStore((state) => state.clearInput);
  const addMessage = useChatStore((state) => state.addMessage);
  const setLoading = useChatStore((state) => state.setLoading);
  const setMessageStatus = useChatStore((state) => state.setMessageStatus);
  const updateMessage = useChatStore((state) => state.updateMessage);

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

      {/* Input area */}
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isInputDisabled}
          className={cn(
            "resize-none min-h-[60px] max-h-[200px] overflow-y-auto pr-12 py-3",
            isInputDisabled && "opacity-50 cursor-not-allowed"
          )}
          rows={2}
          aria-label="Chat message"
        />

        {/* Send button */}
        <Button
          onClick={handleSendMessage}
          disabled={!hasValue || isLoading || isInputDisabled}
          size="icon"
          className="absolute right-2 bottom-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
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
  );
}

export default ChatInput;
