/**
 * SessionsPage Component
 *
 * Page for managing Ralph conversation sessions.
 * Allows creating, viewing, archiving, and deleting sessions.
 * Displays session list with message counts and status badges.
 */

import { useState, useEffect } from "react";
import {
  MessageSquare,
  Plus,
  Trash2,
  Archive,
  CheckCircle,
  Clock,
  AlertCircle,
  Search,
  Filter,
} from "lucide-react";
import { trpc } from "../trpc";
import { useSessionStore } from "../stores/sessionStore";
import type { ConversationStatus } from "../types/session";
import { cn } from "@/lib/utils";

/** Status badge variants */
const STATUS_COLORS: Record<ConversationStatus, string> = {
  active: "bg-green-500/10 text-green-500 border-green-500/20",
  archived: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  completed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const STATUS_ICONS: Record<ConversationStatus, React.ElementType> = {
  active: CheckCircle,
  archived: Archive,
  completed: Clock,
};

export function SessionsPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "all">("all");
  const [newSessionName, setNewSessionName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { activeSession, setActiveSession } = useSessionStore();

  // Fetch all sessions
  const { data: sessions, isLoading, refetch } = trpc.session.list.useQuery(
    statusFilter === "all" ? {} : { status: statusFilter }
  );

  // Create mutation
  const createMutation = trpc.session.create.useMutation();

  // Handle create mutation success
  useEffect(() => {
    if (createMutation.isSuccess && createMutation.data) {
      setIsCreating(false);
      setNewSessionName("");
      setFormError(null);
      refetch();
    }
  }, [createMutation.isSuccess, createMutation.data, refetch]);

  // Handle create mutation error
  useEffect(() => {
    if (createMutation.isError && createMutation.error) {
      setFormError(createMutation.error.message);
    }
  }, [createMutation.isError, createMutation.error]);

  // Update mutation
  const updateMutation = trpc.session.update.useMutation();

  // Handle update mutation success
  useEffect(() => {
    if (updateMutation.isSuccess) {
      refetch();
    }
  }, [updateMutation.isSuccess, refetch]);

  // Delete mutation
  const deleteMutation = trpc.session.delete.useMutation();

  // Handle delete mutation success
  useEffect(() => {
    if (deleteMutation.isSuccess) {
      refetch();
      if (selectedSessionId === activeSession?.id) {
        setActiveSession(null);
      }
    }
  }, [deleteMutation.isSuccess, refetch, selectedSessionId, activeSession, setActiveSession]);

  // Get selected session with full data
  const { data: selectedSession } = trpc.session.get.useQuery(
    { id: selectedSessionId ?? "" },
    { enabled: !!selectedSessionId }
  );

  const handleCreate = async () => {
    if (!newSessionName.trim()) {
      setFormError("Session name is required");
      return;
    }

    createMutation.mutate({ name: newSessionName.trim() });
  };

  const handleDelete = (sessionId: string) => {
    if (window.confirm("Are you sure you want to delete this session?")) {
      setSelectedSessionId(sessionId);
      deleteMutation.mutate({ id: sessionId });
    }
  };

  const handleArchive = (sessionId: string) => {
    updateMutation.mutate({ id: sessionId, status: "archived" });
  };

  const handleComplete = (sessionId: string) => {
    updateMutation.mutate({ id: sessionId, status: "completed" });
  };

  const handleActivate = (sessionId: string) => {
    updateMutation.mutate({ id: sessionId, status: "active" });
  };

  // Filter sessions by search query
  const filteredSessions = sessions?.filter((session) =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
            <p className="text-muted-foreground text-sm">
              Manage your conversation sessions
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Session
        </button>
      </div>

      {/* Create Session Form */}
      {isCreating && (
        <div className="mb-6 p-4 border rounded-lg bg-card">
          <h3 className="text-lg font-semibold mb-3">Create New Session</h3>
          {formError && (
            <div className="mb-3 p-2 bg-destructive/10 text-destructive rounded-md flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {formError}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Session name..."
              className="flex-1 px-3 py-2 border rounded-md bg-background"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </button>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewSessionName("");
                setFormError(null);
              }}
              className="px-4 py-2 border rounded-md hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-10 pr-3 py-2 border rounded-md bg-background"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ConversationStatus | "all")}
            className="px-3 py-2 border rounded-md bg-background"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">Loading sessions...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredSessions.length === 0 && (
        <div className="text-center py-12">
          <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No sessions yet</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || statusFilter !== "all"
              ? "No sessions match your filters"
              : "Create your first session to get started"}
          </p>
          {!searchQuery && statusFilter === "all" && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Create Session
            </button>
          )}
        </div>
      )}

      {/* Sessions List */}
      {!isLoading && filteredSessions.length > 0 && (
        <div className="grid gap-3">
          {filteredSessions.map((session) => {
            const StatusIcon = STATUS_ICONS[session.status];
            const isActive = activeSession?.id === session.id;

            return (
              <div
                key={session.id}
                className={cn(
                  "p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors cursor-pointer",
                  isActive && "border-primary ring-1 ring-primary"
                )}
                onClick={() => setSelectedSessionId(session.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{session.name}</h3>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border",
                          STATUS_COLORS[session.status]
                        )}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {session.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{session.message_count} messages</span>
                      <span>Created {new Date(session.created_at).toLocaleDateString()}</span>
                      <span>Updated {new Date(session.updated_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {session.status === "active" && (
                      <button
                        onClick={() => handleArchive(session.id)}
                        className="p-2 hover:bg-accent rounded-md"
                        title="Archive session"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    )}
                    {session.status !== "completed" && (
                      <button
                        onClick={() => handleComplete(session.id)}
                        className="p-2 hover:bg-accent rounded-md"
                        title="Mark as completed"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                    )}
                    {session.status !== "active" && (
                      <button
                        onClick={() => handleActivate(session.id)}
                        className="p-2 hover:bg-accent rounded-md"
                        title="Activate session"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(session.id)}
                      className="p-2 hover:bg-destructive/10 text-destructive rounded-md"
                      title="Delete session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session Detail Panel */}
      {selectedSession && (
        <div className="fixed top-0 right-0 h-full w-full max-w-lg bg-background border-l shadow-lg overflow-y-auto">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-xl font-bold">{selectedSession.name}</h2>
            <button
              onClick={() => setSelectedSessionId(null)}
              className="p-2 hover:bg-accent rounded-md"
            >
              ✕
            </button>
          </div>
          <div className="p-4">
            <div className="mb-4 pb-4 border-b">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border",
                    STATUS_COLORS[selectedSession.status]
                  )}
                >
                  {selectedSession.status}
                </span>
                <span className="text-sm text-muted-foreground">
                  {selectedSession.messages.length} messages
                </span>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>Created: {new Date(selectedSession.created_at).toLocaleString()}</p>
                <p>Updated: {new Date(selectedSession.updated_at).toLocaleString()}</p>
              </div>
            </div>

            {selectedSession.context && (
              <div className="mb-4 p-3 bg-muted rounded-md">
                <h4 className="text-sm font-semibold mb-1">Context</h4>
                <p className="text-sm text-muted-foreground">{selectedSession.context}</p>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">Messages</h4>
              <div className="space-y-3">
                {selectedSession.messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "p-3 rounded-md",
                      message.role === "user"
                        ? "bg-primary/10 ml-8"
                        : message.role === "assistant"
                          ? "bg-accent mr-8"
                          : "bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase">{message.role}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
