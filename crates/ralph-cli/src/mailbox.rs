//! CLI commands for mailbox management (agent-to-agent communication).
//!
//! Provides commands for sending, listing, reading, and clearing mailbox messages
//! for cross-loop communication in Claude Code Agent Teams.
//!
//! # Commands
//!
//! - `send`: Send a message to a specific loop's mailbox
//! - `list`: List messages in a mailbox or all mailboxes
//! - `read`: Read a specific message by ID
//! - `clear`: Clear all messages from a mailbox

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use ralph_core::mailbox_store::{MailboxEntry, MailboxStore};
use ralph_proto::Event;
use tabled::{
    Table, Tabled,
    settings::{Alignment, Modify, Style, object::Rows},
};

/// Mailbox management commands.
#[derive(Parser, Debug)]
pub struct MailboxArgs {
    #[command(subcommand)]
    pub command: MailboxCommands,
}

#[derive(Subcommand, Debug)]
pub enum MailboxCommands {
    /// Send a message to a loop's mailbox.
    Send {
        /// Target loop ID (e.g., "loop-20260228-143052-a3f2").
        loop_id: String,

        /// Message content to send.
        message: String,

        /// Topic for the message (default: "mailbox.message").
        #[arg(short, long, default_value = "mailbox.message")]
        topic: String,
    },

    /// List messages in a mailbox or all mailboxes.
    List {
        /// Loop ID to list messages for (omit to list all mailboxes).
        #[arg(long)]
        loop_id: Option<String>,

        /// Output format: table, json, quiet.
        #[arg(short, long, default_value = "table")]
        format: String,
    },

    /// Read a specific message by ID.
    Read {
        /// Loop ID containing the message.
        #[arg(long)]
        loop_id: String,

        /// Message ID to read.
        message_id: String,

        /// Output format: table, json, quiet.
        #[arg(short, long, default_value = "table")]
        format: String,
    },

    /// Clear all messages from a mailbox.
    Clear {
        /// Loop ID to clear.
        #[arg(long)]
        loop_id: String,

        /// Skip confirmation prompt.
        #[arg(short, long)]
        force: bool,
    },
}

/// Execute a mailbox command.
pub fn execute(args: MailboxArgs, use_colors: bool) -> Result<()> {
    let root = std::env::current_dir().context("Failed to get current directory")?;
    let store = MailboxStore::new(root.join(".ralph"));

    match args.command {
        MailboxCommands::Send {
            loop_id,
            message,
            topic,
        } => execute_send(&store, &loop_id, &message, &topic, use_colors),
        MailboxCommands::List { loop_id, format } => {
            execute_list(&store, loop_id.as_ref(), &format, use_colors)
        }
        MailboxCommands::Read {
            loop_id,
            message_id,
            format,
        } => execute_read(&store, &loop_id, &message_id, &format, use_colors),
        MailboxCommands::Clear { loop_id, force } => {
            execute_clear(&store, &loop_id, force, use_colors)
        }
    }
}

/// Execute the send command.
fn execute_send(
    store: &MailboxStore,
    loop_id: &str,
    message: &str,
    topic: &str,
    use_colors: bool,
) -> Result<()> {
    let event = Event::new(topic, message).with_target_loop(loop_id);

    let msg_id = store
        .send(loop_id, &event)
        .context("Failed to send message")?;

    if use_colors {
        println!(
            "✅ Message {} sent to loop {}",
            console::style(&msg_id).green(),
            console::style(loop_id).cyan()
        );
    } else {
        println!("✅ Message {} sent to loop {}", msg_id, loop_id);
    }

    Ok(())
}

/// Execute the list command.
fn execute_list(
    store: &MailboxStore,
    loop_id: Option<&String>,
    format: &str,
    use_colors: bool,
) -> Result<()> {
    match loop_id {
        Some(id) => list_mailbox_messages(store, id, format, use_colors),
        None => list_all_mailboxes(store, format, use_colors),
    }
}

/// List messages in a specific mailbox.
fn list_mailbox_messages(
    store: &MailboxStore,
    loop_id: &str,
    format: &str,
    use_colors: bool,
) -> Result<()> {
    let messages = store.receive(loop_id).context("Failed to read mailbox")?;

    if messages.is_empty() {
        if use_colors {
            println!("Mailbox {} is empty", console::style(loop_id).cyan());
        } else {
            println!("Mailbox {} is empty", loop_id);
        }
        return Ok(());
    }

    match format {
        "json" => {
            let json =
                serde_json::to_string_pretty(&messages).context("Failed to serialize messages")?;
            println!("{}", json);
        }
        "quiet" => {
            for msg in &messages {
                println!("{}", msg.id);
            }
        }
        _ => {
            // table format
            print_messages_table(&messages, loop_id, use_colors);
        }
    }

    Ok(())
}

