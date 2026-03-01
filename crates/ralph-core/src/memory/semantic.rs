//! LLM-based semantic ranking for memory retrieval.
//!
//! Uses Large Language Models to rank memories by semantic relevance
//! to a query, complementing keyword-based search.
//!
//! # Architecture
//!
//! - **SemanticRanker**: Ranks memories using LLM understanding
//! - **Relevance scoring**: LLM-judged relevance scores (0-1)
//! - **Prompt templates**: Structured prompts for consistent ranking
//! - **Hybrid approach**: Falls back to heuristic ranking if LLM unavailable
//!
//! # Example
//!
//! ```rust,no_run
//! use ralph_core::memory::Memory;
//! use ralph_core::memory::semantic::{SemanticRanker, RankOptions};
//!
//! # async fn example() -> Result<(), Box<dyn std::error::Error>> {
//! let memories = vec![/* ... */];
//! let ranker = SemanticRanker::new();
//!
//! let ranked = ranker.rank("rust async", &memories, &RankOptions::default()).await?;
//! # Ok(())
//! # }
//! ```

use crate::memory::Memory;
use std::collections::HashSet;

/// Relevance score from LLM (0.0 = not relevant, 1.0 = highly relevant).
pub type RelevanceScore = f64;

/// Ranking method to use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RankingMethod {
    /// Use LLM for semantic ranking (preferred).
    Llm,
    /// Use heuristic-based keyword matching (fallback).
    #[default]
    Heuristic,
    /// Try LLM first, fall back to heuristic on failure.
    Hybrid,
}

/// Options for semantic ranking.
#[derive(Debug, Clone)]
pub struct RankOptions {
    /// Maximum number of results to return (None = unlimited)
    pub limit: Option<usize>,

    /// Minimum relevance threshold (0.0-1.0)
    pub min_score: RelevanceScore,

    /// Whether to include scores in results
    pub include_scores: bool,

    /// Ranking method to use
    pub method: RankingMethod,
}

impl Default for RankOptions {
    fn default() -> Self {
        Self {
            limit: None,
            min_score: 0.3, // Default threshold
            include_scores: true,
            method: RankingMethod::Hybrid, // Default to hybrid for better results
        }
    }
}

impl RankOptions {
    /// Creates options with a limit.
    #[must_use]
    pub fn with_limit(limit: usize) -> Self {
        Self {
            limit: Some(limit),
            min_score: 0.3,
            include_scores: true,
            method: RankingMethod::Hybrid,
        }
    }

    /// Creates options with a minimum score threshold.
    #[must_use]
    pub fn with_min_score(min_score: RelevanceScore) -> Self {
        Self {
            limit: None,
            min_score,
            include_scores: true,
            method: RankingMethod::Hybrid,
        }
    }

    /// Sets whether to include scores in results.
    #[must_use]
    pub fn with_scores(include_scores: bool) -> Self {
        Self {
            limit: None,
            min_score: 0.3,
            include_scores,
            method: RankingMethod::Hybrid,
        }
    }

    /// Sets the ranking method.
    #[must_use]
    pub fn with_method(method: RankingMethod) -> Self {
        Self {
            limit: None,
            min_score: 0.3,
            include_scores: true,
            method,
        }
    }

    /// Use LLM-based ranking (requires LLM backend).
    #[must_use]
    pub fn use_llm(mut self) -> Self {
        self.method = RankingMethod::Llm;
        self
    }

    /// Use heuristic-based ranking (fast, no LLM needed).
    #[must_use]
    pub fn use_heuristic(mut self) -> Self {
        self.method = RankingMethod::Heuristic;
        self
    }

    /// Use hybrid ranking (LLM first, fallback to heuristic).
    #[must_use]
    pub fn use_hybrid(mut self) -> Self {
        self.method = RankingMethod::Hybrid;
        self
    }
}

/// Result of semantic ranking.
#[derive(Debug, Clone)]
pub struct RankedMemory {
    /// The memory
    pub memory: Memory,

