//! Session compression for managing conversation length.
//!
//! When sessions grow too long, they can be compressed using LLM-based
//! summarization. This module provides:
//! - `SessionCompressor`: LLM-powered compression
//! - `CompressedSummary`: Structured summary output
//!
//! The compression extracts:
//! - Key decisions made
//! - Patterns discovered
//! - Fixes applied
//! - Context for continuation

use std::io;

use serde::{Deserialize, Serialize};

use super::{Session, SessionMessage};

/// Summary produced by compressing a session.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CompressedSummary {
    /// Brief summary of the conversation
    pub summary: String,
    /// Key decisions made during the session
    pub decisions: Vec<String>,
    /// Patterns discovered
    pub patterns: Vec<String>,
    /// Fixes applied
    pub fixes: Vec<String>,
    /// Context for continuation
    pub context: String,
}

/// Configuration for session compression.
#[derive(Debug, Clone)]
pub struct CompressionConfig {
    /// Maximum messages before compression is triggered
    pub max_messages: usize,
    /// Number of recent messages to keep uncompressed
    pub keep_recent: usize,
    /// Whether to automatically compress
    pub auto_compress: bool,
}

impl Default for CompressionConfig {
    fn default() -> Self {
        Self {
            max_messages: 100,
            keep_recent: 10,
            auto_compress: true,
        }
    }
}

/// Session compressor using LLM for summarization.
///
/// This compressor creates structured summaries of conversations
/// that can be used to maintain context while reducing token usage.
pub struct SessionCompressor {
    config: CompressionConfig,
}

impl SessionCompressor {
    /// Creates a new compressor with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: CompressionConfig::default(),
        }
    }

    /// Creates a compressor with custom configuration.
    #[must_use]
    pub fn with_config(config: CompressionConfig) -> Self {
        Self { config }
    }

    /// Returns the configuration.
    #[must_use]
    pub fn config(&self) -> &CompressionConfig {
        &self.config
    }

    /// Checks if a session needs compression.
    #[must_use]
    pub fn needs_compression(&self, session: &Session) -> bool {
        session.messages.len() > self.config.max_messages
    }

    /// Compresses a session's messages into a summary.
    ///
    /// This extracts key information from the conversation:
    /// - Decisions made
    /// - Patterns discovered
    /// - Fixes applied
    /// - Context for continuation
    ///
    /// # Arguments
    /// * `session` - The session to compress
    ///
    /// # Returns
    /// A compressed summary suitable for context injection
    pub async fn compress(&self, session: &Session) -> io::Result<CompressedSummary> {
        if session.messages.is_empty() {
            return Ok(CompressedSummary::default());
        }

        // Format messages for summarization
        let messages_text = self.format_messages_for_compression(&session.messages);

        // Build the compression prompt
        let _prompt = self.build_compression_prompt(&messages_text);

        // For now, return a simple summary based on message count
        // In a full implementation, this would call an LLM
        let summary = self.simple_summarize(&session.messages);

        Ok(CompressedSummary {
            summary: summary.clone(),
            decisions: self.extract_decisions(&session.messages),
            patterns: Vec::new(),
            fixes: Vec::new(),
            context: summary,
        })
    }

    /// Formats messages for compression.
    fn format_messages_for_compression(&self, messages: &[SessionMessage]) -> String {
        messages
            .iter()
            .map(|m| format!("{}: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n\n")
    }

    /// Builds the compression prompt for the LLM.
    fn build_compression_prompt(&self, messages_text: &str) -> String {
        format!(
            r#"Summarize the following conversation into a structured format.

CONVERSATION:
{}

Extract and organize into JSON format:
{{
  "summary": "Brief overview of what was discussed and accomplished",
  "decisions": ["List of key decisions made"],
  "patterns": ["Patterns or conventions discovered"],
  "fixes": ["Problems fixed during the conversation"],
  "context": "Key context needed for continuation"
}}

Focus on information that would help continue this work in a future session."#,
            messages_text
        )
    }

    /// Simple summarization without LLM (fallback).
    fn simple_summarize(&self, messages: &[SessionMessage]) -> String {
        let user_count = messages
            .iter()
            .filter(|m| m.role == super::MessageRole::User)
            .count();
        let assistant_count = messages
            .iter()
            .filter(|m| m.role == super::MessageRole::Assistant)
            .count();

        format!(
            "Session with {} user messages and {} assistant responses.",
            user_count, assistant_count
        )
    }

    /// Extracts potential decisions from messages (heuristic).
    fn extract_decisions(&self, messages: &[SessionMessage]) -> Vec<String> {
        let mut decisions = Vec::new();

        for message in messages {
            // Look for decision-related keywords
            let content_lower = message.content.to_lowercase();
            if content_lower.contains("decided")
                || content_lower.contains("chose")
                || content_lower.contains("selected")
                || content_lower.contains("will use")
            {
                // Extract first line as a potential decision
                if let Some(first_line) = message.content.lines().next()
                    && first_line.len() < 200
                {
                    decisions.push(first_line.to_string());
                }
            }
        }

        decisions
    }

    /// Splits a session into compressible and recent portions.
    ///
    /// Returns (messages_to_compress, recent_messages_to_keep)
    #[must_use]
    pub fn split_for_compression<'a>(
        &self,
        session: &'a Session,
    ) -> (Vec<&'a SessionMessage>, Vec<&'a SessionMessage>) {
        let total = session.messages.len();

        if total <= self.config.keep_recent {
            return (Vec::new(), session.messages.iter().collect());
        }

        let split_point = total - self.config.keep_recent;
        let to_compress = session.messages[..split_point].iter().collect();
        let to_keep = session.messages[split_point..].iter().collect();

        (to_compress, to_keep)
    }
}

