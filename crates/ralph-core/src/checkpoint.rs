//! Checkpoint system for state persistence and crash recovery.
//!
//! This module provides checkpoint-based state persistence that allows Ralph
//! orchestration loops to be paused, resumed, and recovered from crashes.
//!
//! # Overview
//!
//! Checkpoints capture the complete execution state at defined intervals:
//! - Loop metadata (iteration, status, timing)
//! - Memories (persistent learnings)
//! - Tasks (work items and their status)
//! - Loop state (hat activation counts, failure tracking)
//!
//! # Storage
//!
//! Checkpoints are stored in `.ralph/checkpoints/{loop_id}/`:
//! ```text
//! .ralph/checkpoints/
//! ├── loop-abc123/
//! │   ├── cp-20260223-103000.json       # Interval checkpoint
//! │   ├── cp-20260223-104500.json.gz    # Compressed (large)
//! │   └── cp-20260223-110000.json
//! └── checkpoint-meta.json              # Index file
//! ```

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Why a checkpoint was created.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckpointType {
    /// Periodic checkpoint at configured intervals.
    Interval,
    /// Before starting a new task.
    PreTask,
    /// After completing a task.
    PostTask,
    /// User-requested checkpoint.
    Manual,
    /// Before a restart (graceful shutdown).
    PreRestart,
}

impl Default for CheckpointType {
    fn default() -> Self {
        Self::Interval
    }
}

/// Configuration for checkpoint behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointConfig {
    /// Whether checkpointing is enabled.
    #[serde(default = "default_enabled")]
    pub enabled: bool,

    /// Interval between automatic checkpoints in seconds.
    #[serde(default = "default_interval_seconds")]
    pub interval_seconds: u64,

    /// Maximum checkpoints to keep per loop (older ones are pruned).
    #[serde(default = "default_max_checkpoints")]
    pub max_checkpoints: usize,

    /// Maximum age in seconds before checkpoints are pruned.
    #[serde(default = "default_max_age_seconds")]
    pub max_age_seconds: u64,

    /// Compress checkpoints larger than this many bytes.
    #[serde(default = "default_compress_threshold")]
    pub compress_threshold: usize,
}

fn default_enabled() -> bool {
    true
}

fn default_interval_seconds() -> u64 {
    300 // 5 minutes
}

fn default_max_checkpoints() -> usize {
    10
}

fn default_max_age_seconds() -> u64 {
    7 * 24 * 60 * 60 // 7 days
}

fn default_compress_threshold() -> usize {
    100_000 // 100KB
}

impl Default for CheckpointConfig {
    fn default() -> Self {
        Self {
            enabled: default_enabled(),
            interval_seconds: default_interval_seconds(),
            max_checkpoints: default_max_checkpoints(),
            max_age_seconds: default_max_age_seconds(),
            compress_threshold: default_compress_threshold(),
        }
    }
}

/// Serializable loop state (checkpoint-compatible version).
///
/// This is a snapshot of the event loop's internal state,
/// converted from `LoopState` which uses non-serializable `Instant`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializableLoopState {
    /// Current iteration number (1-indexed).
    pub iteration: u32,

    /// Number of consecutive failures.
    pub consecutive_failures: u32,

    /// Cumulative cost in USD.
    pub cumulative_cost: f64,

    /// When the loop started (ISO 8601).
    pub started_at: DateTime<Utc>,

    /// The last hat that executed.
    pub last_hat: Option<String>,

    /// Consecutive blocked events from the same hat.
    pub consecutive_blocked: u32,

    /// Hat that emitted the last blocked event.
    pub last_blocked_hat: Option<String>,

    /// Per-task block counts.
    pub task_block_counts: HashMap<String, u32>,

    /// Tasks that have been abandoned.
    pub abandoned_tasks: Vec<String>,

    /// Count of abandoned task redispatches.
    pub abandoned_task_redispatches: u32,

    /// Consecutive malformed events.
    pub consecutive_malformed_events: u32,

    /// Whether completion was requested.
    pub completion_requested: bool,

    /// Per-hat activation counts.
    pub hat_activation_counts: HashMap<String, u32>,

    /// Exhausted hat IDs.
    pub exhausted_hats: HashSet<String>,

    /// When the last Telegram check-in was sent.
    pub last_checkin_at: Option<DateTime<Utc>>,

    /// Last active hat IDs.
    pub last_active_hat_ids: Vec<String>,
}

