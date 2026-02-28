//! Team store for multi-agent collaboration.
//!
//! TeamStore provides team and task management for Claude Code Agent Teams
//! integration. It supports:
//! - Team CRUD operations
//! - Task assignment and self-assignment (teammate claims tasks)
//! - Task queues per team (todo, in_progress, review, done)
//! - Persistent storage with JSONL format
//! - File locking for concurrent access across multiple loops
//!
//! # Architecture
//!
//! - **Team Lead**: Ralph Orchestrator (primary loop) manages teams
//! - **Teammates**: Worktree loops claim and execute tasks
//! - **Shared State**: TeamStore is single source of truth persisted to disk
//! - **Self-Assignment**: Teammates independently claim tasks from the todo queue
//!
//! # Multi-Loop Safety
//!
//! When multiple Ralph loops run concurrently (in worktrees), this store uses
//! file locking to ensure safe concurrent access:
//!
//! - **Shared locks** for reading: Multiple loops can read simultaneously
//! - **Exclusive locks** for writing: Only one loop can write at a time

use crate::file_lock::FileLock;
use crate::task::TaskStatus;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io;
use std::path::Path;
use tracing::warn;

/// Unique identifier for a Ralph loop (primary or worktree).
pub type LoopId = String;

/// Status of a team task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamTaskStatus {
    /// Available for self-assignment
    Todo,
    /// Assigned to a specific teammate
    InProgress,
    /// Awaiting team lead review
    Review,
    /// Completed
    Done,
}

impl From<TaskStatus> for TeamTaskStatus {
    fn from(status: TaskStatus) -> Self {
        match status {
            TaskStatus::Open => TeamTaskStatus::Todo,
            TaskStatus::InProgress => TeamTaskStatus::InProgress,
            TaskStatus::Closed => TeamTaskStatus::Done,
            TaskStatus::Failed => TeamTaskStatus::Todo, // Failed tasks return to todo
        }
    }
}

/// A team of agents working on shared tasks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    /// Unique team ID: team-{unix_timestamp}-{4_hex_chars}
    pub id: String,

    /// Human-readable team name
    pub name: String,

    /// Teammate loop IDs (worktrees working on this team)
    pub teammates: Vec<LoopId>,

    /// Creation timestamp (ISO 8601)
    pub created_at: String,
}

impl Team {
    /// Creates a new team with a unique ID.
    pub fn new(name: String) -> Self {
        Self {
            id: Self::generate_id(),
            name,
            teammates: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Generates a unique team ID: team-{timestamp}-{hex_suffix}
    fn generate_id() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");
        let timestamp = duration.as_secs();
        let hex_suffix = format!("{:04x}", duration.subsec_micros() % 0x10000);
        format!("team-{}-{}", timestamp, hex_suffix)
    }

    /// Adds a teammate to the team.
    pub fn add_teammate(&mut self, loop_id: LoopId) {
        if !self.teammates.contains(&loop_id) {
            self.teammates.push(loop_id);
        }
    }

    /// Removes a teammate from the team.
    pub fn remove_teammate(&mut self, loop_id: &LoopId) {
        self.teammates.retain(|id| id != loop_id);
    }
}

/// A task within a team context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamTask {
    /// Unique task ID
    pub id: String,

    /// Short description
    pub title: String,

    /// Optional detailed description
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Team this task belongs to
    pub team_id: String,

    /// Which teammate is assigned (None = unassigned/todo)
    pub assigned_to: Option<LoopId>,

    /// Current status
    pub status: TeamTaskStatus,

    /// Priority 1-5 (1 = highest)
    pub priority: u8,

    /// Tasks that must complete before this one
    #[serde(default)]
    pub depends_on: Vec<String>,

    /// Creation timestamp (ISO 8601)
    pub created_at: String,

    /// When task was claimed (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub claimed_at: Option<String>,

    /// When task was completed (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

impl TeamTask {
    /// Creates a new team task with the given title and priority.
    pub fn new(title: String, team_id: String, priority: u8) -> Self {
        let id = Self::generate_id();
        Self {
            id,
            title,
            description: None,
            team_id,
            assigned_to: None,
            status: TeamTaskStatus::Todo,
            priority: priority.clamp(1, 5),
            depends_on: Vec::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            claimed_at: None,
            completed_at: None,
        }
    }

    /// Generates a unique task ID: task-{timestamp}-{hex_suffix}
    fn generate_id() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("Time went backwards");
        let timestamp = duration.as_secs();
        let hex_suffix = format!("{:04x}", duration.subsec_micros() % 0x10000);
        format!("task-{}-{}", timestamp, hex_suffix)
    }

    /// Sets the description of the task.
    pub fn with_description(mut self, description: Option<String>) -> Self {
        self.description = description;
        self
    }

    /// Adds a dependency task ID.
    pub fn with_dependency(mut self, task_id: String) -> Self {
        self.depends_on.push(task_id);
        self
    }

    /// Returns true if this task is available for claiming (todo + no blockers).
    pub fn is_available(&self, all_tasks: &[TeamTask]) -> bool {
        if self.status != TeamTaskStatus::Todo {
            return false;
        }
        self.depends_on.iter().all(|dep_id| {
            all_tasks
                .iter()
                .find(|t| &t.id == dep_id)
                .is_some_and(|t| t.status == TeamTaskStatus::Done)
        })
    }
}

/// Status summary for a team.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamStatus {
    pub team_id: String,
    pub total_tasks: usize,
    pub todo_tasks: usize,
    pub in_progress_tasks: usize,
    pub review_tasks: usize,
    pub done_tasks: usize,
    pub teammates: Vec<LoopId>,
}

/// Maximum number of tasks a teammate can work on simultaneously.
///
/// This limit prevents agent overload and ensures fair task distribution.
/// Based on Claude Code best practices for multi-agent collaboration.
pub const MAX_TASKS_PER_TEAMMATE: usize = 6;

