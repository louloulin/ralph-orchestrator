//! Recovery manager for restoring loops from checkpoints.
//!
//! This module provides the `RecoveryManager` trait and implementation
//! for restoring loop state from saved checkpoints.

use crate::checkpoint::{LoopCheckpoint, RestoreResult, SerializableLoopState};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

/// Errors that can occur during recovery operations.
#[derive(Debug, Error)]
pub enum RecoveryError {
    /// I/O error during recovery.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Deserialization error.
    #[error("Deserialization error: {0}")]
    Deserialization(#[from] serde_json::Error),

    /// Checkpoint not found.
    #[error("Checkpoint not found: {0}")]
    CheckpointNotFound(String),

    /// Version mismatch (checkpoint too old/new).
    #[error("Version mismatch: {0}")]
    VersionMismatch(String),

    /// State validation failed.
    #[error("State validation failed: {0}")]
    ValidationFailed(String),

    /// Missing required state.
    #[error("Missing required state: {0}")]
    MissingState(String),

    /// File integrity check failed.
    #[error("File integrity check failed for: {0}")]
    IntegrityCheckFailed(String),
}

/// Result type for recovery operations.
pub type RecoveryResult<T> = Result<T, RecoveryError>;

/// Recovery options.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryOptions {
    /// Whether to validate file hashes.
    pub validate_file_hashes: bool,

    /// Whether to allow partial recovery (with warnings).
    pub allow_partial: bool,

    /// Whether to restore file contents.
    pub restore_files: bool,

    /// Maximum allowed checkpoint version.
    pub max_checkpoint_version: Option<usize>,

    /// Minimum required checkpoint version.
    pub min_checkpoint_version: Option<usize>,
}

impl Default for RecoveryOptions {
    fn default() -> Self {
        Self {
            validate_file_hashes: true,
            allow_partial: true,
            restore_files: false,
            max_checkpoint_version: None,
            min_checkpoint_version: None,
        }
    }
}

/// Recovery status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryStatus {
    /// Recovery completed successfully.
    Success,

    /// Recovery completed with warnings.
    Partial,

    /// Recovery failed.
    Failed,
}

/// Recovery event tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryEvent {
    /// Event timestamp.
    pub timestamp: DateTime<Utc>,

    /// Event type.
    pub event_type: RecoveryEventType,

    /// Event message.
    pub message: String,

    /// Additional details.
    pub details: HashMap<String, String>,
}

/// Types of recovery events.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum RecoveryEventType {
    /// Recovery started.
    Started {
        checkpoint_id: String,
    },

    /// State validated.
    StateValidated,

    /// Files restored.
    FilesRestored {
        count: usize,
    },

    /// Memories restored.
    MemoriesRestored {
        count: usize,
    },

    /// Tasks restored.
    TasksRestored {
        count: usize,
    },

    /// Recovery completed.
    Completed {
        status: RecoveryStatus,
    },

    /// Recovery failed.
    Failed {
        reason: String,
    },
}

/// Information about a recovered loop.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveredLoop {
    /// The loop ID.
    pub loop_id: String,

    /// Iteration to resume from.
    pub iteration: u32,

    /// Status of the loop.
    pub status: String,

    /// Restored memories.
    pub memories: Vec<crate::Memory>,

    /// Restored tasks.
    pub tasks: Vec<crate::Task>,

    /// Current hat to activate.
    pub current_hat: Option<String>,

    /// Loop internal state.
    pub loop_state: SerializableLoopState,

    /// When the loop was started.
    pub started_at: DateTime<Utc>,

    /// Recovery warnings.
    pub warnings: Vec<String>,

    /// Recovery events.
    pub events: Vec<RecoveryEvent>,
}

/// Trait for managing recovery operations.
pub trait RecoveryManager: Send + Sync {
    /// Restores loop state from a checkpoint.
    ///
    /// # Arguments
    /// * `checkpoint` - The checkpoint to restore from
    /// * `options` - Recovery options
    fn restore(
        &self,
        checkpoint: LoopCheckpoint,
        options: RecoveryOptions,
    ) -> RecoveryResult<RecoveredLoop>;

    /// Validates a checkpoint before recovery.
    ///
    /// # Arguments
    /// * `checkpoint` - The checkpoint to validate
    /// * `options` - Validation options
    fn validate_checkpoint(
        &self,
        checkpoint: &LoopCheckpoint,
        _options: &RecoveryOptions,
    ) -> RecoveryResult<Vec<String>>;