/// List all mailboxes with pending messages.
fn list_all_mailboxes(store: &MailboxStore, format: &str, use_colors: bool) -> Result<()> {
    let mailboxes = store.list_mailboxes().context("Failed to list mailboxes")?;

    if mailboxes.is_empty() {
        println!("No mailboxes with pending messages");
        return Ok(());
    }

    match format {
        "json" => {
            // Get message counts for each mailbox
            let mut result = Vec::new();
            for loop_id in &mailboxes {
                let count = store.count(loop_id).unwrap_or(0);
                result.push(serde_json::json!({
                    "loop_id": loop_id,
                    "message_count": count
                }));
            }
            let json =
                serde_json::to_string_pretty(&result).context("Failed to serialize mailboxes")?;
            println!("{}", json);
        }
        "quiet" => {
            for loop_id in &mailboxes {
                println!("{}", loop_id);
            }
        }
        _ => {
            // table format
            print_mailboxes_table(store, &mailboxes, use_colors);
        }
    }

    Ok(())
}

/// Execute the read command.
fn execute_read(
    store: &MailboxStore,
    loop_id: &str,
    message_id: &str,
    format: &str,
    use_colors: bool,
) -> Result<()> {
    let messages = store.receive(loop_id).context("Failed to read mailbox")?;

    let message = messages
        .iter()
        .find(|m| m.id == message_id)
        .ok_or_else(|| {
            anyhow::anyhow!("Message {} not found in mailbox {}", message_id, loop_id)
        })?;

    match format {
        "json" => {
            let json =
                serde_json::to_string_pretty(message).context("Failed to serialize message")?;
            println!("{}", json);
        }
        "quiet" => {
            println!("{}", message.event.payload);
        }
        _ => {
            // table format (detailed view)
            print_message_detail(message, use_colors);
        }
    }

    Ok(())
}

/// Execute the clear command.
fn execute_clear(store: &MailboxStore, loop_id: &str, force: bool, use_colors: bool) -> Result<()> {
    // Check if mailbox exists and has messages
    let count = store.count(loop_id).context("Failed to count messages")?;

    if count == 0 {
        println!("Mailbox {} is already empty", loop_id);
        return Ok(());
    }

    // Confirm unless --force
    if !force {
        println!(
            "This will delete {} message(s) from mailbox {}",
            count, loop_id
        );
        print!("Are you sure? [y/N] ");

        use std::io::{self, BufRead, Write};
        let mut input = String::new();
        io::stdout().flush()?;
        io::stdin().lock().read_line(&mut input)?;

        if !input.trim().eq_ignore_ascii_case("y") {
            println!("Cancelled");
            return Ok(());
        }
    }

    store.clear(loop_id).context("Failed to clear mailbox")?;

    if use_colors {
        println!(
            "✅ Mailbox {} cleared ({} messages deleted)",
            console::style(loop_id).cyan(),
            console::style(count).yellow()
        );
    } else {
        println!(
            "✅ Mailbox {} cleared ({} messages deleted)",
            loop_id, count
        );
    }

    Ok(())
}

/// Row data for messages table.
#[derive(Tabled)]
struct MessageRow {
    #[tabled(rename = "ID")]
    id: String,
    #[tabled(rename = "Topic")]
    topic: String,
    #[tabled(rename = "Payload")]
    payload: String,
    #[tabled(rename = "Timestamp")]
    timestamp: String,
}

/// Print messages as a table.
fn print_messages_table(messages: &[MailboxEntry], loop_id: &str, use_colors: bool) {
    if use_colors {
        println!(
            "\n📬 Mailbox: {} ({} messages)\n",
            console::style(loop_id).cyan().bold(),
            console::style(messages.len()).yellow()
        );
    } else {
        println!("\nMailbox: {} ({} messages)\n", loop_id, messages.len());
    }

    let rows: Vec<MessageRow> = messages
        .iter()
        .map(|m| MessageRow {
            id: m.id.clone(),
            topic: m.event.topic.to_string(),
            payload: truncate(&m.event.payload, 50),
            timestamp: format_timestamp(m.timestamp),
        })
        .collect();

    let mut table = Table::new(rows);
    table.with(Style::rounded());
    table.with(Modify::new(Rows::new(1..)).with(Alignment::left()));

    println!("{}", table);
}