impl Default for SerializableLoopState {
    fn default() -> Self {
        Self {
            iteration: 0,
            consecutive_failures: 0,
            cumulative_cost: 0.0,
            started_at: Utc::now(),
            last_hat: None,
            consecutive_blocked: 0,
            last_blocked_hat: None,
            task_block_counts: HashMap::new(),
            abandoned_tasks: Vec::new(),
            abandoned_task_redispatches: 0,
            consecutive_malformed_events: 0,
            completion_requested: false,
            hat_activation_counts: HashMap::new(),
            exhausted_hats: HashSet::new(),
            last_checkin_at: None,
            last_active_hat_ids: Vec::new(),
        }
    }
}

/// Complete checkpoint state for a loop.
///
/// Contains all the state needed to resume a loop from a saved point.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopCheckpoint {
    /// Unique checkpoint ID (format: cp-{YYYYMMDD}-{HHMMSS}).
    pub id: String,

    /// Associated loop ID.
    pub loop_id: String,

    /// When the checkpoint was created.
    pub created_at: DateTime<Utc>,

    /// Iteration number at checkpoint time.
    pub iteration: u32,

    /// Why this checkpoint was created.
    pub checkpoint_type: CheckpointType,

    /// Size of the serialized checkpoint in bytes.
    #[serde(default)]
    pub size: usize,

    /// SHA-256 checksum for integrity verification.
    #[serde(default)]
    pub checksum: String,

    /// Whether the checkpoint is compressed.
    #[serde(default)]
    pub compressed: bool,

    /// The actual loop state.
    pub state: CheckpointState,
}

/// The state contained within a checkpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointState {
    /// Core loop metadata.
    pub loop_id: String,

    /// Iteration number.
    pub iteration: u32,

    /// Current hat (if any).
    pub current_hat: Option<String>,

    /// Loop status string.
    pub status: String,

    /// Memories at checkpoint time.
    pub memories: Vec<crate::Memory>,

    /// Tasks at checkpoint time.
    pub tasks: Vec<crate::Task>,

    /// Currently active task ID (if any).
    pub current_task: Option<String>,

    /// Pending events (if any).
    #[serde(default)]
    pub pending_events: Vec<String>,

    /// The last prompt sent to the agent.
    #[serde(default)]
    pub last_prompt: Option<String>,

    /// Loop internal state.
    pub loop_state: SerializableLoopState,

    /// When this loop started.
    pub started_at: DateTime<Utc>,

    /// When the last checkpoint was created.
    pub last_checkpoint_at: Option<DateTime<Utc>>,

    /// File hashes for integrity (path -> hash).
    #[serde(default)]
    pub file_hashes: HashMap<String, String>,
}

/// Result of a checkpoint restore operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    /// The restored checkpoint.
    pub checkpoint: LoopCheckpoint,

    /// Whether the restore was successful.
    pub success: bool,

    /// Any warnings encountered during restore.
    pub warnings: Vec<String>,

    /// Timestamp of the restore.
    pub restored_at: DateTime<Utc>,
}

/// Metadata entry for the checkpoint index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckpointMeta {
    /// Checkpoint ID.
    pub id: String,

    /// Loop ID.
    pub loop_id: String,

    /// When created.
    pub created_at: DateTime<Utc>,

    /// Checkpoint type.
    pub checkpoint_type: CheckpointType,

    /// File path relative to checkpoints directory.
    pub path: String,

    /// Size in bytes.
    pub size: usize,

    /// Whether compressed.
    pub compressed: bool,

    /// Checksum.
    pub checksum: String,
}

