//! CLI commands for the `ralph tools test` namespace.
//!
//! Provides test tools for agent-driven E2E testing:
//! - `setup`: Create isolated test workspace
//! - `run`: Execute Ralph and record session
//! - `assert`: Validate test outcomes
//! - `inspect`: Query session recordings
//! - `cleanup`: Remove test workspace
//! - `record`: Record real LLM interactions
//! - `replay`: Replay recorded cassettes
//! - `evaluate`: LLM-as-judge evaluation
//! - `report`: Generate CI/CD reports

use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};

use ralph_e2e::WorkspaceManager;

/// Default base path for test workspaces
const DEFAULT_TEST_BASE: &str = ".ralph-test";

/// Test tool commands.
#[derive(Parser, Debug)]
pub struct TestToolsArgs {
    #[command(subcommand)]
    pub command: TestToolsCommands,
}

#[derive(Subcommand, Debug)]
pub enum TestToolsCommands {
    /// Create an isolated test workspace with optional fixtures
    Setup(SetupArgs),

    /// Execute Ralph and record session
    Run(RunArgs),

    /// Validate test outcomes with assertions
    Assert(AssertArgs),

    /// Query and filter session recordings
    Inspect(InspectArgs),

    /// Remove test workspace
    Cleanup(CleanupArgs),

    /// Record real LLM interactions to cassette
    Record(RecordArgs),

    /// Replay recorded cassettes deterministically
    Replay(ReplayArgs),

    /// LLM-as-judge evaluation
    Evaluate(EvaluateArgs),

    /// Generate CI/CD reports
    Report(ReportArgs),
}

// ============================================================================
// Setup Command
// ============================================================================

/// Arguments for `test setup` command.
#[derive(Parser, Debug)]
pub struct SetupArgs {
    /// Unique identifier for this test workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Files to create in the workspace (path=content, comma-separated key=value)
    #[arg(long, value_delimiter = ',')]
    pub fixtures: Vec<String>,

    /// Ralph configuration overrides (YAML format)
    #[arg(long)]
    pub config: Option<String>,

    /// Initial scratchpad content
    #[arg(long)]
    pub scratchpad: Option<String>,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,
}

/// Output format for test commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, ValueEnum)]
pub enum OutputFormat {
    /// Human-readable format
    #[default]
    Table,
    /// JSON format for programmatic access
    Json,
}

/// Result of test_setup command.
#[derive(Debug, Serialize, Deserialize)]
pub struct SetupResult {
    pub workspace_path: String,
    pub workspace_id: String,
    pub created_files: Vec<String>,
}

/// Execute test setup command.
pub fn execute_setup(args: SetupArgs) -> Result<SetupResult> {
    let base_path = args.base_path.unwrap_or_else(|| DEFAULT_TEST_BASE.to_string());
    let manager = WorkspaceManager::new(&base_path);

    // Create workspace directory
    let workspace_path = manager
        .create_workspace(&args.workspace_id)
        .context("Failed to create workspace")?;

    let mut created_files = Vec::new();

    // Create .agent directory structure
    let agent_dir = workspace_path.join(".agent");
    fs::create_dir_all(&agent_dir).context("Failed to create .agent directory")?;
    created_files.push(".agent/".to_string());

    // Create scratchpad if provided
    if let Some(scratchpad_content) = &args.scratchpad {
        let scratchpad_path = agent_dir.join("scratchpad.md");
        // Allow both literal "\n" and actual newlines for convenience
        let content = scratchpad_content.replace("\\n", "\n");
        fs::write(&scratchpad_path, content)
            .context("Failed to write scratchpad")?;
        created_files.push(".agent/scratchpad.md".to_string());
    }

    // Create fixtures (comma-separated: path=content)
    for fixture in &args.fixtures {
        if let Some((path, content)) = fixture.split_once('=') {
            let fixture_path = workspace_path.join(path);
            if let Some(parent) = fixture_path.parent() {
                fs::create_dir_all(parent).context("Failed to create fixture directory")?;
            }
            fs::write(&fixture_path, content).context("Failed to write fixture")?;
            created_files.push(path.to_string());
        }
    }

    // Create config if provided
    if let Some(config_content) = &args.config {
        let config_path = workspace_path.join("ralph.yml");
        fs::write(&config_path, config_content).context("Failed to write config")?;
        created_files.push("ralph.yml".to_string());
    }

    Ok(SetupResult {
        workspace_path: workspace_path.to_string_lossy().to_string(),
        workspace_id: args.workspace_id,
        created_files,
    })
}

// ============================================================================
// Run Command
// ============================================================================

/// Arguments for `test run` command.
#[derive(Parser, Debug)]
pub struct RunArgs {
    /// Target workspace from test_setup
    #[arg(long)]
    pub workspace_id: String,

    /// Initial task/prompt to send to orchestrator
    #[arg(long)]
    pub task: String,

    /// Backend adapter: claude, kiro, gemini, mock (default: mock)
    #[arg(long, default_value = "mock")]
    pub backend: String,

    /// Override max iterations (default: 5)
    #[arg(long)]
    pub max_iterations: Option<u32>,

    /// Override max runtime in seconds (default: 300)
    #[arg(long)]
    pub max_runtime_secs: Option<u64>,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Result of test_run command.
#[derive(Debug, Serialize, Deserialize)]
pub struct RunResult {
    pub exit_code: i32,
    pub termination_reason: String,
    pub iterations: u32,
    pub elapsed_secs: f64,
    pub session_file: String,
    pub events_count: usize,
    pub stdout: String,
    pub stderr: String,
}

// ============================================================================
// Assert Command
// ============================================================================

/// Arguments for `test assert` command.
#[derive(Parser, Debug)]
pub struct AssertArgs {
    /// Target workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

// ============================================================================
// Inspect Command
// ============================================================================

/// Arguments for `test inspect` command.
#[derive(Parser, Debug)]
pub struct InspectArgs {
    /// Target workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Output format: json, summary, timeline
    #[arg(long, default_value = "json")]
    pub format: String,