/// Row data for mailboxes table.
#[derive(Tabled)]
struct MailboxRow {
    #[tabled(rename = "Loop ID")]
    loop_id: String,
    #[tabled(rename = "Messages")]
    message_count: usize,
}

/// Print mailboxes as a table.
fn print_mailboxes_table(store: &MailboxStore, mailboxes: &[String], use_colors: bool) {
    if use_colors {
        println!(
            "\n📬 Mailboxes with Pending Messages ({} total)\n",
            console::style(mailboxes.len()).yellow()
        );
    } else {
        println!(
            "\nMailboxes with Pending Messages ({} total)\n",
            mailboxes.len()
        );
    }

    let rows: Vec<MailboxRow> = mailboxes
        .iter()
        .map(|loop_id| MailboxRow {
            loop_id: loop_id.clone(),
            message_count: store.count(loop_id).unwrap_or(0),
        })
        .collect();

    let mut table = Table::new(rows);
    table.with(Style::rounded());
    table.with(Modify::new(Rows::new(1..)).with(Alignment::left()));

    println!("{}", table);
}

/// Print detailed message information.
fn print_message_detail(message: &MailboxEntry, use_colors: bool) {
    if use_colors {
        println!("\n{}", console::style("Message Details").bold().cyan());
        println!("{}", console::style("─".repeat(50)).dim());
        println!("{:12} {}", console::style("ID:").dim(), message.id);
        println!(
            "{:12} {}",
            console::style("Topic:").dim(),
            message.event.topic
        );
        println!(
            "{:12} {}",
            console::style("Timestamp:").dim(),
            format_timestamp(message.timestamp)
        );

        if let Some(ref source) = message.event.source {
            println!("{:12} {}", console::style("Source:").dim(), source);
        }
        if let Some(ref target) = message.event.target {
            println!("{:12} {}", console::style("Target:").dim(), target);
        }
        if let Some(ref source_loop) = message.event.source_loop {
            println!(
                "{:12} {}",
                console::style("Source Loop:").dim(),
                source_loop
            );
        }
        if let Some(ref target_loop) = message.event.target_loop {
            println!(
                "{:12} {}",
                console::style("Target Loop:").dim(),
                target_loop
            );
        }

        println!("\n{}", console::style("Payload:").dim());
        println!("{}\n", message.event.payload);
    } else {
        println!("\nMessage Details");
        println!("{}", "─".repeat(50));
        println!("{:12} {}", "ID:", message.id);
        println!("{:12} {}", "Topic:", message.event.topic);
        println!(
            "{:12} {}",
            "Timestamp:",
            format_timestamp(message.timestamp)
        );

        if let Some(ref source) = message.event.source {
            println!("{:12} {}", "Source:", source);
        }
        if let Some(ref target) = message.event.target {
            println!("{:12} {}", "Target:", target);
        }
        if let Some(ref source_loop) = message.event.source_loop {
            println!("{:12} {}", "Source Loop:", source_loop);
        }
        if let Some(ref target_loop) = message.event.target_loop {
            println!("{:12} {}", "Target Loop:", target_loop);
        }

        println!("\nPayload:");
        println!("{}\n", message.event.payload);
    }
}

/// Format a timestamp for display.
fn format_timestamp(ts: DateTime<Utc>) -> String {
    ts.format("%Y-%m-%d %H:%M:%S UTC").to_string()
}

/// Truncate a string to a maximum length.
fn truncate(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}...", &s[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_short_string() {
        assert_eq!(truncate("hello", 10), "hello");
    }

    #[test]
    fn test_truncate_long_string() {
        // truncate(15) takes first (15-3)=12 chars: "hello world " then adds "..."
        let result = truncate("hello world this is a long string", 15);
        assert_eq!(result, "hello world ...");
    }

    #[test]
    fn test_truncate_exact_length() {
        assert_eq!(truncate("hello", 5), "hello");
    }

    #[test]
    fn test_format_timestamp() {
        let ts = DateTime::parse_from_rfc3339("2026-03-01T12:34:56Z")
            .unwrap()
            .with_timezone(&Utc);
        let formatted = format_timestamp(ts);
        assert_eq!(formatted, "2026-03-01 12:34:56 UTC");
    }
}
