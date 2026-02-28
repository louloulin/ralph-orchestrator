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

/// A store for managing teams and team tasks with JSONL persistence.
pub struct TeamStore {
    teams_path: std::path::PathBuf,
    tasks_path: std::path::PathBuf,
    teams: HashMap<String, Team>,
    tasks: HashMap<String, TeamTask>,
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

        // Use lock file for coordination
        let lock_path = base_path.join("team_store.lock");
        let lock = FileLock::new(&lock_path)?;
        let _guard = lock.shared()?;

        let teams = Self::load_teams_from_file(&teams_path)?;
        let tasks = Self::load_tasks_from_file(&tasks_path)?;

        Ok(Self {
            teams_path,
            tasks_path,
            teams,
            tasks,
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
            if let Some(dep_task) = all_tasks.iter().find(|t| &t.id == dep_id) {
                if dep_task.status != TeamTaskStatus::Done {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("Task {} has unmet dependencies", task_id),
                    ));
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
}