    /// Gets the best checkpoint to restore from for a loop.
    ///
    /// # Arguments
    /// * `available_checkpoints` - List of available checkpoints
    /// * `loop_id` - The loop ID
    fn select_best_checkpoint<'a>(
        &self,
        available_checkpoints: &'a [LoopCheckpoint],
        loop_id: &str,
    ) -> Option<&'a LoopCheckpoint>;
}

/// Default implementation of recovery manager.
pub struct DefaultRecoveryManager {
    /// Workspace root path.
    workspace_root: std::path::PathBuf,
}

impl DefaultRecoveryManager {
    /// Creates a new recovery manager.
    ///
    /// # Arguments
    /// * `workspace_root` - Path to the workspace root
    pub fn new(workspace_root: &Path) -> Self {
        Self {
            workspace_root: workspace_root.to_path_buf(),
        }
    }

    /// Records a recovery event.
    fn record_event(&self, events: &mut Vec<RecoveryEvent>, event: RecoveryEvent) {
        events.push(event);
    }

    /// Validates file hashes from a checkpoint.
    fn validate_file_hashes(
        &self,
        file_hashes: &HashMap<String, String>,
    ) -> Vec<String> {
        let mut warnings = Vec::new();

        for (path, expected_hash) in file_hashes {
            let full_path = self.workspace_root.join(path);

            if !full_path.exists() {
                warnings.push(format!("File no longer exists: {}", path));
                continue;
            }

            match std::fs::read_to_string(&full_path) {
                Ok(content) => {
                    use sha2::{Digest, Sha256};
                    let mut hasher = Sha256::new();
                    hasher.update(content.as_bytes());
                    let actual_hash = format!("{:x}", hasher.finalize());

                    if &actual_hash != expected_hash {
                        warnings.push(format!(
                            "File hash mismatch: {} (expected: {}, got: {})",
                            path, expected_hash, actual_hash
                        ));
                    }
                }
                Err(e) => {
                    warnings.push(format!("Failed to read file {}: {}", path, e));
                }
            }
        }

        warnings
    }

    /// Validates loop state consistency.
    fn validate_loop_state(&self, checkpoint: &LoopCheckpoint) -> Vec<String> {
        let mut warnings = Vec::new();

        // Check iteration consistency
        if checkpoint.state.loop_state.iteration != checkpoint.iteration {
            warnings.push(format!(
                "Iteration mismatch: checkpoint says {}, state says {}",
                checkpoint.iteration, checkpoint.state.loop_state.iteration
            ));
        }

        // Check for abandoned tasks that are still open
        for abandoned in &checkpoint.state.loop_state.abandoned_tasks {
            if let Some(task) = checkpoint.state.tasks.iter().find(|t| t.id == *abandoned) {
                if task.status == crate::TaskStatus::Open || task.status == crate::TaskStatus::InProgress {
                    warnings.push(format!(
                        "Abandoned task {} is still marked as {:?}",
                        abandoned, task.status
                    ));
                }
            }
        }

        warnings
    }
}

