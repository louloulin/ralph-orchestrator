//! Checkpoint manager for creating, storing, and restoring checkpoints.
//!
//! This module provides the `CheckpointManager` which handles:
//! - Creating checkpoints at intervals
//! - Storing checkpoints to disk (with optional compression)
//! - Loading and restoring checkpoints
//! - Pruning old checkpoints

use crate::checkpoint::{
    CheckpointConfig, CheckpointIndex, CheckpointMeta, CheckpointState, CheckpointType,
    LoopCheckpoint, RestoreResult, SerializableLoopState,
};
use crate::file_lock::FileLock;
use crate::{Memory, Task};
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use thiserror::Error;

/// Errors that can occur during checkpoint operations.
#[derive(Debug, Error)]
pub enum CheckpointError {
    /// I/O error during checkpoint operation.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization error.
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// Checksum mismatch during restore.
    #[error("Checksum mismatch: expected {expected}, got {actual}")]
    ChecksumMismatch { expected: String, actual: String },

    /// Checkpoint not found.
    #[error("Checkpoint not found: {0}")]
    NotFound(String),

    /// Compression error.
    #[error("Compression error: {0}")]
    Compression(String),

    /// Decompression error.
    #[error("Decompression error: {0}")]
    Decompression(String),

    /// File lock error.
    #[error("File lock error: {0}")]
    Lock(String),

    /// Invalid checkpoint path.
    #[error("Invalid checkpoint path: {0}")]
    InvalidPath(String),
}

/// Result type for checkpoint operations.
pub type CheckpointResult<T> = Result<T, CheckpointError>;

/// Manages checkpoint lifecycle for Ralph loops.
#[allow(dead_code)]
pub struct CheckpointManager {
    /// Root directory for checkpoints (e.g., `.ralph/checkpoints`).
    checkpoints_dir: PathBuf,

    /// Configuration for checkpoint behavior.
    config: CheckpointConfig,

    /// File lock for the checkpoint index.
    index_lock: FileLock,
}

impl CheckpointManager {
    /// Creates a new checkpoint manager.
    ///
    /// # Arguments
    /// * `ralph_dir` - Path to the `.ralph` directory
    /// * `config` - Checkpoint configuration
    pub fn new(ralph_dir: &Path, config: CheckpointConfig) -> CheckpointResult<Self> {
        let checkpoints_dir = ralph_dir.join("checkpoints");

        // Ensure checkpoints directory exists
        fs::create_dir_all(&checkpoints_dir)?;

        let index_lock = FileLock::new(checkpoints_dir.join("index.lock"))
            .map_err(|e| CheckpointError::Lock(e.to_string()))?;

        Ok(Self {
            checkpoints_dir,
            config,
            index_lock,
        })
    }

    /// Creates a checkpoint for the given loop.
    ///
    /// # Arguments
    /// * `loop_id` - The loop identifier
    /// * `iteration` - Current iteration number
    /// * `checkpoint_type` - Why this checkpoint is being created
    /// * `memories` - Current memories
    /// * `tasks` - Current tasks
    /// * `loop_state` - Current loop state
    /// * `last_prompt` - The last prompt sent to the agent
    pub fn create_checkpoint(
        &self,
        loop_id: &str,
        iteration: u32,
        checkpoint_type: CheckpointType,
        memories: Vec<Memory>,
        tasks: Vec<Task>,
        loop_state: SerializableLoopState,
        last_prompt: Option<String>,
    ) -> CheckpointResult<LoopCheckpoint> {
        if !self.config.enabled {
            return Err(CheckpointError::NotFound(
                "Checkpointing is disabled".to_string(),
            ));
        }

        // Build checkpoint state
        let state = CheckpointState {
            loop_id: loop_id.to_string(),
            iteration,
            current_hat: loop_state.last_hat.clone(),
            status: "running".to_string(),
            memories,
            tasks,
            current_task: None, // Will be filled from tasks if any in progress
            pending_events: Vec::new(),
            last_prompt,
            loop_state,
            started_at: Utc::now() - chrono::Duration::seconds(0), // Will be overwritten
            last_checkpoint_at: None,
            file_hashes: HashMap::new(),
        };

        let mut checkpoint =
            LoopCheckpoint::new(loop_id.to_string(), iteration, checkpoint_type, state);

        // Serialize to JSON
        let json = serde_json::to_vec_pretty(&checkpoint)?;
        checkpoint.size = json.len();

        // Calculate checksum
        let mut hasher = Sha256::new();
        hasher.update(&json);
        checkpoint.checksum = format!("{:x}", hasher.finalize());

        // Determine if compression is needed
        checkpoint.compressed = checkpoint.size > self.config.compress_threshold;

        // Save to disk
        self.save_checkpoint(&checkpoint, &json)?;

        // Update index
        self.update_index(&checkpoint)?;

        // Prune old checkpoints if needed
        self.prune_checkpoints(loop_id)?;

        Ok(checkpoint)
    }