    /// Relevance score (0.0-1.0)
    pub score: RelevanceScore,
}

/// LLM-based semantic ranker for memories.
///
/// Uses LLM judgment to rank memories by semantic relevance to a query.
/// This complements keyword-based search by understanding meaning and context.
#[derive(Debug, Clone)]
pub struct SemanticRanker {
    /// Backend configuration for LLM calls
    _backend: String,
}

impl SemanticRanker {
    /// Creates a new semantic ranker.
    ///
    /// # Arguments
    /// * `backend` - LLM backend identifier (e.g., "claude", "auto")
    #[must_use]
    pub fn new() -> Self {
        Self {
            _backend: "auto".to_string(),
        }
    }

    /// Creates a ranker with a specific backend.
    #[must_use]
    pub fn with_backend(backend: &str) -> Self {
        Self {
            _backend: backend.to_string(),
        }
    }

    /// Ranks memories by semantic relevance to the query.
    ///
    /// # Arguments
    /// * `query` - Search query
    /// * `memories` - Candidate memories to rank
    /// * `options` - Ranking options
    ///
    /// # Returns
    /// Ranked memories sorted by relevance score descending
    ///
    /// # Errors
    /// Returns error if LLM call fails or response parsing fails
    pub async fn rank(
        &self,
        query: &str,
        memories: &[Memory],
        options: &RankOptions,
    ) -> Result<Vec<RankedMemory>, RankError> {
        if memories.is_empty() {
            return Ok(Vec::new());
        }

        // Select ranking strategy based on options
        let ranked = match options.method {
            RankingMethod::Llm => {
                // Try LLM-based ranking
                match self.llm_rank(query, memories).await {
                    Ok(result) => result,
                    Err(e) => {
                        tracing::warn!("LLM ranking failed, falling back to heuristic: {}", e);
                        self.heuristic_rank(query, memories)
                    }
                }
            }
            RankingMethod::Heuristic => {
                // Use heuristic-based ranking (fast, no LLM needed)
                self.heuristic_rank(query, memories)
            }
            RankingMethod::Hybrid => {
                // Try LLM first, fall back to heuristic on failure
                match self.llm_rank(query, memories).await {
                    Ok(result) => result,
                    Err(e) => {
                        tracing::debug!("LLM ranking failed, using heuristic: {}", e);
                        self.heuristic_rank(query, memories)
                    }
                }
            }
        };

        // Filter by minimum score
        let mut filtered: Vec<RankedMemory> = ranked
            .into_iter()
            .filter(|r| r.score >= options.min_score)
            .collect();

        // Sort by score descending
        filtered.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Apply limit
        if let Some(limit) = options.limit {
            filtered.truncate(limit);
        }

        Ok(filtered)
    }

    /// Ranks memories using LLM judgment.
    ///
    /// This method builds a prompt for the LLM and expects a JSON response
    /// with relevance scores. Falls back to heuristic on any failure.
    ///
    /// Note: This requires Claude CLI to be available in PATH.
    /// Uses Claude Code with headless mode for ranking.
    async fn llm_rank(
        &self,
        query: &str,
        memories: &[Memory],
    ) -> Result<Vec<RankedMemory>, RankError> {
        // Build the ranking prompt
        let prompt = self.build_ranking_prompt(query, memories);

        // Call Claude CLI with the ranking prompt
        let output = tokio::process::Command::new("claude")
            .args([
                "-p",
                "--dangerously-skip-permissions",
                "--disallowedTools=TodoWrite,TaskCreate,TaskUpdate,TaskList,TaskGet,MemoryWrite",
                &prompt,
            ])
            .output()
            .await
            .map_err(|e| RankError::BackendError(format!("Failed to execute Claude CLI: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(RankError::BackendError(format!(
                "Claude CLI failed: {}",
                stderr
            )));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        self.parse_ranking_response(stdout.trim(), memories)
    }

