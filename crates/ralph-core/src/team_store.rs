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
use std::path::{Path, PathBuf};
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

    /// Files extracted from task description or git diff
    /// Used for conflict detection
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extracted_files: Option<Vec<String>>,
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
            extracted_files: None,
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

    /// Sets the description of the task and auto-extracts file paths.
    pub fn with_description(mut self, description: Option<String>) -> Self {
        self.description = description.clone();

        // Auto-extract file paths from description
        if let Some(ref desc) = description {
            let files = extract_file_paths(desc);
            if !files.is_empty() {
                self.extracted_files = Some(files);
            }
        }

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

    /// Extracts files from git diff as a fallback when no files were extracted from description.
    /// This should be called after the task is claimed (assigned_to is set).
    ///
    /// # Arguments
    /// * `repo_root` - Path to the repository root
    ///
    /// # Returns
    /// The updated task with extracted_files populated from git diff
    pub fn with_extracted_files_from_git_diff(mut self, repo_root: &Path) -> Self {
        // Only extract if not already extracted from description
        if self.extracted_files.is_none() {
            if let Some(ref loop_id) = self.assigned_to {
                let files = extract_files_from_git_diff(loop_id, repo_root);
                if !files.is_empty() {
                    self.extracted_files = Some(files);
                }
            }
        }
        self
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

/// Velocity metrics for a team or individual teammate.
///
/// Tracks task completion velocity and efficiency over time.
/// Used for performance prediction and workload balancing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VelocityMetrics {
    /// Team or teammate ID
    pub id: String,

    /// Whether this metrics is for a team or individual
    pub scope: VelocityScope,

    /// Tasks completed in the last hour
    pub tasks_last_hour: usize,

    /// Tasks completed in the last 24 hours
    pub tasks_last_24h: usize,

    /// Tasks completed in the last 7 days
    pub tasks_last_7d: usize,

    /// Total tasks completed (all time)
    pub total_completed: usize,

    /// Average completion time in seconds (for completed tasks)
    pub avg_completion_time_secs: f64,

    /// Completion rate: completed / total tasks (0.0 to 1.0)
    pub completion_rate: f64,

    /// Velocity: tasks per hour
    pub velocity: f64,

    /// When these metrics were last updated (ISO 8601)
    pub updated_at: String,
}

/// Scope of velocity metrics (team-wide or individual teammate).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VelocityScope {
    /// Team-wide metrics (aggregated across all teammates)
    Team,
    /// Individual teammate metrics
    Teammate,
}

impl VelocityMetrics {
    /// Creates new velocity metrics for a team or teammate.
    pub fn new(id: String, scope: VelocityScope) -> Self {
        Self {
            id,
            scope,
            tasks_last_hour: 0,
            tasks_last_24h: 0,
            tasks_last_7d: 0,
            total_completed: 0,
            avg_completion_time_secs: 0.0,
            completion_rate: 0.0,
            velocity: 0.0,
            updated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Calculates velocity (tasks per hour) from recent data.
    ///
    /// Uses exponential weighted average prioritizing recent activity:
    /// - Last hour: 50% weight
    /// - Last 24h: 30% weight
    /// - Last 7d: 20% weight
    pub fn calculate_velocity(&self) -> f64 {
        if self.tasks_last_hour > 0 {
            // High recent activity: prioritize last hour
            (self.tasks_last_hour as f64 * 0.5)
                + (self.tasks_last_24h as f64 / 24.0 * 0.3)
                + (self.tasks_last_7d as f64 / 168.0 * 0.2) // 168 hours in 7 days
        } else if self.tasks_last_24h > 0 {
            // Moderate activity: use 24h average
            self.tasks_last_24h as f64 / 24.0
        } else if self.tasks_last_7d > 0 {
            // Low activity: use 7-day average
            self.tasks_last_7d as f64 / 168.0
        } else {
            0.0
        }
    }
}

/// Tracks individual task completion events for velocity metrics.
///
/// Records when tasks are completed, enabling time-series analysis of team velocity.
/// Used to calculate completion rates, velocity trends, and workload distribution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskCompletion {
    /// ID of the completed task
    pub task_id: String,

    /// ID of the teammate who completed the task
    pub teammate_id: String,

    /// ID of the team the task belongs to
    pub team_id: String,

    /// When the task was completed (ISO 8601)
    pub completed_at: String,

    /// When the task was started (ISO 8601), if available
    pub started_at: Option<String>,

    /// Task priority (for weighted metrics)
    pub priority: u8,

    /// Optional complexity score (for weighted velocity)
    pub complexity: Option<f64>,
}

impl TaskCompletion {
    /// Creates a new task completion record.
    pub fn new(task_id: String, teammate_id: String, team_id: String, priority: u8) -> Self {
        Self {
            task_id,
            teammate_id,
            team_id,
            completed_at: chrono::Utc::now().to_rfc3339(),
            started_at: None,
            priority,
            complexity: None,
        }
    }

    /// Creates a task completion record with timing information.
    pub fn with_timing(
        task_id: String,
        teammate_id: String,
        team_id: String,
        priority: u8,
        started_at: String,
    ) -> Self {
        Self {
            task_id,
            teammate_id,
            team_id,
            completed_at: chrono::Utc::now().to_rfc3339(),
            started_at: Some(started_at),
            priority,
            complexity: None,
        }
    }

    /// Calculates completion time in seconds, if started_at is available.
    pub fn completion_time_secs(&self) -> Option<f64> {
        self.started_at.as_ref()?;
        let started = chrono::DateTime::parse_from_rfc3339(self.started_at.as_ref()?).ok()?;
        let completed = chrono::DateTime::parse_from_rfc3339(&self.completed_at).ok()?;
        let duration = completed.signed_duration_since(started);
        Some(duration.num_seconds() as f64)
    }
}

/// Aggregated velocity statistics for an entire team.
///
/// Combines individual teammate metrics into team-wide performance indicators.
/// Used for team-level velocity tracking, capacity planning, and workload analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamVelocityStats {
    /// Team ID these stats belong to
    pub team_id: String,

    /// Individual teammate metrics
    pub teammate_metrics: Vec<VelocityMetrics>,

    /// Team-wide aggregated metrics
    pub team_metrics: VelocityMetrics,

    /// Time range covered by these stats (ISO 8601 duration)
    pub time_range: String,

    /// When these stats were calculated (ISO 8601)
    pub calculated_at: String,
}