/// The checkpoint index file structure.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CheckpointIndex {
    /// All checkpoint metadata.
    pub checkpoints: Vec<CheckpointMeta>,

    /// When the index was last updated.
    pub updated_at: DateTime<Utc>,
}

impl CheckpointIndex {
    /// Creates a new empty index.
    pub fn new() -> Self {
        Self {
            checkpoints: Vec::new(),
            updated_at: Utc::now(),
        }
    }

    /// Adds a checkpoint to the index.
    pub fn add(&mut self, meta: CheckpointMeta) {
        self.checkpoints.push(meta);
        self.updated_at = Utc::now();
    }

    /// Removes a checkpoint from the index by ID.
    pub fn remove(&mut self, id: &str) -> Option<CheckpointMeta> {
        if let Some(pos) = self.checkpoints.iter().position(|m| m.id == id) {
            self.updated_at = Utc::now();
            Some(self.checkpoints.remove(pos))
        } else {
            None
        }
    }

    /// Lists checkpoints for a specific loop, sorted by creation time (newest first).
    pub fn for_loop(&self, loop_id: &str) -> Vec<&CheckpointMeta> {
        let mut checkpoints: Vec<_> = self
            .checkpoints
            .iter()
            .filter(|m| m.loop_id == loop_id)
            .collect();
        checkpoints.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        checkpoints
    }

    /// Gets the latest checkpoint for a loop.
    pub fn latest_for_loop(&self, loop_id: &str) -> Option<&CheckpointMeta> {
        self.for_loop(loop_id).into_iter().next()
    }
}

impl LoopCheckpoint {
    /// Generates a checkpoint ID from the current timestamp.
    ///
    /// Format: `cp-{YYYYMMDD}-{HHMMSS}`
    pub fn generate_id() -> String {
        let now = Utc::now();
        format!(
            "cp-{}-{}",
            now.format("%Y%m%d"),
            now.format("%H%M%S")
        )
    }

