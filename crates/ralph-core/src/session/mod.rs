//! Session management for multi-turn conversations.
//!
//! This module provides session management for Claude Code style multi-turn conversations:
//! - `Session`: A conversation session with messages
//! - `SessionMessage`: Individual messages in a conversation
//! - `SessionManager`: CRUD operations and persistence
//!
//! Storage structure:
//! - `.ralph/sessions/sessions.json` - Session index
//! - `.ralph/sessions/{session-id}/meta.json` - Session metadata
//! - `.ralph/sessions/{session-id}/messages.jsonl` - Incremental message log

use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

pub mod compress;

use crate::file_lock::FileLock;

/// Default path for sessions directory relative to workspace root.
pub const DEFAULT_SESSIONS_PATH: &str = ".ralph/sessions";

// Maximum messages to keep in memory before flushing to disk.
// Currently unused but reserved for future cache management.
#[allow(dead_code)]
const MAX_MEMORY_MESSAGES: usize = 100;

/// Role of the message sender.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    /// User input
    User,
    /// Assistant (Ralph) response
    Assistant,
    /// System message
    System,
}

impl std::fmt::Display for MessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::User => write!(f, "user"),
            Self::Assistant => write!(f, "assistant"),
            Self::System => write!(f, "system"),
        }
    }
}

/// A single message in a conversation session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMessage {
    /// Unique message ID
    pub id: String,
    /// Role of the sender
    pub role: MessageRole,
    /// Message content
    pub content: String,
    /// Timestamp when the message was created
    pub created_at: DateTime<Utc>,
    /// Optional metadata (tool calls, thinking, etc.)
    #[serde(default)]
    pub metadata: HashMap<String, serde_json::Value>,
}

impl SessionMessage {
    /// Creates a new user message.
    #[must_use]
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            id: Self::generate_id(),
            role: MessageRole::User,
            content: content.into(),
            created_at: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// Creates a new assistant message.
    #[must_use]
    pub fn assistant(content: impl Into<String>) -> Self {
        Self {
            id: Self::generate_id(),
            role: MessageRole::Assistant,
            content: content.into(),
            created_at: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// Creates a new system message.
    #[must_use]
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            id: Self::generate_id(),
            role: MessageRole::System,
            content: content.into(),
            created_at: Utc::now(),
            metadata: HashMap::new(),
        }
    }

    /// Generates a unique message ID.
    fn generate_id() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};

        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");

        let timestamp = duration.as_secs();
        let nanos = duration.subsec_nanos();
        let hex_suffix = format!("{:04x}", nanos % 0x10000);

        format!("msg-{}-{}", timestamp, hex_suffix)
    }
}

/// Status of a conversation session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum ConversationStatus {
    /// Session is active and can accept new messages
    #[default]
    Active,
    /// Session has been paused/archived
    Archived,
    /// Session has been completed
    Completed,
}

/// Metadata about a session (lightweight for listing).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMeta {
    /// Unique session ID
    pub id: String,
    /// Human-readable session name/title
    pub name: String,
    /// Session status
    pub status: ConversationStatus,
    /// Number of messages in the session
    pub message_count: usize,
    /// Timestamp when the session was created
    pub created_at: DateTime<Utc>,
    /// Timestamp when the session was last updated
    pub updated_at: DateTime<Utc>,
}

/// Full session data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    /// Unique session ID
    pub id: String,
    /// Human-readable session name/title
    pub name: String,
    /// Session status
    pub status: ConversationStatus,
    /// Messages in the session
    pub messages: Vec<SessionMessage>,
    /// Custom context/summary (updated on compression)
    #[serde(default)]
    pub context: String,
    /// Timestamp when the session was created
    pub created_at: DateTime<Utc>,
    /// Timestamp when the session was last updated
    pub updated_at: DateTime<Utc>,
}

impl Session {
    /// Creates a new session.
    #[must_use]
    pub fn new(name: impl Into<String>) -> Self {
        let now = Utc::now();
        Self {
            id: Self::generate_id(),
            name: name.into(),
            status: ConversationStatus::Active,
            messages: Vec::new(),
            context: String::new(),
            created_at: now,
            updated_at: now,
        }
    }