    /// Parses the LLM response to extract relevance scores.
    fn parse_ranking_response(
        &self,
        response: &str,
        memories: &[Memory],
    ) -> Result<Vec<RankedMemory>, RankError> {
        // Try to parse as JSON array
        let parsed: Vec<serde_json::Value> = serde_json::from_str(response)
            .map_err(|e| RankError::ParseError(format!("Failed to parse JSON: {}", e)))?;

        let mut results = Vec::new();
        for item in parsed {
            let index = item
                .get("index")
                .and_then(|v| v.as_u64())
                .and_then(|v| v.checked_sub(1)) // Convert to 0-based
                .ok_or_else(|| RankError::InvalidFormat("Missing or invalid index".to_string()))?
                as usize;

            let relevance = item
                .get("relevance")
                .and_then(|v| v.as_f64())
                .ok_or_else(|| {
                    RankError::InvalidFormat("Missing or invalid relevance".to_string())
                })?;

            if index < memories.len() {
                results.push(RankedMemory {
                    memory: memories[index].clone(),
                    score: relevance,
                });
            }
        }

        Ok(results)
    }

    /// Builds a ranking prompt for the LLM.
    fn build_ranking_prompt(&self, query: &str, memories: &[Memory]) -> String {
        let mut prompt = format!(
            "Rank the following memories by their relevance to this query: \"{}\"\n\n",
            query
        );

        prompt.push_str("Memories to rank:\n");

        for (i, memory) in memories.iter().enumerate() {
            prompt.push_str(&format!(
                "{}. [ID: {}] {}\n",
                i + 1,
                memory.id,
                memory.content
            ));
        }

        prompt.push_str(
            "\n\
            Return a JSON array where each element is:\n\
            {{\"index\": <number>, \"relevance\": <0.0-1.0>}}\n\n\
            Relevance scoring:\n\
            - 1.0: Directly addresses the query with high specificity\n\
            - 0.7-0.9: Relevant and useful context\n\
            - 0.4-0.6: Somewhat related but not directly applicable\n\
            - 0.1-0.3: Tangentially related\n\
            - 0.0: Not relevant\n\n\
            Only return the JSON array, nothing else.",
        );

        prompt
    }

    /// Heuristic-based ranking as fallback when LLM is not available.
    ///
    /// Uses TF-like scoring based on query term overlap.
    fn heuristic_rank(&self, query: &str, memories: &[Memory]) -> Vec<RankedMemory> {
        let query_terms: HashSet<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        memories
            .iter()
            .map(|memory| {
                let content_lower = memory.content.to_lowercase();
                let content_terms: HashSet<String> = content_lower
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect();

                // Calculate overlap score
                let matching: usize = query_terms
                    .intersection(&content_terms)
                    .filter(|t: &&String| t.len() >= 3) // Only significant terms
                    .count();

                let total_query_terms = query_terms.len();
                let score = if total_query_terms > 0 {
                    matching as f64 / total_query_terms as f64
                } else {
                    0.0
                };

                // Boost score for exact phrase matches
                let phrase_boost = if content_lower.contains(query) {
                    0.3
                } else {
                    0.0
                };

                RankedMemory {
                    memory: memory.clone(),
                    score: (score + phrase_boost).min(1.0),
                }
            })
            .collect()
    }
}

impl Default for SemanticRanker {
    fn default() -> Self {
        Self::new()
    }
}

/// Errors that can occur during semantic ranking.
#[derive(Debug, thiserror::Error)]
pub enum RankError {
    /// LLM backend error
    #[error("LLM backend error: {0}")]
    BackendError(String),

    /// Response parsing error
    #[error("Failed to parse LLM response: {0}")]
    ParseError(String),

