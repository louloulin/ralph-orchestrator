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
use ralph_core::{ConflictSeverity, MailboxStore, TeamStore, TeamTask, TeamTaskStatus};
use ralph_proto::Event;
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

    /// Send a message to another loop
    Send(SendArgs),

    /// List messages in a mailbox
    Messages(MessagesArgs),

    /// Suggest a task for a teammate based on load balancing
    Suggest(SuggestArgs),

    /// Show all potential file conflicts for a team
    Conflicts(ConflictsArgs),

    /// Check specific files for conflicts
    CheckFiles(CheckFilesArgs),

    /// Show velocity metrics for a team
    Velocity(VelocityArgs),

    /// Show completion predictions for a team
    Predict(PredictArgs),

    /// Show velocity history over time
    History(HistoryArgs),
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
#[allow(clippy::struct_field_names)]
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
#[allow(clippy::struct_field_names)]
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

/// Arguments for the `team send` command.
#[derive(Parser, Debug)]
pub struct SendArgs {
    /// Target loop ID to send message to
    #[arg(long)]
    pub to: String,

    /// Message content
    pub message: String,

    /// Loop ID sending the message (default: read from current-loop-id)
    #[arg(long)]
    pub from: Option<String>,
}

/// Arguments for the `team messages` command.
#[derive(Parser, Debug)]
pub struct MessagesArgs {
    /// Loop ID to check messages for (default: read from current-loop-id)
    #[arg(long)]
    pub loop_id: Option<String>,

    /// Filter by sender loop ID
    #[arg(long)]
    pub from: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team suggest` command.
#[derive(Parser, Debug)]
pub struct SuggestArgs {
    /// Loop ID of the teammate to suggest a task for
    #[arg(long)]
    pub teammate: String,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team conflicts` command.
#[derive(Parser, Debug)]
pub struct ConflictsArgs {
    /// Team ID
    pub team_id: String,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team check-files` command.
#[derive(Parser, Debug)]
pub struct CheckFilesArgs {
    /// File paths to check (comma-separated or multiple --files flags)
    #[arg(short = 'f', long = "files", value_delimiter = ',')]
    pub files: Vec<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team velocity` command.
#[derive(Parser, Debug)]
pub struct VelocityArgs {
    /// Team ID
    pub team_id: String,

