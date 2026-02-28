//! CLI commands for the `ralph team` namespace.
//!
//! Provides subcommands for managing teams:
//! - `create`: Create a new team
//! - `list`: List all teams
//! - `status`: Show status of a team
//! - `send`: Send a message/event to a team

use crate::display::colors;
use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use ralph_core::{TeamStore, TeamTask, TeamTaskStatus};
use std::path::{Path, PathBuf};

/// Output format for team commands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, ValueEnum)]
pub enum OutputFormat {
    /// Human-readable table format
    #[default]
    Table,
    /// JSON format for programmatic access
    Json,
    /// ID-only output for scripting
    Quiet,
}

/// Team management commands for multi-agent collaboration.
#[derive(Parser, Debug)]
pub struct TeamArgs {
    #[command(subcommand)]
    pub command: TeamCommands,

    /// Working directory (default: current directory)
    #[arg(long, global = true)]
    pub root: Option<PathBuf>,
}

#[derive(Subcommand, Debug)]
pub enum TeamCommands {
    /// Create a new team
    Create(CreateArgs),

    /// List all teams
    List(ListArgs),

    /// Show status of a team
    Status(StatusArgs),

    /// Add a task to a team
    AddTask(AddTaskArgs),

    /// Claim a task from a team (self-assignment)
    Claim(ClaimArgs),

    /// Release a task back to the team
    Release(ReleaseArgs),

    /// Update task status
    Update(UpdateArgs),

    /// List available tasks for a team
    ListTasks(ListTasksArgs),
}

/// Arguments for the `team create` command.
#[derive(Parser, Debug)]
pub struct CreateArgs {
    /// Team name
    pub name: String,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team list` command.
#[derive(Parser, Debug)]
pub struct ListArgs {
    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team status` command.
#[derive(Parser, Debug)]
pub struct StatusArgs {
    /// Team ID
    pub team_id: String,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team add-task` command.
#[derive(Parser, Debug)]
pub struct AddTaskArgs {
    /// Team ID
    pub team_id: String,

    /// Task title
    pub title: String,

    /// Priority (1-5, default 3)
    #[arg(short = 'p', long, default_value = "3")]
    pub priority: u8,

    /// Task description
    #[arg(short = 'd', long)]
    pub description: Option<String>,

    /// Task IDs that must complete first (comma-separated)
    #[arg(long)]
    pub depends_on: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team claim` command.
#[derive(Parser, Debug)]
pub struct ClaimArgs {
    /// Team ID
    pub team_id: String,

    /// Task ID to claim
    pub task_id: String,

    /// Loop ID claiming the task (default: read from current-loop-id)
    #[arg(long)]
    pub loop_id: Option<String>,
}

/// Arguments for the `team release` command.
#[derive(Parser, Debug)]
pub struct ReleaseArgs {
    /// Team ID
    pub team_id: String,

    /// Task ID to release
    pub task_id: String,

    /// Loop ID releasing the task (default: read from current-loop-id)
    #[arg(long)]
    pub loop_id: Option<String>,
}

/// Arguments for the `team update` command.
#[derive(Parser, Debug)]
pub struct UpdateArgs {
    /// Team ID
    pub team_id: String,

    /// Task ID to update
    pub task_id: String,

    /// New status (todo, in_progress, review, done)
    pub status: String,
}

/// Arguments for the `team list-tasks` command.
#[derive(Parser, Debug)]
pub struct ListTasksArgs {
    /// Team ID
    pub team_id: String,

