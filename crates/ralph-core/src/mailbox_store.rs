//! Mailbox store for cross-loop communication in Claude Code Agent Teams.
//!
//! This module implements a file-based mailbox system for agent-to-agent messaging,
//! enabling the Claude Code Agent Teams integration pattern.
//!
//! # Architecture
//!
//! Each loop has a dedicated mailbox file at `.ralph/mailboxes/{loop_id}.jsonl`.
//! Messages are appended to the target loop's file and read by that loop during
//! its iteration cycle.
//!
//! # File Locking
//!
//! All operations use file locking via `FileLock` to ensure safe concurrent access
//! from multiple loops. Write operations use exclusive locks; read operations use
//! shared locks.
//!
//! # Example
//!
//! ```no_run
//! use ralph_core::mailbox_store::MailboxStore;
//! use ralph_proto::Event;
//! use std::path::PathBuf;
//!
//! let store = MailboxStore::new(PathBuf::from(".ralph"));
//!
//! // Send a message to a loop
//! let event = Event::new("mailbox.message", "Hello from loop A");
//! let msg_id = store.send("loop-123", &event).unwrap();
//!
//! // Receive messages for a loop
//! let messages = store.receive("loop-123").unwrap();
//!
//! // Clear mailbox
//! store.clear("loop-123").unwrap();
//! ```

use crate::file_lock::FileLock;
use chrono::{DateTime, Utc};
use ralph_proto::Event;
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use thiserror::Error;

/// Errors that can occur during mailbox operations.
#[derive(Debug, Error)]
pub enum MailboxError {
    /// I/O error during file operations.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// File locking error.
    #[error("Lock error: {0}")]
    Lock(String),
}

/// A message in a loop's mailbox.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MailboxEntry {
    /// Unique identifier for this message.
    /// Format: `{timestamp}-{random_hex}` for uniqueness.
    pub id: String,

    /// The event payload.
    pub event: Event,

    /// When this message was created.
    pub timestamp: DateTime<Utc>,
}

/// File-based mailbox store for cross-loop communication.
///
/// Manages mailbox files under `.ralph/mailboxes/` directory.
/// Each loop has its own JSONL file for message persistence.
#[derive(Debug, Clone)]
pub struct MailboxStore {
    /// Base path (typically `.ralph/`).
    base_path: PathBuf,
}