    /// Saves a checkpoint to disk.
    fn save_checkpoint(&self, checkpoint: &LoopCheckpoint, json: &[u8]) -> CheckpointResult<()> {
        let loop_dir = self.checkpoints_dir.join(&checkpoint.loop_id);
        fs::create_dir_all(&loop_dir)?;

        let filename = if checkpoint.compressed {
            format!("{}.gz", checkpoint.id)
        } else {
            format!("{}.json", checkpoint.id)
        };
        let path = loop_dir.join(&filename);

        let file = File::create(&path)?;
        let mut writer = BufWriter::new(file);

        if checkpoint.compressed {
            #[cfg(feature = "checkpoint-compression")]
            {
                use flate2::Compression;
                use flate2::write::GzEncoder;
                let mut encoder = GzEncoder::new(writer, Compression::default());
                encoder.write_all(json)?;
                encoder.finish()?;
            }
            #[cfg(not(feature = "checkpoint-compression"))]
            {
                // Fall back to uncompressed if feature not enabled
                writer.write_all(json)?;
            }
        } else {
            writer.write_all(json)?;
        }

        Ok(())
    }

    /// Lists all checkpoints for a loop.
    ///
    /// Returns checkpoints sorted by creation time (newest first).
    pub fn list_checkpoints(&self, loop_id: &str) -> CheckpointResult<Vec<CheckpointMeta>> {
        let index = self.read_index()?;

        let mut checkpoints: Vec<_> = index
            .checkpoints
            .into_iter()
            .filter(|m| m.loop_id == loop_id)
            .collect();

        checkpoints.sort_by_key(|b| std::cmp::Reverse(b.created_at));
        Ok(checkpoints)
    }

    /// Gets the latest checkpoint for a loop.
    pub fn get_latest(&self, loop_id: &str) -> CheckpointResult<Option<CheckpointMeta>> {
        let checkpoints = self.list_checkpoints(loop_id)?;
        Ok(checkpoints.into_iter().next())
    }

    /// Loads a checkpoint by ID.
    pub fn load_checkpoint(&self, checkpoint_id: &str) -> CheckpointResult<LoopCheckpoint> {
        let index = self.read_index()?;

        let meta = index
            .checkpoints
            .iter()
            .find(|m| m.id == checkpoint_id)
            .ok_or_else(|| CheckpointError::NotFound(checkpoint_id.to_string()))?;

        self.load_checkpoint_from_meta(meta)
    }

    /// Loads a checkpoint from its metadata.
    fn load_checkpoint_from_meta(&self, meta: &CheckpointMeta) -> CheckpointResult<LoopCheckpoint> {
        let path = self.checkpoints_dir.join(&meta.path);

        if meta.compressed {
            self.load_compressed(&path, &meta.checksum)
        } else {
            self.load_uncompressed(&path, &meta.checksum)
        }
    }

    /// Loads an uncompressed checkpoint.
    fn load_uncompressed(
        &self,
        path: &Path,
        expected_checksum: &str,
    ) -> CheckpointResult<LoopCheckpoint> {
        let file = File::open(path)?;
        let mut reader = BufReader::new(file);
        let mut json = Vec::new();
        reader.read_to_end(&mut json)?;

        // Verify checksum
        let mut hasher = Sha256::new();
        hasher.update(&json);
        let actual_checksum = format!("{:x}", hasher.finalize());

        if actual_checksum != expected_checksum {
            return Err(CheckpointError::ChecksumMismatch {
                expected: expected_checksum.to_string(),
                actual: actual_checksum,
            });
        }

        let checkpoint: LoopCheckpoint = serde_json::from_slice(&json)?;
        Ok(checkpoint)
    }