impl RecoveryManager for DefaultRecoveryManager {
    fn restore(
        &self,
        checkpoint: LoopCheckpoint,
        options: RecoveryOptions,
    ) -> RecoveryResult<RecoveredLoop> {
        let mut events = Vec::new();
        let mut warnings = Vec::new();

        // Record start event
        self.record_event(
            &mut events,
            RecoveryEvent {
                timestamp: Utc::now(),
                event_type: RecoveryEventType::Started {
                    checkpoint_id: checkpoint.id.clone(),
                },
                message: format!("Starting recovery from checkpoint {}", checkpoint.id),
                details: HashMap::new(),
            },
        );

        // Validate checkpoint
        let validation_warnings = self.validate_checkpoint(&checkpoint, &options)?;
        warnings.extend(validation_warnings);

        self.record_event(
            &mut events,
            RecoveryEvent {
                timestamp: Utc::now(),
                event_type: RecoveryEventType::StateValidated,
                message: "State validation completed".to_string(),
                details: {
                    let mut d = HashMap::new();
                    d.insert("warnings_count".to_string(), warnings.len().to_string());
                    d
                },
            },
        );

        // Validate file hashes if enabled
        if options.validate_file_hashes {
            let file_warnings = self.validate_file_hashes(&checkpoint.state.file_hashes);
            if !file_warnings.is_empty() {
                warnings.extend(file_warnings);
            }
        }

        // Record memories restored
        self.record_event(
            &mut events,
            RecoveryEvent {
                timestamp: Utc::now(),
                event_type: RecoveryEventType::MemoriesRestored {
                    count: checkpoint.state.memories.len(),
                },
                message: format!("Restored {} memories", checkpoint.state.memories.len()),
                details: HashMap::new(),
            },
        );

        // Record tasks restored
        self.record_event(
            &mut events,
            RecoveryEvent {
                timestamp: Utc::now(),
                event_type: RecoveryEventType::TasksRestored {
                    count: checkpoint.state.tasks.len(),
                },
                message: format!("Restored {} tasks", checkpoint.state.tasks.len()),
                details: HashMap::new(),
            },
        );

        // Determine recovery status
        let status = if warnings.is_empty() {
            RecoveryStatus::Success
        } else if options.allow_partial {
            RecoveryStatus::Partial
        } else {
            return Err(RecoveryError::ValidationFailed(format!(
                "Recovery failed with {} warnings",
                warnings.len()
            )));
        };

        // Record completion
        self.record_event(
            &mut events,
            RecoveryEvent {
                timestamp: Utc::now(),
                event_type: RecoveryEventType::Completed { status },
                message: format!("Recovery completed with status: {:?}", status),
                details: HashMap::new(),
            },
        );

        Ok(RecoveredLoop {
            loop_id: checkpoint.loop_id.clone(),
            iteration: checkpoint.iteration,
            status: checkpoint.state.status.clone(),
            memories: checkpoint.state.memories.clone(),
            tasks: checkpoint.state.tasks.clone(),
            current_hat: checkpoint.state.current_hat.clone(),
            loop_state: checkpoint.state.loop_state.clone(),
            started_at: checkpoint.state.started_at,
            warnings,
            events,
        })
    }

    fn validate_checkpoint(
        &self,
        checkpoint: &LoopCheckpoint,
        _options: &RecoveryOptions,
    ) -> RecoveryResult<Vec<String>> {
        let mut warnings = Vec::new();

        // Validate loop state
        warnings.extend(self.validate_loop_state(checkpoint));

        // Check checkpoint age (in production, add age limits)
        let age = Utc::now().signed_duration_since(checkpoint.created_at);
        if age.num_days() > 30 {
            warnings.push(format!(
                "Checkpoint is {} days old, may be stale",
                age.num_days()
            ));
        }

        // Check for empty state
        if checkpoint.state.memories.is_empty() && checkpoint.state.tasks.is_empty() {
            warnings.push("Checkpoint has no memories or tasks".to_string());
        }

        Ok(warnings)
    }

    fn select_best_checkpoint<'a>(
        &self,
        available_checkpoints: &'a [LoopCheckpoint],
        loop_id: &str,
    ) -> Option<&'a LoopCheckpoint> {
        let loop_id = loop_id.to_string();
        available_checkpoints
            .iter()
            .filter(|cp| cp.loop_id == loop_id)
            .filter(|cp| cp.checkpoint_type == crate::checkpoint::CheckpointType::Interval)
            .max_by_key(|cp| cp.iteration)
    }
}

/// Creates a default recovery manager with the given workspace root.
pub fn create_recovery_manager(workspace_root: &Path) -> DefaultRecoveryManager {
    DefaultRecoveryManager::new(workspace_root)
}