impl MailboxStore {
    /// Creates a new mailbox store.
    ///
    /// The mailboxes directory will be created on first send if it doesn't exist.
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }

    /// Sends a message to a loop's mailbox.
    ///
    /// The message is appended to the target loop's mailbox file with an
    /// exclusive lock to prevent concurrent write conflicts.
    ///
    /// Returns the unique message ID on success.
    pub fn send(&self, loop_id: &str, event: &Event) -> Result<String, MailboxError> {
        let path = self.mailbox_path(loop_id);

        // Ensure mailboxes directory exists
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Create mailbox entry
        let timestamp = Utc::now();
        let id = generate_message_id(&timestamp);
        let entry = MailboxEntry {
            id: id.clone(),
            event: event.clone(),
            timestamp,
        };

        // Acquire exclusive lock for writing
        let lock = FileLock::new(&path).map_err(|e| MailboxError::Lock(e.to_string()))?;
        let _guard = lock
            .exclusive()
            .map_err(|e| MailboxError::Lock(e.to_string()))?;

        // Append to file
        let mut file = OpenOptions::new().create(true).append(true).open(&path)?;

        let json = serde_json::to_string(&entry)?;
        writeln!(file, "{}", json)?;

        Ok(id)
    }

    /// Receives all messages from a loop's mailbox.
    ///
    /// Returns all messages currently in the mailbox without removing them.
    /// Uses a shared lock to allow concurrent reads.
    ///
    /// Returns an empty vector if the mailbox doesn't exist.
    pub fn receive(&self, loop_id: &str) -> Result<Vec<MailboxEntry>, MailboxError> {
        let path = self.mailbox_path(loop_id);

        if !path.exists() {
            return Ok(Vec::new());
        }

        // Acquire shared lock for reading
        let lock = FileLock::new(&path).map_err(|e| MailboxError::Lock(e.to_string()))?;
        let _guard = lock
            .shared()
            .map_err(|e| MailboxError::Lock(e.to_string()))?;

        let file = File::open(&path)?;
        let reader = BufReader::new(file);
        let mut entries = Vec::new();

        for line in reader.lines() {
            let line = line?;
            if line.trim().is_empty() {
                continue;
            }

            if let Ok(entry) = serde_json::from_str::<MailboxEntry>(&line) {
                entries.push(entry);
            }
            // Silently skip malformed entries
        }

        Ok(entries)
    }

    /// Clears all messages from a loop's mailbox.
    ///
    /// Removes the mailbox file entirely. This is safe - the file will be
    /// recreated on the next send operation.
    pub fn clear(&self, loop_id: &str) -> Result<(), MailboxError> {
        let path = self.mailbox_path(loop_id);

        if !path.exists() {
            return Ok(());
        }

        // Acquire exclusive lock before deletion
        let lock = FileLock::new(&path).map_err(|e| MailboxError::Lock(e.to_string()))?;
        let _guard = lock
            .exclusive()
            .map_err(|e| MailboxError::Lock(e.to_string()))?;

        std::fs::remove_file(&path)?;

        Ok(())
    }

    /// Returns the path to a loop's mailbox file.
    fn mailbox_path(&self, loop_id: &str) -> PathBuf {
        self.base_path
            .join("mailboxes")
            .join(format!("{}.jsonl", loop_id))
    }

    /// Lists all loops that have mailboxes with pending messages.
    ///
    /// Returns loop IDs extracted from mailbox filenames in the mailboxes directory.
    /// Only includes mailboxes with content (non-zero file size).
    pub fn list_mailboxes(&self) -> Result<Vec<String>, MailboxError> {
        let mailboxes_dir = self.base_path.join("mailboxes");

        if !mailboxes_dir.exists() {
            return Ok(Vec::new());
        }

        let mut loop_ids = Vec::new();

        let entries = std::fs::read_dir(&mailboxes_dir)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            // Only process .jsonl files
            if path.extension().map(|e| e == "jsonl").unwrap_or(false)
                && entry.metadata()?.len() > 0
            {
                if let Some(stem) = path.file_stem() {
                    if let Some(loop_id) = stem.to_str() {
                        loop_ids.push(loop_id.to_string());
                    }
                }
            }
        }

        loop_ids.sort();
        Ok(loop_ids)
    }

    /// Returns the number of pending messages in a loop's mailbox.
    pub fn count(&self, loop_id: &str) -> Result<usize, MailboxError> {
        let messages = self.receive(loop_id)?;
        Ok(messages.len())
    }
}