    /// Loads a compressed checkpoint.
    fn load_compressed(
        &self,
        path: &Path,
        expected_checksum: &str,
    ) -> CheckpointResult<LoopCheckpoint> {
        #[cfg(feature = "checkpoint-compression")]
        {
            use flate2::read::GzDecoder;

            let file = File::open(path)?;
            let decoder = GzDecoder::new(file);
            let mut reader = BufReader::new(decoder);
            let mut json = Vec::new();
            reader.read_to_end(&mut json)?;

            // Verify checksum
            let mut hasher = Sha256::new();
            hasher.update(&json);
            let actual_checksum = format!("{:x}", hasher.finalize());

            if actual_checksum != expected_checksum {
                return Err(CheckpointError::ChecksumMismatch {
                    expected: expected_checksum.to_string(),
                    actual: actual_checksum,
                });
            }

            let checkpoint: LoopCheckpoint = serde_json::from_slice(&json)?;
            Ok(checkpoint)
        }

        #[cfg(not(feature = "checkpoint-compression"))]
        {
            // Try loading as uncompressed instead
            let uncompressed_path = path.with_extension("");
            self.load_uncompressed(&uncompressed_path, expected_checksum)
        }
    }

    /// Restores loop state from a checkpoint.
    ///
    /// Returns the checkpoint and any warnings encountered.
    pub fn restore(&self, checkpoint_id: &str) -> CheckpointResult<RestoreResult> {
        let checkpoint = self.load_checkpoint(checkpoint_id)?;

        // Validate state consistency
        let mut warnings = Vec::new();

        // Check for missing files referenced in file_hashes
        for file_path in checkpoint.state.file_hashes.keys() {
            if !Path::new(file_path).exists() {
                warnings.push(format!("Referenced file no longer exists: {}", file_path));
            }
        }

        // Check loop state consistency
        if checkpoint.state.loop_state.iteration != checkpoint.iteration {
            warnings.push(format!(
                "Iteration mismatch: checkpoint says {}, state says {}",
                checkpoint.iteration, checkpoint.state.loop_state.iteration
            ));
        }

        Ok(RestoreResult {
            checkpoint,
            success: true,
            warnings,
            restored_at: Utc::now(),
        })
    }

    /// Deletes a checkpoint.
    pub fn delete_checkpoint(&self, checkpoint_id: &str) -> CheckpointResult<()> {
        let index = self.read_index()?;

        let meta = index
            .checkpoints
            .iter()
            .find(|m| m.id == checkpoint_id)
            .ok_or_else(|| CheckpointError::NotFound(checkpoint_id.to_string()))?;

        let path = self.checkpoints_dir.join(&meta.path);

        // Delete the file
        if path.exists() {
            fs::remove_file(&path)?;
        }

        // Update index
        let mut index = index;
        index.remove(checkpoint_id);
        self.write_index(&index)?;

        Ok(())
    }

    /// Prunes old checkpoints for a loop based on config.
    fn prune_checkpoints(&self, loop_id: &str) -> CheckpointResult<()> {
        let mut checkpoints = self.list_checkpoints(loop_id)?;

        // Remove checkpoints beyond max_checkpoints
        if checkpoints.len() > self.config.max_checkpoints {
            let to_remove: Vec<_> = checkpoints.drain(self.config.max_checkpoints..).collect();

            let mut index = self.read_index()?;

            for meta in to_remove {
                let path = self.checkpoints_dir.join(&meta.path);
                if path.exists() {
                    let _ = fs::remove_file(&path);
                }
                index.remove(&meta.id);
            }

            self.write_index(&index)?;
        }

        // Remove checkpoints older than max_age_seconds
        let now = Utc::now();
        let max_age = chrono::Duration::seconds(self.config.max_age_seconds as i64);

        let index = self.read_index()?;
        let to_remove: Vec<_> = index
            .checkpoints
            .iter()
            .filter(|m| m.loop_id == loop_id && now.signed_duration_since(m.created_at) > max_age)
            .map(|m| m.id.clone())
            .collect();

        for id in to_remove {
            self.delete_checkpoint(&id)?;
        }

        Ok(())
    }

    /// Updates the checkpoint index with a new checkpoint.
    fn update_index(&self, checkpoint: &LoopCheckpoint) -> CheckpointResult<()> {
        let mut index = self.read_index()?;

        let filename = if checkpoint.compressed {
            format!("{}/{}.gz", checkpoint.loop_id, checkpoint.id)
        } else {
            format!("{}/{}.json", checkpoint.loop_id, checkpoint.id)
        };

        let meta = CheckpointMeta {
            id: checkpoint.id.clone(),
            loop_id: checkpoint.loop_id.clone(),
            created_at: checkpoint.created_at,
            checkpoint_type: checkpoint.checkpoint_type,
            path: filename,
            size: checkpoint.size,
            compressed: checkpoint.compressed,
            checksum: checkpoint.checksum.clone(),
        };

        index.add(meta);
        self.write_index(&index)?;

        Ok(())
    }