/// Helper to convert a RestoreResult to a RecoveredLoop.
pub fn restore_result_to_recovered(
    result: RestoreResult,
    workspace_root: &Path,
) -> RecoveryResult<RecoveredLoop> {
    let manager = DefaultRecoveryManager::new(workspace_root);
    manager.restore(result.checkpoint, RecoveryOptions::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_default_options() {
        let options = RecoveryOptions::default();
        assert!(options.validate_file_hashes);
        assert!(options.allow_partial);
        assert!(!options.restore_files);
        assert!(options.max_checkpoint_version.is_none());
        assert!(options.min_checkpoint_version.is_none());
    }

    #[test]
    fn test_recovery_status_serde() {
        let status = RecoveryStatus::Partial;
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, "\"partial\"");

        let deserialized: RecoveryStatus = serde_json::from_str("\"success\"").unwrap();
        assert_eq!(deserialized, RecoveryStatus::Success);
    }

    #[test]
    fn test_select_best_checkpoint() {
        let temp_dir = TempDir::new().unwrap();
        let manager = DefaultRecoveryManager::new(temp_dir.path());

        let _now = Utc::now();
        let checkpoints = vec![
            create_test_checkpoint("loop-test", 1, crate::checkpoint::CheckpointType::Interval),
            create_test_checkpoint("loop-test", 3, crate::checkpoint::CheckpointType::Interval),
            create_test_checkpoint("loop-test", 2, crate::checkpoint::CheckpointType::Manual),
            create_test_checkpoint("other-loop", 1, crate::checkpoint::CheckpointType::Interval),
        ];

        let best = manager.select_best_checkpoint(&checkpoints, "loop-test");
        assert!(best.is_some());
        assert_eq!(best.unwrap().iteration, 3);
    }

    #[test]
    fn test_select_best_checkpoint_no_match() {
        let temp_dir = TempDir::new().unwrap();
        let manager = DefaultRecoveryManager::new(temp_dir.path());

        let checkpoints = vec![
            create_test_checkpoint("other-loop", 1, crate::checkpoint::CheckpointType::Interval),
        ];

        let best = manager.select_best_checkpoint(&checkpoints, "loop-test");
        assert!(best.is_none());
    }

    #[test]
    fn test_validate_checkpoint() {
        let temp_dir = TempDir::new().unwrap();
        let manager = DefaultRecoveryManager::new(temp_dir.path());

        let checkpoint = create_test_checkpoint("loop-test", 5, crate::checkpoint::CheckpointType::Interval);

        let warnings = manager
            .validate_checkpoint(&checkpoint, &RecoveryOptions::default())
            .unwrap();

        // Should have a warning about empty state
        assert!(!warnings.is_empty());
    }

    #[test]
    fn test_restore_simple() {
        let temp_dir = TempDir::new().unwrap();
        let manager = DefaultRecoveryManager::new(temp_dir.path());

        let checkpoint = create_test_checkpoint("loop-test", 5, crate::checkpoint::CheckpointType::Interval);

        let options = RecoveryOptions {
            allow_partial: true,
            ..Default::default()
        };

        let result = manager.restore(checkpoint, options);
        assert!(result.is_ok());

        let recovered = result.unwrap();
        assert_eq!(recovered.loop_id, "loop-test");
        assert_eq!(recovered.iteration, 5);
        assert!(!recovered.events.is_empty());
    }

    #[test]
    fn test_restore_without_partial_fails_on_warnings() {
        let temp_dir = TempDir::new().unwrap();
        let manager = DefaultRecoveryManager::new(temp_dir.path());

        let checkpoint = create_test_checkpoint("loop-test", 5, crate::checkpoint::CheckpointType::Interval);

        let options = RecoveryOptions {
            allow_partial: false,
            ..Default::default()
        };

        let result = manager.restore(checkpoint, options);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_file_hashes() {
        let temp_dir = TempDir::new().unwrap();
        let manager = DefaultRecoveryManager::new(temp_dir.path());

        // Create a test file
        let file_path = temp_dir.path().join("test.txt");
        std::fs::write(&file_path, "test content").unwrap();

        // Compute its hash
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(b"test content");
        let hash = format!("{:x}", hasher.finalize());

        let mut file_hashes = HashMap::new();
        file_hashes.insert("test.txt".to_string(), hash.clone());

        // Should validate successfully
        let warnings = manager.validate_file_hashes(&file_hashes);
        assert!(warnings.is_empty());

        // Modify the hash to trigger a warning
        file_hashes.insert("test.txt".to_string(), "wrong_hash".to_string());
        let warnings = manager.validate_file_hashes(&file_hashes);
        assert!(!warnings.is_empty());
    }

    fn create_test_checkpoint(
        loop_id: &str,
        iteration: u32,
        checkpoint_type: crate::checkpoint::CheckpointType,
    ) -> LoopCheckpoint {
        LoopCheckpoint {
            id: format!("cp-20260225-100000"),
            loop_id: loop_id.to_string(),
            created_at: Utc::now(),
            iteration,
            checkpoint_type,
            size: 0,
            checksum: String::new(),
            compressed: false,
            state: crate::checkpoint::CheckpointState {
                loop_id: loop_id.to_string(),
                iteration,
                current_hat: None,
                status: "running".to_string(),
                memories: Vec::new(),
                tasks: Vec::new(),
                current_task: None,
                pending_events: Vec::new(),
                last_prompt: None,
                loop_state: SerializableLoopState {
                    iteration,
                    ..Default::default()
                },
                started_at: Utc::now(),
                last_checkpoint_at: None,
                file_hashes: HashMap::new(),
            },
        }
    }
}