    /// Max records to return
    #[arg(long)]
    pub limit: Option<usize>,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,
}

// ============================================================================
// Cleanup Command
// ============================================================================

/// Arguments for `test cleanup` command.
#[derive(Parser, Debug)]
pub struct CleanupArgs {
    /// Target workspace to clean up
    #[arg(long)]
    pub workspace_id: String,

    /// Keep session.jsonl for debugging
    #[arg(long)]
    pub preserve_session: bool,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Result of test_cleanup command.
#[derive(Debug, Serialize, Deserialize)]
pub struct CleanupResult {
    pub deleted: bool,
    pub preserved_files: Vec<String>,
}

// ============================================================================
// Record Command
// ============================================================================

/// Arguments for `test record` command.
#[derive(Parser, Debug)]
pub struct RecordArgs {
    /// Target workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Name for the cassette file
    #[arg(long)]
    pub cassette_name: String,

    /// Initial task/prompt
    #[arg(long)]
    pub task: String,

    /// Real backend to use: claude, kiro, gemini
    #[arg(long)]
    pub backend: String,

    /// Override max iterations (default: 10)
    #[arg(long)]
    pub max_iterations: Option<u32>,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,
}

// ============================================================================
// Replay Command
// ============================================================================

/// Arguments for `test replay` command.
#[derive(Parser, Debug)]
pub struct ReplayArgs {
    /// Target workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Cassette to replay
    #[arg(long)]
    pub cassette_name: String,

    /// Initial task (must match recording)
    #[arg(long)]
    pub task: String,

    /// Fail if request doesn't match recording (default: true)
    #[arg(long)]
    pub strict: bool,

    /// Allow real API calls for unmatched requests (default: false)
    #[arg(long)]
    pub allow_passthrough: bool,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,
}

// ============================================================================
// Evaluate Command
// ============================================================================

/// Arguments for `test evaluate` command.
#[derive(Parser, Debug)]
pub struct EvaluateArgs {
    /// Target workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Evaluation criteria (JSON array)
    #[arg(long)]
    pub evaluations: String,

    /// Meta preset to use for judging (default: judge)
    #[arg(long)]
    pub judge_preset: Option<String>,

    /// Backend for judge runs
    #[arg(long)]
    pub judge_backend: Option<String>,

    /// Require reasoning before score (default: true)
    #[arg(long)]
    pub chain_of_thought: Option<bool>,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,
}

// ============================================================================
// Report Command
// ============================================================================

/// Arguments for `test report` command.
#[derive(Parser, Debug)]
pub struct ReportArgs {
    /// Target workspace
    #[arg(long)]
    pub workspace_id: String,

    /// Output format: junit, tap, json, ctrf
    #[arg(long)]
    pub format: String,

    /// Name for the test suite
    #[arg(long)]
    pub test_name: String,

    /// Include session traces in report
    #[arg(long)]
    pub include_traces: bool,

    /// Custom output path
    #[arg(long)]
    pub output_path: Option<String>,

    /// Base path for test workspaces (default: .ralph-test)
    #[arg(long)]
    pub base_path: Option<String>,
}

// ============================================================================
// Main execute function
// ============================================================================

/// Execute a test tools command.
pub fn execute(args: TestToolsArgs) -> Result<()> {
    match args.command {
        TestToolsCommands::Setup(setup_args) => {
            let result = execute_setup(setup_args)?;
            println!("{}", serde_json::to_string(&result)?);
        }
        TestToolsCommands::Run(_run_args) => {
            println!("test_run not yet implemented");
        }
        TestToolsCommands::Assert(_assert_args) => {
            println!("test_assert not yet implemented");
        }
        TestToolsCommands::Inspect(_inspect_args) => {
            println!("test_inspect not yet implemented");
        }
        TestToolsCommands::Cleanup(cleanup_args) => {
            execute_cleanup(cleanup_args)?;
        }
        TestToolsCommands::Record(_record_args) => {
            println!("test_record not yet implemented");
        }
        TestToolsCommands::Replay(_replay_args) => {
            println!("test_replay not yet implemented");
        }
        TestToolsCommands::Evaluate(_evaluate_args) => {
            println!("test_evaluate not yet implemented");
        }
        TestToolsCommands::Report(_report_args) => {
            println!("test_report not yet implemented");
        }
    }
    Ok(())
}

fn execute_cleanup(args: CleanupArgs) -> Result<CleanupResult> {
    let base_path = args.base_path.unwrap_or_else(|| DEFAULT_TEST_BASE.to_string());
    let manager = WorkspaceManager::new(&base_path);

    let workspace_path = manager.workspace_path(&args.workspace_id);
    let mut preserved_files = Vec::new();

    // Preserve session if requested
    if args.preserve_session {
        let session_file = workspace_path.join("session.jsonl");
        if session_file.exists() {
            let temp_path = std::env::temp_dir().join("ralph-test").join(&args.workspace_id);
            fs::create_dir_all(&temp_path)?;
            let preserved = temp_path.join("session.jsonl");
            fs::copy(&session_file, &preserved)?;
            preserved_files.push(preserved.to_string_lossy().to_string());
        }
    }

    manager
        .cleanup(&args.workspace_id)
        .context("Failed to cleanup workspace")?;

    println!(
        "{}",
        serde_json::to_string(&CleanupResult {
            deleted: true,
            preserved_files
        })?
    );

    Ok(CleanupResult {
        deleted: true,
        preserved_files: vec![],
    })
}
