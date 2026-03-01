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
                if args.from.is_some() {
                    println!("No messages from {}", args.from.unwrap());
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
                        .map(|s| s.split('-').last().unwrap_or(s).to_string())
                        .unwrap_or_else(|| "(unknown)".to_string());

                    let timestamp = msg.timestamp.format("%Y-%m-%d %H:%M:%S").to_string();

                    let content_truncated = if msg.event.payload.len() > 60 {
                        crate::display::truncate(&msg.event.payload, 60)
                    } else {
                        msg.event.payload.clone()
                    };

                    let msg_id_short = msg.id.split('-').last().unwrap_or(&msg.id);

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
                } else {
                    if use_colors {
                        println!(
                            "{}Suggested task: {}{}",
                            colors::GREEN,
                            task_id,
                            colors::RESET
                        );
                    } else {
                        println!("Suggested task: {}", task_id);
                    }
                }
            } else {
                if use_colors {
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
                        let loop_short = agent.loop_id.split('-').last().unwrap_or(&agent.loop_id);
                        if use_colors {
                            println!(
                                "  {}↳{} Loop {} (Task: {}) {}{}",
                                colors::DIM,
                                colors::RESET,
                                loop_short,
                                agent.task_id.split('-').last().unwrap_or(&agent.task_id),
                                agent.task_title,
                                colors::RESET
                            );
                        } else {
                            println!(
                                "  ↳ Loop {} (Task: {}) {}",
                                loop_short,
                                agent.task_id.split('-').last().unwrap_or(&agent.task_id),
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
                        let loop_short = agent.loop_id.split('-').last().unwrap_or(&agent.loop_id);
                        if use_colors {
                            println!(
                                "  {}↳{} Loop {} (Task: {}) {}",
                                colors::DIM,
                                colors::RESET,
                                loop_short,
                                agent.task_id.split('-').last().unwrap_or(&agent.task_id),
                                agent.task_title
                            );
                        } else {
                            println!(
                                "  ↳ Loop {} (Task: {}) {}",
                                loop_short,
                                agent.task_id.split('-').last().unwrap_or(&agent.task_id),
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