    /// Invalid response format
    #[error("Invalid response format: {0}")]
    InvalidFormat(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory::MemoryType;

    fn create_test_memory(id: &str, content: &str) -> Memory {
        Memory {
            id: id.to_string(),
            memory_type: MemoryType::Pattern,
            content: content.to_string(),
            tags: vec![],
            created: "2025-01-20".to_string(),
        }
    }

    #[test]
    fn test_rank_options_default() {
        let options = RankOptions::default();
        assert!(options.limit.is_none());
        assert!((options.min_score - 0.3).abs() < f64::EPSILON);
        assert!(options.include_scores);
    }

    #[test]
    fn test_rank_options_with_limit() {
        let options = RankOptions::with_limit(10);
        assert_eq!(options.limit, Some(10));
        assert!((options.min_score - 0.3).abs() < f64::EPSILON);
    }

    #[test]
    fn test_rank_options_with_min_score() {
        let options = RankOptions::with_min_score(0.5);
        assert!((options.min_score - 0.5).abs() < f64::EPSILON);
        assert!(options.limit.is_none());
    }

    #[test]
    fn test_rank_options_with_scores() {
        let options = RankOptions::with_scores(false);
        assert!(!options.include_scores);
    }

    #[test]
    fn test_semantic_ranker_new() {
        let ranker = SemanticRanker::new();
        assert_eq!(ranker._backend, "auto");
    }

    #[test]
    fn test_semantic_ranker_with_backend() {
        let ranker = SemanticRanker::with_backend("claude");
        assert_eq!(ranker._backend, "claude");
    }

    #[test]
    fn test_semantic_ranker_default() {
        let ranker = SemanticRanker::default();
        assert_eq!(ranker._backend, "auto");
    }

    #[test]
    fn test_rank_empty_memories() {
        let ranker = SemanticRanker::new();
        let rt = tokio::runtime::Runtime::new().unwrap();

        let result =
            rt.block_on(async { ranker.rank("query", &[], &RankOptions::default()).await });

        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn test_rank_heuristic_scoring() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "Uses barrel exports for modules"),
            create_test_memory("mem-2", "Async await patterns in Rust"),
            create_test_memory("mem-3", "Python decorators"),
        ];

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt
            .block_on(async {
                ranker
                    .rank("rust async", &memories, &RankOptions::default())
                    .await
            })
            .unwrap();

