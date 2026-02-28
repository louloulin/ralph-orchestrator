//! Memory module with indexing and semantic search capabilities.
//!
//! This module provides enhanced memory retrieval using:
//! - Inverted index for fast keyword search
//! - LLM-based semantic ranking for relevance understanding

mod base;
pub mod semantic;

pub use base::{Memory, MemoryType};
pub use semantic::{
    RankError, RankOptions, RankedMemory, RankingMethod, RelevanceScore, SemanticRanker,
};
