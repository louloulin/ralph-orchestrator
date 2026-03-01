//! Integration tests for `ralph team conflicts` and `ralph team check-files` CLI commands.

use ralph_core::TeamTask;
use std::process::Command;
use tempfile::TempDir;

fn ralph_team(temp_path: &std::path::Path, args: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_ralph"))
        .arg("team")
        .args(args)
        .arg("--root")
        .arg(temp_path)
        .current_dir(temp_path)
        .output()
        .expect("Failed to execute ralph team command")
}

fn ralph_team_ok(temp_path: &std::path::Path, args: &[&str]) -> String {
    let output = ralph_team(temp_path, args);
    assert!(
        output.status.success(),
        "Command 'ralph team {}' failed: {}",
        args.join(" "),
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn create_team_with_tasks(temp_path: &std::path::Path) -> (String, String, String) {
    // Create a team
    let stdout = ralph_team_ok(temp_path, &["create", "Test Team", "--format", "quiet"]);
    let team_id = stdout.trim().to_string();

    // Add teammates (simulated by creating loop marker files)
    let ralph_dir = temp_path.join(".ralph");
    std::fs::create_dir_all(&ralph_dir).expect("create .ralph");

    let loop1_id = "loop-2026-01-01-120000-abc1".to_string();
    let loop2_id = "loop-2026-01-01-120000-abc2".to_string();

    // Add tasks with file paths in description
    ralph_team_ok(
        temp_path,
        &[
            "add-task",
            &team_id,
            "Edit src/auth.rs for authentication",
            "-p",
            "1",
            "-d",
            "Modify src/auth.rs to add OAuth support",
            "--format",
            "quiet",
        ],
    );

    ralph_team_ok(
        temp_path,
        &[
            "add-task",
            &team_id,
            "Update src/lib.rs exports",
            "-p",
            "2",
            "-d",
            "Add new exports to src/lib.rs",
            "--format",
            "quiet",
        ],
    );

    // Add teammates to team
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .add_teammate(&team_id, loop1_id.clone())
        .expect("add teammate 1");
    store
        .add_teammate(&team_id, loop2_id.clone())
        .expect("add teammate 2");
    store.save().expect("save team store");

    (team_id, loop1_id, loop2_id)
}

#[test]
fn test_team_conflicts_no_conflicts() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, _loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Check conflicts - should show none since no tasks are claimed
    let stdout = ralph_team_ok(temp_path, &["conflicts", &team_id, "--format", "table"]);

    assert!(stdout.contains("No file conflicts detected"));
}

#[test]
fn test_team_conflicts_with_conflicts() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Reserve a file manually
    let ralph_dir = temp_path.join(".ralph");
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    // Create a task with extracted files
    let mut task = TeamTask::new("Test auth task".to_string(), team_id.clone(), 1);
    task.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task_id = task.id.clone();
    store.create_team_task(task);

    // Reserve the file
    store
        .reserve_files(
            task_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Now check conflicts - should show the conflict
    let stdout = ralph_team_ok(temp_path, &["conflicts", &team_id, "--format", "json"]);

    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON response");
    assert!(response["conflictCount"].as_u64().unwrap() >= 1);
}

#[test]
fn test_team_check_files_no_conflicts() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (_team_id, _loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Check specific files - should show no conflicts
    let stdout = ralph_team_ok(
        temp_path,
        &[
            "check-files",
            "--files",
            "src/main.rs,tests/test.rs",
            "--format",
            "table",
        ],
    );

    assert!(stdout.contains("No conflicts detected"));
    assert!(stdout.contains("src/main.rs"));
    assert!(stdout.contains("tests/test.rs"));
}

#[test]
fn test_team_check_files_with_conflicts() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Reserve a file
    let ralph_dir = temp_path.join(".ralph");
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    let mut task = TeamTask::new("Reserved task".to_string(), team_id.clone(), 1);
    task.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task_id = task.id.clone();
    store.create_team_task(task);
    store
        .reserve_files(
            task_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Check conflicts for the reserved file
    let stdout = ralph_team_ok(
        temp_path,
        &["check-files", "--files", "src/auth.rs", "--format", "json"],
    );

    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON response");
    assert!(response["conflictCount"].as_u64().unwrap() >= 1);

    // Check conflicts include the file
    let conflicts = response["conflicts"].as_array().unwrap();
    let has_auth_conflict = conflicts
        .iter()
        .any(|c| c["file_path"].as_str().unwrap() == "src/auth.rs");
    assert!(has_auth_conflict);
}

#[test]
fn test_team_check_files_quiet_format() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (_team_id, _loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Check files with quiet format - no conflicts
    let stdout = ralph_team_ok(
        temp_path,
        &["check-files", "-f", "src/main.rs", "--format", "quiet"],
    );

    // Quiet format should output nothing when no conflicts
    assert!(stdout.trim().is_empty());
}

#[test]
fn test_team_conflicts_json_format() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, _loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Check conflicts in JSON format
    let stdout = ralph_team_ok(temp_path, &["conflicts", &team_id, "--format", "json"]);

    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON response");
    assert!(response["teamId"].is_string());
    assert!(response["teamName"].is_string());
    assert!(response["conflictCount"].is_u64());
    assert!(response["conflicts"].is_array());
}