    /// Filter by status (todo, in_progress, review, done)
    #[arg(short = 's', long)]
    pub status: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Gets the team store base path.
fn get_team_store_path(root: Option<&PathBuf>) -> PathBuf {
    let base = root.map(|p| p.as_path()).unwrap_or(Path::new("."));
    base.join(".ralph")
}

/// Gets the current loop ID from the marker file.
fn get_current_loop_id(root: Option<&PathBuf>) -> Option<String> {
    let base = root.map(|p| p.as_path()).unwrap_or(Path::new("."));
    let marker_path = base.join(".ralph").join("current-loop-id");

    if let Ok(loop_id) = std::fs::read_to_string(&marker_path) {
        let loop_id = loop_id.trim().to_string();
        if !loop_id.is_empty() {
            return Some(loop_id);
        }
    }

    None
}

/// Parses task status from string.
fn parse_task_status(status: &str) -> Result<TeamTaskStatus> {
    match status.to_lowercase().as_str() {
        "todo" => Ok(TeamTaskStatus::Todo),
        "in_progress" | "in-progress" => Ok(TeamTaskStatus::InProgress),
        "review" => Ok(TeamTaskStatus::Review),
        "done" => Ok(TeamTaskStatus::Done),
        _ => anyhow::bail!(
            "Invalid task status: {}. Valid options: todo, in_progress, review, done",
            status
        ),
    }
}

/// Executes team CLI commands.
pub fn execute(args: TeamArgs, use_colors: bool) -> Result<()> {
    let root = args.root.clone();

    match args.command {
        TeamCommands::Create(create_args) => execute_create(create_args, root.as_ref(), use_colors),
        TeamCommands::List(list_args) => execute_list(list_args, root.as_ref(), use_colors),
        TeamCommands::Status(status_args) => execute_status(status_args, root.as_ref(), use_colors),
        TeamCommands::AddTask(add_task_args) => {
            execute_add_task(add_task_args, root.as_ref(), use_colors)
        }
        TeamCommands::Claim(claim_args) => execute_claim(claim_args, root.as_ref(), use_colors),
        TeamCommands::Release(release_args) => {
            execute_release(release_args, root.as_ref(), use_colors)
        }
        TeamCommands::Update(update_args) => execute_update(update_args, root.as_ref(), use_colors),
        TeamCommands::ListTasks(list_tasks_args) => {
            execute_list_tasks(list_tasks_args, root.as_ref(), use_colors)
        }
    }
}

fn execute_create(args: CreateArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mut store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let team_id = store.create_team(args.name.clone());
    store.save().context("Failed to save team store")?;

    match args.format {
        OutputFormat::Table => {
            if use_colors {
                println!("{}Created team {}{}", colors::GREEN, team_id, colors::RESET);
            } else {
                println!("Created team {}", team_id);
            }
            println!("  Name: {}", args.name);
        }
        OutputFormat::Json => {
            let team = store.get_team(&team_id).context("Team not found")?;
            println!("{}", serde_json::to_string_pretty(team)?);
        }
        OutputFormat::Quiet => {
            println!("{}", team_id);
        }
    }

    Ok(())
}

fn execute_list(args: ListArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let teams = store.all_teams();

    match args.format {
        OutputFormat::Table => {
            if teams.is_empty() {
                println!("No teams found");
            } else {
                if use_colors {
                    println!(
                        "{}{:<30} {:<20} {:<15} {:<20}{}",
                        colors::DIM,
                        "ID",
                        "Name",
                        "Teammates",
                        "Created",
                        colors::RESET
                    );
                    println!("{}{}{}", colors::DIM, "-".repeat(85), colors::RESET);
                } else {
                    println!(
                        "{:<30} {:<20} {:<15} {:<20}",
                        "ID", "Name", "Teammates", "Created"
                    );
                    println!("{}", "-".repeat(85));
                }

                for team in teams {
                    let created = team
                        .created_at
                        .split('T')
                        .next()
                        .unwrap_or(&team.created_at);
                    if use_colors {
                        println!(
                            "{}{:<30}{} {:<20} {:<15} {:<20}",
                            colors::DIM,
                            team.id,
                            colors::RESET,
                            team.name,
                            team.teammates.len(),
                            created
                        );
                    } else {
                        println!(
                            "{:<30} {:<20} {:<15} {:<20}",
                            team.id,
                            team.name,
                            team.teammates.len(),
                            created
                        );
                    }
                }
            }
        }
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&teams)?);
        }
        OutputFormat::Quiet => {
            for team in teams {
                println!("{}", team.id);
            }
        }
    }