impl Default for SessionCompressor {
    fn default() -> Self {
        Self::new()
    }
}

/// Result of applying compression to a session.
#[derive(Debug, Clone)]
pub struct CompressionResult {
    /// The compressed summary
    pub summary: CompressedSummary,
    /// Number of messages that were compressed
    pub messages_compressed: usize,
    /// Number of messages kept as-is
    pub messages_kept: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::Session;

    fn create_test_session() -> Session {
        let mut session = Session::new("Test Session");
        for i in 0..50 {
            session.append(SessionMessage::user(format!("User message {}", i)));
            session.append(SessionMessage::assistant(format!(
                "Assistant response {}",
                i
            )));
        }
        session
    }

    #[test]
    fn test_needs_compression() {
        let compressor = SessionCompressor::new();
        let session = create_test_session();

        // Default max_messages is 100, session has 100 messages
        assert!(!compressor.needs_compression(&session));

        // Create a smaller threshold config
        let small_config = CompressionConfig {
            max_messages: 50,
            ..Default::default()
        };
        let small_compressor = SessionCompressor::with_config(small_config);
        assert!(small_compressor.needs_compression(&session));
    }

    #[test]
    fn test_split_for_compression() {
        let compressor = SessionCompressor::new();
        let session = create_test_session();

        let (to_compress, to_keep) = compressor.split_for_compression(&session);

        // Default keep_recent is 10
        assert_eq!(to_keep.len(), 10);
        assert_eq!(to_compress.len(), 90);
    }

    #[test]
    fn test_split_small_session() {
        let compressor = SessionCompressor::new();
        let mut session = Session::new("Small Session");
        session.append(SessionMessage::user("Hello"));

        let (to_compress, to_keep) = compressor.split_for_compression(&session);

        // Small session should keep all messages
        assert!(to_compress.is_empty());
        assert_eq!(to_keep.len(), 1);
    }

    #[tokio::test]
    async fn test_compress_empty_session() {
        let compressor = SessionCompressor::new();
        let session = Session::new("Empty Session");

        let result = compressor.compress(&session).await.unwrap();

        assert!(result.summary.is_empty());
        assert!(result.decisions.is_empty());
    }

    #[tokio::test]
    async fn test_compress_session() {
        let compressor = SessionCompressor::new();
        let session = create_test_session();

        let result = compressor.compress(&session).await.unwrap();

        // Should have a summary
        assert!(!result.summary.is_empty());
        // Should contain message counts
        assert!(result.summary.contains("50 user messages"));
    }

    #[test]
    fn test_extract_decisions() {
        let compressor = SessionCompressor::new();
        let mut session = Session::new("Decision Session");

        session.append(SessionMessage::user("What framework should we use?"));
        session.append(SessionMessage::assistant(
            "We decided to use React for the frontend.",
        ));

        let decisions = compressor.extract_decisions(&session.messages);

        assert!(!decisions.is_empty());
        assert!(decisions[0].contains("decided"));
    }

    #[test]
    fn test_compression_config_default() {
        let config = CompressionConfig::default();

        assert_eq!(config.max_messages, 100);
        assert_eq!(config.keep_recent, 10);
        assert!(config.auto_compress);
    }
}
