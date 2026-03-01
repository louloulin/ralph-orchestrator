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