impl TeamVelocityStats {
    /// Creates new team velocity stats by aggregating teammate metrics.
    pub fn new(team_id: String, teammate_metrics: Vec<VelocityMetrics>) -> Self {
        let team_metrics = Self::aggregate_team_metrics(&team_id, &teammate_metrics);
        Self {
            team_id: team_id.clone(),
            teammate_metrics,
            team_metrics,
            time_range: "P7D".to_string(), // 7 days (ISO 8601 duration)
            calculated_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Aggregates individual teammate metrics into team-wide metrics.
    fn aggregate_team_metrics(
        team_id: &str,
        teammate_metrics: &[VelocityMetrics],
    ) -> VelocityMetrics {
        if teammate_metrics.is_empty() {
            return VelocityMetrics::new(team_id.to_string(), VelocityScope::Team);
        }

        let total_completed: usize = teammate_metrics.iter().map(|m| m.total_completed).sum();
        let tasks_last_hour: usize = teammate_metrics.iter().map(|m| m.tasks_last_hour).sum();
        let tasks_last_24h: usize = teammate_metrics.iter().map(|m| m.tasks_last_24h).sum();
        let tasks_last_7d: usize = teammate_metrics.iter().map(|m| m.tasks_last_7d).sum();

        // Calculate weighted average completion time
        let avg_completion_time_secs = if total_completed > 0 {
            teammate_metrics
                .iter()
                .map(|m| m.avg_completion_time_secs * m.total_completed as f64)
                .sum::<f64>()
                / total_completed as f64
        } else {
            0.0
        };

        // Calculate average completion rate
        let completion_rate = teammate_metrics
            .iter()
            .map(|m| m.completion_rate)
            .sum::<f64>()
            / teammate_metrics.len() as f64;

        // Calculate team velocity (sum of individual velocities)
        let velocity: f64 = teammate_metrics.iter().map(|m| m.velocity).sum();

        let mut metrics = VelocityMetrics::new(team_id.to_string(), VelocityScope::Team);
        metrics.tasks_last_hour = tasks_last_hour;
        metrics.tasks_last_24h = tasks_last_24h;
        metrics.tasks_last_7d = tasks_last_7d;
        metrics.total_completed = total_completed;
        metrics.avg_completion_time_secs = avg_completion_time_secs;
        metrics.completion_rate = completion_rate;
        metrics.velocity = velocity;
        metrics.updated_at = chrono::Utc::now().to_rfc3339();
        metrics
    }

    /// Finds the top performing teammate by velocity.
    pub fn top_performer(&self) -> Option<&VelocityMetrics> {
        self.teammate_metrics.iter().max_by(|a, b| {
            a.velocity
                .partial_cmp(&b.velocity)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    }

    /// Calculates workload distribution (standard deviation of velocities).
    pub fn workload_balance(&self) -> f64 {
        if self.teammate_metrics.len() < 2 {
            return 1.0; // Perfect balance with 0 or 1 teammate
        }

        let mean_velocity = self.team_metrics.velocity / self.teammate_metrics.len() as f64;
        if mean_velocity == 0.0 {
            return 1.0; // Perfect balance when no activity
        }

        let variance: f64 = self
            .teammate_metrics
            .iter()
            .map(|m| {
                let diff = m.velocity - mean_velocity;
                diff * diff
            })
            .sum::<f64>()
            / self.teammate_metrics.len() as f64;

        let std_dev = variance.sqrt();
        // Convert to balance score: 1.0 = perfect balance, 0.0 = highly imbalanced
        1.0 - (std_dev / mean_velocity).min(1.0)
    }
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
            // Check both directions: reserved glob vs path, and path glob vs reserved
            if reserved.contains('*') {
                return Self::glob_match(reserved, path);
            }

            if path.contains('*') {
                return Self::glob_match(path, reserved);
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
            for part in parts.iter() {
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
    completions_path: std::path::PathBuf,
    teams: HashMap<String, Team>,
    tasks: HashMap<String, TeamTask>,
    reservations: HashMap<String, FileReservation>,
    completions: Vec<TaskCompletion>,
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
        let completions_path = base_path.join("task_completions.jsonl");

        // Use lock file for coordination
        let lock_path = base_path.join("team_store.lock");
        let lock = FileLock::new(&lock_path)?;
        let _guard = lock.shared()?;

        let teams = Self::load_teams_from_file(&teams_path)?;
        let tasks = Self::load_tasks_from_file(&tasks_path)?;
        let reservations = Self::load_reservations_from_file(&reservations_path)?;
        let completions = Self::load_completions_from_file(&completions_path)?;

        Ok(Self {
            teams_path,
            tasks_path,
            reservations_path,
            completions_path,
            teams,
            tasks,
            reservations,
            completions,
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

    fn load_completions_from_file(path: &Path) -> io::Result<Vec<TaskCompletion>> {
        if !path.exists() {
            return Ok(Vec::new());
        }

        let content = std::fs::read_to_string(path)?;
        let mut completions = Vec::new();

        for line in content.lines().filter(|l| !l.trim().is_empty()) {
            match serde_json::from_str::<TaskCompletion>(line) {
                Ok(completion) => {
                    completions.push(completion);
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        line = line.chars().take(200).collect::<String>(),
                        "Skipping malformed completion line in JSONL"
                    );
                }
            }
        }

        Ok(completions)
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

        // Save completions
        let completions_content: String = self
            .completions
            .iter()
            .map(|c| serde_json::to_string(c))
            .collect::<Result<Vec<_>, _>>()?
            .join("\n");
        std::fs::write(
            &self.completions_path,
            if completions_content.is_empty() {
                String::new()
            } else {
                completions_content + "\n"
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
    /// If file conflicts are detected, they are logged as warnings but don't block the claim.
    pub fn claim_task(&mut self, task_id: &str, loop_id: LoopId) -> io::Result<()> {
        // First, gather the needed information without holding a mutable reference
        let (task_status, dependencies, team_id, extracted_files) = {
            let task = self.tasks.get(task_id).ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("Task {} not found", task_id),
                )
            })?;
            (
                task.status,
                task.depends_on.clone(),
                task.team_id.clone(),
                task.extracted_files.clone(),
            )
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

        // Check for file conflicts if task has extracted files
        if let Some(ref files) = extracted_files {
            let conflicts = self.check_conflicts(files);
            if !conflicts.is_empty() {
                // Log warnings for each conflict
                for conflict in &conflicts {
                    warn!(
                        task_id = %task_id,
                        loop_id = %loop_id,
                        file_path = %conflict.file_path,
                        severity = ?conflict.severity,
                        conflicting_agents = ?conflict.conflicting_agents,
                        suggestion = %conflict.suggestion,
                        "File conflict detected during task claim"
                    );
                }

                // Emit conflict_detected event to event file if available
                if let Err(e) = self.emit_conflict_event(&team_id, task_id, &loop_id, &conflicts) {
                    warn!("Failed to emit conflict event: {}", e);
                }
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

        // Release file reservations for this task
        self.reservations.remove(task_id);

        self.save()
    }

    /// Records a task completion event for velocity tracking.
    ///
    /// Creates a TaskCompletion record and persists it to the completions store.
    /// This enables velocity metrics, completion rate analysis, and workload distribution tracking.
    ///
    /// # Arguments
    ///
    /// * `task_id` - ID of the completed task
    /// * `teammate_id` - ID of the teammate who completed the task
    /// * `team_id` - ID of the team the task belongs to
    /// * `priority` - Task priority (1-5, 1 = highest)
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` if the completion was recorded successfully.
    /// Returns an error if saving fails.
    pub fn record_task_completion(
        &mut self,
        task_id: &str,
        teammate_id: &str,
        team_id: &str,
        priority: u8,
    ) -> io::Result<()> {
        // Get task details to extract timing information
        let (use_timing, started_at) = if let Some(task) = self.tasks.get(task_id) {
            let started = task.claimed_at.clone();
            (task.completed_at.is_some(), started)
        } else {
            (false, None)
        };

        // Create completion record with timing if available
        let completion = if use_timing {
            if let Some(started) = started_at {
                TaskCompletion::with_timing(
                    task_id.to_string(),
                    teammate_id.to_string(),
                    team_id.to_string(),
                    priority,
                    started,
                )
            } else {
                TaskCompletion::new(
                    task_id.to_string(),
                    teammate_id.to_string(),
                    team_id.to_string(),
                    priority,
                )
            }
        } else {
            TaskCompletion::new(
                task_id.to_string(),
                teammate_id.to_string(),
                team_id.to_string(),
                priority,
            )
        };

        // Add to completions history
        self.completions.push(completion);

        // Persist to disk
        self.save()
    }

    // ========== Velocity Metrics Methods ==========

    /// Calculates velocity metrics for a team.
    ///
    /// Aggregates completion data for all teammates in the team and computes
    /// team-wide velocity metrics including tasks/hour, completion rate, and trends.
    ///
    /// # Arguments
    ///
    /// * `team_id` - ID of the team to calculate metrics for
    ///
    /// # Returns
    ///
    /// Returns `Ok(TeamVelocityStats)` with aggregated metrics for the team and individual teammates.
    /// Returns an error if the team doesn't exist.
    ///
    /// # Performance
    ///
    /// Target: <100ms for 1000 completions
    pub fn calculate_velocity_metrics(&self, team_id: &str) -> io::Result<TeamVelocityStats> {
        let team = self.teams.get(team_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Team {} not found", team_id),
            )
        })?;

        // Calculate metrics for each teammate
        let teammate_metrics: Vec<VelocityMetrics> = team
            .teammates
            .iter()
            .map(|teammate_id| self.calculate_teammate_velocity_internal(team_id, teammate_id))
            .collect();

        Ok(TeamVelocityStats::new(
            team_id.to_string(),
            teammate_metrics,
        ))
    }

    /// Calculates velocity metrics for an individual teammate.
    ///
    /// # Arguments
    ///
    /// * `team_id` - ID of the team the teammate belongs to
    /// * `loop_id` - ID of the teammate (loop ID)
    ///
    /// # Returns
    ///
    /// Returns `Ok(VelocityMetrics)` with individual velocity metrics.
    /// Returns an error if the teammate has no completions.
    pub fn calculate_teammate_velocity(
        &self,
        team_id: &str,
        loop_id: &str,
    ) -> io::Result<VelocityMetrics> {
        // Verify teammate belongs to team
        let team = self.teams.get(team_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Team {} not found", team_id),
            )
        })?;

        if !team.teammates.contains(&loop_id.to_string()) {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                format!("Teammate {} not found in team {}", loop_id, team_id),
            ));
        }

        Ok(self.calculate_teammate_velocity_internal(team_id, loop_id))
    }

    /// Internal helper to calculate teammate velocity without validation.
    fn calculate_teammate_velocity_internal(
        &self,
        team_id: &str,
        loop_id: &str,
    ) -> VelocityMetrics {
        let now = chrono::Utc::now();
        let one_hour_ago = now - chrono::Duration::hours(1);
        let one_day_ago = now - chrono::Duration::days(1);
        let seven_days_ago = now - chrono::Duration::days(7);

        // Filter completions for this teammate
        let teammate_completions: Vec<&TaskCompletion> = self
            .completions
            .iter()
            .filter(|c| c.team_id == team_id && c.teammate_id == loop_id)
            .collect();

        let mut metrics = VelocityMetrics::new(loop_id.to_string(), VelocityScope::Teammate);

        if teammate_completions.is_empty() {
            return metrics;
        }

        // Count completions in time windows
        for completion in &teammate_completions {
            if let Ok(completed_at) = chrono::DateTime::parse_from_rfc3339(&completion.completed_at)
            {
                let completed_at = completed_at.with_timezone(&chrono::Utc);
                if completed_at > one_hour_ago {
                    metrics.tasks_last_hour += 1;
                }
                if completed_at > one_day_ago {
                    metrics.tasks_last_24h += 1;
                }
                if completed_at > seven_days_ago {
                    metrics.tasks_last_7d += 1;
                }
            }
        }

        metrics.total_completed = teammate_completions.len();

        // Calculate average completion time
        let completion_times: Vec<f64> = teammate_completions
            .iter()
            .filter_map(|c| {
                let (Some(started), Ok(completed)) = (
                    &c.started_at,
                    chrono::DateTime::parse_from_rfc3339(&c.completed_at),
                ) else {
                    return None;
                };

                if let Ok(started) = chrono::DateTime::parse_from_rfc3339(started) {
                    let duration =
                        completed.with_timezone(&chrono::Utc) - started.with_timezone(&chrono::Utc);
                    Some(duration.num_seconds() as f64)
                } else {
                    None
                }
            })
            .collect();

        if !completion_times.is_empty() {
            metrics.avg_completion_time_secs =
                completion_times.iter().sum::<f64>() / completion_times.len() as f64;
        }

        // Calculate velocity using exponential weighted average
        metrics.velocity = metrics.calculate_velocity();

        // Calculate completion rate (completed / total assigned)
        let assigned_count = self
            .tasks
            .values()
            .filter(|t| t.team_id == team_id && t.assigned_to.as_deref() == Some(loop_id))
            .count();
        if assigned_count > 0 {
            metrics.completion_rate = metrics.total_completed as f64 / assigned_count as f64;
        }

        metrics.updated_at = now.to_rfc3339();
        metrics
    }

    /// Gets velocity history for a team over a time period.
    ///
    /// Returns time-series data showing how team velocity has changed over time.
    /// Useful for trend analysis and performance visualization.
    ///
    /// # Arguments
    ///
    /// * `team_id` - ID of the team
    /// * `duration_hours` - Number of hours of history to return (e.g., 168 for 7 days)
    ///
    /// # Returns
    ///
    /// Returns a vector of (timestamp, velocity) tuples representing hourly velocity samples.
    /// Each sample shows the velocity at that point in time based on the preceding hour.
    pub fn get_velocity_history(
        &self,
        team_id: &str,
        duration_hours: u64,
    ) -> io::Result<Vec<(String, f64)>> {
        let team = self.teams.get(team_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Team {} not found", team_id),
            )
        })?;

        let now = chrono::Utc::now();
        let mut history = Vec::new();

        // Sample velocity at hourly intervals
        for hour_offset in 0..duration_hours {
            let sample_time = now - chrono::Duration::hours(hour_offset as i64);
            let window_start = sample_time - chrono::Duration::hours(1);

            // Count completions in this hour window
            let completions_in_hour = self
                .completions
                .iter()
                .filter(|c| {
                    if c.team_id != team_id {
                        return false;
                    }
                    if !team.teammates.contains(&c.teammate_id) {
                        return false;
                    }
                    if let Ok(completed_at) = chrono::DateTime::parse_from_rfc3339(&c.completed_at)
                    {
                        let completed_at = completed_at.with_timezone(&chrono::Utc);
                        return completed_at >= window_start && completed_at < sample_time;
                    }
                    false
                })
                .count();

            // Velocity is tasks per hour
            let velocity = completions_in_hour as f64;
            history.push((sample_time.to_rfc3339(), velocity));
        }

        // Reverse to get chronological order (oldest first)
        history.reverse();
        Ok(history)
    }

    // ========== Prediction Methods ==========

    /// Predicts remaining work time for a team.
    ///
    /// Estimates how long it will take to complete all open (todo + in_progress) tasks
    /// based on the team's current velocity.
    ///
    /// # Arguments
    ///
    /// * `team_id` - ID of the team
    ///
    /// # Returns
    ///
    /// Returns `Ok(estimated_seconds)` - estimated time in seconds to complete all open tasks.
    /// Returns 0.0 if there are no open tasks.
    /// Returns an error if the team doesn't exist or has no velocity data.
    ///
    /// # Algorithm
    ///
    /// 1. Count open tasks (todo + in_progress)
    /// 2. Get team velocity (tasks per hour)
    /// 3. Estimate: open_tasks / velocity = hours needed
    ///
    /// # Performance
    ///
    /// Target: <50ms
    pub fn predict_remaining_work(&self, team_id: &str) -> io::Result<f64> {
        // Verify team exists
        let _team = self.teams.get(team_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Team {} not found", team_id),
            )
        })?;

        // Count open tasks
        let open_tasks = self
            .tasks
            .values()
            .filter(|t| {
                t.team_id == team_id
                    && (t.status == TeamTaskStatus::Todo || t.status == TeamTaskStatus::InProgress)
            })
            .count();

        if open_tasks == 0 {
            return Ok(0.0);
        }

        // Get team velocity
        let stats = self.calculate_velocity_metrics(team_id)?;
        let velocity = stats.team_metrics.velocity;

        if velocity <= 0.0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Team {} has no velocity data", team_id),
            ));
        }

        // Estimate: tasks / (tasks/hour) = hours
        let hours_needed = open_tasks as f64 / velocity;
        let seconds_needed = hours_needed * 3600.0;

        Ok(seconds_needed)
    }

    /// Predicts when a specific task will be completed.
    ///
    /// Estimates the completion date for a task based on:
    /// - Task status (todo tasks must wait for assignment)
    /// - Team velocity
    /// - Queue position (for todo tasks)
    /// - Current progress (for in_progress tasks)
    ///
    /// # Arguments
    ///
    /// * `task_id` - ID of the task to predict
    ///
    /// # Returns
    ///
    /// Returns `Ok(estimated_timestamp)` - ISO 8601 timestamp of estimated completion.
    /// Returns an error if task not found, team not found, or no velocity data.
    ///
    /// # Algorithm
    ///
    /// For IN_PROGRESS tasks:
    ///   - Use avg completion time from velocity metrics
    ///   - estimated = now + avg_completion_time
    ///
    /// For TODO tasks:
    ///   - Count tasks ahead in queue (todo + in_progress)
    ///   - Estimate queue wait time: queue_position / velocity
    ///   - Add avg task completion time
    ///   - estimated = now + queue_wait + avg_completion_time
    ///
    /// For REVIEW/DONE tasks:
    ///   - REVIEW: Estimate 1 hour for review
    ///   - DONE: Return completed_at timestamp
    ///
    /// # Performance
    ///
    /// Target: <50ms
    pub fn predict_completion_date(&self, task_id: &str) -> io::Result<String> {
        let task = self.tasks.get(task_id).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("Task {} not found", task_id),
            )
        })?;

        let team_id = &task.team_id;
        let stats = self.calculate_velocity_metrics(team_id)?;
        let velocity = stats.team_metrics.velocity;

        if velocity <= 0.0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("Team {} has no velocity data", team_id),
            ));
        }

        let now = chrono::Utc::now();
        let estimated_completion = match task.status {
            TeamTaskStatus::Done => {
                // Already done - return actual completion time
                return Ok(task
                    .completed_at
                    .clone()
                    .unwrap_or_else(|| now.to_rfc3339()));
            }
            TeamTaskStatus::Review => {
                // In review - estimate 1 hour for review
                now + chrono::Duration::hours(1)
            }
            TeamTaskStatus::InProgress => {
                // In progress - use avg completion time
                let avg_seconds = stats.team_metrics.avg_completion_time_secs;
                if avg_seconds > 0.0 {
                    now + chrono::Duration::seconds(avg_seconds as i64)
                } else {
                    // No avg time data - estimate 1 hour
                    now + chrono::Duration::hours(1)
                }
            }
            TeamTaskStatus::Todo => {
                // Todo - estimate queue wait + completion time

                // Count tasks ahead in queue (all todo + in_progress tasks)
                let queue_position = self
                    .tasks
                    .values()
                    .filter(|t| {
                        t.team_id.as_str() == team_id
                            && (t.status == TeamTaskStatus::Todo
                                || t.status == TeamTaskStatus::InProgress)
                            && t.priority <= task.priority // Higher or equal priority
                            && t.id != task_id
                    })
                    .count();

                // Queue wait time in hours
                let queue_wait_hours = if velocity > 0.0 {
                    queue_position as f64 / velocity
                } else {
                    0.0
                };

                // Task completion time
                let avg_seconds = stats.team_metrics.avg_completion_time_secs;
                let completion_hours = if avg_seconds > 0.0 {
                    avg_seconds / 3600.0
                } else {
                    1.0 // Default 1 hour
                };

                let total_hours = queue_wait_hours + completion_hours;
                now + chrono::Duration::seconds((total_hours * 3600.0) as i64)
            }
        };

        Ok(estimated_completion.to_rfc3339())
    }

    /// Extrapolates velocity trend for a team.
    ///
    /// Analyzes velocity history to predict future velocity direction.
    /// Uses simple linear regression on recent velocity samples.
    ///
    /// # Arguments
    ///
    /// * `team_id` - ID of the team
    ///
    /// # Returns
    ///
    /// Returns `Ok(trend)` where trend is:
    /// - Positive: velocity is increasing (team is accelerating)
    /// - Negative: velocity is decreasing (team is slowing down)
    /// - Near zero: velocity is stable
    ///
    /// Returns an error if team not found or insufficient data (<2 samples).
    ///
    /// # Algorithm
    ///
    /// Simple linear regression on last 24 hours of velocity data:
    /// - slope > 0.1: accelerating
    /// - slope < -0.1: decelerating
    /// - else: stable
    ///
    /// # Performance
    ///
    /// Target: <50ms
    pub fn extrapolate_velocity_trend(&self, team_id: &str) -> io::Result<f64> {
        // Get last 24 hours of velocity history
        let history = self.get_velocity_history(team_id, 24)?;

        if history.len() < 2 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!(
                    "Insufficient velocity data for team {} (need >= 2 samples, got {})",
                    team_id,
                    history.len()
                ),
            ));
        }

        // Simple linear regression: y = mx + b
        // where x = time index (0, 1, 2, ...) and y = velocity
        let n = history.len() as f64;
        let x_sum = (n * (n - 1.0)) / 2.0; // Sum of 0..n
        let y_sum: f64 = history.iter().map(|(_, y)| y).sum();
        let xy_sum: f64 = history
            .iter()
            .enumerate()
            .map(|(i, (_, y))| i as f64 * y)
            .sum();
        let xx_sum: f64 = (0..history.len()).map(|i| (i * i) as f64).sum();

        // Calculate slope (m)
        let denominator = n * xx_sum - x_sum * x_sum;
        if denominator.abs() < 1e-10 {
            // All x values are the same (shouldn't happen)
            return Ok(0.0);
        }

        let slope = (n * xy_sum - x_sum * y_sum) / denominator;

        Ok(slope)
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

    /// Emits a conflict_detected event to the events file.
    ///
    /// This method writes a structured event to `.ralph/events.jsonl` (or the path
    /// specified in `.ralph/current-events`) that can be consumed by the event loop,
    /// RObot, or other observers.
    ///
    /// # Arguments
    /// * `team_id` - The team ID
    /// * `task_id` - The task ID being claimed
    /// * `loop_id` - The loop ID claiming the task
    /// * `conflicts` - List of detected conflicts
    ///
    /// # Returns
    /// * `Ok(())` - Event emitted successfully
    /// * `Err(io::Error)` - Failed to write event (e.g., no events file)
    fn emit_conflict_event(
        &self,
        team_id: &str,
        task_id: &str,
        loop_id: &LoopId,
        conflicts: &[ConflictWarning],
    ) -> io::Result<()> {
        use std::io::Write;

        // Determine events file path
        let base_path = self
            .teams_path
            .parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Cannot determine base path"))?;

        // Check for current-events marker file (set by ralph run)
        let events_file = std::fs::read_to_string(base_path.join("current-events"))
            .map(|s| base_path.join(s.trim()))
            .unwrap_or_else(|_| base_path.join("events.jsonl"));

        // Create event payload
        let event_payload = serde_json::json!({
            "type": "conflict_detected",
            "team_id": team_id,
            "task_id": task_id,
            "loop_id": loop_id,
            "conflicts": conflicts,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });

        // Write event as JSONL line
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&events_file)?;

        writeln!(file, "{}", serde_json::to_string(&event_payload)?)?;

        Ok(())
    }
}

// ========== File Path Extraction Functions ==========

/// Extracts file paths from task descriptions.
///
/// Parses text for file path mentions using regex patterns.
/// Supports:
/// - "Edit src/auth.rs" → "src/auth.rs"
/// - "Modify tests/*.rs" → "tests/*.rs"
/// - "Update crates/ralph-core/src/**/*.rs" → "crates/ralph-core/src/**/*.rs"
/// - File extensions: .rs, .toml, .md, .json, .yaml, .yml, .ts, .tsx, .js, .jsx
///
/// # Arguments
/// * `text` - The task description or text to parse
///
/// # Returns
/// Vector of extracted file paths (may include glob patterns)
pub fn extract_file_paths(text: &str) -> Vec<String> {
    use regex::Regex;
    use std::sync::OnceLock;

    // Define supported file extensions (order matters: longer extensions first to avoid partial matches)
    const EXTENSIONS: &str = r"toml|json|ya?ml|tsx|jsx|html|css|txt|rs|md|ts|js|sh";

    // Regex patterns for file path extraction
    // Pattern 1: Explicit action verbs followed by file path
    // e.g., "Edit src/auth.rs", "Modify tests/*.rs", "Update crates/**/*.rs"
    static ACTION_PATTERN: OnceLock<Regex> = OnceLock::new();
    let action_pattern = ACTION_PATTERN.get_or_init(|| {
        let pattern = format!(
            "(?i)(?:edit|modify|update|change|fix|refactor|add|create|delete|remove|read|write|open|check|review)\\s+([a-zA-Z0-9_\\-./]+(?:\\*\\*?/[a-zA-Z0-9_\\-./]*)*\\.({}))",
            EXTENSIONS
        );
        Regex::new(&pattern).expect("Invalid action regex pattern")
    });

    // Pattern 2: File paths in quotes or code blocks
    // e.g., "`src/main.rs`", "'config.toml'", "\"test.json\""
    // Uses character class with backtick (U+0060), single quote, and double quote
    static QUOTED_PATTERN: OnceLock<Regex> = OnceLock::new();
    let quoted_pattern = QUOTED_PATTERN.get_or_init(|| {
        // Using escaped backtick \x60 and escaped single quote \x27 in character class
        let pattern = format!(
            "[\\x60\\x27\"]([a-zA-Z0-9_\\-./]+(?:\\*\\*?/[a-zA-Z0-9_\\-./]*)*\\.({}))[\\x60\\x27\"]",
            EXTENSIONS
        );
        Regex::new(&pattern).expect("Invalid quoted path regex pattern")
    });

    // Pattern 3: Standalone file paths (paths that look like file paths)
    // Must have at least one directory separator or start with a common prefix
    // e.g., "src/main.rs", "crates/ralph-core/src/lib.rs", "tests/integration/*.rs"
    static STANDALONE_PATTERN: OnceLock<Regex> = OnceLock::new();
    let standalone_pattern = STANDALONE_PATTERN.get_or_init(|| {
        let pattern = format!(
            "(?m)(?:^|[^\\w/])([a-zA-Z][a-zA-Z0-9_\\-.]*(?:/[a-zA-Z0-9_\\-.*]+)+\\.({}))(?:[^\\w/]|$)",
            EXTENSIONS
        );
        Regex::new(&pattern).expect("Invalid standalone path regex pattern")
    });

    let mut paths = Vec::new();

    // Extract from action patterns
    for caps in action_pattern.captures_iter(text) {
        if let Some(path) = caps.get(1) {
            let path_str = path.as_str().to_string();
            if !paths.contains(&path_str) {
                paths.push(path_str);
            }
        }
    }

    // Extract from quoted patterns
    for caps in quoted_pattern.captures_iter(text) {
        if let Some(path) = caps.get(1) {
            let path_str = path.as_str().to_string();
            if !paths.contains(&path_str) {
                paths.push(path_str);
            }
        }
    }

    // Extract from standalone patterns
    for caps in standalone_pattern.captures_iter(text) {
        if let Some(path) = caps.get(1) {
            let path_str = path.as_str().to_string();
            if !paths.contains(&path_str) {
                paths.push(path_str);
            }
        }
    }

    paths
}

/// Extracts modified file paths from git diff for a specific loop.
///
/// This function runs `git diff --name-only` in the worktree directory
/// to get a list of files that have been modified by the agent.
///
/// # Arguments
/// * `loop_id` - The loop identifier to look up the worktree path
/// * `repo_root` - The repository root path
///
/// # Returns
/// Vector of modified file paths (relative to repo root), or empty vector on error
///
/// # Errors
/// Returns an empty vector if:
/// - Loop entry not found in registry
/// - Git command fails
/// - Worktree path is invalid
pub fn extract_files_from_git_diff(loop_id: &LoopId, repo_root: &Path) -> Vec<String> {
    use crate::loop_registry::LoopRegistry;

    // Load loop registry to find worktree path
    let registry = match LoopRegistry::new(repo_root).get(loop_id) {
        Ok(Some(entry)) => entry,
        Ok(None) => {
            warn!("Loop {} not found in registry", loop_id);
            return Vec::new();
        }
        Err(e) => {
            warn!("Failed to read loop registry: {}", e);
            return Vec::new();
        }
    };

    // Determine working directory (worktree or main repo)
    let work_dir = match registry.worktree_path {
        Some(ref wt_path) => PathBuf::from(wt_path),
        None => repo_root.to_path_buf(),
    };

    // Run git diff --name-only
    let output = match std::process::Command::new("git")
        .args(["diff", "--name-only"])
        .current_dir(&work_dir)
        .output()
    {
        Ok(output) => output,
        Err(e) => {
            warn!("Failed to run git diff: {}", e);
            return Vec::new();
        }
    };

    // Parse output
    if !output.status.success() {
        warn!(
            "git diff failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        return Vec::new();
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .filter(|line| !line.is_empty())
        .map(|s| s.to_string())
        .collect()
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

    // ========== extract_file_paths Tests ==========

    #[test]
    fn test_extract_file_paths_action_edit() {
        let text = "Edit src/auth.rs to add login functionality";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/auth.rs");
    }

    #[test]
    fn test_extract_file_paths_action_modify() {
        let text = "Modify tests/*.rs to update test cases";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "tests/*.rs");
    }

    #[test]
    fn test_extract_file_paths_action_update() {
        let text = "Update crates/ralph-core/src/**/*.rs files";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "crates/ralph-core/src/**/*.rs");
    }

    #[test]
    fn test_extract_file_paths_quoted_backtick() {
        let text = "Work on `src/main.rs` and `lib.rs`";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/main.rs".to_string()));
        assert!(paths.contains(&"lib.rs".to_string()));
    }

    #[test]
    fn test_extract_file_paths_quoted_double() {
        let text = "Read \"config.toml\" for settings";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "config.toml");
    }

    #[test]
    fn test_extract_file_paths_quoted_single() {
        let text = "Check 'package.json' for dependencies";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "package.json");
    }

    #[test]
    fn test_extract_file_paths_standalone() {
        let text = "The file src/models/user.rs needs updating";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/models/user.rs");
    }

    #[test]
    fn test_extract_file_paths_multiple_occurrences() {
        let text = "Edit src/auth.rs and modify src/main.rs";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/auth.rs".to_string()));
        assert!(paths.contains(&"src/main.rs".to_string()));
    }

    #[test]
    fn test_extract_file_paths_deduplicates() {
        let text = "Edit src/auth.rs, fix src/auth.rs bugs, update src/auth.rs docs";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/auth.rs");
    }

    #[test]
    fn test_extract_file_paths_various_extensions() {
        let text = "Edit src/main.rs, update Cargo.toml, fix README.md";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 3);
        assert!(paths.contains(&"src/main.rs".to_string()));
        assert!(paths.contains(&"Cargo.toml".to_string()));
        assert!(paths.contains(&"README.md".to_string()));
    }

    #[test]
    fn test_extract_file_paths_case_insensitive_verbs() {
        let text = "EDIT src/auth.rs and Fix src/main.rs";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/auth.rs".to_string()));
        assert!(paths.contains(&"src/main.rs".to_string()));
    }

    #[test]
    fn test_extract_file_paths_yaml_yml() {
        let text = "Update config.yml and modify settings.yaml";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"config.yml".to_string()));
        assert!(paths.contains(&"settings.yaml".to_string()));
    }

    #[test]
    fn test_extract_file_paths_tsx_jsx() {
        let text = "Edit components/Header.tsx and utils/Button.jsx";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"components/Header.tsx".to_string()));
        assert!(paths.contains(&"utils/Button.jsx".to_string()));
    }

    #[test]
    fn test_extract_file_paths_no_matches() {
        let text = "This is just random text without file paths";
        let paths = extract_file_paths(text);
        assert!(paths.is_empty());
    }

    #[test]
    fn test_extract_file_paths_complex_glob() {
        let text = "Update all files in src/**/*.rs pattern";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/**/*.rs");
    }

    #[test]
    fn test_extract_file_paths_multiple_patterns() {
        let text = "Edit src/auth/*.rs and tests/integration/**/*.rs";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/auth/*.rs".to_string()));
        assert!(paths.contains(&"tests/integration/**/*.rs".to_string()));
    }

    #[test]
    fn test_extract_file_paths_refactor_verb() {
        let text = "Refactor src/lib.rs to improve performance";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/lib.rs");
    }

    #[test]
    fn test_extract_file_paths_create_verb() {
        let text = "Create new file src/api/routes.rs";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/api/routes.rs");
    }

    #[test]
    fn test_extract_file_paths_delete_verb() {
        let text = "Delete old file src/deprecated/legacy.rs";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "src/deprecated/legacy.rs");
    }

    // ========== extract_files_from_git_diff Tests ==========

    #[test]
    fn test_extract_files_from_git_diff_loop_not_found() {
        let tmp = TempDir::new().unwrap();
        let result = extract_files_from_git_diff(&"nonexistent-loop".to_string(), tmp.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_extract_files_from_git_diff_no_git_repo() {
        use crate::loop_registry::{LoopEntry, LoopRegistry};

        let tmp = TempDir::new().unwrap();
        let registry = LoopRegistry::new(tmp.path());

        // Create a loop entry without a git repo
        let entry = LoopEntry::with_workspace(
            "test prompt",
            None::<String>,
            tmp.path().display().to_string(),
        );
        let loop_id = registry.register(entry).unwrap();

        // Should return empty vector since there's no git repo
        let result = extract_files_from_git_diff(&loop_id, tmp.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_team_task_with_description_extracts_files() {
        let task = TeamTask::new("Test task".to_string(), "team-123".to_string(), 2)
            .with_description(Some("Edit src/auth.rs and modify tests/*.rs".to_string()));

        assert!(task.extracted_files.is_some());
        let files = task.extracted_files.unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.contains(&"src/auth.rs".to_string()));
        assert!(files.contains(&"tests/*.rs".to_string()));
    }

    #[test]
    fn test_team_task_with_description_no_files() {
        let task = TeamTask::new("Test task".to_string(), "team-123".to_string(), 2)
            .with_description(Some("Just a description without file paths".to_string()));

        assert!(task.extracted_files.is_none());
    }

    #[test]
    fn test_team_task_with_description_none() {
        let task = TeamTask::new("Test task".to_string(), "team-123".to_string(), 2)
            .with_description(None);

        assert!(task.extracted_files.is_none());
    }

    #[test]
    fn test_team_task_with_extracted_files_from_git_diff() {
        use crate::loop_registry::{LoopEntry, LoopRegistry};

        let tmp = TempDir::new().unwrap();
        let registry = LoopRegistry::new(tmp.path());

        // Create a loop entry
        let entry = LoopEntry::with_workspace(
            "test prompt",
            None::<String>,
            tmp.path().display().to_string(),
        );
        let loop_id = registry.register(entry).unwrap();

        // Create a task and assign it to the loop
        let mut task = TeamTask::new("Test task".to_string(), "team-123".to_string(), 2);
        task.assigned_to = Some(loop_id);

        // Try to extract from git diff (will be empty since no git repo)
        let task = task.with_extracted_files_from_git_diff(tmp.path());

        // Should remain None since no git repo exists
        assert!(task.extracted_files.is_none());
    }

    #[test]
    fn test_team_task_extracted_files_preserves_existing() {
        // Task with files already extracted from description
        let task = TeamTask::new("Test task".to_string(), "team-123".to_string(), 2)
            .with_description(Some("Edit src/auth.rs".to_string()));

        assert!(task.extracted_files.is_some());
        let original_files = task.extracted_files.clone();

        // Try to extract from git diff (should preserve existing)
        let tmp = TempDir::new().unwrap();
        let task = task.with_extracted_files_from_git_diff(tmp.path());

        // Should preserve the original files
        assert_eq!(task.extracted_files, original_files);
    }

    // ========== Conflict Detection Integration Tests ==========

    #[test]
    fn test_claim_task_with_conflict_detection_no_conflicts() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/main.rs".to_string()));
        let task_id = store.create_team_task(task);

        // Claim should succeed without conflicts
        let result = store.claim_task(&task_id, "loop-123".to_string());
        assert!(result.is_ok());

        let task = store.get_task(&task_id).unwrap();
        assert_eq!(task.status, TeamTaskStatus::InProgress);
    }

    #[test]
    fn test_claim_task_with_conflict_detection_logs_warnings() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // First task reserves a file
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/main.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-123".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-123".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        // Second task wants the same file
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 2)
            .with_description(Some("Modify src/main.rs".to_string()));
        let task2_id = store.create_team_task(task2);

        // Claim should succeed but log warnings (not block)
        let result = store.claim_task(&task2_id, "loop-456".to_string());
        assert!(result.is_ok());

        let task2 = store.get_task(&task2_id).unwrap();
        assert_eq!(task2.status, TeamTaskStatus::InProgress);
    }

    #[test]
    fn test_claim_task_no_extracted_files_skips_conflict_check() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Task without file paths
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 1);
        assert!(task.extracted_files.is_none());
        let task_id = store.create_team_task(task);

        // Claim should succeed without conflict check
        let result = store.claim_task(&task_id, "loop-123".to_string());
        assert!(result.is_ok());
    }

    #[test]
    fn test_claim_task_with_multiple_conflicts() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // First task reserves multiple files
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/main.rs and src/lib.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-123".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-123".to_string(),
                vec!["src/main.rs".to_string(), "src/lib.rs".to_string()],
            )
            .unwrap();

        // Second task wants both files
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 2)
            .with_description(Some("Modify src/main.rs and src/lib.rs".to_string()));
        let task2_id = store.create_team_task(task2);

        // Claim should succeed with multiple conflict warnings
        let result = store.claim_task(&task2_id, "loop-456".to_string());
        assert!(result.is_ok());
    }

    #[test]
    fn test_emit_conflict_event_creates_event_file() {
        let (mut store, tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create and reserve files for task1
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/main.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-123".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-123".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        // Create task2 that conflicts
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 2)
            .with_description(Some("Modify src/main.rs".to_string()));
        let task2_id = store.create_team_task(task2);

        // Claim task2 (should emit event)
        store.claim_task(&task2_id, "loop-456".to_string()).unwrap();

        // Check that events file was created
        let events_path = tmp.path().join("events.jsonl");
        assert!(events_path.exists());

        // Read and parse the event
        let content = std::fs::read_to_string(&events_path).unwrap();
        let event: serde_json::Value = serde_json::from_str(&content).unwrap();

        assert_eq!(event["type"], "conflict_detected");
        assert_eq!(event["task_id"], task2_id);
        assert_eq!(event["loop_id"], "loop-456");
        assert!(event["conflicts"].is_array());
        assert_eq!(event["conflicts"].as_array().unwrap().len(), 1);
    }

    // ========== Concurrent Reservation Tests ==========

    #[test]
    fn test_concurrent_reservations_non_overlapping_files() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create multiple tasks with non-overlapping file paths
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/auth.rs".to_string()));
        let task1_id = store.create_team_task(task1);

        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/database.rs".to_string()));
        let task2_id = store.create_team_task(task2);

        let task3 = TeamTask::new("Task 3".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/utils.rs".to_string()));
        let task3_id = store.create_team_task(task3);

        // All three agents should be able to claim and reserve their files without conflicts
        store.claim_task(&task1_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-1".to_string(),
                vec!["src/auth.rs".to_string()],
            )
            .unwrap();

        store.claim_task(&task2_id, "loop-2".to_string()).unwrap();
        store
            .reserve_files(
                task2_id.clone(),
                "loop-2".to_string(),
                vec!["src/database.rs".to_string()],
            )
            .unwrap();

        store.claim_task(&task3_id, "loop-3".to_string()).unwrap();
        store
            .reserve_files(
                task3_id.clone(),
                "loop-3".to_string(),
                vec!["src/utils.rs".to_string()],
            )
            .unwrap();

        // Verify all reservations exist
        assert!(store.reservations.contains_key(&task1_id));
        assert!(store.reservations.contains_key(&task2_id));
        assert!(store.reservations.contains_key(&task3_id));
    }

    #[test]
    fn test_release_reservation_allows_new_claim() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create a task with a file
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/main.rs".to_string()));
        let task1_id = store.create_team_task(task1);

        // Agent 1 claims the task and reserves the file
        store.claim_task(&task1_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-1".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();
        assert!(store.reservations.contains_key(&task1_id));

        // Release the task
        store
            .release_task(&task1_id, &"loop-1".to_string())
            .unwrap();
        assert!(!store.reservations.contains_key(&task1_id));

        // Create another task with the same file
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1)
            .with_description(Some("Modify src/main.rs".to_string()));
        let task2_id = store.create_team_task(task2);

        // Agent 2 should now be able to claim and reserve without conflict
        store.claim_task(&task2_id, "loop-2".to_string()).unwrap();
        store
            .reserve_files(
                task2_id.clone(),
                "loop-2".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();
        assert!(store.reservations.contains_key(&task2_id));
    }

    #[test]
    fn test_reservations_persist_across_reload() {
        let (mut store, tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create and claim a task
        let task = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/main.rs".to_string()));
        let task_id = store.create_team_task(task);
        store.claim_task(&task_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task_id.clone(),
                "loop-1".to_string(),
                vec!["src/main.rs".to_string()],
            )
            .unwrap();

        // Verify reservation exists
        assert!(store.reservations.contains_key(&task_id));

        // Save and reload
        store.save().unwrap();
        let reloaded_store = TeamStore::load(tmp.path()).unwrap();

        // Verify reservation persisted
        assert!(reloaded_store.reservations.contains_key(&task_id));
        let reservation = &reloaded_store.reservations[&task_id];
        assert_eq!(reservation.task_id, task_id);
        assert_eq!(reservation.loop_id, "loop-1");
        assert!(reservation.file_paths.contains(&"src/main.rs".to_string()));
    }

    #[test]
    fn test_glob_conflict_with_exact_path() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Agent 1 reserves a glob pattern
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/**/*.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-1".to_string(),
                vec!["src/**/*.rs".to_string()],
            )
            .unwrap();

        // Agent 2 tries to reserve an exact file that matches the glob
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1)
            .with_description(Some("Modify src/auth.rs".to_string()));
        let _task2_id = store.create_team_task(task2);

        // Check for conflicts before claiming
        let conflicts = store.check_conflicts(&["src/auth.rs".to_string()]);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].file_path, "src/auth.rs");
        assert_eq!(conflicts[0].severity, ConflictSeverity::High);
    }

    #[test]
    fn test_exact_path_conflicts_with_glob_reservation() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Agent 1 reserves an exact file
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/auth.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-1".to_string(),
                vec!["src/auth.rs".to_string()],
            )
            .unwrap();

        // Agent 2 tries to reserve a glob that would match Agent 1's file
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1)
            .with_description(Some("Modify src/**/*.rs".to_string()));
        let _task2_id = store.create_team_task(task2);

        // Check for conflicts before claiming
        let conflicts = store.check_conflicts(&["src/**/*.rs".to_string()]);
        assert_eq!(conflicts.len(), 1);
        // The conflict should be on src/auth.rs since it matches the glob
        assert_eq!(conflicts[0].file_path, "src/**/*.rs");
    }

    #[test]
    fn test_multiple_concurrent_conflicts_different_files() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Agent 1 reserves multiple files
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/auth.rs and src/database.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-1".to_string(),
                vec!["src/auth.rs".to_string(), "src/database.rs".to_string()],
            )
            .unwrap();

        // Agent 2 reserves a different file
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/utils.rs".to_string()));
        let task2_id = store.create_team_task(task2);
        store.claim_task(&task2_id, "loop-2".to_string()).unwrap();
        store
            .reserve_files(
                task2_id.clone(),
                "loop-2".to_string(),
                vec!["src/utils.rs".to_string()],
            )
            .unwrap();

        // Agent 3 tries to reserve files that conflict with both Agent 1 and Agent 2
        let task3 = TeamTask::new("Task 3".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit src/auth.rs and src/utils.rs".to_string()));
        let _task3_id = store.create_team_task(task3);

        // Check for conflicts
        let conflicts =
            store.check_conflicts(&["src/auth.rs".to_string(), "src/utils.rs".to_string()]);
        assert_eq!(conflicts.len(), 2);

        // Both should be High severity (one conflicting agent each)
        assert_eq!(conflicts[0].severity, ConflictSeverity::High);
        assert_eq!(conflicts[1].severity, ConflictSeverity::High);
    }

    #[test]
    fn test_concurrent_glob_reservations_same_pattern() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Agent 1 reserves a glob pattern
        let task1 = TeamTask::new("Task 1".to_string(), team_id.clone(), 1)
            .with_description(Some("Edit tests/*.rs".to_string()));
        let task1_id = store.create_team_task(task1);
        store.claim_task(&task1_id, "loop-1".to_string()).unwrap();
        store
            .reserve_files(
                task1_id.clone(),
                "loop-1".to_string(),
                vec!["tests/*.rs".to_string()],
            )
            .unwrap();

        // Agent 2 tries to reserve the same glob pattern
        let task2 = TeamTask::new("Task 2".to_string(), team_id.clone(), 1)
            .with_description(Some("Modify tests/*.rs".to_string()));
        let _task2_id = store.create_team_task(task2);

        // Check for conflicts - should conflict since they're the same pattern
        let conflicts = store.check_conflicts(&["tests/*.rs".to_string()]);
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].severity, ConflictSeverity::High);
    }

    #[test]
    fn test_file_extraction_with_backticks() {
        let text = "Work on `src/main.rs` and `lib.rs`";
        let paths = extract_file_paths(text);
        assert_eq!(paths.len(), 2);
        assert!(paths.contains(&"src/main.rs".to_string()));
        assert!(paths.contains(&"lib.rs".to_string()));
    }

    #[test]
    fn test_record_task_completion_basic() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 2);
        let task_id = store.create_team_task(task);

        // Record completion
        store
            .record_task_completion(&task_id, "loop-123", &team_id, 2)
            .unwrap();

        // Verify completion was recorded
        assert_eq!(store.completions.len(), 1);
        let completion = &store.completions[0];
        assert_eq!(completion.task_id, task_id);
        assert_eq!(completion.teammate_id, "loop-123");
        assert_eq!(completion.team_id, team_id);
        assert_eq!(completion.priority, 2);
        assert!(completion.started_at.is_none()); // No timing since task wasn't claimed
    }

    #[test]
    fn test_record_task_completion_with_timing() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);

        // Claim task (sets claimed_at)
        store.claim_task(&task_id, "loop-456".to_string()).unwrap();

        // Mark as done (sets completed_at)
        store
            .update_task_status(&task_id, TeamTaskStatus::Done)
            .unwrap();

        // Record completion
        store
            .record_task_completion(&task_id, "loop-456", &team_id, 1)
            .unwrap();

        // Verify completion with timing
        assert_eq!(store.completions.len(), 1);
        let completion = &store.completions[0];
        assert_eq!(completion.task_id, task_id);
        assert_eq!(completion.teammate_id, "loop-456");
        assert!(completion.started_at.is_some());
        assert!(completion.completion_time_secs().is_some());
    }

    #[test]
    fn test_record_task_completion_persists() {
        let (mut store, tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        let task = TeamTask::new("Test Task".to_string(), team_id.clone(), 3);
        let task_id = store.create_team_task(task);

        // Record completion
        store
            .record_task_completion(&task_id, "loop-789", &team_id, 3)
            .unwrap();

        // Reload store from disk
        let reloaded_store = TeamStore::load(tmp.path()).unwrap();

        // Verify completion persisted
        assert_eq!(reloaded_store.completions.len(), 1);
        let completion = &reloaded_store.completions[0];
        assert_eq!(completion.task_id, task_id);
        assert_eq!(completion.teammate_id, "loop-789");
        assert_eq!(completion.priority, 3);
    }

    #[test]
    fn test_record_multiple_completions() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create and complete multiple tasks
        for i in 1..=3 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), i);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, &format!("loop-{}", i), &team_id, i)
                .unwrap();
        }

        // Verify all completions recorded
        assert_eq!(store.completions.len(), 3);
        for (i, completion) in store.completions.iter().enumerate() {
            let idx = i + 1;
            assert_eq!(completion.task_id.starts_with("task-"), true);
            assert_eq!(completion.teammate_id, format!("loop-{}", idx));
            assert_eq!(completion.priority, idx as u8);
        }
    }

    // ========== Velocity Metrics Tests ==========

    #[test]
    fn test_calculate_velocity_metrics_empty_team() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        let stats = store.calculate_velocity_metrics(&team_id).unwrap();

        assert_eq!(stats.team_id, team_id);
        assert_eq!(stats.team_metrics.total_completed, 0);
        assert_eq!(stats.team_metrics.velocity, 0.0);
        assert!(stats.teammate_metrics.is_empty());
    }

    #[test]
    fn test_calculate_velocity_metrics_with_completions() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create and complete tasks
        for i in 1..=3 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-123", &team_id, 1)
                .unwrap();
        }

        let stats = store.calculate_velocity_metrics(&team_id).unwrap();

        assert_eq!(stats.team_id, team_id);
        assert_eq!(stats.team_metrics.total_completed, 3);
        assert!(stats.team_metrics.velocity > 0.0);
        assert_eq!(stats.teammate_metrics.len(), 1);
        assert_eq!(stats.teammate_metrics[0].total_completed, 3);
    }

    #[test]
    fn test_calculate_velocity_metrics_team_not_found() {
        let (store, _tmp) = create_test_store();

        let result = store.calculate_velocity_metrics("nonexistent-team");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_calculate_teammate_velocity() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create, assign, and complete tasks
        for i in 1..=5 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store.claim_task(&task_id, "loop-123".to_string()).unwrap();
            store
                .record_task_completion(&task_id, "loop-123", &team_id, 1)
                .unwrap();
        }

        let metrics = store
            .calculate_teammate_velocity(&team_id, "loop-123")
            .unwrap();

        assert_eq!(metrics.id, "loop-123");
        assert_eq!(metrics.total_completed, 5);
        assert_eq!(metrics.scope, VelocityScope::Teammate);
        assert!(metrics.velocity > 0.0);
        assert!(metrics.completion_rate > 0.0);
    }

    #[test]
    fn test_calculate_teammate_velocity_no_completions() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-456".to_string())
            .unwrap();

        let metrics = store
            .calculate_teammate_velocity(&team_id, "loop-456")
            .unwrap();

        assert_eq!(metrics.total_completed, 0);
        assert_eq!(metrics.velocity, 0.0);
    }

    #[test]
    fn test_calculate_teammate_velocity_team_not_found() {
        let (store, _tmp) = create_test_store();

        let result = store.calculate_teammate_velocity("nonexistent", "loop-123");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_calculate_teammate_velocity_teammate_not_found() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        let result = store.calculate_teammate_velocity(&team_id, "loop-999");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_get_velocity_history_empty() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        let history = store.get_velocity_history(&team_id, 24).unwrap();

        assert_eq!(history.len(), 24);
        // All velocities should be 0.0 (no completions)
        for (_, velocity) in &history {
            assert_eq!(*velocity, 0.0);
        }
    }

    #[test]
    fn test_get_velocity_history_with_completions() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create and complete 2 tasks (will be in the last hour)
        for i in 1..=2 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-123", &team_id, 1)
                .unwrap();
        }

        let history = store.get_velocity_history(&team_id, 24).unwrap();

        assert_eq!(history.len(), 24);
        // Most recent hour should have velocity of 2.0
        let (_, latest_velocity) = history.last().unwrap();
        assert_eq!(*latest_velocity, 2.0);
    }

    #[test]
    fn test_get_velocity_history_team_not_found() {
        let (store, _tmp) = create_test_store();

        let result = store.get_velocity_history("nonexistent", 24);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_get_velocity_history_chronological_order() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        let history = store.get_velocity_history(&team_id, 5).unwrap();

        assert_eq!(history.len(), 5);
        // Verify timestamps are in chronological order (oldest first)
        for i in 0..history.len() - 1 {
            let current = &history[i].0;
            let next = &history[i + 1].0;
            assert!(current < next);
        }
    }

    // ========== Prediction Tests ==========

    #[test]
    fn test_predict_remaining_work_no_tasks() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Complete one task to establish velocity
        let task = TeamTask::new("Task 1".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store
            .update_task_status(&task_id, TeamTaskStatus::Done)
            .unwrap();
        store
            .record_task_completion(&task_id, "loop-123", &team_id, 1)
            .unwrap();

        let remaining = store.predict_remaining_work(&team_id).unwrap();
        assert_eq!(remaining, 0.0);
    }

    #[test]
    fn test_predict_remaining_work_with_tasks() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Complete 3 tasks quickly to establish velocity
        for i in 1..=3 {
            let task = TeamTask::new(format!("Completed {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-123", &team_id, 1)
                .unwrap();
        }

        // Create 2 open tasks
        for i in 1..=2 {
            let task = TeamTask::new(format!("Open {}", i), team_id.clone(), 1);
            store.create_team_task(task);
        }

        let remaining = store.predict_remaining_work(&team_id).unwrap();
        // Should return a positive number of seconds
        assert!(remaining > 0.0);
    }

    #[test]
    fn test_predict_remaining_work_no_velocity() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create open task without any completions
        let task = TeamTask::new("Open Task".to_string(), team_id.clone(), 1);
        store.create_team_task(task);

        let result = store.predict_remaining_work(&team_id);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_predict_remaining_work_team_not_found() {
        let (store, _tmp) = create_test_store();

        let result = store.predict_remaining_work("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_predict_completion_date_in_progress() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create completed task to establish velocity
        let completed_task = TeamTask::new("Completed".to_string(), team_id.clone(), 1);
        let completed_id = store.create_team_task(completed_task);
        store
            .record_task_completion(&completed_id, "loop-123", &team_id, 1)
            .unwrap();

        // Create in-progress task
        let mut task = TeamTask::new("In Progress".to_string(), team_id.clone(), 1);
        task.status = TeamTaskStatus::InProgress;
        let task_id = store.create_team_task(task);

        let prediction = store.predict_completion_date(&task_id).unwrap();
        // Should return a valid timestamp
        assert!(chrono::DateTime::parse_from_rfc3339(&prediction).is_ok());
    }

    #[test]
    fn test_predict_completion_date_todo() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create completed task to establish velocity
        let completed_task = TeamTask::new("Completed".to_string(), team_id.clone(), 1);
        let completed_id = store.create_team_task(completed_task);
        store
            .record_task_completion(&completed_id, "loop-123", &team_id, 1)
            .unwrap();

        // Create todo task
        let task = TeamTask::new("Todo Task".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);

        let prediction = store.predict_completion_date(&task_id).unwrap();
        // Should return a valid timestamp
        assert!(chrono::DateTime::parse_from_rfc3339(&prediction).is_ok());
    }

    #[test]
    fn test_predict_completion_date_done() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create a completed task to establish velocity
        let completed_task = TeamTask::new("Velocity Task".to_string(), team_id.clone(), 1);
        let completed_id = store.create_team_task(completed_task);
        store
            .record_task_completion(&completed_id, "loop-123", &team_id, 1)
            .unwrap();

        // Create and complete a task
        let mut task = TeamTask::new("Done Task".to_string(), team_id.clone(), 1);
        task.status = TeamTaskStatus::Done;
        task.completed_at = Some(chrono::Utc::now().to_rfc3339());
        let task_id = store.create_team_task(task);

        let prediction = store.predict_completion_date(&task_id).unwrap();
        // Should return the completed_at timestamp
        assert!(chrono::DateTime::parse_from_rfc3339(&prediction).is_ok());
    }

    #[test]
    fn test_predict_completion_date_review() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create completed task to establish velocity
        let completed_task = TeamTask::new("Completed".to_string(), team_id.clone(), 1);
        let completed_id = store.create_team_task(completed_task);
        store
            .record_task_completion(&completed_id, "loop-123", &team_id, 1)
            .unwrap();

        // Create review task
        let mut task = TeamTask::new("Review Task".to_string(), team_id.clone(), 1);
        task.status = TeamTaskStatus::Review;
        let task_id = store.create_team_task(task);

        let prediction = store.predict_completion_date(&task_id).unwrap();
        // Should return a valid timestamp (estimated 1 hour for review)
        assert!(chrono::DateTime::parse_from_rfc3339(&prediction).is_ok());
    }

    #[test]
    fn test_predict_completion_date_task_not_found() {
        let (store, _tmp) = create_test_store();

        let result = store.predict_completion_date("nonexistent-task");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_predict_completion_date_no_velocity() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());

        // Create task without any completions
        let task = TeamTask::new("Task".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);

        let result = store.predict_completion_date(&task_id);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_extrapolate_velocity_trend_stable() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create consistent completions (stable velocity)
        for i in 0..24 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-123", &team_id, 1)
                .unwrap();
        }

        let trend = store.extrapolate_velocity_trend(&team_id).unwrap();
        // Trend should be relatively stable (close to 0)
        assert!(trend.abs() < 1.0);
    }

    #[test]
    fn test_extrapolate_velocity_trend_team_not_found() {
        let (store, _tmp) = create_test_store();

        let result = store.extrapolate_velocity_trend("nonexistent");
        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_velocity_metrics_time_windows() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store
            .add_teammate(&team_id, "loop-123".to_string())
            .unwrap();

        // Create multiple completions
        for i in 1..=10 {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-123", &team_id, 1)
                .unwrap();
        }

        let metrics = store
            .calculate_teammate_velocity(&team_id, "loop-123")
            .unwrap();

        // All 10 completions should be in the last hour/24h/7d
        assert_eq!(metrics.tasks_last_hour, 10);
        assert_eq!(metrics.tasks_last_24h, 10);
        assert_eq!(metrics.tasks_last_7d, 10);
        assert_eq!(metrics.total_completed, 10);
    }

    #[test]
    fn test_team_velocity_stats_aggregation() {
        let (mut store, _tmp) = create_test_store();

        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();
        store.add_teammate(&team_id, "loop-2".to_string()).unwrap();

        // Complete 3 tasks for each teammate
        for teammate in &["loop-1", "loop-2"] {
            for i in 1..=3 {
                let task = TeamTask::new(format!("Task {}-{}", teammate, i), team_id.clone(), 1);
                let task_id = store.create_team_task(task);
                store
                    .record_task_completion(&task_id, teammate, &team_id, 1)
                    .unwrap();
            }
        }

        let stats = store.calculate_velocity_metrics(&team_id).unwrap();

        // Team should have aggregated metrics from both teammates
        assert_eq!(stats.team_metrics.total_completed, 6);
        assert_eq!(stats.teammate_metrics.len(), 2);

        // Each teammate should have 3 completions
        for teammate_metrics in &stats.teammate_metrics {
            assert_eq!(teammate_metrics.total_completed, 3);
        }
    }

    // ========== Velocity Metrics Tests ==========

    #[test]
    fn test_velocity_metrics_new() {
        let metrics = VelocityMetrics::new("test-id".to_string(), VelocityScope::Team);

        assert_eq!(metrics.id, "test-id");
        assert_eq!(metrics.scope, VelocityScope::Team);
        assert_eq!(metrics.tasks_last_hour, 0);
        assert_eq!(metrics.tasks_last_24h, 0);
        assert_eq!(metrics.tasks_last_7d, 0);
        assert_eq!(metrics.total_completed, 0);
        assert_eq!(metrics.avg_completion_time_secs, 0.0);
        assert_eq!(metrics.completion_rate, 0.0);
        assert_eq!(metrics.velocity, 0.0);
    }

    #[test]
    fn test_velocity_metrics_calculate_velocity_high_activity() {
        let mut metrics = VelocityMetrics::new("test".to_string(), VelocityScope::Team);
        metrics.tasks_last_hour = 10;
        metrics.tasks_last_24h = 50;
        metrics.tasks_last_7d = 200;

        let velocity = metrics.calculate_velocity();

        // Should prioritize last hour (50% weight)
        // 10 * 0.5 + (50/24) * 0.3 + (200/168) * 0.2
        // = 5.0 + 2.083 * 0.3 + 1.19 * 0.2
        // = 5.0 + 0.625 + 0.238
        assert!(velocity > 5.5 && velocity < 6.5);
    }

    #[test]
    fn test_velocity_metrics_calculate_velocity_moderate_activity() {
        let mut metrics = VelocityMetrics::new("test".to_string(), VelocityScope::Team);
        metrics.tasks_last_hour = 0;
        metrics.tasks_last_24h = 24;

        let velocity = metrics.calculate_velocity();

        // Should use 24h average
        assert_eq!(velocity, 1.0);
    }

    #[test]
    fn test_velocity_metrics_calculate_velocity_low_activity() {
        let mut metrics = VelocityMetrics::new("test".to_string(), VelocityScope::Team);
        metrics.tasks_last_hour = 0;
        metrics.tasks_last_24h = 0;
        metrics.tasks_last_7d = 168;

        let velocity = metrics.calculate_velocity();

        // Should use 7-day average
        assert_eq!(velocity, 1.0);
    }

    #[test]
    fn test_velocity_metrics_calculate_velocity_no_activity() {
        let metrics = VelocityMetrics::new("test".to_string(), VelocityScope::Team);

        let velocity = metrics.calculate_velocity();

        assert_eq!(velocity, 0.0);
    }

    #[test]
    fn test_task_completion_new() {
        let completion = TaskCompletion::new(
            "task-123".to_string(),
            "loop-456".to_string(),
            "team-789".to_string(),
            1,
        );

        assert_eq!(completion.task_id, "task-123");
        assert_eq!(completion.teammate_id, "loop-456");
        assert_eq!(completion.team_id, "team-789");
        assert_eq!(completion.priority, 1);
        assert!(completion.started_at.is_none());
        assert!(completion.complexity.is_none());
    }

    #[test]
    fn test_task_completion_new_with_start_time() {
        let started_at = chrono::Utc::now().to_rfc3339();
        let completion = TaskCompletion::with_timing(
            "task-123".to_string(),
            "loop-456".to_string(),
            "team-789".to_string(),
            1,
            started_at.clone(),
        );

        assert_eq!(completion.task_id, "task-123");
        assert_eq!(completion.started_at, Some(started_at));
    }

    #[test]
    fn test_task_completion_completion_time_secs() {
        let started_at = chrono::Utc::now() - chrono::Duration::seconds(3600);
        let mut completion = TaskCompletion::with_timing(
            "task-123".to_string(),
            "loop-456".to_string(),
            "team-789".to_string(),
            1,
            started_at.to_rfc3339(),
        );

        // Set completed_at to 1 hour after started_at
        completion.completed_at = (started_at + chrono::Duration::seconds(3600)).to_rfc3339();

        let time_secs = completion.completion_time_secs();

        assert_eq!(time_secs, Some(3600.0));
    }

    #[test]
    fn test_task_completion_completion_time_secs_no_start() {
        let completion = TaskCompletion::new(
            "task-123".to_string(),
            "loop-456".to_string(),
            "team-789".to_string(),
            1,
        );

        let time_secs = completion.completion_time_secs();

        assert_eq!(time_secs, None);
    }

    #[test]
    fn test_team_velocity_stats_new() {
        let teammate1 = VelocityMetrics::new("loop-1".to_string(), VelocityScope::Teammate);
        let teammate2 = VelocityMetrics::new("loop-2".to_string(), VelocityScope::Teammate);

        let stats = TeamVelocityStats::new("team-123".to_string(), vec![teammate1, teammate2]);

        assert_eq!(stats.team_id, "team-123");
        assert_eq!(stats.teammate_metrics.len(), 2);
        assert_eq!(stats.time_range, "P7D");
        assert_eq!(stats.team_metrics.scope, VelocityScope::Team);
    }

    #[test]
    fn test_team_velocity_stats_aggregate_empty() {
        let stats = TeamVelocityStats::new("team-123".to_string(), vec![]);

        assert_eq!(stats.team_metrics.total_completed, 0);
        assert_eq!(stats.team_metrics.velocity, 0.0);
    }

    #[test]
    fn test_calculate_velocity_metrics_single_teammate() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Create and complete a task
        let task = TeamTask::new("task-1".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store
            .record_task_completion(&task_id, "loop-1", &team_id, 1)
            .unwrap();

        let stats = store.calculate_velocity_metrics(&team_id).unwrap();

        assert_eq!(stats.teammate_metrics.len(), 1);
        assert_eq!(stats.teammate_metrics[0].total_completed, 1);
        assert_eq!(stats.team_metrics.total_completed, 1);
    }

    #[test]
    fn test_calculate_velocity_metrics_nonexistent_team() {
        let (store, _tmp) = create_test_store();

        let result = store.calculate_velocity_metrics("nonexistent");

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_calculate_teammate_velocity_with_completions() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Create and complete 3 tasks
        for i in 1..=3 {
            let task = TeamTask::new(format!("task-{}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-1", &team_id, 1)
                .unwrap();
        }

        let metrics = store
            .calculate_teammate_velocity(&team_id, "loop-1")
            .unwrap();

        assert_eq!(metrics.total_completed, 3);
        assert_eq!(metrics.id, "loop-1");
        assert_eq!(metrics.scope, VelocityScope::Teammate);
    }

    #[test]
    fn test_calculate_teammate_velocity_nonexistent_team() {
        let (store, _tmp) = create_test_store();

        let result = store.calculate_teammate_velocity("nonexistent", "loop-1");

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_calculate_teammate_velocity_nonexistent_teammate() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());

        let result = store.calculate_teammate_velocity(&team_id, "nonexistent");

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_get_velocity_history() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Create and complete a task
        let task = TeamTask::new("task-1".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store
            .record_task_completion(&task_id, "loop-1", &team_id, 1)
            .unwrap();

        let history = store.get_velocity_history(&team_id, 24).unwrap();

        // Should have at least one sample
        assert!(!history.is_empty());
    }

    #[test]
    fn test_get_velocity_history_nonexistent_team() {
        let (store, _tmp) = create_test_store();

        let result = store.get_velocity_history("nonexistent", 24);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_predict_remaining_work_with_completed_tasks() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Complete tasks and set them to Done status
        for i in 1..=10 {
            let task = TeamTask::new(format!("task-{}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store.claim_task(&task_id, "loop-1".to_string()).unwrap();
            store
                .update_task_status(&task_id, TeamTaskStatus::Done)
                .unwrap();
            store
                .record_task_completion(&task_id, "loop-1", &team_id, 1)
                .unwrap();
        }

        // Now there are 10 completed, 0 open
        let result = store.predict_remaining_work(&team_id);

        assert!(result.is_ok());
        // Should return 0 when no open tasks
        assert_eq!(result.unwrap(), 0.0);
    }

    #[test]
    fn test_predict_remaining_work_with_open_tasks() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Create 3 todo tasks
        for i in 1..=3 {
            let task = TeamTask::new(format!("task-{}", i), team_id.clone(), 1);
            store.create_team_task(task);
        }

        // Complete 1 task to establish velocity
        let task = TeamTask::new("task-done".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store
            .record_task_completion(&task_id, "loop-1", &team_id, 1)
            .unwrap();

        let result = store.predict_remaining_work(&team_id);

        assert!(result.is_ok());
        // Should predict > 0 seconds for 3 open tasks
        assert!(result.unwrap() > 0.0);
    }

    #[test]
    fn test_predict_remaining_work_nonexistent_team() {
        let (store, _tmp) = create_test_store();

        let result = store.predict_remaining_work("nonexistent");

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_predict_remaining_work_no_velocity_data() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Create todo task but don't complete anything (no velocity)
        let task = TeamTask::new("task-1".to_string(), team_id.clone(), 1);
        store.create_team_task(task);

        let result = store.predict_remaining_work(&team_id);

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::InvalidData);
    }

    #[test]
    fn test_predict_completion_date_done_task() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Create and complete a task
        let task = TeamTask::new("task-1".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store.claim_task(&task_id, "loop-1".to_string()).unwrap();
        store
            .update_task_status(&task_id, TeamTaskStatus::Done)
            .unwrap();
        store
            .record_task_completion(&task_id, "loop-1", &team_id, 1)
            .unwrap();

        let result = store.predict_completion_date(&task_id);

        assert!(result.is_ok());
        // Should return a timestamp string
        let predicted = result.unwrap();
        // Verify it's a non-empty timestamp string
        assert!(!predicted.is_empty());
        assert!(predicted.len() >= 10); // Minimum length for a date string
    }

    #[test]
    fn test_predict_completion_date_nonexistent_task() {
        let (store, _tmp) = create_test_store();

        let result = store.predict_completion_date("nonexistent");

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_extrapolate_velocity_trend() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        // Complete multiple tasks to establish trend
        for i in 1..=5 {
            let task = TeamTask::new(format!("task-{}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, "loop-1", &team_id, 1)
                .unwrap();
        }

        let result = store.extrapolate_velocity_trend(&team_id);

        assert!(result.is_ok());
        let slope = result.unwrap();
        // Should return a slope value (f64)
        // Slope can be positive, negative, or near zero
        assert!(slope.is_finite());
    }

    #[test]
    fn test_extrapolate_velocity_trend_nonexistent_team() {
        let (store, _tmp) = create_test_store();

        let result = store.extrapolate_velocity_trend("nonexistent");

        assert!(result.is_err());
        assert_eq!(result.unwrap_err().kind(), io::ErrorKind::NotFound);
    }

    #[test]
    fn test_record_task_completion_updates_completions() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        let initial_count = store.completions.len();

        let task = TeamTask::new("task-1".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store
            .record_task_completion(&task_id, "loop-1", &team_id, 1)
            .unwrap();

        assert_eq!(store.completions.len(), initial_count + 1);
    }

    #[test]
    fn test_record_task_completion_with_start_time() {
        let (mut store, _tmp) = create_test_store();
        let team_id = store.create_team("Test Team".to_string());
        store.add_teammate(&team_id, "loop-1".to_string()).unwrap();

        let task = TeamTask::new("task-1".to_string(), team_id.clone(), 1);
        let task_id = store.create_team_task(task);
        store.claim_task(&task_id, "loop-1".to_string()).unwrap();

        // Set completed_at on the task so record_task_completion extracts timing
        if let Some(task) = store.tasks.get_mut(&task_id) {
            task.completed_at = Some(chrono::Utc::now().to_rfc3339());
        }

        store
            .record_task_completion(&task_id, "loop-1", &team_id, 1)
            .unwrap();

        // Find the completion record
        let completion = store
            .completions
            .iter()
            .find(|c| c.task_id == task_id)
            .unwrap();

        assert!(completion.started_at.is_some());
        assert!(completion.completion_time_secs().is_some());
    }
}
