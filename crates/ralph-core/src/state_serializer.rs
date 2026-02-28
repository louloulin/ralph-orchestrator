//! State serialization for checkpoints.
//!
//! This module provides the `StateSerializer` trait and implementation
//! for converting loop state to/from checkpoint-serializable format.

use crate::checkpoint::{CheckpointState, SerializableLoopState};
use crate::{Memory, Task};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use thiserror::Error;

/// Errors that can occur during state serialization.
#[derive(Debug, Error)]
pub enum SerializationError {
    /// I/O error during serialization.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// Serialization error.
    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    /// File not found for hashing.
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Invalid loop state.
    #[error("Invalid loop state: {0}")]
    InvalidState(String),
}

/// Result type for serialization operations.
pub type SerializationResult<T> = Result<T, SerializationError>;

/// Serialization options.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializationOptions {
    /// Whether to include file hashes.
    pub include_file_hashes: bool,

    /// Whether to truncate large prompts.
    pub truncate_prompts: bool,

    /// Maximum prompt size in characters.
    pub max_prompt_size: usize,

    /// Whether to include empty memories/tasks.
    pub include_empty_entries: bool,
}

impl Default for SerializationOptions {
    fn default() -> Self {
        Self {
            include_file_hashes: true,
            truncate_prompts: true,
            max_prompt_size: 10000,
            include_empty_entries: true,
        }
    }
}

/// Trait for serializing loop state to checkpoint format.
pub trait StateSerializer: Send + Sync {
    /// Serializes the current loop state to a checkpoint state.
    ///
    /// # Arguments
    /// * `loop_id` - The loop identifier
    /// * `iteration` - Current iteration number
    /// * `current_hat` - Currently active hat (if any)
    /// * `status` - Loop status string
    /// * `memories` - Current memories
    /// * `tasks` - Current tasks
    /// * `current_task` - Currently active task ID (if any)
    /// * `last_prompt` - The last prompt sent to the agent
    /// * `loop_state` - Loop internal state
    /// * `started_at` - When the loop started
    /// * `last_checkpoint_at` - When the last checkpoint was created
    /// * `options` - Serialization options
    fn serialize_to_checkpoint(
        &self,
        loop_id: String,
        iteration: u32,
        current_hat: Option<String>,
        status: String,
        memories: Vec<Memory>,
        tasks: Vec<Task>,
        current_task: Option<String>,
        last_prompt: Option<String>,
        loop_state: SerializableLoopState,
        started_at: DateTime<Utc>,
        last_checkpoint_at: Option<DateTime<Utc>>,
        options: SerializationOptions,
    ) -> SerializationResult<CheckpointState>;

    /// Computes file hashes for integrity checking.
    ///
    /// # Arguments
    /// * `paths` - File paths to hash (relative to workspace root)
    fn compute_file_hashes(&self, paths: &[String])
    -> SerializationResult<HashMap<String, String>>;
}

/// Default implementation of state serializer.
pub struct DefaultStateSerializer {
    /// Workspace root path.
    workspace_root: std::path::PathBuf,
}

impl DefaultStateSerializer {
    /// Creates a new state serializer.
    ///
    /// # Arguments
    /// * `workspace_root` - Path to the workspace root
    pub fn new(workspace_root: &Path) -> Self {
        Self {
            workspace_root: workspace_root.to_path_buf(),
        }
    }

    /// Truncates a prompt if it exceeds the maximum size.
    fn maybe_truncate_prompt(
        &self,
        prompt: Option<String>,
        options: &SerializationOptions,
    ) -> Option<String> {
        let prompt = prompt?;
        if !options.truncate_prompts || prompt.len() <= options.max_prompt_size {
            return Some(prompt);
        }
        let truncated = format!(
            "{}... [truncated {} characters]",
            &prompt[..prompt.len().min(options.max_prompt_size)],
            prompt.len() - options.max_prompt_size
        );
        Some(truncated)
    }

    /// Filters out empty memories if configured.
    fn filter_memories(
        &self,
        memories: Vec<Memory>,
        options: &SerializationOptions,
    ) -> Vec<Memory> {
        if options.include_empty_entries {
            return memories;
        }
        memories
            .into_iter()
            .filter(|m| !m.content.is_empty() || !m.tags.is_empty())
            .collect()
    }

    /// Filters out empty tasks if configured.
    fn filter_tasks(&self, tasks: Vec<Task>, options: &SerializationOptions) -> Vec<Task> {
        if options.include_empty_entries {
            return tasks;
        }
        tasks.into_iter().filter(|t| !t.title.is_empty()).collect()
    }

    /// Computes the SHA-256 hash of a file.
    fn hash_file(&self, path: &Path) -> SerializationResult<String> {
        let full_path = self.workspace_root.join(path);

        if !full_path.exists() {
            return Err(SerializationError::FileNotFound(path.display().to_string()));
        }

        let content = std::fs::read_to_string(&full_path)?;
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        Ok(format!("{:x}", hasher.finalize()))
    }
}