/// A file reservation tracking which agent is working on which files.
///
/// Used for proactive conflict detection in multi-agent scenarios.
/// Each task can reserve multiple file paths (exact paths or glob patterns).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReservation {
    /// Task ID that owns this reservation
    pub task_id: String,

    /// Loop ID (agent) that claimed this task
    pub loop_id: LoopId,

    /// Reserved file paths (can be exact paths or glob patterns)
    pub file_paths: Vec<String>,

    /// When the reservation was created (ISO 8601)
    pub reserved_at: String,
}

impl FileReservation {
    /// Creates a new file reservation for a task.
    pub fn new(task_id: String, loop_id: LoopId, file_paths: Vec<String>) -> Self {
        Self {
            task_id,
            loop_id,
            file_paths,
            reserved_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Checks if a given file path might conflict with this reservation.
    ///
    /// Returns true if the path matches any of the reserved patterns.
    /// Supports both exact path matching and glob patterns.
    pub fn conflicts_with(&self, path: &str) -> bool {
        self.file_paths.iter().any(|reserved| {
            // Exact match
            if reserved == path {
                return true;
            }

            // Glob pattern matching (simple * and ** support)
            if reserved.contains('*') {
                return Self::glob_match(reserved, path);
            }

            false
        })
    }

    /// Simple glob pattern matching.
    ///
    /// Supports:
    /// - `*` matches any sequence within a path segment
    /// - `**` matches any sequence across segments
    fn glob_match(pattern: &str, path: &str) -> bool {
        let pattern_parts: Vec<&str> = pattern.split('/').collect();
        let path_parts: Vec<&str> = path.split('/').collect();

        Self::match_pattern_segments(&pattern_parts, &path_parts)
    }

    fn match_pattern_segments(pattern: &[&str], path: &[&str]) -> bool {
        let mut p_idx = 0;
        let mut path_idx = 0;

        while p_idx < pattern.len() {
            if path_idx >= path.len() {
                // If we've exhausted the path but still have pattern segments,
                // only match if remaining pattern is just **
                return pattern[p_idx..].iter().all(|&p| p == "**");
            }

            let p = pattern[p_idx];

            match p {
                "**" => {
                    // ** matches zero or more segments
                    if p_idx == pattern.len() - 1 {
                        // ** at the end matches everything remaining
                        return true;
                    }

                    // Try to match the rest of the pattern starting from each path position
                    let remaining_pattern = &pattern[p_idx + 1..];
                    for remaining_idx in path_idx..=path.len() {
                        if Self::match_pattern_segments(remaining_pattern, &path[remaining_idx..]) {
                            return true;
                        }
                    }
                    return false;
                }
                _ => {
                    // Check if this segment matches (with wildcard support)
                    if !Self::segment_matches(p, path[path_idx]) {
                        return false;
                    }
                    p_idx += 1;
                    path_idx += 1;
                }
            }
        }

        // If we've consumed the entire pattern, match if we've also consumed the entire path
        path_idx == path.len()
    }

    /// Check if a pattern segment matches a path segment.
    ///
    /// Supports `*` wildcard within a segment (e.g., `*.rs` matches `main.rs`)
    fn segment_matches(pattern: &str, segment: &str) -> bool {
        // Handle ** (shouldn't reach here normally, but just in case)
        if pattern == "**" {
            return true;
        }

        // Handle single * (matches any single segment)
        if pattern == "*" {
            return true;
        }

        // No wildcard - exact match
        if !pattern.contains('*') {
            return pattern == segment;
        }

        // Wildcard matching within segment
        let parts: Vec<&str> = pattern.split('*').collect();

        // Simple case: single * in middle
        if parts.len() == 2 {
            let prefix = parts[0];
            let suffix = parts[1];
            return segment.starts_with(prefix) && segment.ends_with(suffix);
        }

        // For more complex patterns, fall back to simple matching
        // (Full glob implementation would need more sophisticated logic)
        if parts.len() > 2 {
            // Handle patterns like *test*.rs
            let mut idx = 0;
            for (_i, part) in parts.iter().enumerate() {
                if part.is_empty() {
                    continue;
                }
                if let Some(pos) = segment[idx..].find(part) {
                    idx += pos + part.len();
                } else {
                    return false;
                }
            }
            return true;
        }

        pattern == segment
    }
}

/// A warning about potential file conflicts between agents.
///
/// Emitted when multiple agents might work on the same files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictWarning {
    /// The file path that has conflicts
    pub file_path: String,

    /// List of agents that have reserved this file
    pub conflicting_agents: Vec<ConflictAgent>,

    /// Severity level
    pub severity: ConflictSeverity,

    /// Suggested resolution
    pub suggestion: String,
}

/// Information about an agent involved in a conflict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictAgent {
    /// Loop ID of the conflicting agent
    pub loop_id: LoopId,

    /// Task ID that reserved the file
    pub task_id: String,

    /// Title of the task (for display)
    pub task_title: String,
}

/// Severity level of a conflict warning.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictSeverity {
    /// Multiple agents working in same general area
    Low,

    /// Direct file conflict likely
    High,

    /// Guaranteed merge conflict
    Critical,
}

impl ConflictWarning {
    /// Creates a new conflict warning.
    pub fn new(
        file_path: String,
        conflicting_agents: Vec<ConflictAgent>,
        severity: ConflictSeverity,
    ) -> Self {
        let suggestion = match severity {
            ConflictSeverity::Low => {
                "Agents are working in related files. Consider coordinating edits.".to_string()
            }
            ConflictSeverity::High => {
                "Direct file conflict detected. Agents should sequence their work.".to_string()
            }
            ConflictSeverity::Critical => {
                "Critical conflict: Agents will edit the same file. Immediate action required."
                    .to_string()
            }
        };

        Self {
            file_path,
            conflicting_agents,
            severity,
            suggestion,
        }
    }
}

/// A store for managing teams and team tasks with JSONL persistence.
pub struct TeamStore {
    teams_path: std::path::PathBuf,
    tasks_path: std::path::PathBuf,
    reservations_path: std::path::PathBuf,
    teams: HashMap<String, Team>,
    tasks: HashMap<String, TeamTask>,
    reservations: HashMap<String, FileReservation>,
    lock: FileLock,
}