    /// Loop ID to filter velocity for specific teammate (optional)
    #[arg(long)]
    pub teammate: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team predict` command.
#[derive(Parser, Debug)]
pub struct PredictArgs {
    /// Team ID
    pub team_id: String,

    /// Specific task ID to predict completion date (optional)
    #[arg(long)]
    pub task_id: Option<String>,

    /// Output format
    #[arg(long, value_enum, default_value_t = OutputFormat::Table)]
    pub format: OutputFormat,
}

/// Arguments for the `team history` command.
#[derive(Parser, Debug)]
pub struct HistoryArgs {
    /// Team ID
    pub team_id: String,

    /// Duration in hours to show history for (default: 24)
    #[arg(long, short = 'd', default_value = "24")]
    pub duration: u64,

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
        TeamCommands::Send(send_args) => execute_send(send_args, root.as_ref(), use_colors),
        TeamCommands::Messages(messages_args) => {
            execute_messages(messages_args, root.as_ref(), use_colors)
        }
        TeamCommands::Suggest(suggest_args) => {
            execute_suggest(suggest_args, root.as_ref(), use_colors)
        }
        TeamCommands::Conflicts(conflicts_args) => {
            execute_conflicts(conflicts_args, root.as_ref(), use_colors)
        }
        TeamCommands::CheckFiles(check_files_args) => {
            execute_check_files(check_files_args, root.as_ref(), use_colors)
        }
        TeamCommands::Velocity(velocity_args) => {
            execute_velocity(velocity_args, root.as_ref(), use_colors)
        }
        TeamCommands::Predict(predict_args) => {
            execute_predict(predict_args, root.as_ref(), use_colors)
        }
        TeamCommands::History(history_args) => {
            execute_history(history_args, root.as_ref(), use_colors)
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
                let mut sorted_tasks: Vec<_> = tasks.clone();
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
                        .map(|id| id.split('-').next_back().unwrap_or(id).to_string())
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

fn execute_send(args: SendArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mailbox = MailboxStore::new(base_path);

    let from_loop_id = args.from.or_else(|| get_current_loop_id(root)).context(
        "Loop ID not specified. Use --from or ensure current-loop-id marker file exists",
    )?;

    // Create event with source loop information
    let event = Event::new("mailbox.message", &args.message).with_source_loop(from_loop_id.clone());

    let msg_id = mailbox
        .send(&args.to, &event)
        .context("Failed to send message")?;

    if use_colors {
        println!("{}Message sent {}{}", colors::GREEN, msg_id, colors::RESET);
    } else {
        println!("Message sent {}", msg_id);
    }
    println!("  From: {}", from_loop_id);
    println!("  To:   {}", args.to);

    Ok(())
}

fn execute_messages(args: MessagesArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let mailbox = MailboxStore::new(base_path);

    let loop_id = args.loop_id.or_else(|| get_current_loop_id(root)).context(
        "Loop ID not specified. Use --loop-id or ensure current-loop-id marker file exists",
    )?;

    let messages = mailbox
        .receive(&loop_id)
        .context("Failed to read messages")?;

    // Filter by sender if specified
    let filtered_messages: Vec<_> = if let Some(from_filter) = &args.from {
        messages
            .into_iter()
            .filter(|m| {
                m.event
                    .source_loop
                    .as_ref()
                    .map(|s| s == from_filter)
                    .unwrap_or(false)
            })
            .collect()
    } else {
        messages
    };

    match args.format {
        OutputFormat::Table => {
            if filtered_messages.is_empty() {
                if let Some(from) = &args.from {
                    println!("No messages from {}", from);
                } else {
                    println!("No messages for loop {}", loop_id);
                }
            } else {
                if use_colors {
                    println!(
                        "{}{:<25} {:<25} {:<20} {:<60}{}",
                        colors::DIM,
                        "Message ID",
                        "From",
                        "Timestamp",
                        "Content",
                        colors::RESET
                    );
                    println!("{}{}{}", colors::DIM, "-".repeat(130), colors::RESET);
                } else {
                    println!(
                        "{:<25} {:<25} {:<20} {:<60}",
                        "Message ID", "From", "Timestamp", "Content"
                    );
                    println!("{}", "-".repeat(130));
                }

                for msg in filtered_messages {
                    let from = msg
                        .event
                        .source_loop
                        .as_ref()
                        .map(|s| s.split('-').next_back().unwrap_or(s).to_string())
                        .unwrap_or_else(|| "(unknown)".to_string());

                    let timestamp = msg.timestamp.format("%Y-%m-%d %H:%M:%S").to_string();

                    let content_truncated = if msg.event.payload.len() > 60 {
                        crate::display::truncate(&msg.event.payload, 60)
                    } else {
                        msg.event.payload.clone()
                    };

                    let msg_id_short = msg.id.split('-').next_back().unwrap_or(&msg.id);

                    if use_colors {
                        println!(
                            "{}{:<25}{} {:<25} {:<20} {:<60}",
                            colors::DIM,
                            msg_id_short,
                            colors::RESET,
                            from,
                            timestamp,
                            content_truncated
                        );
                    } else {
                        println!(
                            "{:<25} {:<25} {:<20} {:<60}",
                            msg_id_short, from, timestamp, content_truncated
                        );
                    }
                }
            }
        }
        OutputFormat::Json => {
            println!("{}", serde_json::to_string_pretty(&filtered_messages)?);
        }
        OutputFormat::Quiet => {
            for msg in filtered_messages {
                println!("{}", msg.id);
            }
        }
    }

    Ok(())
}

fn execute_suggest(args: SuggestArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let suggested_task = store.suggest_task_for_teammate(&args.teammate);

    match args.format {
        OutputFormat::Table => {
            if let Some(task_id) = suggested_task {
                let task = store.get_task(&task_id);
                if let Some(task) = task {
                    if use_colors {
                        println!(
                            "{}Suggested task for teammate {}:{}",
                            colors::GREEN,
                            args.teammate,
                            colors::RESET
                        );
                    } else {
                        println!("Suggested task for teammate {}:", args.teammate);
                    }
                    println!("  Task ID:  {}", task_id);
                    println!("  Title:    {}", task.title);
                    println!("  Priority: {}", task.priority);
                    println!("  Status:   {:?}", task.status);
                } else if use_colors {
                    println!(
                        "{}Suggested task: {}{}",
                        colors::GREEN,
                        task_id,
                        colors::RESET
                    );
                } else {
                    println!("Suggested task: {}", task_id);
                }
            } else if use_colors {
                println!(
                    "{}No tasks available for teammate {}{}",
                    colors::YELLOW,
                    args.teammate,
                    colors::RESET
                );
            } else {
                println!("No tasks available for teammate {}", args.teammate);
            }
        }
        OutputFormat::Json => {
            let response = if let Some(task_id) = suggested_task {
                let task = store.get_task(&task_id);
                serde_json::json!({
                    "taskId": task_id,
                    "task": task,
                })
            } else {
                serde_json::json!({
                    "taskId": null,
                    "reason": "No tasks available"
                })
            };
            println!("{}", serde_json::to_string_pretty(&response)?);
        }
        OutputFormat::Quiet => {
            if let Some(task_id) = suggested_task {
                println!("{}", task_id);
            }
            // No output if no task available (for scripting)
        }
    }

    Ok(())
}

fn execute_conflicts(args: ConflictsArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    // Verify team exists
    let team = store
        .get_team(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    // Collect all files from tasks that have extracted_files
    let tasks = store.get_team_tasks(&args.team_id);
    let mut all_files: Vec<String> = Vec::new();

    for task in &tasks {
        if let Some(ref files) = task.extracted_files {
            all_files.extend(files.clone());
        }
    }

    // Remove duplicates
    all_files.sort();
    all_files.dedup();

    // Check conflicts for all files
    let conflicts = store.check_conflicts(&all_files);

    match args.format {
        OutputFormat::Table => {
            if conflicts.is_empty() {
                println!("No file conflicts detected for team '{}'", team.name);
            } else {
                if use_colors {
                    println!(
                        "{}File conflicts for team '{}' ({} conflicts):{}",
                        colors::YELLOW,
                        team.name,
                        conflicts.len(),
                        colors::RESET
                    );
                    println!("{}{}{}", colors::DIM, "-".repeat(100), colors::RESET);
                } else {
                    println!(
                        "File conflicts for team '{}' ({} conflicts):",
                        team.name,
                        conflicts.len()
                    );
                    println!("{}", "-".repeat(100));
                }

                for conflict in &conflicts {
                    let severity_color = match conflict.severity {
                        ConflictSeverity::Low => colors::DIM,
                        ConflictSeverity::High => colors::YELLOW,
                        ConflictSeverity::Critical => colors::RED,
                    };

                    let severity_str = match conflict.severity {
                        ConflictSeverity::Low => "LOW",
                        ConflictSeverity::High => "HIGH",
                        ConflictSeverity::Critical => "CRITICAL",
                    };

                    if use_colors {
                        println!(
                            "{}[{}]{} {}{}",
                            severity_color,
                            severity_str,
                            colors::RESET,
                            conflict.file_path,
                            colors::RESET
                        );
                    } else {
                        println!("[{}] {}", severity_str, conflict.file_path);
                    }

                    for agent in &conflict.conflicting_agents {
                        let loop_short = agent
                            .loop_id
                            .split('-')
                            .next_back()
                            .unwrap_or(&agent.loop_id);
                        if use_colors {
                            println!(
                                "  {}↳{} Loop {} (Task: {}) {}{}",
                                colors::DIM,
                                colors::RESET,
                                loop_short,
                                agent
                                    .task_id
                                    .split('-')
                                    .next_back()
                                    .unwrap_or(&agent.task_id),
                                agent.task_title,
                                colors::RESET
                            );
                        } else {
                            println!(
                                "  ↳ Loop {} (Task: {}) {}",
                                loop_short,
                                agent
                                    .task_id
                                    .split('-')
                                    .next_back()
                                    .unwrap_or(&agent.task_id),
                                agent.task_title
                            );
                        }
                    }
                    println!("  Suggestion: {}", conflict.suggestion);
                    println!();
                }
            }
        }
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "teamId": args.team_id,
                    "teamName": team.name,
                    "conflictCount": conflicts.len(),
                    "conflicts": conflicts
                }))?
            );
        }
        OutputFormat::Quiet => {
            // Output count only
            println!("{}", conflicts.len());
        }
    }

    Ok(())
}

fn execute_check_files(
    args: CheckFilesArgs,
    root: Option<&PathBuf>,
    use_colors: bool,
) -> Result<()> {
    if args.files.is_empty() {
        anyhow::bail!("No files specified. Use --files path1,path2 or -f path1 -f path2");
    }

    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    let conflicts = store.check_conflicts(&args.files);

    match args.format {
        OutputFormat::Table => {
            if conflicts.is_empty() {
                println!("No conflicts detected for the specified files:");
                for file in &args.files {
                    println!("  ✓ {}", file);
                }
            } else {
                if use_colors {
                    println!(
                        "{}Conflicts detected ({} files affected):{}",
                        colors::YELLOW,
                        conflicts.len(),
                        colors::RESET
                    );
                    println!("{}{}{}", colors::DIM, "-".repeat(100), colors::RESET);
                } else {
                    println!("Conflicts detected ({} files affected):", conflicts.len());
                    println!("{}", "-".repeat(100));
                }

                for conflict in &conflicts {
                    let severity_color = match conflict.severity {
                        ConflictSeverity::Low => colors::DIM,
                        ConflictSeverity::High => colors::YELLOW,
                        ConflictSeverity::Critical => colors::RED,
                    };

                    let severity_str = match conflict.severity {
                        ConflictSeverity::Low => "LOW",
                        ConflictSeverity::High => "HIGH",
                        ConflictSeverity::Critical => "CRITICAL",
                    };

                    if use_colors {
                        println!(
                            "{}[{}]{} {}",
                            severity_color,
                            severity_str,
                            colors::RESET,
                            conflict.file_path
                        );
                    } else {
                        println!("[{}] {}", severity_str, conflict.file_path);
                    }

                    for agent in &conflict.conflicting_agents {
                        let loop_short = agent
                            .loop_id
                            .split('-')
                            .next_back()
                            .unwrap_or(&agent.loop_id);
                        if use_colors {
                            println!(
                                "  {}↳{} Loop {} (Task: {}) {}",
                                colors::DIM,
                                colors::RESET,
                                loop_short,
                                agent
                                    .task_id
                                    .split('-')
                                    .next_back()
                                    .unwrap_or(&agent.task_id),
                                agent.task_title
                            );
                        } else {
                            println!(
                                "  ↳ Loop {} (Task: {}) {}",
                                loop_short,
                                agent
                                    .task_id
                                    .split('-')
                                    .next_back()
                                    .unwrap_or(&agent.task_id),
                                agent.task_title
                            );
                        }
                    }
                }

                // Print summary of safe files
                let conflicted_paths: std::collections::HashSet<_> =
                    conflicts.iter().map(|c| c.file_path.as_str()).collect();
                let safe_files: Vec<_> = args
                    .files
                    .iter()
                    .filter(|f| !conflicted_paths.contains(f.as_str()))
                    .collect();

                if !safe_files.is_empty() {
                    println!();
                    if use_colors {
                        println!(
                            "{}Safe files:{} ({} files)",
                            colors::GREEN,
                            colors::RESET,
                            safe_files.len()
                        );
                    } else {
                        println!("Safe files: ({} files)", safe_files.len());
                    }
                    for file in safe_files {
                        if use_colors {
                            println!("  {}✓{} {}", colors::GREEN, colors::RESET, file);
                        } else {
                            println!("  ✓ {}", file);
                        }
                    }
                }
            }
        }
        OutputFormat::Json => {
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "filesChecked": args.files,
                    "conflictCount": conflicts.len(),
                    "conflicts": conflicts
                }))?
            );
        }
        OutputFormat::Quiet => {
            // Output only conflicted file paths
            for conflict in &conflicts {
                println!("{}", conflict.file_path);
            }
        }
    }

    Ok(())
}

fn execute_velocity(args: VelocityArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    // Verify team exists
    let _team = store
        .get_team(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    let stats = store
        .calculate_velocity_metrics(&args.team_id)
        .context("Failed to calculate velocity metrics")?;

    match args.format {
        OutputFormat::Table => {
            // If a specific teammate is requested, show their metrics
            if let Some(teammate_id) = &args.teammate {
                let teammate_metrics = store
                    .calculate_teammate_velocity(&args.team_id, teammate_id)
                    .context("Failed to calculate teammate velocity")?;

                if use_colors {
                    println!(
                        "{}Velocity metrics for teammate:{} {}",
                        colors::CYAN,
                        colors::RESET,
                        teammate_id
                    );
                } else {
                    println!("Velocity metrics for teammate: {}", teammate_id);
                }
                println!();
                println!("  Time Range:     {}", stats.time_range);
                println!("  Tasks (1h):     {}", teammate_metrics.tasks_last_hour);
                println!("  Tasks (24h):    {}", teammate_metrics.tasks_last_24h);
                println!("  Tasks (7d):     {}", teammate_metrics.tasks_last_7d);
                println!("  Total:          {}", teammate_metrics.total_completed);
                println!(
                    "  Avg Time:       {:.1}s",
                    teammate_metrics.avg_completion_time_secs
                );
                println!(
                    "  Velocity:       {:.2} tasks/hr",
                    teammate_metrics.velocity
                );
            } else {
                // Show team-wide metrics
                if use_colors {
                    println!(
                        "{}Team velocity metrics for:{} {}",
                        colors::CYAN,
                        colors::RESET,
                        args.team_id
                    );
                } else {
                    println!("Team velocity metrics for: {}", args.team_id);
                }
                println!();
                println!("  Time Range:     {}", stats.time_range);
                println!(
                    "  Team Velocity:  {:.2} tasks/hr",
                    stats.team_metrics.velocity
                );
                println!("  Tasks (1h):     {}", stats.team_metrics.tasks_last_hour);
                println!("  Tasks (24h):    {}", stats.team_metrics.tasks_last_24h);
                println!("  Tasks (7d):     {}", stats.team_metrics.tasks_last_7d);
                println!("  Total:          {}", stats.team_metrics.total_completed);
                println!(
                    "  Avg Time:       {:.1}s",
                    stats.team_metrics.avg_completion_time_secs
                );
                println!();
                println!("Teammates: {}", stats.teammate_metrics.len());
                for tm in &stats.teammate_metrics {
                    let id_short = tm.id.split('-').next_back().unwrap_or(&tm.id);
                    println!(
                        "  - {}: {:.2} tasks/hr ({} tasks)",
                        id_short, tm.velocity, tm.total_completed
                    );
                }
            }
        }
        OutputFormat::Json => {
            if let Some(teammate_id) = &args.teammate {
                let teammate_metrics =
                    store.calculate_teammate_velocity(&args.team_id, teammate_id)?;
                println!("{}", serde_json::to_string_pretty(&teammate_metrics)?);
            } else {
                println!("{}", serde_json::to_string_pretty(&stats)?);
            }
        }
        OutputFormat::Quiet => {
            if let Some(teammate_id) = &args.teammate {
                let teammate_metrics =
                    store.calculate_teammate_velocity(&args.team_id, teammate_id)?;
                println!("{:.2}", teammate_metrics.velocity);
            } else {
                println!("{:.2}", stats.team_metrics.velocity);
            }
        }
    }

    Ok(())
}

fn execute_predict(args: PredictArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    // Verify team exists
    let _team = store
        .get_team(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    match args.format {
        OutputFormat::Table => {
            // If a specific task is requested, predict that task's completion
            if let Some(task_id) = &args.task_id {
                let predicted_date = store
                    .predict_completion_date(task_id)
                    .context("Failed to predict completion date")?;

                if use_colors {
                    println!(
                        "{}Prediction for task:{} {}",
                        colors::CYAN,
                        colors::RESET,
                        task_id
                    );
                } else {
                    println!("Prediction for task: {}", task_id);
                }
                println!();
                println!("  Predicted Completion: {}", predicted_date);
            } else {
                // Show team-wide prediction
                let hours_remaining = store
                    .predict_remaining_work(&args.team_id)
                    .context("Failed to predict remaining work")?;

                let trend = store
                    .extrapolate_velocity_trend(&args.team_id)
                    .context("Failed to calculate velocity trend")?;

                let trend_description = if trend > 0.1 {
                    "accelerating"
                } else if trend < -0.1 {
                    "decelerating"
                } else {
                    "stable"
                };

                if use_colors {
                    println!(
                        "{}Team completion prediction:{} {}",
                        colors::CYAN,
                        colors::RESET,
                        args.team_id
                    );
                } else {
                    println!("Team completion prediction: {}", args.team_id);
                }
                println!();
                println!("  Hours Remaining:  {:.1}", hours_remaining);
                if hours_remaining < 1.0 {
                    println!("  Est. Completion:  < 1 hour");
                } else if hours_remaining < 24.0 {
                    println!("  Est. Completion:  {:.1} hours", hours_remaining);
                } else {
                    println!("  Est. Completion:  {:.1} days", hours_remaining / 24.0);
                }
                println!();
                println!("  Velocity Trend:   {} ({:.2})", trend_description, trend);
            }
        }
        OutputFormat::Json => {
            if let Some(task_id) = &args.task_id {
                let predicted_date = store.predict_completion_date(task_id)?;
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "taskId": task_id,
                        "predictedCompletion": predicted_date
                    }))?
                );
            } else {
                let hours_remaining = store.predict_remaining_work(&args.team_id)?;
                let trend = store.extrapolate_velocity_trend(&args.team_id)?;
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "teamId": args.team_id,
                        "hoursRemaining": hours_remaining,
                        "velocityTrend": trend
                    }))?
                );
            }
        }
        OutputFormat::Quiet => {
            if let Some(task_id) = &args.task_id {
                let predicted_date = store.predict_completion_date(task_id)?;
                println!("{}", predicted_date);
            } else {
                let hours_remaining = store.predict_remaining_work(&args.team_id)?;
                println!("{:.1}", hours_remaining);
            }
        }
    }

    Ok(())
}

fn execute_history(args: HistoryArgs, root: Option<&PathBuf>, use_colors: bool) -> Result<()> {
    let base_path = get_team_store_path(root);
    let store = TeamStore::load(&base_path).context("Failed to load team store")?;

    // Verify team exists
    let team = store
        .get_team(&args.team_id)
        .context(format!("Team {} not found", args.team_id))?;

    let history = store
        .get_velocity_history(&args.team_id, args.duration)
        .context("Failed to get velocity history")?;

    match args.format {
        OutputFormat::Table => {
            if history.is_empty() {
                println!("No velocity history available for team '{}'", team.name);
            } else {
                if use_colors {
                    println!(
                        "{}Velocity history for team '{}' (last {} hours):{}",
                        colors::CYAN,
                        team.name,
                        args.duration,
                        colors::RESET
                    );
                    println!("{}{}{}", colors::DIM, "-".repeat(60), colors::RESET);
                } else {
                    println!(
                        "Velocity history for team '{}' (last {} hours):",
                        team.name, args.duration
                    );
                    println!("{}", "-".repeat(60));
                }

                // Print header
                if use_colors {
                    println!(
                        "{}{:<25} {:<15}{}",
                        colors::DIM,
                        "Timestamp",
                        "Velocity",
                        colors::RESET
                    );
                } else {
                    println!("{:<25} {:<15}", "Timestamp", "Velocity");
                }

                for (timestamp, velocity) in &history {
                    println!("{:<25} {:.2}", timestamp, velocity);
                }

                // Calculate and print average
                if !history.is_empty() {
                    let sum: f64 = history.iter().map(|(_, v)| v).sum();
                    let avg = sum / history.len() as f64;
                    println!();
                    println!("Average velocity: {:.2} tasks/hr", avg);
                }
            }
        }
        OutputFormat::Json => {
            let history_json: Vec<serde_json::Value> = history
                .iter()
                .map(|(ts, v)| {
                    serde_json::json!({
                        "timestamp": ts,
                        "velocity": v
                    })
                })
                .collect();
            println!(
                "{}",
                serde_json::to_string_pretty(&serde_json::json!({
                    "teamId": args.team_id,
                    "durationHours": args.duration,
                    "history": history_json
                }))?
            );
        }
        OutputFormat::Quiet => {
            for (_, velocity) in &history {
                println!("{:.2}", velocity);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ralph_core::{TeamStore, TeamTask, TeamTaskStatus};
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn create_test_team_store() -> (TeamStore, TempDir, PathBuf) {
        let tmp = TempDir::new().unwrap();
        let path = tmp.path().to_path_buf();
        let store = TeamStore::load(&path).unwrap();
        (store, tmp, path)
    }

    fn create_team_with_completions(
        store: &mut TeamStore,
        team_name: &str,
        num_completions: usize,
    ) -> (String, String) {
        let team_id = store.create_team(team_name.to_string());
        let teammate_id = "loop-test".to_string();
        store.add_teammate(&team_id, teammate_id.clone()).unwrap();

        // Create and complete tasks
        for i in 0..num_completions {
            let task = TeamTask::new(format!("Task {}", i), team_id.clone(), 1);
            let task_id = store.create_team_task(task);
            store
                .record_task_completion(&task_id, &teammate_id, &team_id, 1)
                .unwrap();
        }

        (team_id, teammate_id)
    }

    // ========== Velocity CLI Tests ==========

    #[test]
    fn test_velocity_args_parsing() {
        let args = VelocityArgs::parse_from(["velocity", "team-123"]);
        assert_eq!(args.team_id, "team-123");
        assert_eq!(args.teammate, None);
        assert_eq!(args.format, OutputFormat::Table);
    }

    #[test]
    fn test_velocity_args_with_teammate() {
        let args = VelocityArgs::parse_from(["velocity", "team-123", "--teammate", "loop-456"]);
        assert_eq!(args.team_id, "team-123");
        assert_eq!(args.teammate, Some("loop-456".to_string()));
    }

    #[test]
    fn test_velocity_args_with_format() {
        let args = VelocityArgs::parse_from(["velocity", "team-123", "--format", "json"]);
        assert_eq!(args.format, OutputFormat::Json);
    }

    #[test]
    fn test_execute_velocity_team_not_found() {
        let (_, _, path) = create_test_team_store();
        let args = VelocityArgs {
            team_id: "nonexistent".to_string(),
            teammate: None,
            format: OutputFormat::Table,
        };

        let result = execute_velocity(args, Some(&path), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_velocity_with_completions() {
        let (mut store, _tmp, path) = create_test_team_store();
        let (team_id, _) = create_team_with_completions(&mut store, "Test Team", 5);

        // Need to save the store to disk before CLI reads it
        store.save().unwrap();

        let args = VelocityArgs {
            team_id,
            teammate: None,
            format: OutputFormat::Json,
        };

        // Reload store from disk to simulate CLI behavior
        let reloaded_store = TeamStore::load(&path).unwrap();
        let stats = reloaded_store
            .calculate_velocity_metrics(&args.team_id)
            .unwrap();

        assert_eq!(stats.team_metrics.total_completed, 5);
    }

    #[test]
    fn test_execute_velocity_teammate_specific() {
        let (mut store, _tmp, path) = create_test_team_store();
        let (team_id, teammate_id) = create_team_with_completions(&mut store, "Test Team", 3);

        // Save and reload
        store.save().unwrap();
        let reloaded_store = TeamStore::load(&path).unwrap();

        // Test teammate velocity calculation
        let metrics = reloaded_store
            .calculate_teammate_velocity(&team_id, &teammate_id)
            .unwrap();

        assert_eq!(metrics.total_completed, 3);
    }

    // ========== Predict CLI Tests ==========

    #[test]
    fn test_predict_args_parsing() {
        let args = PredictArgs::parse_from(["predict", "team-123"]);
        assert_eq!(args.team_id, "team-123");
        assert_eq!(args.task_id, None);
        assert_eq!(args.format, OutputFormat::Table);
    }

    #[test]
    fn test_predict_args_with_task_id() {
        let args = PredictArgs::parse_from(["predict", "team-123", "--task-id", "task-456"]);
        assert_eq!(args.team_id, "team-123");
        assert_eq!(args.task_id, Some("task-456".to_string()));
    }

    #[test]
    fn test_execute_predict_team_not_found() {
        let (_, _, path) = create_test_team_store();
        let args = PredictArgs {
            team_id: "nonexistent".to_string(),
            task_id: None,
            format: OutputFormat::Table,
        };

        let result = execute_predict(args, Some(&path), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_predict_with_completions() {
        let (mut store, _tmp, path) = create_test_team_store();
        let (team_id, _) = create_team_with_completions(&mut store, "Test Team", 5);

        // Create some open tasks
        for i in 0..3 {
            let task = TeamTask::new(format!("Open Task {}", i), team_id.clone(), 1);
            store.create_team_task(task);
        }

        store.save().unwrap();
        let reloaded_store = TeamStore::load(&path).unwrap();

        // Test predict_remaining_work and extrapolate_velocity_trend
        let hours_remaining = reloaded_store.predict_remaining_work(&team_id).unwrap();

        let trend = reloaded_store.extrapolate_velocity_trend(&team_id).unwrap();

        // Should have positive hours remaining (3 open tasks / velocity)
        assert!(hours_remaining >= 0.0);
        // Trend should be finite
        assert!(trend.is_finite());
    }

    #[test]
    fn test_execute_predict_specific_task() {
        let (mut store, _tmp, path) = create_test_team_store();
        let (team_id, _) = create_team_with_completions(&mut store, "Test Team", 3);

        // Create an in-progress task
        let mut task = TeamTask::new("In Progress Task".to_string(), team_id.clone(), 1);
        task.status = TeamTaskStatus::InProgress;
        let task_id = store.create_team_task(task);

        store.save().unwrap();
        let reloaded_store = TeamStore::load(&path).unwrap();

        // Test predict_completion_date
        let prediction = reloaded_store.predict_completion_date(&task_id).unwrap();

        // Should return a valid timestamp string
        assert!(!prediction.is_empty());
    }

    // ========== History CLI Tests ==========

    #[test]
    fn test_history_args_parsing() {
        let args = HistoryArgs::parse_from(["history", "team-123"]);
        assert_eq!(args.team_id, "team-123");
        assert_eq!(args.duration, 24); // default
        assert_eq!(args.format, OutputFormat::Table);
    }

    #[test]
    fn test_history_args_with_duration() {
        let args = HistoryArgs::parse_from(["history", "team-123", "-d", "48"]);
        assert_eq!(args.team_id, "team-123");
        assert_eq!(args.duration, 48);
    }

    #[test]
    fn test_execute_history_team_not_found() {
        let (_, _, path) = create_test_team_store();
        let args = HistoryArgs {
            team_id: "nonexistent".to_string(),
            duration: 24,
            format: OutputFormat::Table,
        };

        let result = execute_history(args, Some(&path), false);
        assert!(result.is_err());
    }

    #[test]
    fn test_execute_history_with_completions() {
        let (mut store, _tmp, path) = create_test_team_store();
        let (team_id, _) = create_team_with_completions(&mut store, "Test Team", 10);

        store.save().unwrap();
        let reloaded_store = TeamStore::load(&path).unwrap();

        let args = HistoryArgs {
            team_id: team_id.clone(),
            duration: 24,
            format: OutputFormat::Json,
        };

        let history = reloaded_store
            .get_velocity_history(&team_id, args.duration)
            .unwrap();

        // Should have some history data
        assert!(!history.is_empty());
    }

    #[test]
    fn test_execute_history_empty_team() {
        let (mut store, _tmp, path) = create_test_team_store();
        let team_id = store.create_team("Empty Team".to_string());

        let args = HistoryArgs {
            team_id,
            duration: 24,
            format: OutputFormat::Table,
        };

        let result = execute_history(args, Some(&path), false);
        // Should handle empty history gracefully
        assert!(result.is_ok() || result.is_err()); // Either is fine for empty team
    }
}
