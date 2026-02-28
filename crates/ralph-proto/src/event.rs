//! Event types for pub/sub messaging.

use crate::{HatId, Topic};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// The operational state of a teammate agent in the team system.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AgentStatus {
    /// Agent is idle and available for work
    Idle,
    /// Agent is actively processing a task
    Busy,
    /// Agent encountered an error and may need intervention
    Error,
    /// Agent is offline or not responding
    Offline,
}

/// Unique identifier for a Ralph loop (primary or worktree).
pub type LoopId = String;

/// Status of a team task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TeamTaskStatus {
    /// Available for self-assignment
    Todo,
    /// Assigned to a specific teammate
    InProgress,
    /// Ready for review
    Review,
    /// Completed successfully
    Done,
}

/// Events for team coordination and agent-to-agent communication.
///
/// These events enable the Claude Code Agent Teams integration pattern,
/// supporting task coordination, agent messaging, and team status tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TeamEvent {
    // === Task Assignment Events ===
    /// A new task has been created and is available for assignment.
    TaskCreated {
        /// The unique identifier of the created task.
        task_id: String,
        /// The team this task belongs to.
        team_id: String,
    },

    /// A task has been claimed by a teammate.
    TaskClaimed {
        /// The unique identifier of the claimed task.
        task_id: String,
        /// The loop that claimed the task.
        loop_id: LoopId,
    },

    /// A task has been released back to the queue.
    TaskReleased {
        /// The unique identifier of the released task.
        task_id: String,
        /// The loop that released the task.
        loop_id: LoopId,
    },

    /// A task's status has been updated.
    TaskStatusUpdate {
        /// The unique identifier of the task.
        task_id: String,
        /// The new status of the task.
        status: TeamTaskStatus,
    },

    // === Agent-to-Agent Communication ===
    /// A direct message from one agent to another.
    AgentMessage {
        /// The sender's loop identifier.
        from: LoopId,
        /// The recipient's loop identifier.
        to: LoopId,
        /// The message content.
        message: String,
        /// When the message was sent.
        timestamp: DateTime<Utc>,
    },

    // === Team Coordination ===
    /// Progress update for a team.
    TeamProgress {
        /// The team identifier.
        team_id: String,
        /// Number of tasks completed.
        tasks_completed: usize,
        /// Total number of tasks.
        tasks_total: usize,
    },

    // === Teammate Lifecycle ===
    /// A new teammate has joined the team.
    TeammateJoined {
        /// The team identifier.
        team_id: String,
        /// The loop identifier of the new teammate.
        loop_id: LoopId,
    },

    /// A teammate has left the team.
    TeammateLeft {
        /// The team identifier.
        team_id: String,
        /// The loop identifier of the departing teammate.
        loop_id: LoopId,
    },

    /// Heartbeat from a teammate indicating current status.
    TeammateHeartbeat {
        /// The loop identifier of the teammate.
        loop_id: LoopId,
        /// Current operational status of the teammate.
        status: AgentStatus,
    },
}

/// An event in the pub/sub system.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    /// The routing topic for this event.
    pub topic: Topic,

    /// The content/payload of the event.
    pub payload: String,

    /// The hat that published this event (if any).
    pub source: Option<HatId>,

    /// Optional target hat for direct handoff.
    pub target: Option<HatId>,
}

impl Event {
    /// Creates a new event with the given topic and payload.
    pub fn new(topic: impl Into<Topic>, payload: impl Into<String>) -> Self {
        Self {
            topic: topic.into(),
            payload: payload.into(),
            source: None,
            target: None,
        }
    }

    /// Sets the source hat for this event.
    #[must_use]
    pub fn with_source(mut self, source: impl Into<HatId>) -> Self {
        self.source = Some(source.into());
        self
    }

    /// Sets the target hat for direct handoff.
    #[must_use]
    pub fn with_target(mut self, target: impl Into<HatId>) -> Self {
        self.target = Some(target.into());
        self
    }
}
