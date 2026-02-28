/**
 * Session Service
 *
 * Service for managing conversation sessions in the web dashboard.
 * Mirrors the Rust SessionManager in crates/ralph-core/src/session/
 *
 * Storage structure:
 * - `.ralph/sessions/sessions.json` - Session index
 * - `.ralph/sessions/{session-id}/meta.json` - Session metadata
 * - `.ralph/sessions/{session-id}/messages.jsonl` - Incremental message log
 */

import * as fs from "fs";
import * as path from "path";

const DEFAULT_SESSIONS_PATH = ".ralph/sessions";

/**
 * Message role in a conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Conversation status
 */
export type ConversationStatus = "active" | "archived" | "completed";

/**
 * A single message in a conversation session
 */
export interface SessionMessage {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

/**
 * Session metadata (lightweight for listing)
 */
export interface SessionMeta {
  id: string;
  name: string;
  status: ConversationStatus;
  message_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Full session data
 */
export interface Session {
  id: string;
  name: string;
  status: ConversationStatus;
  messages: SessionMessage[];
  context: string;
  created_at: string;
  updated_at: string;
}

/**
 * Session Service
 *
 * Manages conversation sessions with file-based storage.
 */
export class SessionService {
  private basePath: string;

  constructor(cwd: string) {
    this.basePath = path.join(cwd, DEFAULT_SESSIONS_PATH);
  }

  /**
   * Ensures the sessions directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * Generates a unique session ID
   */
  private generateSessionId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `sess-${timestamp}-${random}`;
  }

  /**
   * Generates a unique message ID
   */
  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
    return `msg-${timestamp}-${random}`;
  }

  /**
   * Gets the path to a session directory
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.basePath, sessionId);
  }

  /**
   * Gets the sessions index path
   */
  private getIndexPath(): string {
    return path.join(this.basePath, "sessions.json");
  }

  /**
   * Creates a new session
   */
  async create(name: string): Promise<Session> {
    this.ensureDirectory();

    const now = new Date().toISOString();
    const session: Session = {
      id: this.generateSessionId(),
      name,
      status: "active",
      messages: [],
      context: "",
      created_at: now,
      updated_at: now,
    };

    // Create session directory
    const sessionPath = this.getSessionPath(session.id);
    fs.mkdirSync(sessionPath, { recursive: true });

    // Write metadata
    const metaPath = path.join(sessionPath, "meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(session, null, 2));

    // Create empty messages file
    const messagesPath = path.join(sessionPath, "messages.jsonl");
    fs.writeFileSync(messagesPath, "");

    // Update index
    await this.addToIndex(session);

    return session;
  }

  /**
   * Appends a message to a session
   */
  async append(sessionId: string, role: MessageRole, content: string): Promise<SessionMessage> {
    const sessionPath = this.getSessionPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const message: SessionMessage = {
      id: this.generateMessageId(),
      role,
      content,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    // Append to messages file (JSONL format)
    const messagesPath = path.join(sessionPath, "messages.jsonl");
    fs.appendFileSync(messagesPath, JSON.stringify(message) + "\n");

    // Update metadata
    const metaPath = path.join(sessionPath, "meta.json");
    const session: Session = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    session.messages.push(message);
    session.updated_at = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(session, null, 2));

    // Update index
    await this.updateIndex(session);

    return message;
  }

  /**
   * Loads a session by ID (full data with messages)
   */
  async load(sessionId: string): Promise<Session> {
    const sessionPath = this.getSessionPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Load metadata
    const metaPath = path.join(sessionPath, "meta.json");
    const session: Session = JSON.parse(fs.readFileSync(metaPath, "utf-8"));

    // Load messages
    const messagesPath = path.join(sessionPath, "messages.jsonl");
    if (fs.existsSync(messagesPath)) {
      const messagesContent = fs.readFileSync(messagesPath, "utf-8");
      session.messages = [];
      for (const line of messagesContent.split("\n")) {
        if (line.trim()) {
          try {
            session.messages.push(JSON.parse(line));
          } catch {
            // Skip invalid lines
          }
        }
      }
    }

    return session;
  }

  /**
   * Lists all sessions (metadata only)
   */
  async list(): Promise<SessionMeta[]> {
    const indexPath = this.getIndexPath();

    if (!fs.existsSync(indexPath)) {
      return [];
    }

    const content = fs.readFileSync(indexPath, "utf-8");
    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  }

  /**
   * Gets a session by ID (metadata only)
   */
  async getMeta(sessionId: string): Promise<SessionMeta> {
    const sessions = await this.list();
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    return session;
  }

  /**
   * Deletes a session
   */
  async delete(sessionId: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(sessionId);

    if (!fs.existsSync(sessionPath)) {
      return false;
    }

    // Remove directory
    fs.rmSync(sessionPath, { recursive: true, force: true });

    // Update index
    await this.removeFromIndex(sessionId);

    return true;
  }

  /**
   * Updates session metadata
   */
  async update(sessionId: string, name?: string, status?: ConversationStatus): Promise<Session> {
    const session = await this.load(sessionId);

    if (name !== undefined) {
      session.name = name;
    }
    if (status !== undefined) {
      session.status = status;
    }
    session.updated_at = new Date().toISOString();

    // Write metadata
    const sessionPath = this.getSessionPath(sessionId);
    const metaPath = path.join(sessionPath, "meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(session, null, 2));

    // Update index
    await this.updateIndex(session);

    return session;
  }

  /**
   * Adds a session to the index
   */
  private async addToIndex(session: Session): Promise<void> {
    const indexPath = this.getIndexPath();

    let sessions: SessionMeta[] = [];
    if (fs.existsSync(indexPath)) {
      try {
        sessions = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      } catch {
        sessions = [];
      }
    }

    sessions.push({
      id: session.id,
      name: session.name,
      status: session.status,
      message_count: session.messages.length,
      created_at: session.created_at,
      updated_at: session.updated_at,
    });

    fs.writeFileSync(indexPath, JSON.stringify(sessions, null, 2));
  }

  /**
   * Removes a session from the index
   */
  private async removeFromIndex(sessionId: string): Promise<void> {
    const indexPath = this.getIndexPath();

    if (!fs.existsSync(indexPath)) {
      return;
    }

    const content = fs.readFileSync(indexPath, "utf-8");
    let sessions: SessionMeta[] = JSON.parse(content);

    sessions = sessions.filter((s) => s.id !== sessionId);

    fs.writeFileSync(indexPath, JSON.stringify(sessions, null, 2));
  }

  /**
   * Updates a session in the index
   */
  private async updateIndex(session: Session): Promise<void> {
    const indexPath = this.getIndexPath();

    if (!fs.existsSync(indexPath)) {
      await this.addToIndex(session);
      return;
    }

    const content = fs.readFileSync(indexPath, "utf-8");
    let sessions: SessionMeta[] = JSON.parse(content);

    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx !== -1) {
      sessions[idx] = {
        id: session.id,
        name: session.name,
        status: session.status,
        message_count: session.messages.length,
        created_at: session.created_at,
        updated_at: session.updated_at,
      };
    }

    fs.writeFileSync(indexPath, JSON.stringify(sessions, null, 2));
  }
}

/**
 * Creates a session service for the given working directory
 */
export function createSessionService(cwd: string): SessionService {
  return new SessionService(cwd);
}