impl TeamStore {
    /// Loads teams and tasks from JSONL files at the given paths.
    ///
    /// If files don't exist, returns an empty store.
    /// Logs warnings for malformed JSON lines and skips them.
    ///
    /// Uses a shared lock to allow concurrent reads from multiple loops.
    pub fn load(base_path: &Path) -> io::Result<Self> {
        let teams_path = base_path.join("teams.jsonl");
        let tasks_path = base_path.join("team_tasks.jsonl");
        let reservations_path = base_path.join("file_reservations.jsonl");

        // Use lock file for coordination
        let lock_path = base_path.join("team_store.lock");
        let lock = FileLock::new(&lock_path)?;
        let _guard = lock.shared()?;

        let teams = Self::load_teams_from_file(&teams_path)?;
        let tasks = Self::load_tasks_from_file(&tasks_path)?;
        let reservations = Self::load_reservations_from_file(&reservations_path)?;

        Ok(Self {
            teams_path,
            tasks_path,
            reservations_path,
            teams,
            tasks,
            reservations,
            lock,
        })
    }

    fn load_teams_from_file(path: &Path) -> io::Result<HashMap<String, Team>> {
        if !path.exists() {
            return Ok(HashMap::new());
        }

        let content = std::fs::read_to_string(path)?;
        let mut teams = HashMap::new();

        for line in content.lines().filter(|l| !l.trim().is_empty()) {
            match serde_json::from_str::<Team>(line) {
                Ok(team) => {
                    teams.insert(team.id.clone(), team);
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        line = line.chars().take(200).collect::<String>(),
                        "Skipping malformed team line in JSONL"
                    );
                }
            }
        }

