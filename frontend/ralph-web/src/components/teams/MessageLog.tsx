/**
 * MessageLog Component
 *
 * Displays team communication history from the MailboxStore.
 * Shows sender, recipient, timestamp, message type with filtering and search.
 *
 * Part of subtask 2.4.4 - Message log viewer component
 */

import React, { useState, useMemo } from "react";
import {
  Mail,
  Search,
  Filter,
  ArrowRight,
  Clock,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  Info,
  MessageSquare,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

/**
 * Message type for mailbox communication
 */
export type MailboxMessageType =
  | "task_claim"
  | "task_complete"
  | "task_status_update"
  | "progress_report"
  | "question"
  | "answer"
  | "coordination"
  | "error";

/**
 * Mailbox message structure
 */
export interface MailboxMessage {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  recipientId: string | null; // null for broadcast messages
  recipientName: string | null;
  messageType: MailboxMessageType;
  subject: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Message type configuration for display
 */
const MESSAGE_TYPE_CONFIG: Record<
  MailboxMessageType,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  task_claim: {
    label: "Task Claim",
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-blue-400",
    bgColor: "bg-blue-900/30",
  },
  task_complete: {
    label: "Task Complete",
    icon: <CheckCircle2 className="w-4 h-4" />,
    color: "text-green-400",
    bgColor: "bg-green-900/30",
  },
  task_status_update: {
    label: "Status Update",
    icon: <Info className="w-4 h-4" />,
    color: "text-cyan-400",
    bgColor: "bg-cyan-900/30",
  },
  progress_report: {
    label: "Progress",
    icon: <MessageSquare className="w-4 h-4" />,
    color: "text-purple-400",
    bgColor: "bg-purple-900/30",
  },
  question: {
    label: "Question",
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-900/30",
  },
  answer: {
    label: "Answer",
    icon: <MessageSquare className="w-4 h-4" />,
    color: "text-green-400",
    bgColor: "bg-green-900/30",
  },
  coordination: {
    label: "Coordination",
    icon: <Users className="w-4 h-4" />,
    color: "text-indigo-400",
    bgColor: "bg-indigo-900/30",
  },
  error: {
    label: "Error",
    icon: <AlertCircle className="w-4 h-4" />,
    color: "text-red-400",
    bgColor: "bg-red-900/30",
  },
};

interface MessageLogProps {
  teamId: string;
  messages?: MailboxMessage[];
}

export function MessageLog({ teamId, messages: propMessages }: MessageLogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<Set<MailboxMessageType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Mock messages for initial display - backend integration in subtask 2.4.6
  const messages: MailboxMessage[] = propMessages || [
    {
      id: "msg-1",
      teamId,
      senderId: "agent-1",
      senderName: "Coordinator",
      recipientId: null,
      recipientName: null,
      messageType: "coordination",
      subject: "Task Distribution",
      content: "Assigning authentication task to Agent-1 and database schema to Agent-2",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "msg-2",
      teamId,
      senderId: "agent-2",
      senderName: "Agent-1",
      recipientId: null,
      recipientName: null,
      messageType: "task_claim",
      subject: "Claimed: Implement authentication",
      content: "Starting implementation of JWT authentication system",
      timestamp: new Date(Date.now() - 3000000).toISOString(),
    },
    {
      id: "msg-3",
      teamId,
      senderId: "agent-3",
      senderName: "Agent-2",
      recipientId: null,
      recipientName: null,
      messageType: "task_claim",
      subject: "Claimed: Design database schema",
      content: "Working on database models and migrations",
      timestamp: new Date(Date.now() - 2400000).toISOString(),
    },
    {
      id: "msg-4",
      teamId,
      senderId: "agent-2",
      senderName: "Agent-1",
      recipientId: "agent-1",
      recipientName: "Coordinator",
      messageType: "progress_report",
      subject: "Authentication Progress",
      content: "JWT token generation complete, working on validation middleware",
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "msg-5",
      teamId,
      senderId: "agent-2",
      senderName: "Agent-1",
      recipientId: "agent-3",
      recipientName: "Agent-2",
      messageType: "question",
      subject: "User model schema",
      content: "What fields should the User model include for authentication?",
      timestamp: new Date(Date.now() - 1200000).toISOString(),
    },
    {
      id: "msg-6",
      teamId,
      senderId: "agent-3",
      senderName: "Agent-2",
      recipientId: "agent-2",
      recipientName: "Agent-1",
      messageType: "answer",
      subject: "Re: User model schema",
      content: "Include: id, email, password_hash, created_at, updated_at, last_login",
      timestamp: new Date(Date.now() - 600000).toISOString(),
    },
    {
      id: "msg-7",
      teamId,
      senderId: "agent-3",
      senderName: "Agent-2",
      recipientId: null,
      recipientName: null,
      messageType: "task_complete",
      subject: "Completed: Design database schema",
      content: "Database schema design complete with migrations ready",
      timestamp: new Date(Date.now() - 300000).toISOString(),
    },
  ];

  // Filter and search messages
  const filteredMessages = useMemo(() => {
    let result = messages;

    // Filter by message type
    if (selectedTypes.size > 0) {
      result = result.filter((msg) => selectedTypes.has(msg.messageType));
    }

    // Search by content
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (msg) =>
          msg.subject.toLowerCase().includes(query) ||
          msg.content.toLowerCase().includes(query) ||
          msg.senderName.toLowerCase().includes(query) ||
          (msg.recipientName?.toLowerCase().includes(query) ?? false)
      );
    }

    return result;
  }, [messages, selectedTypes, searchQuery]);

  const toggleTypeFilter = (type: MailboxMessageType) => {
    const newSelected = new Set(selectedTypes);
    if (newSelected.has(type)) {
      newSelected.delete(type);
    } else {
      newSelected.add(type);
    }
    setSelectedTypes(newSelected);
  };

  const clearFilters = () => {
    setSelectedTypes(new Set());
    setSearchQuery("");
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Message Log
            <span className="text-xs text-gray-500 font-normal ml-2">
              {filteredMessages.length} messages
            </span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={clsx(showFilters && "text-blue-400")}
          >
            <Filter className="w-4 h-4 mr-1" />
            Filters
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-gray-900/50 border-gray-700"
          />
        </div>

        {/* Filter Chips */}
        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(MESSAGE_TYPE_CONFIG) as MailboxMessageType[]).map((type) => {
              const config = MESSAGE_TYPE_CONFIG[type];
              const isSelected = selectedTypes.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleTypeFilter(type)}
                  className={clsx(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
                    isSelected
                      ? `${config.bgColor} ${config.color} border border-current`
                      : "bg-gray-700/50 text-gray-400 hover:bg-gray-700"
                  )}
                >
                  {config.icon}
                  {config.label}
                </button>
              );
            })}
            {selectedTypes.size > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Message List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredMessages.length > 0 ? (
          <div className="divide-y divide-gray-700/50">
            {filteredMessages.map((message) => {
              const typeConfig = MESSAGE_TYPE_CONFIG[message.messageType];
              return (
                <div
                  key={message.id}
                  className="p-4 hover:bg-gray-800/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {/* Type Icon */}
                    <div
                      className={clsx(
                        "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                        typeConfig.bgColor
                      )}
                    >
                      <span className={typeConfig.color}>{typeConfig.icon}</span>
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      {/* Header Row */}
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={clsx(
                            "text-xs px-2 py-0.5 rounded",
                            typeConfig.bgColor,
                            typeConfig.color
                          )}
                        >
                          {typeConfig.label}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(message.timestamp)}
                        </span>
                      </div>

                      {/* Subject */}
                      <p className="font-medium text-white text-sm mb-1 truncate">
                        {message.subject}
                      </p>

                      {/* Content */}
                      <p className="text-sm text-gray-400 mb-2 line-clamp-2">
                        {message.content}
                      </p>

                      {/* Sender/Recipient */}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          <span>{message.senderName}</span>
                        </div>
                        {message.recipientName && (
                          <>
                            <ArrowRight className="w-3 h-3" />
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>{message.recipientName}</span>
                            </div>
                          </>
                        )}
                        {!message.recipientName && (
                          <>
                            <ArrowRight className="w-3 h-3" />
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span>All</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No messages found</p>
            <p className="text-sm">
              {searchQuery || selectedTypes.size > 0
                ? "Try adjusting your filters"
                : "Team communication will appear here"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