    /// Reads the checkpoint index.
    fn read_index(&self) -> CheckpointResult<CheckpointIndex> {
        let index_path = self.checkpoints_dir.join("checkpoint-meta.json");

        if !index_path.exists() {
            return Ok(CheckpointIndex::new());
        }

        let file = File::open(&index_path)?;
        let reader = BufReader::new(file);

        let index: CheckpointIndex = serde_json::from_reader(reader)?;
        Ok(index)
    }

    /// Writes the checkpoint index.
    fn write_index(&self, index: &CheckpointIndex) -> CheckpointResult<()> {
        let index_path = self.checkpoints_dir.join("checkpoint-meta.json");

        let file = File::create(&index_path)?;
        let writer = BufWriter::new(file);

        serde_json::to_writer_pretty(writer, index)?;
        Ok(())
    }

    /// Returns the path to the checkpoints directory.
    pub fn checkpoints_dir(&self) -> &Path {
        &self.checkpoints_dir
    }

    /// Returns the checkpoint configuration.
    pub fn config(&self) -> &CheckpointConfig {
        &self.config
    }

    /// Checks if a checkpoint should be created based on timing.
    ///
    /// Returns true if the last checkpoint was created more than
    /// `interval_seconds` ago.
    pub fn should_checkpoint(
        &self,
        _loop_id: &str,
        last_checkpoint_at: Option<DateTime<Utc>>,
    ) -> bool {
        if !self.config.enabled {
            return false;
        }

        match last_checkpoint_at {
            None => true,
            Some(last) => {
                let elapsed = Utc::now().signed_duration_since(last);
                elapsed.num_seconds() >= self.config.interval_seconds as i64
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_manager() -> (TempDir, CheckpointManager) {
        let temp_dir = TempDir::new().unwrap();
        let ralph_dir = temp_dir.path().join(".ralph");
        fs::create_dir_all(&ralph_dir).unwrap();

        let manager = CheckpointManager::new(&ralph_dir, CheckpointConfig::default()).unwrap();
        (temp_dir, manager)
    }

    #[test]
    fn test_create_checkpoint() {
        let (_temp, manager) = create_test_manager();

        let loop_state = SerializableLoopState::default();
        let checkpoint = manager
            .create_checkpoint(
                "loop-test",
                1,
                CheckpointType::Interval,
                vec![],
                vec![],
                loop_state,
                Some("Test prompt".to_string()),
            )
            .unwrap();

        assert!(checkpoint.id.starts_with("cp-"));
        assert_eq!(checkpoint.loop_id, "loop-test");
        assert_eq!(checkpoint.iteration, 1);
        assert!(!checkpoint.checksum.is_empty());
    }

    #[test]
    fn test_list_checkpoints() {
        let (_temp, manager) = create_test_manager();

        // Create multiple checkpoints
        for i in 1..=3 {
            let loop_state = SerializableLoopState {
                iteration: i,
                ..Default::default()
            };
            manager
                .create_checkpoint(
                    "loop-test",
                    i,
                    CheckpointType::Interval,
                    vec![],
                    vec![],
                    loop_state,
                    None,
                )
                .unwrap();

            // Small delay to ensure different timestamps
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        let checkpoints = manager.list_checkpoints("loop-test").unwrap();
        assert_eq!(checkpoints.len(), 3);

        // Should be sorted newest first
        assert!(checkpoints[0].created_at >= checkpoints[1].created_at);
    }

    #[test]
    fn test_get_latest() {
        let (_temp, manager) = create_test_manager();

        // Create two checkpoints
        let loop_state = SerializableLoopState::default();
        manager
            .create_checkpoint(
                "loop-test",
                1,
                CheckpointType::Interval,
                vec![],
                vec![],
                loop_state.clone(),
                None,
            )
            .unwrap();

        std::thread::sleep(std::time::Duration::from_millis(10));

        manager
            .create_checkpoint(
                "loop-test",
                2,
                CheckpointType::Interval,
                vec![],
                vec![],
                loop_state,
                None,
            )
            .unwrap();

        let latest = manager.get_latest("loop-test").unwrap();
        assert!(latest.is_some());
        assert!(latest.unwrap().id.starts_with("cp-"));
    }

    #[test]
    fn test_load_checkpoint() {
        let (_temp, manager) = create_test_manager();

        let memory = Memory::new(
            crate::MemoryType::Pattern,
            "Test pattern".to_string(),
            vec!["test".to_string()],
        );

        let loop_state = SerializableLoopState {
            iteration: 5,
            ..Default::default()
        };

        let checkpoint = manager
            .create_checkpoint(
                "loop-test",
                5,
                CheckpointType::Manual,
                vec![memory],
                vec![],
                loop_state,
                Some("Test prompt".to_string()),
            )
            .unwrap();

        // Load it back
        let loaded = manager.load_checkpoint(&checkpoint.id).unwrap();

        assert_eq!(loaded.id, checkpoint.id);
        assert_eq!(loaded.state.iteration, 5);
        assert_eq!(loaded.state.memories.len(), 1);
        assert_eq!(loaded.state.last_prompt, Some("Test prompt".to_string()));
    }

    #[test]
    fn test_restore() {
        let (_temp, manager) = create_test_manager();

        let loop_state = SerializableLoopState {
            iteration: 1, // Match the checkpoint iteration
            ..Default::default()
        };
        let checkpoint = manager
            .create_checkpoint(
                "loop-test",
                1,
                CheckpointType::Interval,
                vec![],
                vec![],
                loop_state,
                None,
            )
            .unwrap();

        let result = manager.restore(&checkpoint.id).unwrap();

        assert!(result.success);
        assert_eq!(result.checkpoint.id, checkpoint.id);
        assert!(
            result.warnings.is_empty(),
            "Warnings: {:?}",
            result.warnings
        );
    }

    #[test]
    fn test_delete_checkpoint() {
        let (_temp, manager) = create_test_manager();

        let loop_state = SerializableLoopState::default();
        let checkpoint = manager
            .create_checkpoint(
                "loop-test",
                1,
                CheckpointType::Interval,
                vec![],
                vec![],
                loop_state,
                None,
            )
            .unwrap();

        // Delete it
        manager.delete_checkpoint(&checkpoint.id).unwrap();

        // Should no longer be found
        let result = manager.load_checkpoint(&checkpoint.id);
        assert!(result.is_err());
    }

    #[test]
    fn test_prune_checkpoints() {
        let config = CheckpointConfig {
            max_checkpoints: 2,
            ..Default::default()
        };

        let temp_dir = TempDir::new().unwrap();
        let ralph_dir = temp_dir.path().join(".ralph");
        fs::create_dir_all(&ralph_dir).unwrap();

        let manager = CheckpointManager::new(&ralph_dir, config).unwrap();

        // Create 4 checkpoints
        for i in 1..=4 {
            let loop_state = SerializableLoopState {
                iteration: i,
                ..Default::default()
            };
            manager
                .create_checkpoint(
                    "loop-test",
                    i,
                    CheckpointType::Interval,
                    vec![],
                    vec![],
                    loop_state,
                    None,
                )
                .unwrap();

            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        // Should only have 2 (the newest ones)
        let checkpoints = manager.list_checkpoints("loop-test").unwrap();
        assert_eq!(checkpoints.len(), 2);

        // The remaining ones should be the newest
        assert_eq!(checkpoints[0].checkpoint_type, CheckpointType::Interval);
    }

    #[test]
    fn test_should_checkpoint() {
        let (_temp, manager) = create_test_manager();

        // No previous checkpoint
        assert!(manager.should_checkpoint("loop-test", None));

        // Recent checkpoint (just now)
        let now = Utc::now();
        assert!(!manager.should_checkpoint("loop-test", Some(now)));

        // Old checkpoint (10 minutes ago)
        let old = now - chrono::Duration::seconds(600);
        assert!(manager.should_checkpoint("loop-test", Some(old)));
    }

    #[test]
    fn test_disabled_checkpoint() {
        let config = CheckpointConfig {
            enabled: false,
            ..Default::default()
        };

        let temp_dir = TempDir::new().unwrap();
        let ralph_dir = temp_dir.path().join(".ralph");
        fs::create_dir_all(&ralph_dir).unwrap();

        let manager = CheckpointManager::new(&ralph_dir, config).unwrap();

        let loop_state = SerializableLoopState::default();
        let result = manager.create_checkpoint(
            "loop-test",
            1,
            CheckpointType::Interval,
            vec![],
            vec![],
            loop_state,
            None,
        );

        assert!(result.is_err());
        assert!(!manager.should_checkpoint("loop-test", None));
    }
}