        Ok(teams)
    }

    fn load_tasks_from_file(path: &Path) -> io::Result<HashMap<String, TeamTask>> {
        if !path.exists() {
            return Ok(HashMap::new());
        }

        let content = std::fs::read_to_string(path)?;
        let mut tasks = HashMap::new();

        for line in content.lines().filter(|l| !l.trim().is_empty()) {
            match serde_json::from_str::<TeamTask>(line) {
                Ok(task) => {
                    tasks.insert(task.id.clone(), task);
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        line = line.chars().take(200).collect::<String>(),
                        "Skipping malformed task line in JSONL"
                    );
                }
            }
        }

        Ok(tasks)
    }

    fn load_reservations_from_file(path: &Path) -> io::Result<HashMap<String, FileReservation>> {
        if !path.exists() {
            return Ok(HashMap::new());
        }

        let content = std::fs::read_to_string(path)?;
        let mut reservations = HashMap::new();

        for line in content.lines().filter(|l| !l.trim().is_empty()) {
            match serde_json::from_str::<FileReservation>(line) {
                Ok(reservation) => {
                    reservations.insert(reservation.task_id.clone(), reservation);
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        line = line.chars().take(200).collect::<String>(),
                        "Skipping malformed reservation line in JSONL"
                    );
                }
            }
        }

        Ok(reservations)
    }

    /// Saves all teams and tasks to their respective JSONL files.
    ///
    /// Creates parent directories if they don't exist.
    /// Uses an exclusive lock to prevent concurrent writes.
    pub fn save(&self) -> io::Result<()> {
        let _guard = self.lock.exclusive()?;

        if let Some(parent) = self.teams_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Save teams
        let teams_content: String = self
            .teams
            .values()
            .map(|t| serde_json::to_string(t))
            .collect::<Result<Vec<_>, _>>()?
            .join("\n");
        std::fs::write(
            &self.teams_path,
            if teams_content.is_empty() {
                String::new()
            } else {
                teams_content + "\n"
            },
        )?;

        // Save tasks
        let tasks_content: String = self
            .tasks
            .values()
            .map(|t| serde_json::to_string(t))
            .collect::<Result<Vec<_>, _>>()?
            .join("\n");
        std::fs::write(
            &self.tasks_path,
            if tasks_content.is_empty() {
                String::new()
            } else {
                tasks_content + "\n"
            },
        )?;

        // Save reservations
        let reservations_content: String = self
            .reservations
            .values()
            .map(|r| serde_json::to_string(r))
            .collect::<Result<Vec<_>, _>>()?
            .join("\n");
        std::fs::write(
            &self.reservations_path,
            if reservations_content.is_empty() {
                String::new()
            } else {
                reservations_content + "\n"
            },
        )?;

        Ok(())
    }

    // ========== Team Management ==========

    /// Creates a new team with the given configuration.
    ///
    /// Returns the team ID.
    pub fn create_team(&mut self, name: String) -> String {
        let team = Team::new(name);
        let team_id = team.id.clone();
        self.teams.insert(team_id.clone(), team);
        team_id
    }

    /// Gets a team by ID.
    pub fn get_team(&self, team_id: &str) -> Option<&Team> {
        self.teams.get(team_id)
    }

    /// Gets a mutable reference to a team by ID.
    pub fn get_team_mut(&mut self, team_id: &str) -> Option<&mut Team> {
        self.teams.get_mut(team_id)
    }

    /// Lists all teammates in a team.
    pub fn list_teammates(&self, team_id: &str) -> Vec<LoopId> {
        self.get_team(team_id)
            .map(|team| team.teammates.clone())
            .unwrap_or_default()
    }

    /// Adds a teammate to a team.
    pub fn add_teammate(&mut self, team_id: &str, loop_id: LoopId) -> io::Result<()> {
        if let Some(team) = self.get_team_mut(team_id) {
            team.add_teammate(loop_id);
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Team {} not found", team_id),
            ))
        }
    }

    /// Removes a teammate from a team.
    pub fn remove_teammate(&mut self, team_id: &str, loop_id: &LoopId) -> io::Result<()> {
        if let Some(team) = self.get_team_mut(team_id) {
            team.remove_teammate(loop_id);
            Ok(())
        } else {
            Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Team {} not found", team_id),
            ))
        }
    }

    // ========== Task Queue Management ==========

    /// Creates a new team task.
    ///
    /// Returns the task ID.
    pub fn create_team_task(&mut self, task: TeamTask) -> String {
        let task_id = task.id.clone();
        self.tasks.insert(task_id.clone(), task);
        task_id
    }

    /// Claims a task for a teammate (self-assignment).
    ///
    /// Returns error if task doesn't exist or is not available.
    pub fn claim_task(&mut self, task_id: &str, loop_id: LoopId) -> io::Result<()> {
        // First, gather the needed information without holding a mutable reference
        let (task_status, dependencies) = {
            let task = self.tasks.get(task_id).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("Task {} not found", task_id),
                )
            })?;
            (task.status, task.depends_on.clone())
        };

        // Check if task is available for claiming
        if task_status != TeamTaskStatus::Todo {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "Task {} is not available (status: {:?})",
                    task_id, task_status
                ),
            ));
        }

        // Check if dependencies are met
        let all_tasks: Vec<TeamTask> = self.tasks.values().cloned().collect();
        for dep_id in &dependencies {
            if let Some(dep_task) = all_tasks.iter().find(|t| &t.id == dep_id)
                && dep_task.status != TeamTaskStatus::Done
            {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("Task {} has unmet dependencies", task_id),
                ));
            }
        }

        // Now modify the task
        let task = self.tasks.get_mut(task_id).unwrap();
        task.status = TeamTaskStatus::InProgress;
        task.assigned_to = Some(loop_id);
        task.claimed_at = Some(chrono::Utc::now().to_rfc3339());

        Ok(())
    }

    /// Releases a task back to the todo queue.
    pub fn release_task(&mut self, task_id: &str, loop_id: &LoopId) -> io::Result<()> {
        let task = self.tasks.get_mut(task_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Task {} not found", task_id),
            )
        })?;

        // Verify ownership
        if task.assigned_to.as_ref() != Some(loop_id) {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!("Task {} is not assigned to loop {}", task_id, loop_id),
            ));
        }

        // Release the task
        task.status = TeamTaskStatus::Todo;
        task.assigned_to = None;
        task.claimed_at = None;

        Ok(())
    }

    /// Updates a task's status.
    pub fn update_task_status(&mut self, task_id: &str, status: TeamTaskStatus) -> io::Result<()> {
        let task = self.tasks.get_mut(task_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Task {} not found", task_id),
            )
        })?;

        task.status = status;

        // Set completion timestamp if done
        if status == TeamTaskStatus::Done {
            task.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }

        Ok(())
    }

    // ========== Query Methods ==========

    /// Gets a task by ID.
    pub fn get_task(&self, task_id: &str) -> Option<&TeamTask> {
        self.tasks.get(task_id)
    }

    /// Gets all tasks for a team.
    pub fn get_team_tasks(&self, team_id: &str) -> Vec<&TeamTask> {
        self.tasks
            .values()
            .filter(|t| t.team_id == team_id)
            .collect()
    }

    /// Gets available (claimable) tasks for a team.
    ///
    /// Returns task IDs that are available for claiming.
    pub fn get_available_tasks(&self, team_id: &str) -> Vec<String> {
        let team_tasks: Vec<TeamTask> = self
            .tasks
            .values()
            .filter(|t| t.team_id == team_id)
            .cloned()
            .collect();

        team_tasks
            .iter()
            .filter(|t| t.is_available(&team_tasks))
            .map(|t| t.id.clone())
            .collect()
    }

    /// Gets all tasks assigned to a specific teammate.
    pub fn get_tasks_by_teammate(&self, loop_id: &LoopId) -> Vec<&TeamTask> {
        self.tasks
            .values()
            .filter(|t| t.assigned_to.as_ref() == Some(loop_id))
            .collect()
    }

    /// Gets status summary for a team.
    pub fn get_team_status(&self, team_id: &str) -> Option<TeamStatus> {
        let team = self.get_team(team_id)?;

        let team_tasks = self.get_team_tasks(team_id);
        let total_tasks = team_tasks.len();
        let todo_tasks = team_tasks
            .iter()
            .filter(|t| t.status == TeamTaskStatus::Todo)
            .count();
        let in_progress_tasks = team_tasks
            .iter()
            .filter(|t| t.status == TeamTaskStatus::InProgress)
            .count();
        let review_tasks = team_tasks
            .iter()
            .filter(|t| t.status == TeamTaskStatus::Review)
            .count();
        let done_tasks = team_tasks
            .iter()
            .filter(|t| t.status == TeamTaskStatus::Done)
            .count();

        Some(TeamStatus {
            team_id: team_id.to_string(),
            total_tasks,
            todo_tasks,
            in_progress_tasks,
            review_tasks,
            done_tasks,
            teammates: team.teammates.clone(),
        })
    }

    /// Returns all teams.
    pub fn all_teams(&self) -> Vec<&Team> {
        self.teams.values().collect()
    }

    /// Returns all tasks.
    pub fn all_tasks(&self) -> Vec<&TeamTask> {
        self.tasks.values().collect()
    }

    // ========== Load Balancing Methods ==========

    /// Gets the current workload (number of in-progress tasks) for a teammate.
    ///
    /// Returns the count of tasks currently assigned to this teammate with
    /// status `InProgress`.
    pub fn get_teammate_load(&self, loop_id: &LoopId) -> usize {
        self.tasks
            .values()
            .filter(|t| {
                t.assigned_to.as_ref() == Some(loop_id) && t.status == TeamTaskStatus::InProgress
            })
            .count()
    }

    /// Checks if a teammate has capacity for more tasks.
    ///
    /// Returns `true` if the teammate's current workload is below the maximum
    /// limit (`MAX_TASKS_PER_TEAMMATE`).
    pub fn is_teammate_available(&self, loop_id: &LoopId) -> bool {
        self.get_teammate_load(loop_id) < MAX_TASKS_PER_TEAMMATE
    }

    /// Suggests the best available task for a teammate to claim.
    ///
    /// Returns the task ID of the highest priority available task that the
    /// teammate can claim, or `None` if:
    /// - The teammate is not in any team
    /// - The teammate is at max capacity (load >= MAX_TASKS_PER_TEAMMATE)
    /// - There are no available tasks in the teammate's team
    ///
    /// Priority is determined by the task's `priority` field (1 = highest).
    pub fn suggest_task_for_teammate(&self, loop_id: &LoopId) -> Option<String> {
        // Check if teammate has capacity
        if !self.is_teammate_available(loop_id) {
            return None;
        }

        // Find the team this teammate belongs to
        let team = self
            .teams
            .values()
            .find(|t| t.teammates.contains(loop_id))?;

        // Get available tasks for this team
        let available_task_ids = self.get_available_tasks(&team.id);

        // Find the highest priority available task
        let mut best_task: Option<&TeamTask> = None;

        for task_id in &available_task_ids {
            if let Some(task) = self.tasks.get(task_id) {
                // Compare priorities (lower number = higher priority)
                best_task = Some(match best_task {
                    None => task,
                    Some(current_best) if task.priority < current_best.priority => task,
                    Some(current_best) => current_best,
                });
            }
        }

        best_task.map(|t| t.id.clone())
    }

    // ========== File Reservation Methods ==========

    /// Reserves files for a task to prevent conflicts.
    ///
    /// # Arguments
    /// * `task_id` - The task claiming the files
    /// * `loop_id` - The agent (loop) claiming the task
    /// * `file_paths` - List of file paths to reserve (exact paths or glob patterns)
    ///
    /// # Returns
    /// * `Ok(())` - Files reserved successfully
    /// * `Err(io::Error)` - Failed to acquire lock or save
    pub fn reserve_files(
        &mut self,
        task_id: String,
        loop_id: LoopId,
        file_paths: Vec<String>,
    ) -> io::Result<()> {
        let reservation = FileReservation::new(task_id.clone(), loop_id, file_paths);
        self.reservations.insert(task_id, reservation);
        self.save()
    }

    /// Releases file reservations for a task.
    ///
    /// Called when a task is completed, released, or fails.
    ///
    /// # Arguments
    /// * `task_id` - The task to release reservations for
    ///
    /// # Returns
    /// * `Ok(())` - Reservations released successfully
    /// * `Err(io::Error)` - Failed to acquire lock or save
    pub fn release_files(&mut self, task_id: &str) -> io::Result<()> {
        self.reservations.remove(task_id);
        self.save()
    }

    /// Checks for potential file conflicts before claiming a task.
    ///
    /// # Arguments
    /// * `file_paths` - List of file paths the task wants to work on
    ///
    /// # Returns
    /// List of conflict warnings (empty if no conflicts)
    pub fn check_conflicts(&self, file_paths: &[String]) -> Vec<ConflictWarning> {
        let mut conflicts = Vec::new();

        // Check each requested file path against existing reservations
        for requested_path in file_paths {
            let mut conflicting_agents = Vec::new();

            // Find all reservations that conflict with this path
            for reservation in self.reservations.values() {
                if reservation.conflicts_with(requested_path) {
                    // Get the task title for better error messages
                    let task_title = self
                        .tasks
                        .get(&reservation.task_id)
                        .map(|t| t.title.clone())
                        .unwrap_or_else(|| "Unknown Task".to_string());

                    conflicting_agents.push(ConflictAgent {
                        loop_id: reservation.loop_id.clone(),
                        task_id: reservation.task_id.clone(),
                        task_title,
                    });
                }
            }

            if !conflicting_agents.is_empty() {
                // Determine severity based on number of conflicting agents
                let severity = match conflicting_agents.len() {
                    1 => ConflictSeverity::High,
                    _ => ConflictSeverity::Critical,
                };

                conflicts.push(ConflictWarning::new(
                    requested_path.clone(),
                    conflicting_agents,
                    severity,
                ));
            }
        }

        conflicts
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_store() -> (TeamStore, TempDir) {
        let tmp = TempDir::new().unwrap();
        let store = TeamStore::load(tmp.path()).unwrap();
        (store, tmp)
    }

    #[test]
    fn test_create_team() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let team = store.get_team(&team_id).unwrap();

        assert_eq!(team.name, "Test Team");
        assert!(team.teammates.is_empty());
        assert!(team.id.starts_with("team-"));
    }

    #[test]
    fn test_add_teammate() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        let team = store.get_team(&team_id).unwrap();
        assert_eq!(team.teammates.len(), 1);
        assert_eq!(team.teammates[0], "loop-123");
    }

    #[test]
    fn test_remove_teammate() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();
        store
            .remove_teammate(&team_id, &"loop-123".to_string())
            .unwrap();

        let team = store.get_team(&team_id).unwrap();
        assert!(team.teammates.is_empty());
    }

    #[test]
    fn test_create_team_task() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 1);

        let task_id = store.create_team_task(task);
        let task = store.get_task(&task_id).unwrap();

        assert_eq!(task.title, "Test Task");
        assert_eq!(task.team_id, team_id);
        assert_eq!(task.status, TeamTaskStatus::Todo);
        assert!(task.assigned_to.is_none());
    }

    #[test]
    fn test_claim_task() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);

        store.claim_task(&task_id, "loop-123".to_string()).unwrap();

        let task = store.get_task(&task_id).unwrap();
        assert_eq!(task.status, TeamTaskStatus::InProgress);
        assert_eq!(task.assigned_to, Some("loop-123".to_string()));
        assert!(task.claimed_at.is_some());
    }

    #[test]
    fn test_claim_task_fails_if_not_todo() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let mut task = TeamTask::new("Test Task".to_string(), team_id, 1);
        task.status = TeamTaskStatus::InProgress;
        let task_id = store.create_team_task(task);

        let result = store.claim_task(&task_id, "loop-123".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_release_task() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id, 1);
        let task_id = store.create_team_task(task);

        store.claim_task(&task_id, "loop-123".to_string()).unwrap();
        store
            .release_task(&task_id, &"loop-123".to_string())
            .unwrap();

        let task = store.get_task(&task_id).unwrap();
        assert_eq!(task.status, TeamTaskStatus::Todo);
        assert!(task.assigned_to.is_none());
        assert!(task.claimed_at.is_none());
    }

    #[test]
    fn test_release_task_fails_if_not_owner() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id, 1);
        let task_id = store.create_team_task(task);

        store.claim_task(&task_id, "loop-123".to_string()).unwrap();

        let result = store.release_task(&task_id, &"loop-456".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_update_task_status() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id, 1);
        let task_id = store.create_team_task(task);

        store
            .update_task_status(&task_id, TeamTaskStatus::Review)
            .unwrap();

        let task = store.get_task(&task_id).unwrap();
        assert_eq!(task.status, TeamTaskStatus::Review);
    }

    #[test]
    fn test_update_task_status_to_done_sets_completion_time() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id, 1);
        let task_id = store.create_team_task(task);

        store
            .update_task_status(&task_id, TeamTaskStatus::Done)
            .unwrap();

        let task = store.get_task(&task_id).unwrap();
        assert_eq!(task.status, TeamTaskStatus::Done);
        assert!(task.completed_at.is_some());
    }

    #[test]
    fn test_get_available_tasks() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        let task1_id = store.create_team_task(task1);

        // Create and claim task2
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1);
        let task2_id = store.create_team_task(task2);
        store.claim_task(&task2_id, "loop-123".to_string()).unwrap();

        let available = store.get_available_tasks(&team_id);
        assert_eq!(available.len(), 1);
        assert_eq!(available[0], task1_id);
    }

    #[test]
    fn test_get_available_tasks_with_dependencies() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create dependent task first
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1);
        let task2_id = task2.id.clone();
        store.create_team_task(task2);

        // Create task with dependency
        let mut task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        task1.depends_on.push(task2_id.clone());
        store.create_team_task(task1);

        // Task1 should not be available (depends on unfinished task2)
        let available = store.get_available_tasks(&team_id);
        assert_eq!(available.len(), 1);
        // The available task should be task2 (not task1 which depends on it)
        assert_eq!(available[0], task2_id);
    }

    #[test]
    fn test_get_tasks_by_teammate() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        let task1_id = store.create_team_task(task1);

        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1);
        let task2_id = store.create_team_task(task2);

        store.claim_task(&task1_id, "loop-123".to_string()).unwrap();
        store.claim_task(&task2_id, "loop-456".to_string()).unwrap();

        let tasks_123 = store.get_tasks_by_teammate(&"loop-123".to_string());
        assert_eq!(tasks_123.len(), 1);
        assert_eq!(tasks_123[0].id, task1_id);
    }

    #[test]
    fn test_get_team_status() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        store.create_team_task(task1);

        let mut task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1);
        task2.status = TeamTaskStatus::Done;
        store.create_team_task(task2);

        let status = store.get_team_status(&team_id).unwrap();
        assert_eq!(status.total_tasks, 2);
        assert_eq!(status.todo_tasks, 1);
        assert_eq!(status.done_tasks, 1);
        assert_eq!(status.teammates.len(), 1);
    }

    #[test]
    fn test_save_and_reload() {
        let (mut store, tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);

        store.save().unwrap();

        // Reload store
        let reloaded = TeamStore::load(tmp.path()).unwrap();
        let team = reloaded.get_team(&team_id).unwrap();
        assert_eq!(team.name, "Test Team");
        assert_eq!(team.teammates.len(), 1);

        let task = reloaded.get_task(&task_id).unwrap();
        assert_eq!(task.title, "Test Task");
    }

    #[test]
    fn test_task_with_description() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id, 1)
            .with_description(Some("Detailed description".to_string()));

        let task_id = store.create_team_task(task);
        let task = store.get_task(&task_id).unwrap();

        assert_eq!(task.description, Some("Detailed description".to_string()));
    }

    #[test]
    fn test_task_with_dependency() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create first task
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        let task1_id = store.create_team_task(task1);

        // Create second task with dependency
        let task2 =
            TeamTask::new("Task 2".to_string(), team_id, 1).with_dependency(task1_id.clone());
        let task2_id = store.create_team_task(task2);

        let task2 = store.get_task(&task2_id).unwrap();
        assert_eq!(task2.depends_on.len(), 1);
        assert_eq!(task2.depends_on[0], task1_id);
    }

    #[test]
    fn test_get_teammate_load() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create tasks
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        let task1_id = store.create_team_task(task1);

        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1);
        let task2_id = store.create_team_task(task2);

        let task3 = TeamTask::new("Task 3".to_string(), team_id.clone(), 1);
        let task3_id = store.create_team_task(task3);

        // Claim tasks for loop-123
        store.claim_task(&task1_id, "loop-123".to_string()).unwrap();
        store.claim_task(&task2_id, "loop-123".to_string()).unwrap();

        // Claim task for loop-456
        store.claim_task(&task3_id, "loop-456".to_string()).unwrap();

        // Check loads
        assert_eq!(store.get_teammate_load(&"loop-123".to_string()), 2);
        assert_eq!(store.get_teammate_load(&"loop-456".to_string()), 1);
        assert_eq!(store.get_teammate_load(&"loop-789".to_string()), 0);
    }

    #[test]
    fn test_is_teammate_available_under_limit() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create and claim 5 tasks (under the limit of 6)
        for i in 0..5 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store.claim_task(&task_id, "loop-123".to_string()).unwrap();
        }

        // Teammate should be available (5 < 6)
        assert!(store.is_teammate_available(&"loop-123".to_string()));
    }

    #[test]
    fn test_is_teammate_available_at_limit() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create and claim 6 tasks (at the limit)
        for i in 0..MAX_TASKS_PER_TEAMMATE {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store.claim_task(&task_id, "loop-123".to_string()).unwrap();
        }

        // Teammate should NOT be available (6 == 6)
        assert!(!store.is_teammate_available(&"loop-123".to_string()));
    }

    #[test]
    fn test_suggest_task_for_teammate_basic() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create tasks with different priorities
        let task1 = TeamTask::new("Task 1 - Priority 3".to_string(), team_id.clone(), 3);
        let _task1_id = store.create_team_task(task1);

        let task2 = TeamTask::new("Task 2 - Priority 1".to_string(), team_id.clone(), 1);
        let task2_id = store.create_team_task(task2);

        let task3 = TeamTask::new("Task 3 - Priority 2".to_string(), team_id.clone(), 2);
        let _task3_id = store.create_team_task(task3);

        // Should suggest the highest priority task (priority 1 = task2)
        let suggested = store.suggest_task_for_teammate(&"loop-123".to_string());
        assert_eq!(suggested, Some(task2_id));
    }

    #[test]
    fn test_suggest_task_for_teammate_respects_capacity() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create and claim 6 tasks (at capacity)
        for i in 0..MAX_TASKS_PER_TEAMMATE {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store.claim_task(&task_id, "loop-123".to_string()).unwrap();
        }

        // Create additional available tasks
        let extra_task = TeamTask::new("Extra Task".to_string(), team_id.clone(), 1);
        store.create_team_task(extra_task);

        // Should return None because teammate is at capacity
        let suggested = store.suggest_task_for_teammate(&"loop-123".to_string());
        assert_eq!(suggested, None);
    }

    #[test]
    fn test_suggest_task_for_teammate_priority_ordering() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create tasks with mixed priorities
        let task1 = TeamTask::new("Task P5".to_string(), team_id.clone(), 5);
        let _task1_id = store.create_team_task(task1);

        let task2 = TeamTask::new("Task P2".to_string(), team_id.clone(), 2);
        let task2_id = store.create_team_task(task2);

        let task3 = TeamTask::new("Task P4".to_string(), team_id.clone(), 4);
        let _task3_id = store.create_team_task(task3);

        let task4 = TeamTask::new("Task P1".to_string(), team_id.clone(), 1);
        let task4_id = store.create_team_task(task4);

        // Should suggest the highest priority task (priority 1)
        let suggested = store.suggest_task_for_teammate(&"loop-123".to_string());
        assert_eq!(suggested, Some(task4_id.clone()));

        // Claim the P1 task
        store.claim_task(&task4_id, "loop-123".to_string()).unwrap();

        // Now should suggest the next highest priority (priority 2)
        let suggested = store.suggest_task_for_teammate(&"loop-123".to_string());
        assert_eq!(suggested, Some(task2_id));
    }

    #[test]
    fn test_suggest_task_for_teammate_no_available_tasks() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create and claim all tasks
        let task = TeamTask::new("Only Task".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store.claim_task(&task_id, "loop-123".to_string()).unwrap();

        // Should return None because no tasks are available
        let suggested = store.suggest_task_for_teammate(&"loop-123".to_string());
        assert_eq!(suggested, None);
    }

    #[test]
    fn test_suggest_task_for_teammate_not_in_team() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create tasks but don't add the teammate to the team
        let task = TeamTask::new("Task".to_string(), team_id.clone(), 1);
        store.create_team_task(task);

        // Should return None because teammate is not in any team
        let suggested = store.suggest_task_for_teammate(&"loop-123".to_string());
        assert_eq!(suggested, None);
    }

    // ========== FileReservation Tests ==========

    #[test]
    fn test_file_reservation_new() {
        let reservation = FileReservation::new(
            "task-123".to_string(),
            "loop-456".to_string(),
            vec!["src/main.rs".to_string(), "src/lib.rs".to_string()],
        );

        assert_eq!(reservation.task_id, "task-123");
        assert_eq!(reservation.loop_id, "loop-456");
        assert_eq!(reservation.file_paths.len(), 2);
        assert!(reservation.reserved_at.contains('T')); // ISO 8601 format
    }

    #[test]
    fn test_file_reservation_conflicts_with_exact_match() {
        let reservation = FileReservation::new(
            "task-123".to_string(),
            "loop-456".to_string(),
            vec!["src/main.rs".to_string()],
        );

        assert!(reservation.conflicts_with("src/main.rs"));
        assert!(!reservation.conflicts_with("src/lib.rs"));
    }

    #[test]
    fn test_file_reservation_conflicts_with_glob_star() {
        let reservation = FileReservation::new(
            "task-123".to_string(),
            "loop-456".to_string(),
            vec!["src/*.rs".to_string()],
        );

        assert!(reservation.conflicts_with("src/main.rs"));
        assert!(reservation.conflicts_with("src/lib.rs"));
        assert!(!reservation.conflicts_with("tests/main.rs"));
    }

    #[test]
    fn test_file_reservation_conflicts_with_glob_double_star() {
        let reservation = FileReservation::new(
            "task-123".to_string(),
            "loop-456".to_string(),
            vec!["src/**/*.rs".to_string()],
        );

        assert!(reservation.conflicts_with("src/main.rs"));
        assert!(reservation.conflicts_with("src/auth/login.rs"));
        assert!(reservation.conflicts_with("src/models/user.rs"));
        assert!(!reservation.conflicts_with("tests/main.rs"));
    }

    #[test]
    fn test_file_reservation_glob_match_simple() {
        // Test basic * pattern
        assert!(FileReservation::glob_match("*.rs", "main.rs"));
        assert!(FileReservation::glob_match("src/*.rs", "src/main.rs"));
        assert!(!FileReservation::glob_match("src/*.rs", "tests/main.rs"));
    }

    #[test]
    fn test_file_reservation_glob_match_double_star() {
        // Test ** pattern
        assert!(FileReservation::glob_match("src/**/*.rs", "src/main.rs"));
        assert!(FileReservation::glob_match(
            "src/**/*.rs",
            "src/auth/login.rs"
        ));
        assert!(FileReservation::glob_match("**/*.rs", "src/main.rs"));
        assert!(FileReservation::glob_match(
            "**/*.rs",
            "tests/integration/main.rs"
        ));
    }

    // ========== ConflictWarning Tests ==========

    #[test]
    fn test_conflict_warning_new_low_severity() {
        let warning =
            ConflictWarning::new("src/main.rs".to_string(), vec![], ConflictSeverity::Low);

        assert_eq!(warning.file_path, "src/main.rs");
        assert_eq!(warning.severity, ConflictSeverity::Low);
        assert!(warning.suggestion.contains("related files"));
    }

    #[test]
    fn test_conflict_warning_new_high_severity() {
        let warning =
            ConflictWarning::new("src/main.rs".to_string(), vec![], ConflictSeverity::High);

        assert_eq!(warning.severity, ConflictSeverity::High);
        assert!(warning.suggestion.contains("Direct file conflict"));
    }

    #[test]
    fn test_conflict_warning_new_critical_severity() {
        let warning = ConflictWarning::new(
            "src/main.rs".to_string(),
            vec![],
            ConflictSeverity::Critical,
        );

        assert_eq!(warning.severity, ConflictSeverity::Critical);
        assert!(warning.suggestion.contains("Critical conflict"));
    }

    #[test]
    fn test_conflict_warning_with_agents() {
        let agent1 = ConflictAgent {
            loop_id: "loop-123".to_string(),
            task_id: "task-456".to_string(),
            task_title: "Refactor main".to_string(),
        };

        let agent2 = ConflictAgent {
            loop_id: "loop-789".to_string(),
            task_id: "task-012".to_string(),
            task_title: "Add logging".to_string(),
        };

        let warning = ConflictWarning::new(
            "src/main.rs".to_string(),
            vec![agent1.clone(), agent2.clone()],
            ConflictSeverity::High,
        );

        assert_eq!(warning.conflicting_agents.len(), 2);
        assert_eq!(warning.conflicting_agents[0].loop_id, "loop-123");
        assert_eq!(warning.conflicting_agents[1].loop_id, "loop-789");
    }

    #[test]
    fn test_reserve_files() {
        let (mut store, _tmp) = create_test_store();

        let task_id = store.create_team_task(TeamTask::new(
            "Test Task".to_string(),
            "team-123".to_string(),
            1,
        ));

        let result = store.reserve_files(
            task_id.clone(),
            "loop-456".to_string(),
            vec!["src/main.rs".to_string(), "src/lib.rs".to_string()],
        );

        assert!(result.is_ok());
        assert!(store.reservations.contains_key(&task_id));

        let reservation = store.reservations.get(&task_id).unwrap();
        assert_eq!(reservation.task_id, task_id);
        assert_eq!(reservation.loop_id, "loop-456");
        assert_eq!(reservation.file_paths.len(), 2);
    }

    #[test]
    fn test_release_files() {
        let (mut store, _tmp) = create_test_store();

        let task_id = store.create_team_task(TeamTask::new(
            "Test Task".to_string(),
            "team-123".to_string(),
            1,
        ));

        // Reserve files
        store
            .reserve_files(
                task_id.clone(),
                "loop-456".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        assert!(store.reservations.contains_key(&task_id));

        // Release files
        let result = store.release_files(&task_id);
        assert!(result.is_ok());
        assert!(!store.reservations.contains_key(&task_id));
    }

    #[test]
    fn test_check_conflicts_no_conflicts() {
        let (mut store, _tmp) = create_test_store();

        // Check conflicts when no reservations exist
        let conflicts = store.check_conflicts(&["src/main.rs".to_string()]);
        assert!(conflicts.is_empty());

        // Add a reservation for a different file
        let task_id = store.create_team_task(TeamTask::new(
            "Task 1".to_string(),
            "team-123".to_string(),
            1,
        ));
        store
            .reserve_files(
                task_id,
                "loop-456".to_string(),
                vec!["src/lib.rs".to_string()],
            )
            .unwrap();

        // Check conflicts for a file that doesn't match
        let conflicts = store.check_conflicts(&["src/main.rs".to_string()]);
        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_check_conflicts_with_exact_match() {
        let (mut store, _tmp) = create_test_store();

        // Reserve a file
        let task_id = store.create_team_task(TeamTask::new(
            "Task 1".to_string(),
            "team-123".to_string(),
            1,
        ));
        store
            .reserve_files(
                task_id.clone(),
                "loop-456".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        // Check for conflicts on the same file
        let conflicts = store.check_conflicts(&["src/main.rs".to_string()]);

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].file_path, "src/main.rs");
        assert_eq!(conflicts[0].severity, ConflictSeverity::High);
        assert_eq!(conflicts[0].conflicting_agents.len(), 1);
        assert_eq!(conflicts[0].conflicting_agents[0].task_id, task_id);
        assert_eq!(conflicts[0].conflicting_agents[0].loop_id, "loop-456");
    }

    #[test]
    fn test_check_conflicts_with_glob_pattern() {
        let (mut store, _tmp) = create_test_store();

        // Reserve files with glob pattern
        let task_id = store.create_team_task(TeamTask::new(
            "Task 1".to_string(),
            "team-123".to_string(),
            1,
        ));
        store
            .reserve_files(
                task_id.clone(),
                "loop-456".to_string(),
                vec!["src/**/*.rs".to_string()],
            )
            .unwrap();

        // Check for conflicts on a file matching the glob
        let conflicts = store.check_conflicts(&["src/auth/login.rs".to_string()]);

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].file_path, "src/auth/login.rs");
        assert_eq!(conflicts[0].severity, ConflictSeverity::High);
    }

    #[test]
    fn test_check_conflicts_critical_multiple_agents() {
        let (mut store, _tmp) = create_test_store();

        // Two agents reserve the same file
        let task_id1 = store.create_team_task(TeamTask::new(
            "Task 1".to_string(),
            "team-123".to_string(),
            1,
        ));
        store
            .reserve_files(
                task_id1,
                "loop-456".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        let task_id2 = store.create_team_task(TeamTask::new(
            "Task 2".to_string(),
            "team-123".to_string(),
            2,
        ));
        store
            .reserve_files(
                task_id2,
                "loop-789".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        // Check for conflicts
        let conflicts = store.check_conflicts(&["src/main.rs".to_string()]);

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].severity, ConflictSeverity::Critical);
        assert_eq!(conflicts[0].conflicting_agents.len(), 2);
    }
}