    /// Creates a new checkpoint with the given loop ID and state.
    pub fn new(loop_id: String, iteration: u32, checkpoint_type: CheckpointType, state: CheckpointState) -> Self {
        Self {
            id: Self::generate_id(),
            loop_id,
            created_at: Utc::now(),
            iteration,
            checkpoint_type,
            size: 0,
            checksum: String::new(),
            compressed: false,
            state,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_checkpoint_config_defaults() {
        let config = CheckpointConfig::default();
        assert!(config.enabled);
        assert_eq!(config.interval_seconds, 300);
        assert_eq!(config.max_checkpoints, 10);
        assert_eq!(config.max_age_seconds, 7 * 24 * 60 * 60);
        assert_eq!(config.compress_threshold, 100_000);
    }

    #[test]
    fn test_checkpoint_type_serde() {
        let ct = CheckpointType::PreTask;
        let json = serde_json::to_string(&ct).unwrap();
        assert_eq!(json, "\"pre_task\"");

        let deserialized: CheckpointType = serde_json::from_str("\"interval\"").unwrap();
        assert_eq!(deserialized, CheckpointType::Interval);
    }

    #[test]
    fn test_checkpoint_id_format() {
        let id = LoopCheckpoint::generate_id();
        assert!(id.starts_with("cp-"));
        // Format: cp-YYYYMMDD-HHMMSS
        assert_eq!(id.len(), 18); // "cp-" + 8 + "-" + 6
    }

    #[test]
    fn test_serializable_loop_state_default() {
        let state = SerializableLoopState::default();
        assert_eq!(state.iteration, 0);
        assert_eq!(state.consecutive_failures, 0);
        assert!(state.last_hat.is_none());
        assert!(state.hat_activation_counts.is_empty());
    }

    #[test]
    fn test_checkpoint_index_operations() {
        let mut index = CheckpointIndex::new();
        assert!(index.checkpoints.is_empty());

        let meta = CheckpointMeta {
            id: "cp-20260223-103000".to_string(),
            loop_id: "loop-abc".to_string(),
            created_at: Utc::now(),
            checkpoint_type: CheckpointType::Interval,
            path: "loop-abc/cp-20260223-103000.json".to_string(),
            size: 1024,
            compressed: false,
            checksum: "abc123".to_string(),
        };

        index.add(meta.clone());
        assert_eq!(index.checkpoints.len(), 1);

        let for_loop = index.for_loop("loop-abc");
        assert_eq!(for_loop.len(), 1);

        let latest = index.latest_for_loop("loop-abc");
        assert!(latest.is_some());

        let removed = index.remove("cp-20260223-103000");
        assert!(removed.is_some());
        assert!(index.checkpoints.is_empty());
    }

    #[test]
    fn test_checkpoint_index_sorted_by_time() {
        let mut index = CheckpointIndex::new();

        let now = Utc::now();
        let meta1 = CheckpointMeta {
            id: "cp-1".to_string(),
            loop_id: "loop-abc".to_string(),
            created_at: now - chrono::Duration::hours(1),
            checkpoint_type: CheckpointType::Interval,
            path: "loop-abc/cp-1.json".to_string(),
            size: 100,
            compressed: false,
            checksum: "a".to_string(),
        };

        let meta2 = CheckpointMeta {
            id: "cp-2".to_string(),
            loop_id: "loop-abc".to_string(),
            created_at: now,
            checkpoint_type: CheckpointType::Interval,
            path: "loop-abc/cp-2.json".to_string(),
            size: 100,
            compressed: false,
            checksum: "b".to_string(),
        };

        index.add(meta1);
        index.add(meta2);

        let for_loop = index.for_loop("loop-abc");
        assert_eq!(for_loop[0].id, "cp-2"); // Newest first
        assert_eq!(for_loop[1].id, "cp-1");
    }

    #[test]
    fn test_loop_checkpoint_creation() {
        let state = CheckpointState {
            loop_id: "loop-test".to_string(),
            iteration: 5,
            current_hat: Some("coder".to_string()),
            status: "running".to_string(),
            memories: Vec::new(),
            tasks: Vec::new(),
            current_task: None,
            pending_events: Vec::new(),
            last_prompt: Some("Fix the bug".to_string()),
            loop_state: SerializableLoopState::default(),
            started_at: Utc::now(),
            last_checkpoint_at: None,
            file_hashes: HashMap::new(),
        };

        let checkpoint = LoopCheckpoint::new(
            "loop-test".to_string(),
            5,
            CheckpointType::Interval,
            state,
        );

        assert!(checkpoint.id.starts_with("cp-"));
        assert_eq!(checkpoint.loop_id, "loop-test");
        assert_eq!(checkpoint.iteration, 5);
        assert_eq!(checkpoint.checkpoint_type, CheckpointType::Interval);
    }

    #[test]
    fn test_checkpoint_state_serde_roundtrip() {
        let state = CheckpointState {
            loop_id: "loop-test".to_string(),
            iteration: 10,
            current_hat: Some("planner".to_string()),
            status: "healthy".to_string(),
            memories: vec![crate::Memory::new(
                crate::MemoryType::Pattern,
                "Test pattern".to_string(),
                vec!["test".to_string()],
            )],
            tasks: vec![crate::Task::new("Test task".to_string(), 1)],
            current_task: Some("task-123".to_string()),
            pending_events: vec!["event1".to_string()],
            last_prompt: Some("Do something".to_string()),
            loop_state: SerializableLoopState {
                iteration: 10,
                consecutive_failures: 0,
                ..Default::default()
            },
            started_at: Utc::now(),
            last_checkpoint_at: Some(Utc::now()),
            file_hashes: {
                let mut map = HashMap::new();
                map.insert("file.txt".to_string(), "hash123".to_string());
                map
            },
        };

        let json = serde_json::to_string(&state).unwrap();
        let deserialized: CheckpointState = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.loop_id, state.loop_id);
        assert_eq!(deserialized.iteration, state.iteration);
        assert_eq!(deserialized.memories.len(), 1);
        assert_eq!(deserialized.tasks.len(), 1);
        assert_eq!(deserialized.file_hashes.len(), 1);
    }
}
