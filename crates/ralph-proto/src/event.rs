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

impl From<TeamEvent> for Event {
    fn from(team_event: TeamEvent) -> Self {
        let topic = match &team_event {
            TeamEvent::TaskCreated { .. }
            | TeamEvent::TaskClaimed { .. }
            | TeamEvent::TaskReleased { .. }
            | TeamEvent::TaskStatusUpdate { .. } => Topic::from("team.task"),

            TeamEvent::AgentMessage { .. } => Topic::from("team.message"),

            TeamEvent::TeamProgress { .. } => Topic::from("team.progress"),

            TeamEvent::TeammateJoined { .. }
            | TeamEvent::TeammateLeft { .. }
            | TeamEvent::TeammateHeartbeat { .. } => Topic::from("team.teammate"),
        };

        let payload =
            serde_json::to_string(&team_event).expect("TeamEvent serialization should never fail");

        Event::new(topic, payload)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_team_event_task_created() {
        let team_event = TeamEvent::TaskCreated {
            task_id: "task-123".to_string(),
            team_id: "team-abc".to_string(),
        };
        let event: Event = team_event.into();
        assert_eq!(event.topic, Topic::from("team.task"));
        assert!(event.payload.contains("task-123"));
        assert!(event.payload.contains("team-abc"));
    }

    #[test]
    fn test_from_team_event_task_claimed() {
        let team_event = TeamEvent::TaskClaimed {
            task_id: "task-456".to_string(),
            loop_id: "loop-xyz".to_string(),
        };
        let event: Event = team_event.into();
        assert_eq!(event.topic, Topic::from("team.task"));
        assert!(event.payload.contains("task-456"));
        assert!(event.payload.contains("loop-xyz"));
    }

    #[test]
    fn test_from_team_event_agent_message() {
        let team_event = TeamEvent::AgentMessage {
            from: "loop-1".to_string(),
            to: "loop-2".to_string(),
            message: "Hello!".to_string(),
            timestamp: Utc::now(),
        };
        let event: Event = team_event.into();
        assert_eq!(event.topic, Topic::from("team.message"));
        assert!(event.payload.contains("Hello!"));
    }

    #[test]
    fn test_from_team_event_team_progress() {
        let team_event = TeamEvent::TeamProgress {
            team_id: "team-abc".to_string(),
            tasks_completed: 5,
            tasks_total: 10,
        };
        let event: Event = team_event.into();
        assert_eq!(event.topic, Topic::from("team.progress"));
        assert!(event.payload.contains("team-abc"));
        assert!(event.payload.contains("5"));
        assert!(event.payload.contains("10"));
    }

    #[test]
    fn test_from_team_event_teammate_joined() {
        let team_event = TeamEvent::TeammateJoined {
            team_id: "team-abc".to_string(),
            loop_id: "loop-new".to_string(),
        };
        let event: Event = team_event.into();
        assert_eq!(event.topic, Topic::from("team.teammate"));
        assert!(event.payload.contains("team-abc"));
        assert!(event.payload.contains("loop-new"));
    }

    #[test]
    fn test_from_team_event_teammate_heartbeat() {
        let team_event = TeamEvent::TeammateHeartbeat {
            loop_id: "loop-active".to_string(),
            status: AgentStatus::Busy,
        };
        let event: Event = team_event.into();
        assert_eq!(event.topic, Topic::from("team.teammate"));
        assert!(event.payload.contains("loop-active"));
        assert!(event.payload.contains("Busy"));
    }

    #[test]
    fn test_from_team_event_serialization_roundtrip() {
        let original = TeamEvent::TaskCreated {
            task_id: "task-789".to_string(),
            team_id: "team-xyz".to_string(),
        };

        let event: Event = original.clone().into();
        let deserialized: TeamEvent =
            serde_json::from_str(&event.payload).expect("Should deserialize successfully");

        match deserialized {
            TeamEvent::TaskCreated { task_id, team_id } => {
                assert_eq!(task_id, "task-789");
                assert_eq!(team_id, "team-xyz");
            }
            _ => panic!("Wrong event type after roundtrip"),
        }
    }
}
