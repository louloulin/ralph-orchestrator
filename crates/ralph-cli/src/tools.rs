//! CLI commands for the `ralph tools` namespace.
//!
//! Ralph's runtime tools - things Ralph uses during orchestration.
//! This namespace contains agent-facing tools, while top-level commands
//! are user-facing.
//!
//! Subcommands:
//! - `memory`: Persistent memories for accumulated learning
//! - `task`: Work item tracking (beads-lite)
//! - `skill`: Load skill content on demand
//! - `interact`: Human-in-the-loop communication (progress updates, notifications)
//! - `test`: Agent-driven E2E testing tools
//! - `mailbox`: Cross-loop agent-to-agent messaging

use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::interact;
use crate::mailbox;
use crate::memory;
use crate::skill_cli;
use crate::task_cli;
use crate::test_tools;

/// Ralph's runtime tools (agent-facing).
#[derive(Parser, Debug)]
pub struct ToolsArgs {
    #[command(subcommand)]
    pub command: ToolsCommands,
}

#[derive(Subcommand, Debug)]
pub enum ToolsCommands {
    /// Manage persistent memories for accumulated learning
    Memory(memory::MemoryArgs),

    /// Manage work items (task tracking)
    Task(task_cli::TaskArgs),

    /// Load and manage skills
    Skill(skill_cli::SkillArgs),

    /// Interact with human via Telegram (progress updates, notifications)
    Interact(interact::InteractArgs),

    /// Agent-driven E2E testing tools
    Test(test_tools::TestToolsArgs),

    /// Cross-loop agent-to-agent mailbox messaging
    Mailbox(mailbox::MailboxArgs),
}

/// Execute a tools command.
pub async fn execute(args: ToolsArgs, use_colors: bool) -> Result<()> {
    match args.command {
        ToolsCommands::Memory(memory_args) => memory::execute(memory_args, use_colors),
        ToolsCommands::Task(task_args) => task_cli::execute(task_args, use_colors),
        ToolsCommands::Skill(skill_args) => skill_cli::execute(skill_args),
        ToolsCommands::Interact(interact_args) => interact::execute(interact_args).await,
        ToolsCommands::Test(test_args) => test_tools::execute(test_args).await,
        ToolsCommands::Mailbox(mailbox_args) => mailbox::execute(mailbox_args, use_colors),
    }
}