    Ok(())
}

fn execute_status(args: StatusArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let status = store
        .get_team_status(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    let team = store
        .get_team(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    match args.format {
        OutputFormat::Table => {
            if use_colors {
                println!("{}Team: {}{}", colors::DIM, team.name, colors::RESET);
                println!("{}ID:   {}{}", colors::DIM, args.team_id, colors::RESET);
            } else {
                println!("Team: {}", team.name);
                println!("ID:   {}", args.team_id);
            }

            println!();
            println!("Tasks:");
            println!("  Total:       {}", status.total_tasks);
            println!("  To Do:       {}", status.todo_tasks);
            println!("  In Progress: {}", status.in_progress_tasks);
            println!("  Review:      {}", status.review_tasks);
            println!("  Done:        {}", status.done_tasks);
            println!();
            println!("Teammates: {}", status.teammates.len());
            for teammate in &status.teammates {
                println!("  - {}", teammate);
            }
        }
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&status)?);
        }
        OutputFormat::Quiet => {
            println!("{}", args.team_id);
        }
    }

    Ok(())
}

fn execute_add_task(args: AddTaskArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mut store = TeamStore::load(&base_path).context("Failed to load team store")?;

    // Verify team exists
    if store.get_team(&args.team_id).is_none() {
        anyhow::bail!("Team {} not found", args.team_id);
    }

    let mut task = TeamTask::new(args.title.clone(), args.team_id.clone(), args.priority);

    if let Some(desc) = args.description {
        task = task.with_description(Some(desc));
    }

    if let Some(deps) = args.depends_on {
        for dep_id in deps.split(',').map(|s| s.trim()) {
            // Verify dependency exists
            if store.get_task(dep_id).is_none() {
                anyhow::bail!("Dependency task {} not found", dep_id);
            }
            task = task.with_dependency(dep_id.to_string());
        }
    }

    let task_id = task.id.clone();
    store.create_team_task(task);
    store.save().context("Failed to save team store")?;

    match args.format {
        OutputFormat::Table => {
            if use_colors {
                println!("{}Created task {}{}", colors::GREEN, task_id, colors::RESET);
            } else {
                println!("Created task {}", task_id);
            }
            println!("  Title:    {}", args.title);
            println!("  Priority: {}", args.priority);
            println!("  Team:     {}", args.team_id);
        }
        OutputFormat::Json => {
            let task = store.get_task(&task_id).context("Task not found")?;
            println!("{}", serde_json::to_string_pretty(task)?);
        }
        OutputFormat::Quiet => {
            println!("{}", task_id);
        }
    }

    Ok(())
}

fn execute_claim(args: ClaimArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mut store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let loop_id = args.loop_id.or_else(|| get_current_loop_id(root)).context(
        "Loop ID not specified. Use --loop-id or ensure current-loop-id marker file exists",
    )?;

    store
        .claim_task(&args.task_id, loop_id.clone())
        .context(format!("Failed to claim task {}", args.task_id))?;

    store.save().context("Failed to save team store")?;

    if use_colors {
        println!(
            "{}Claimed task {} for loop {}{}",
            colors::GREEN,
            args.task_id,
            loop_id,
            colors::RESET
        );
    } else {
        println!("Claimed task {} for loop {}", args.task_id, loop_id);
    }

    Ok(())
}

fn execute_release(args: ReleaseArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mut store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let loop_id = args.loop_id.or_else(|| get_current_loop_id(root)).context(
        "Loop ID not specified. Use --loop-id or ensure current-loop-id marker file exists",
    )?;

    store
        .release_task(&args.task_id, &loop_id)
        .context(format!("Failed to release task {}", args.task_id))?;

    store.save().context("Failed to save team store")?;

    if use_colors {
        println!(
            "{}Released task {} from loop {}{}",
            colors::GREEN,
            args.task_id,
            loop_id,
            colors::RESET
        );
    } else {
        println!("Released task {} from loop {}", args.task_id, loop_id);
    }

    Ok(())
}