    /// Generates a unique session ID.
    fn generate_id() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};

        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");

        let timestamp = duration.as_secs();
        // Use microseconds as the hex suffix for uniqueness
        let micros = duration.subsec_micros();
        let hex_suffix = format!("{:04x}", micros % 0x10000);

        format!("sess-{}-{}", timestamp, hex_suffix)
    }

    /// Adds a message to the session.
    pub fn append(&mut self, message: SessionMessage) {
        self.messages.push(message);
        self.updated_at = Utc::now();
    }

    /// Returns the number of messages.
    #[must_use]
    pub fn len(&self) -> usize {
        self.messages.len()
    }

    /// Returns true if the session has no messages.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.messages.is_empty()
    }
}

/// Session store for managing multiple sessions.
///
/// This store uses file-based storage with JSONL for messages:
/// - `sessions.json`: Index of all sessions
/// - `{session-id}/meta.json`: Session metadata
/// - `{session-id}/messages.jsonl`: Message log (appended incrementally)
///
/// # Multi-loop Safety
///
/// Uses file locking for safe concurrent access:
/// - Shared locks for reading
/// - Exclusive locks for writing
#[derive(Debug, Clone)]
pub struct SessionManager {
    base_path: PathBuf,
    cache: Arc<RwLock<HashMap<String, Session>>>,
}