/// Generates a unique message ID.
///
/// Format: `msg-{timestamp_ms}-{random_hex}` where random_hex is 8 characters.
fn generate_message_id(timestamp: &DateTime<Utc>) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let ts_ms = timestamp.timestamp_millis();

    // Generate random component using timestamp and address
    let random_seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);

    // Simple hash for random-looking hex (not cryptographically secure)
    let hash =
        ts_ms as u64 ^ random_seed ^ ((random_seed.wrapping_shl(32)) & 0xFFFF_FFFF_0000_0000);

    format!("msg-{}-{:08x}", ts_ms, hash & 0xFFFF_FFFF)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ralph_proto::Event;
    use tempfile::TempDir;

    #[test]
    fn test_mailbox_path() {
        let store = MailboxStore::new(PathBuf::from(".ralph"));
        let path = store.mailbox_path("loop-123");
        assert_eq!(path, PathBuf::from(".ralph/mailboxes/loop-123.jsonl"));
    }

    #[test]
    fn test_send_creates_entry() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        let event = Event::new("mailbox.message", "Hello");
        let msg_id = store.send("loop-123", &event).unwrap();

        assert!(msg_id.starts_with("msg-"));
        assert!(temp_dir.path().join("mailboxes/loop-123.jsonl").exists());
    }

    #[test]
    fn test_receive_empty_mailbox() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        let messages = store.receive("loop-nonexistent").unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_send_and_receive() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        let event = Event::new("mailbox.message", "Test message");
        let msg_id = store.send("loop-123", &event).unwrap();

        let messages = store.receive("loop-123").unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].id, msg_id);
        assert_eq!(messages[0].event.payload, "Test message");
    }

    #[test]
    fn test_multiple_messages() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        // Send multiple messages
        for i in 0..5 {
            let event = Event::new("mailbox.message", &format!("Message {}", i));
            store.send("loop-123", &event).unwrap();
        }

        let messages = store.receive("loop-123").unwrap();
        assert_eq!(messages.len(), 5);

        // Verify order is preserved
        for (i, msg) in messages.iter().enumerate() {
            assert_eq!(msg.event.payload, format!("Message {}", i));
        }
    }

    #[test]
    fn test_clear_mailbox() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        // Send a message
        let event = Event::new("mailbox.message", "Test");
        store.send("loop-123", &event).unwrap();

        // Verify it exists
        let messages = store.receive("loop-123").unwrap();
        assert_eq!(messages.len(), 1);

        // Clear mailbox
        store.clear("loop-123").unwrap();

        // Verify it's empty
        let messages = store.receive("loop-123").unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn test_clear_nonexistent_mailbox() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        // Clearing nonexistent mailbox should succeed
        let result = store.clear("loop-nonexistent");
        assert!(result.is_ok());
    }

    #[test]
    fn test_generate_message_id_uniqueness() {
        let ts1 = Utc::now();
        let id1 = generate_message_id(&ts1);

        // Small delay to ensure different timestamp
        std::thread::sleep(std::time::Duration::from_millis(2));

        let ts2 = Utc::now();
        let id2 = generate_message_id(&ts2);

        assert_ne!(id1, id2);
        assert!(id1.starts_with("msg-"));
        assert!(id2.starts_with("msg-"));
    }

    #[test]
    fn test_concurrent_sends() {
        use std::sync::{Arc, Barrier};
        use std::thread;

        let temp_dir = TempDir::new().unwrap();
        let store = Arc::new(MailboxStore::new(temp_dir.path().to_path_buf()));
        let barrier = Arc::new(Barrier::new(3));

        let mut handles = vec![];

        for i in 0..3 {
            let store_clone = Arc::clone(&store);
            let barrier_clone = Arc::clone(&barrier);

            let handle = thread::spawn(move || {
                barrier_clone.wait();

                for j in 0..5 {
                    let event =
                        Event::new("mailbox.message", &format!("Thread {} Message {}", i, j));
                    store_clone.send("loop-123", &event).unwrap();
                }
            });

            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // All messages should be present
        let messages = store.receive("loop-123").unwrap();
        assert_eq!(messages.len(), 15); // 3 threads × 5 messages
    }

    #[test]
    fn test_message_serialization_roundtrip() {
        let entry = MailboxEntry {
            id: "msg-1234567890-abc12345".to_string(),
            event: Event::new("mailbox.message", "Test payload"),
            timestamp: Utc::now(),
        };

        let json = serde_json::to_string(&entry).unwrap();
        let deserialized: MailboxEntry = serde_json::from_str(&json).unwrap();

        assert_eq!(entry.id, deserialized.id);
        assert_eq!(entry.event.payload, deserialized.event.payload);
    }

    #[test]
    fn test_list_mailboxes_empty() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        let mailboxes = store.list_mailboxes().unwrap();
        assert!(mailboxes.is_empty());
    }

    #[test]
    fn test_list_mailboxes_multiple() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        // Create mailboxes for 3 loops
        for loop_id in &["loop-3", "loop-1", "loop-2"] {
            let event = Event::new("mailbox.message", "Test");
            store.send(loop_id, &event).unwrap();
        }

        let mailboxes = store.list_mailboxes().unwrap();
        // Should be sorted
        assert_eq!(mailboxes, vec!["loop-1", "loop-2", "loop-3"]);
    }

    #[test]
    fn test_list_mailboxes_excludes_empty() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        // Create mailbox for loop-1 with a message
        let event = Event::new("mailbox.message", "Test");
        store.send("loop-1", &event).unwrap();

        // Create empty mailbox file for loop-2
        let mailboxes_dir = temp_dir.path().join("mailboxes");
        std::fs::create_dir_all(&mailboxes_dir).unwrap();
        std::fs::File::create(mailboxes_dir.join("loop-2.jsonl")).unwrap();

        let mailboxes = store.list_mailboxes().unwrap();
        // Only loop-1 should be included (loop-2 is empty)
        assert_eq!(mailboxes, vec!["loop-1"]);
    }

    #[test]
    fn test_count_messages() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        // Send 3 messages
        for i in 0..3 {
            let event = Event::new("mailbox.message", &format!("Message {}", i));
            store.send("loop-123", &event).unwrap();
        }

        let count = store.count("loop-123").unwrap();
        assert_eq!(count, 3);
    }

    #[test]
    fn test_count_empty_mailbox() {
        let temp_dir = TempDir::new().unwrap();
        let store = MailboxStore::new(temp_dir.path().to_path_buf());

        let count = store.count("loop-nonexistent").unwrap();
        assert_eq!(count, 0);
    }
}