        // mem-2 should rank highest (matches both "rust" and "async")
        assert!(!result.is_empty());
        let best = &result[0];
        assert!(best.score > 0.0);
    }

    #[test]
    fn test_rank_with_min_score() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "Completely unrelated content"),
            create_test_memory("mem-2", "Uses barrel exports"),
        ];

        let options = RankOptions::with_min_score(0.5);
        let rt = tokio::runtime::Runtime::new().unwrap();

        let result = rt
            .block_on(async { ranker.rank("barrel exports", &memories, &options).await })
            .unwrap();

        // Should only return high-scoring memories
        for ranked in &result {
            assert!(ranked.score >= 0.5);
        }
    }

    #[test]
    fn test_rank_with_limit() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "rust patterns"),
            create_test_memory("mem-2", "async await"),
            create_test_memory("mem-3", "rust async"),
        ];

        let options = RankOptions::with_limit(2);
        let rt = tokio::runtime::Runtime::new().unwrap();

        let result = rt
            .block_on(async { ranker.rank("rust async", &memories, &options).await })
            .unwrap();

        assert!(result.len() <= 2);
    }

    #[test]
    fn test_build_ranking_prompt() {
        let ranker = SemanticRanker::new();
        let memories = vec![create_test_memory("mem-1", "Test content")];

        let prompt = ranker.build_ranking_prompt("test query", &memories);

        assert!(prompt.contains("test query"));
        assert!(prompt.contains("Test content"));
        assert!(prompt.contains("relevance"));
        assert!(prompt.contains("JSON array"));
    }

    #[test]
    fn test_heuristic_rank_exact_phrase_boost() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "rust async patterns"),
            create_test_memory("mem-2", "rust and async separately"),
        ];

        let ranked = ranker.heuristic_rank("rust async", &memories);

        // mem-1 should get a boost for exact phrase match
        let best = &ranked[0];
        assert_eq!(best.memory.id, "mem-1");
        assert!(best.score > 0.3); // Should have phrase boost
    }

    #[test]
    fn test_heuristic_rank_case_insensitive() {
        let ranker = SemanticRanker::new();
        let memories = vec![create_test_memory("mem-1", "Rust Async Patterns")];

        let ranked = ranker.heuristic_rank("RUST ASYNC", &memories);

        assert_eq!(ranked.len(), 1);
        assert!(ranked[0].score > 0.0);
    }

    // Tests for RankingMethod

    #[test]
    fn test_ranking_method_default() {
        let method: RankingMethod = RankingMethod::default();
        assert_eq!(method, RankingMethod::Heuristic);
    }

    #[test]
    fn test_ranking_method_variants() {
        assert!(matches!(RankingMethod::Llm, RankingMethod::Llm));
        assert!(matches!(RankingMethod::Heuristic, RankingMethod::Heuristic));
        assert!(matches!(RankingMethod::Hybrid, RankingMethod::Hybrid));
    }

    // Tests for RankOptions with ranking method

    #[test]
    fn test_rank_options_default_includes_method() {
        let options = RankOptions::default();
        assert_eq!(options.method, RankingMethod::Hybrid); // Default is hybrid
    }

    #[test]
    fn test_rank_options_with_method() {
        let options = RankOptions::with_method(RankingMethod::Llm);
        assert_eq!(options.method, RankingMethod::Llm);
    }

    #[test]
    fn test_rank_options_use_llm() {
        let options = RankOptions::default().use_llm();
        assert_eq!(options.method, RankingMethod::Llm);
    }

    #[test]
    fn test_rank_options_use_heuristic() {
        let options = RankOptions::default().use_heuristic();
        assert_eq!(options.method, RankingMethod::Heuristic);
    }

    #[test]
    fn test_rank_options_use_hybrid() {
        let options = RankOptions::default().use_hybrid();
        assert_eq!(options.method, RankingMethod::Hybrid);
    }

    #[test]
    fn test_rank_options_method_preserves_other_options() {
        // When setting method, other options should use defaults
        let options = RankOptions::with_limit(5).use_llm();
        assert_eq!(options.method, RankingMethod::Llm);
        assert_eq!(options.limit, Some(5));
        assert!((options.min_score - 0.3).abs() < f64::EPSILON); // default
    }

    // Tests for rank with different methods

    #[test]
    fn test_rank_with_heuristic_method() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "rust async patterns"),
            create_test_memory("mem-2", "python decorators"),
        ];

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt
            .block_on(async {
                ranker
                    .rank(
                        "rust async",
                        &memories,
                        &RankOptions::default().use_heuristic(),
                    )
                    .await
            })
            .unwrap();

        // Heuristic should work
        assert!(!result.is_empty());
    }

    #[test]
    fn test_rank_with_hybrid_method() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "rust async patterns"),
            create_test_memory("mem-2", "python decorators"),
        ];

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt
            .block_on(async {
                ranker
                    .rank(
                        "rust async",
                        &memories,
                        &RankOptions::default().use_hybrid(),
                    )
                    .await
            })
            .unwrap();

        // Hybrid should fall back to heuristic when LLM fails
        assert!(!result.is_empty());
        // Should get the rust memory ranked higher
        assert_eq!(result[0].memory.id, "mem-1");
    }

    #[test]
    fn test_rank_llm_method_falls_back_to_heuristic() {
        let ranker = SemanticRanker::new();
        let memories = vec![
            create_test_memory("mem-1", "rust async patterns"),
            create_test_memory("mem-2", "python decorators"),
        ];

        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt
            .block_on(async {
                ranker
                    .rank("rust async", &memories, &RankOptions::default().use_llm())
                    .await
            })
            .unwrap();

        // LLM should fail but fall back to heuristic
        assert!(!result.is_empty());
    }
}
