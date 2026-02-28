//! Integration tests for `ralph team suggest` CLI command.

use ralph_core::{TeamTask, TeamTaskStatus};
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

fn create_team_and_tasks(temp_path: &std::path::Path) -> (String, String, String) {
    // Create a team
    let stdout = ralph_team_ok(temp_path, &["create", "Test Team", "--format", "quiet"]);
    let team_id = stdout.trim().to_string();

    // Add teammates (simulated by creating loop marker files)
    let ralph_dir = temp_path.join(".ralph");
    std::fs::create_dir_all(&ralph_dir).expect("create .ralph");

    let loop1_id = "loop-2026-01-01-120000-abc1";
    let loop2_id = "loop-2026-01-01-120000-abc2";

    // Add tasks with different priorities
    ralph_team_ok(
        temp_path,
        &[
            "add-task",
            &team_id,
            "High priority task",
            "-p",
            "1",
            "--format",
            "quiet",
        ],
    );

    ralph_team_ok(
        temp_path,
        &[
            "add-task",
            &team_id,
            "Medium priority task",
            "-p",
            "3",
            "--format",
            "quiet",
        ],
    );

    ralph_team_ok(
        temp_path,
        &[
            "add-task",
            &team_id,
            "Low priority task",
            "-p",
            "5",
            "--format",
            "quiet",
        ],
    );

    // Add teammates to team
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .add_teammate(&team_id, loop1_id.to_string())
        .expect("add teammate 1");
    store
        .add_teammate(&team_id, loop2_id.to_string())
        .expect("add teammate 2");
    store.save().expect("save team store");

    (team_id, loop1_id.to_string(), loop2_id.to_string())
}

#[test]
fn test_team_task_suggest_basic() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (_team_id, loop1_id, _loop2_id) = create_team_and_tasks(temp_path);

    // Suggest task for loop1 - should get highest priority (1)
    let stdout = ralph_team_ok(
        temp_path,
        &["suggest", "--teammate", &loop1_id, "--format", "quiet"],
    );
    let suggested_task_id = stdout.trim();

    // Verify task exists and has high priority
    let ralph_dir = temp_path.join(".ralph");
    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let task = store.get_task(suggested_task_id).expect("task exists");

    assert_eq!(task.priority, 1);
    assert_eq!(task.title, "High priority task");
    assert_eq!(task.status, TeamTaskStatus::Todo);
}

#[test]
fn test_team_task_suggest_respects_capacity() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (team_id, loop1_id, _loop2_id) = create_team_and_tasks(temp_path);

    // Claim 6 tasks (max capacity) for loop1
    let ralph_dir = temp_path.join(".ralph");
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");

    // Add more tasks to exceed capacity
    for i in 0..6 {
        let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 2);
        let task_id = task.id.clone();
        store.create_team_task(task);
        store
            .claim_task(&task_id, loop1_id.clone())
            .expect("claim task");
    }
    store.save().expect("save team store");

    // Try to suggest task for loop1 - should return no tasks due to capacity
    let stdout = ralph_team_ok(
        temp_path,
        &["suggest", "--teammate", &loop1_id, "--format", "json"],
    );

    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON response");
    assert!(response["taskId"].is_null());
    assert_eq!(response["reason"], "No tasks available");
}

#[test]
fn test_team_task_suggest_no_tasks() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    // Create a team but no tasks
    let stdout = ralph_team_ok(temp_path, &["create", "Empty Team", "--format", "quiet"]);
    let team_id = stdout.trim();

    let loop_id = "loop-2026-01-01-120000-abc1";

    // Add teammate to team
    let ralph_dir = temp_path.join(".ralph");
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .add_teammate(&team_id, loop_id.to_string())
        .expect("add teammate");
    store.save().expect("save team store");

    // Suggest task - should return no tasks available
    let stdout = ralph_team_ok(
        temp_path,
        &["suggest", "--teammate", loop_id, "--format", "json"],
    );

    let response: serde_json::Value = serde_json::from_str(&stdout).expect("parse JSON response");
    assert!(response["taskId"].is_null());
    assert_eq!(response["reason"], "No tasks available");
}

#[test]
fn test_team_task_suggest_priority_ordering() {
    let temp_dir = TempDir::new().expect("temp dir");
    let temp_path = temp_dir.path();

    let (_team_id, loop1_id, _loop2_id) = create_team_and_tasks(temp_path);

    // Suggest task - should get highest priority (1)
    let stdout1 = ralph_team_ok(
        temp_path,
        &["suggest", "--teammate", &loop1_id, "--format", "quiet"],
    );
    let task1_id = stdout1.trim();

    let ralph_dir = temp_path.join(".ralph");
    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let task1 = store.get_task(&task1_id).expect("task exists");
    assert_eq!(task1.priority, 1);

    // Claim the first task
    let mut store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    store
        .claim_task(&task1_id, loop1_id.clone())
        .expect("claim task");
    store.save().expect("save team store");

    // Suggest again - should get medium priority (3)
    let stdout2 = ralph_team_ok(
        temp_path,
        &["suggest", "--teammate", &loop1_id, "--format", "quiet"],
    );
    let task2_id = stdout2.trim();

    let store = ralph_core::TeamStore::load(&ralph_dir).expect("load team store");
    let task2 = store.get_task(&task2_id).expect("task exists");
    assert_eq!(task2.priority, 3);
}
