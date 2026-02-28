/**
 * Session Types
 *
 * Type definitions for conversation sessions (P1-1, P1-2).
 * Mirrors the backend types in backend/ralph-web-server/src/types/session.ts
 * and the Rust session types in crates/ralph-core/src/session/
 */

export type MessageRole = "user" | "assistant" | "system";

export type ConversationStatus = "active" | "archived" | "completed";

export interface SessionMessage {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface SessionMeta {
  id: string;
  name: string;
  status: ConversationStatus;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  name: string;
  status: ConversationStatus;
  messages: SessionMessage[];
  context: string;
  created_at: string;
  updated_at: string;
}

// Zod schemas for validation (imported from backend via tRPC)
// These types are automatically inferred from the tRPC router