#[test]
fn test_team_check_files_no_files_error() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    // Try to check files without specifying any
    let output = ralph_team(temp_path, &["check-files", "--format", "table"]);

    // Should fail with error message
    assert!(!output.status.success());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(stderr.contains("No files specified") || stderr.contains("--files"));
}

#[test]
fn test_team_check_files_mixed_conflicts() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Reserve a file
    let ralph_dir = temp_path.join(".ralph");
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    let mut task = TeamTask::new("Reserved task".to_string(), team_id.clone(), 1);
    task.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task_id = task.id.clone();
    store.create_team_task(task);
    store
        .reserve_files(
            task_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Check multiple files - some conflicting, some safe
    let stdout = ralph_team_ok(
        temp_path,
        &[
            "check-files",
            "-f",
            "src/auth.rs",
            "-f",
            "src/main.rs",
            "-f",
            "tests/test.rs",
            "--format",
            "table",
        ],
    );

    // Should show both conflicts and safe files
    assert!(stdout.contains("src/auth.rs"));
    assert!(stdout.contains("Safe files"));
    assert!(stdout.contains("src/main.rs"));
}

// ============================================================================
// Conflict Prevention During Task Claim Tests
// ============================================================================

#[test]
fn test_claim_task_no_conflicts() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_with_tasks(temp_path);

    // Get task ID from the store
    let ralph_dir = temp_path.join(".ralph");
    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let tasks = store.get_team_tasks(&team_id);
    let task_id = tasks
        .iter()
        .find(|t| t.title.contains("auth"))
        .expect("find auth task")
        .id
        .clone();

    // Claim task - should succeed with no conflicts
    let _stdout = ralph_team_ok(
        temp_path,
        &["claim", &team_id, &task_id, "--loop-id", &loop1_id],
    );

    // Verify task is now claimed
    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let task = store.get_task(&task_id).expect("task exists");
    assert_eq!(task.assigned_to, Some(loop1_id));
}

#[test]
fn test_claim_task_with_conflict_warning() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, loop2_id) = create_team_with_tasks(temp_path);
    let ralph_dir = temp_path.join(".ralph");

    // First, reserve src/auth.rs with loop1
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    // Create a task with the same file and reserve it
    let mut task1 = TeamTask::new("Reserved auth task".to_string(), team_id.clone(), 1);
    task1.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task1_id = task1.id.clone();
    store.create_team_task(task1);
    store
        .reserve_files(
            task1_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Now try to claim another task that also edits src/auth.rs with loop2
    let tasks = store.get_team_tasks(&team_id);
    let auth_task = tasks
        .iter()
        .find(|t| t.title.contains("auth") && t.id != task1_id)
        .expect("find auth task");
    let auth_task_id = auth_task.id.clone();

    // Claim should still succeed (conflicts are warnings, not blockers)
    // but the conflict should be logged
    let _stdout = ralph_team_ok(
        temp_path,
        &["claim", &team_id, &auth_task_id, "--loop-id", &loop2_id],
    );

    // Verify task is claimed despite conflict
    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let task = store.get_task(&auth_task_id).expect("task exists");
    assert_eq!(task.assigned_to, Some(loop2_id));
}