impl SessionManager {
    /// Creates a new session manager at the given path.
    #[must_use]
    pub fn new(path: impl AsRef<Path>) -> Self {
        Self {
            base_path: path.as_ref().to_path_buf(),
            cache: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Creates a session manager with the default path.
    #[must_use]
    pub fn with_default_path(root: impl AsRef<Path>) -> Self {
        Self::new(root.as_ref().join(DEFAULT_SESSIONS_PATH))
    }

    /// Returns the base path for sessions.
    #[must_use]
    pub fn base_path(&self) -> &Path {
        &self.base_path
    }

    /// Returns true if the sessions directory exists.
    #[must_use]
    pub fn exists(&self) -> bool {
        self.base_path.exists()
    }

    /// Initializes the sessions directory.
    pub fn init(&self) -> io::Result<()> {
        fs::create_dir_all(&self.base_path)
    }

    /// Creates a new session.
    pub async fn create(&self, name: impl Into<String>) -> io::Result<Session> {
        // Ensure directory exists
        self.init()?;

        let session = Session::new(name);
        let session_path = self.base_path.join(&session.id);

        // Create session directory
        fs::create_dir_all(&session_path)?;

        // Write metadata
        let meta_path = session_path.join("meta.json");
        let meta_json = serde_json::to_string_pretty(&session)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&meta_path, meta_json)?;

        // Create empty messages file
        let messages_path = session_path.join("messages.jsonl");
        fs::write(&messages_path, "")?;

        // Update sessions index
        self.add_to_index(&session)?;

        // Add to cache
        let mut cache = self.cache.write().await;
        cache.insert(session.id.clone(), session.clone());

        Ok(session)
    }

    /// Appends a message to a session.
    pub async fn append(&self, session_id: &str, message: SessionMessage) -> io::Result<()> {
        let session_path = self.base_path.join(session_id);

        if !session_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Session not found: {}", session_id),
            ));
        }

        let messages_path = session_path.join("messages.jsonl");

        // Append to messages file (JSONL format)
        let lock = FileLock::new(&messages_path)?;
        let _guard = lock.exclusive()?;

        let json = serde_json::to_string(&message)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        let line = format!("{}\n", json);
        fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&messages_path)?
            .write_all(line.as_bytes())?;

        // Update cache
        let mut cache = self.cache.write().await;
        if let Some(session) = cache.get_mut(session_id) {
            session.append(message);
            session.updated_at = Utc::now();
        }

        // Update metadata
        let meta_path = session_path.join("meta.json");
        if let Some(session) = cache.get(session_id) {
            let meta_json = serde_json::to_string_pretty(session)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
            fs::write(&meta_path, meta_json)?;
        }

        Ok(())
    }

    /// Loads a session by ID.
    pub async fn load(&self, session_id: &str) -> io::Result<Session> {
        // Check cache first
        {
            let cache = self.cache.read().await;
            if let Some(session) = cache.get(session_id) {
                return Ok(session.clone());
            }
        }

        let session_path = self.base_path.join(session_id);

        if !session_path.exists() {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Session not found: {}", session_id),
            ));
        }

        // Load metadata
        let meta_path = session_path.join("meta.json");
        let meta_content = fs::read_to_string(&meta_path)?;
        let mut session: Session = serde_json::from_str(&meta_content)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        // Load messages
        let messages_path = session_path.join("messages.jsonl");
        if messages_path.exists() {
            let messages_content = fs::read_to_string(&messages_path)?;
            for line in messages_content.lines() {
                if line.trim().is_empty() {
                    continue;
                }
                if let Ok(message) = serde_json::from_str::<SessionMessage>(line) {
                    session.messages.push(message);
                }
            }
        }

        // Add to cache
        let mut cache = self.cache.write().await;
        cache.insert(session_id.to_string(), session.clone());

        Ok(session)
    }

    /// Lists all sessions (metadata only).
    pub fn list(&self) -> io::Result<Vec<SessionMeta>> {
        let index_path = self.base_path.join("sessions.json");

        if !index_path.exists() {
            return Ok(Vec::new());
        }

        let lock = FileLock::new(&index_path)?;
        let _guard = lock.shared()?;

        let content = fs::read_to_string(&index_path)?;
        let sessions: Vec<SessionMeta> = serde_json::from_str(&content)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        Ok(sessions)
    }

    /// Gets a session by ID (metadata only).
    pub async fn get_meta(&self, session_id: &str) -> io::Result<SessionMeta> {
        let sessions = self.list()?;
        sessions
            .into_iter()
            .find(|s| s.id == session_id)
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("Session not found: {}", session_id),
                )
            })
    }

    /// Deletes a session.
    pub async fn delete(&self, session_id: &str) -> io::Result<bool> {
        let session_path = self.base_path.join(session_id);

        if !session_path.exists() {
            return Ok(false);
        }

        // Remove from cache
        {
            let mut cache = self.cache.write().await;
            cache.remove(session_id);
        }

        // Remove directory
        fs::remove_dir_all(&session_path)?;

        // Update index
        self.remove_from_index(session_id)?;

        Ok(true)
    }

    /// Updates session metadata.
    pub async fn update(
        &self,
        session_id: &str,
        name: Option<String>,
        status: Option<ConversationStatus>,
    ) -> io::Result<Session> {
        let mut session = self.load(session_id).await?;

        if let Some(n) = name {
            session.name = n;
        }
        if let Some(s) = status {
            session.status = s;
        }
        session.updated_at = Utc::now();

        // Write metadata
        let session_path = self.base_path.join(session_id);
        let meta_path = session_path.join("meta.json");
        let meta_json = serde_json::to_string_pretty(&session)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&meta_path, meta_json)?;

        // Update cache
        let mut cache = self.cache.write().await;
        cache.insert(session_id.to_string(), session.clone());

        // Update index
        self.update_index(&session)?;

        Ok(session)
    }

    /// Adds a session to the index.
    fn add_to_index(&self, session: &Session) -> io::Result<()> {
        let index_path = self.base_path.join("sessions.json");

        let mut sessions: Vec<SessionMeta> = if index_path.exists() {
            let lock = FileLock::new(&index_path)?;
            let _guard = lock.exclusive()?;
            let content = fs::read_to_string(&index_path)?;
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        };

        sessions.push(SessionMeta {
            id: session.id.clone(),
            name: session.name.clone(),
            status: session.status,
            message_count: session.messages.len(),
            created_at: session.created_at,
            updated_at: session.updated_at,
        });

        // Write index
        let index_json = serde_json::to_string_pretty(&sessions)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&index_path, index_json)?;

        Ok(())
    }

    /// Removes a session from the index.
    fn remove_from_index(&self, session_id: &str) -> io::Result<()> {
        let index_path = self.base_path.join("sessions.json");

        if !index_path.exists() {
            return Ok(());
        }

        let lock = FileLock::new(&index_path)?;
        let _guard = lock.exclusive()?;

        let content = fs::read_to_string(&index_path)?;
        let mut sessions: Vec<SessionMeta> = serde_json::from_str(&content)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        sessions.retain(|s| s.id != session_id);

        let index_json = serde_json::to_string_pretty(&sessions)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&index_path, index_json)?;

        Ok(())
    }

    /// Updates a session in the index.
    fn update_index(&self, session: &Session) -> io::Result<()> {
        let index_path = self.base_path.join("sessions.json");

        if !index_path.exists() {
            return self.add_to_index(session);
        }

        let lock = FileLock::new(&index_path)?;
        let _guard = lock.exclusive()?;

        let content = fs::read_to_string(&index_path)?;
        let mut sessions: Vec<SessionMeta> = serde_json::from_str(&content)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        if let Some(meta) = sessions.iter_mut().find(|s| s.id == session.id) {
            meta.name = session.name.clone();
            meta.status = session.status;
            meta.message_count = session.messages.len();
            meta.updated_at = session.updated_at;
        }

        let index_json = serde_json::to_string_pretty(&sessions)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&index_path, index_json)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_temp_manager() -> (TempDir, SessionManager) {
        let temp_dir = TempDir::new().unwrap();
        let manager = SessionManager::new(temp_dir.path());
        (temp_dir, manager)
    }

    #[tokio::test]
    async fn test_create_session() {
        let (_temp_dir, manager) = create_temp_manager();

        let session = manager.create("Test Session").await.unwrap();

        assert!(session.id.starts_with("sess-"));
        assert_eq!(session.name, "Test Session");
        assert_eq!(session.status, ConversationStatus::Active);
        assert!(session.messages.is_empty());
    }

    #[tokio::test]
    async fn test_append_message() {
        let (_temp_dir, manager) = create_temp_manager();

        let session = manager.create("Test Session").await.unwrap();
        let session_id = session.id.clone();

        manager
            .append(&session_id, SessionMessage::user("Hello"))
            .await
            .unwrap();
        manager
            .append(&session_id, SessionMessage::assistant("Hi there!"))
            .await
            .unwrap();

        let loaded = manager.load(&session_id).await.unwrap();
        assert_eq!(loaded.messages.len(), 2);
        assert_eq!(loaded.messages[0].role, MessageRole::User);
        assert_eq!(loaded.messages[1].role, MessageRole::Assistant);
    }

    #[tokio::test]
    async fn test_list_sessions() {
        let (_temp_dir, manager) = create_temp_manager();

        manager.create("Session 1").await.unwrap();
        manager.create("Session 2").await.unwrap();

        let sessions = manager.list().unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[tokio::test]
    async fn test_delete_session() {
        let (_temp_dir, manager) = create_temp_manager();

        let session = manager.create("Test Session").await.unwrap();
        let session_id = session.id.clone();

        let deleted = manager.delete(&session_id).await.unwrap();
        assert!(deleted);

        let result = manager.load(&session_id).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_update_session() {
        let (_temp_dir, manager) = create_temp_manager();

        let session = manager.create("Original Name").await.unwrap();
        let session_id = session.id.clone();

        let updated = manager
            .update(&session_id, Some("New Name".to_string()), None)
            .await
            .unwrap();

        assert_eq!(updated.name, "New Name");
    }

    #[tokio::test]
    async fn test_cache() {
        let (_temp_dir, manager) = create_temp_manager();

        let session = manager.create("Test Session").await.unwrap();
        let session_id = session.id.clone();

        // First load
        let loaded1 = manager.load(&session_id).await.unwrap();
        // Second load should hit cache
        let loaded2 = manager.load(&session_id).await.unwrap();

        assert_eq!(loaded1.id, loaded2.id);
    }
}