impl StateSerializer for DefaultStateSerializer {
    fn serialize_to_checkpoint(
        &self,
        loop_id: String,
        iteration: u32,
        current_hat: Option<String>,
        status: String,
        memories: Vec<Memory>,
        tasks: Vec<Task>,
        current_task: Option<String>,
        last_prompt: Option<String>,
        loop_state: SerializableLoopState,
        started_at: DateTime<Utc>,
        last_checkpoint_at: Option<DateTime<Utc>>,
        options: SerializationOptions,
    ) -> SerializationResult<CheckpointState> {
        // Compute file hashes if enabled
        let file_hashes = if options.include_file_hashes {
            // Get tracked files from git (simplified - in production would use git_ops)
            let tracked_files = Vec::<String>::new();
            self.compute_file_hashes(&tracked_files)?
        } else {
            HashMap::new()
        };

        // Filter and process memories/tasks
        let memories = self.filter_memories(memories, &options);
        let tasks = self.filter_tasks(tasks, &options);

        // Truncate prompt if needed
        let last_prompt = self.maybe_truncate_prompt(last_prompt, &options);

        Ok(CheckpointState {
            loop_id,
            iteration,
            current_hat,
            status,
            memories,
            tasks,
            current_task,
            pending_events: Vec::new(), // Pending events would need event loop integration
            last_prompt,
            loop_state,
            started_at,
            last_checkpoint_at,
            file_hashes,
        })
    }

    fn compute_file_hashes(
        &self,
        paths: &[String],
    ) -> SerializationResult<HashMap<String, String>> {
        let mut hashes = HashMap::new();

        for path_str in paths {
            let path = Path::new(path_str);
            match self.hash_file(path) {
                Ok(hash) => {
                    hashes.insert(path_str.clone(), hash);
                }
                Err(e) => {
                    // Log warning but continue
                    tracing::warn!("Failed to hash file {}: {}", path_str, e);
                }
            }
        }

        Ok(hashes)
    }
}

/// Creates a default state serializer with the given workspace root.
pub fn create_serializer(workspace_root: &Path) -> DefaultStateSerializer {
    DefaultStateSerializer::new(workspace_root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::MemoryType;
    use tempfile::TempDir;

    #[test]
    fn test_default_options() {
        let options = SerializationOptions::default();
        assert!(options.include_file_hashes);
        assert!(options.truncate_prompts);
        assert!(options.include_empty_entries);
        assert_eq!(options.max_prompt_size, 10000);
    }

    #[test]
    fn test_maybe_truncate_prompt() {
        let temp_dir = TempDir::new().unwrap();
        let serializer = DefaultStateSerializer::new(temp_dir.path());

        let options = SerializationOptions {
            truncate_prompts: true,
            max_prompt_size: 100,
            ..Default::default()
        };

        // Small prompt - not truncated
        let small = "Hello world".to_string();
        let result = serializer.maybe_truncate_prompt(Some(small.clone()), &options);
        assert_eq!(result, Some(small));

        // Large prompt - truncated
        let large = "a".repeat(200);
        let result = serializer.maybe_truncate_prompt(Some(large), &options);
        assert!(result.is_some());
        let truncated = result.unwrap();
        assert!(truncated.contains("... [truncated"));
        assert!(truncated.len() < 200);
    }

    #[test]
    fn test_filter_memories() {
        let temp_dir = TempDir::new().unwrap();
        let serializer = DefaultStateSerializer::new(temp_dir.path());

        let options = SerializationOptions {
            include_empty_entries: false,
            ..Default::default()
        };

        let memories = vec![
            Memory::new(MemoryType::Pattern, "Has content".to_string(), vec![]),
            Memory::new(MemoryType::Pattern, String::new(), vec![]),
            Memory::new(MemoryType::Pattern, "Also has content".to_string(), vec![]),
        ];

        let filtered = serializer.filter_memories(memories, &options);
        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_filter_tasks() {
        let temp_dir = TempDir::new().unwrap();
        let serializer = DefaultStateSerializer::new(temp_dir.path());

        let options = SerializationOptions {
            include_empty_entries: false,
            ..Default::default()
        };

        let tasks = vec![
            Task::new("Valid task".to_string(), 1),
            Task::new(String::new(), 2),
            Task::new("Another valid".to_string(), 3),
        ];

        let filtered = serializer.filter_tasks(tasks, &options);
        assert_eq!(filtered.len(), 2);
    }

    #[test]
    fn test_serialize_to_checkpoint() {
        let temp_dir = TempDir::new().unwrap();
        let serializer = DefaultStateSerializer::new(temp_dir.path());

        let result = serializer.serialize_to_checkpoint(
            "loop-test".to_string(),
            5,
            Some("coder".to_string()),
            "running".to_string(),
            vec![],
            vec![],
            None,
            None,
            SerializableLoopState::default(),
            Utc::now(),
            None,
            SerializationOptions::default(),
        );

        assert!(result.is_ok());
        let state = result.unwrap();
        assert_eq!(state.loop_id, "loop-test");
        assert_eq!(state.iteration, 5);
        assert_eq!(state.current_hat, Some("coder".to_string()));
        assert_eq!(state.status, "running");
    }

    #[test]
    fn test_compute_file_hashes() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        std::fs::write(&file_path, "test content").unwrap();

        let serializer = DefaultStateSerializer::new(temp_dir.path());

        let relative_path = "test.txt".to_string();
        let result = serializer.compute_file_hashes(&[relative_path]);

        assert!(result.is_ok());
        let hashes = result.unwrap();
        assert!(hashes.contains_key("test.txt"));
        assert!(!hashes["test.txt"].is_empty());
    }

    #[test]
    fn test_hash_file_not_found() {
        let temp_dir = TempDir::new().unwrap();
        let serializer = DefaultStateSerializer::new(temp_dir.path());

        let result = serializer.hash_file(Path::new("nonexistent.txt"));
        assert!(result.is_err());
    }
}