#[test]
fn test_claim_task_glob_pattern_conflict() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, loop2_id) = create_team_with_tasks(temp_path);
    let ralph_dir = temp_path.join(".ralph");

    // Reserve a glob pattern with loop1
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    let mut task1 = TeamTask::new("Glob task".to_string(), team_id.clone(), 1);
    task1.extracted_files = Some(vec!["src/**/*.rs".to_string()]);
    let task1_id = task1.id.clone();
    store.create_team_task(task1);
    store
        .reserve_files(
            task1_id.clone(),
            loop1_id.clone(),
            vec!["src/**/*.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Create a new task that matches the glob pattern
    let mut task2 = TeamTask::new("Specific file task".to_string(), team_id.clone(), 2);
    task2.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task2_id = task2.id.clone();
    store.create_team_task(task2);
    store.save().expect("save store");

    // Claim the specific file task - should detect glob conflict
    let _stdout = ralph_team_ok(
        temp_path,
        &["claim", &team_id, &task2_id, "--loop-id", &loop2_id],
    );

    // Task should still be claimed (conflict is a warning)
    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let task = store.get_task(&task2_id).expect("task exists");
    assert_eq!(task.assigned_to, Some(loop2_id));
}

// ============================================================================
// Conflict Resolution Flow Tests
// ============================================================================

#[test]
fn test_release_reservation_clears_conflict() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_with_tasks(temp_path);
    let ralph_dir = temp_path.join(".ralph");

    // Reserve a file
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    let mut task = TeamTask::new("Reserved task".to_string(), team_id.clone(), 1);
    task.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task_id = task.id.clone();
    store.create_team_task(task);
    store
        .reserve_files(
            task_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Verify conflict exists
    let stdout = ralph_team_ok(
        temp_path,
        &["check-files", "--files", "src/auth.rs", "--format", "json"],
    );
    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON");
    assert!(response["conflictCount"].as_u64().unwrap() >= 1);

    // Release the reservation
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store.release_files(&task_id).expect("release files");
    store.save().expect("save store");

    // Verify conflict is cleared
    let stdout = ralph_team_ok(
        temp_path,
        &["check-files", "--files", "src/auth.rs", "--format", "json"],
    );
    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON");
    assert_eq!(response["conflictCount"].as_u64().unwrap(), 0);
}

#[test]
fn test_complete_task_releases_reservations() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_with_tasks(temp_path);
    let ralph_dir = temp_path.join(".ralph");

    // Create and claim a task with file reservation
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    let mut task = TeamTask::new("Task to complete".to_string(), team_id.clone(), 1);
    task.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task_id = task.id.clone();
    store.create_team_task(task);
    store
        .claim_task(&task_id, loop1_id.clone())
        .expect("claim task");
    store.save().expect("save store");

    // Reserve the files
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .reserve_files(
            task_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Verify conflict exists
    let stdout = ralph_team_ok(
        temp_path,
        &["check-files", "--files", "src/auth.rs", "--format", "json"],
    );
    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON");
    assert!(response["conflictCount"].as_u64().unwrap() >= 1);

    // Release the task (simulating task completion)
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .release_task(&task_id, &loop1_id)
        .expect("release task");
    store.save().expect("save store");

    // Verify conflict is cleared
    let stdout = ralph_team_ok(
        temp_path,
        &["check-files", "--files", "src/auth.rs", "--format", "json"],
    );
    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON");
    assert_eq!(response["conflictCount"].as_u64().unwrap(), 0);
}

#[test]
fn test_sequential_task_completion() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, loop2_id) = create_team_with_tasks(temp_path);
    let ralph_dir = temp_path.join(".ralph");

    // Agent 1 creates and reserves a task
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    let mut task1 = TeamTask::new("Agent 1 task".to_string(), team_id.clone(), 1);
    task1.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task1_id = task1.id.clone();
    store.create_team_task(task1);
    store
        .claim_task(&task1_id, loop1_id.clone())
        .expect("claim task1");
    store
        .reserve_files(
            task1_id.clone(),
            loop1_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files");
    store.save().expect("save store");

    // Agent 2 tries to claim a conflicting task - should succeed with warning
    let mut task2 = TeamTask::new("Agent 2 task".to_string(), team_id.clone(), 2);
    task2.extracted_files = Some(vec!["src/auth.rs".to_string()]);
    let task2_id = task2.id.clone();
    store.create_team_task(task2);
    store
        .claim_task(&task2_id, loop2_id.clone())
        .expect("claim task2");
    store.save().expect("save store");

    // Agent 1 completes their task and releases
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .release_task(&task1_id, &loop1_id)
        .expect("release task1");
    store.save().expect("save store");

    // Now Agent 2 can reserve the file
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .reserve_files(
            task2_id.clone(),
            loop2_id.clone(),
            vec!["src/auth.rs".to_string()],
        )
        .expect("reserve files for task2");
    store.save().expect("save store");

    // Verify only Agent 2's reservation exists
    let conflicts = store.check_conflicts(&["src/auth.rs".to_string()]);
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].conflicting_agents.len(), 1);
    assert_eq!(conflicts[0].conflicting_agents[0].loop_id, loop2_id);
}