fn execute_update(args: UpdateArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mut store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let status = parse_task_status(&args.status)?;

    store
        .update_task_status(&args.task_id, status)
        .context(format!("Failed to update task {}", args.task_id))?;

    store.save().context("Failed to save team store")?;

    if use_colors {
        println!(
            "{}Updated task {} to {}{}",
            colors::GREEN,
            args.task_id,
            args.status,
            colors::RESET
        );
    } else {
        println!("Updated task {} to {}", args.task_id, args.status);
    }

    Ok(())
}

fn execute_list_tasks(args: ListTasksArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let team = store
        .get_team(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    let mut tasks = store.get_team_tasks(&args.team_id);

    // Filter by status if specified
    if let Some(status_str) = &args.status {
        let target_status = parse_task_status(status_str)?;
        tasks.retain(|t| t.status == target_status);
    }

    match args.format {
        OutputFormat::Table => {
            if tasks.is_empty() {
                println!("No tasks found for team {}", team.name);
            } else {
                if use_colors {
                    println!(
                        "{}{:<20} {:<15} {:<8} {:<20} {:<60}{}",
                        colors::DIM,
                        "ID",
                        "Status",
                        "Priority",
                        "Assigned To",
                        "Title",
                        colors::RESET
                    );
                    println!("{}{}{}", colors::DIM, "-".repeat(125), colors::RESET);
                } else {
                    println!(
                        "{:<20} {:<15} {:<8} {:<20} {:<60}",
                        "ID", "Status", "Priority", "Assigned To", "Title"
                    );
                    println!("{}", "-".repeat(125));
                }

                // Sort by status then priority
                let mut sorted_tasks: Vec<_> = tasks.to_vec();
                sorted_tasks.sort_by(|a, b| {
                    let status_rank = |s: &TeamTaskStatus| match s {
                        TeamTaskStatus::Todo => 0,
                        TeamTaskStatus::InProgress => 1,
                        TeamTaskStatus::Review => 2,
                        TeamTaskStatus::Done => 3,
                    };

                    let rank_a = status_rank(&a.status);
                    let rank_b = status_rank(&b.status);

                    if rank_a != rank_b {
                        return rank_a.cmp(&rank_b);
                    }

                    a.priority.cmp(&b.priority)
                });

                for task in sorted_tasks {
                    let (status_str, status_color) = match task.status {
                        TeamTaskStatus::Todo => ("todo", colors::GREEN),
                        TeamTaskStatus::InProgress => ("in_progress", colors::BLUE),
                        TeamTaskStatus::Review => ("review", colors::YELLOW),
                        TeamTaskStatus::Done => ("done", colors::DIM),
                    };

                    let priority_color = match task.priority {
                        1 => colors::RED,
                        2 => colors::YELLOW,
                        _ => colors::RESET,
                    };

                    let assigned = task
                        .assigned_to
                        .as_ref()
                        .map(|id| id.split('-').last().unwrap_or(id).to_string())
                        .unwrap_or_else(|| "(unassigned)".to_string());

                    let title_truncated = if task.title.len() > 60 {
                        crate::display::truncate(&task.title, 60)
                    } else {
                        task.title.clone()
                    };

                    if use_colors {
                        println!(
                            "{}{:<20}{} {}{:<15}{} {}{:<8}{} {:<20} {:<60}",
                            colors::DIM,
                            task.id,
                            colors::RESET,
                            status_color,
                            status_str,
                            colors::RESET,
                            priority_color,
                            task.priority,
                            colors::RESET,
                            assigned,
                            title_truncated
                        );
                    } else {
                        println!(
                            "{:<20} {:<15} {:<8} {:<20} {:<60}",
                            task.id, status_str, task.priority, assigned, title_truncated
                        );
                    }
                }
            }
        }
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&tasks)?);
        }
        OutputFormat::Quiet => {
            for task in tasks {
                println!("{}", task.id);
            }
        }
    }

    Ok(())
}
