//! Inverted index for fast memory keyword search.
//!
//! Provides TF-IDF (Term Frequency-Inverse Document Frequency) based
//! keyword search to accelerate memory retrieval before LLM re-ranking.
//!
//! # Architecture
//!
//! - **InvertedIndex**: Maps terms to memory IDs for fast lookups
//! - **TF-IDF scoring**: Ranks results by term relevance
//! - **Tokenization**: Splits text into searchable terms
//!
//! # Example
//!
//! ```rust
//! use ralph_core::memory_index::{InvertedIndex, SearchOptions};
//! use ralph_core::Memory;
//!
//! let memories = vec![/* ... */];
//! let index = InvertedIndex::build(&memories);
//!
//! let results = index.search("rust async", &SearchOptions::default());
//! // Returns: [(memory_id, tfidf_score), ...]
//! ```

use crate::memory::Memory;
use std::collections::{HashMap, HashSet};

/// Memory identifier for index lookups.
pub type MemoryId = String;

/// Term frequency count.
pub type TermFreq = u32;

/// Document frequency (number of memories containing a term).
pub type DocFreq = u32;

/// TF-IDF relevance score.
pub type TfidfScore = f64;

/// Inverted index for keyword-based memory search.
///
/// Maps terms to memory IDs and computes TF-IDF scores for relevance ranking.
#[derive(Debug, Clone)]
pub struct InvertedIndex {
    /// Term -> set of memory IDs containing this term
    index: HashMap<String, HashSet<MemoryId>>,

    /// Memory ID -> term frequency map (for TF calculation)
    term_freqs: HashMap<MemoryId, HashMap<String, TermFreq>>,

    /// Term -> document frequency (number of memories containing term)
    doc_freq: HashMap<String, DocFreq>,

    /// Total number of indexed memories
    total_docs: u32,
}

impl InvertedIndex {
    /// Builds an inverted index from a collection of memories.
    ///
    /// # Arguments
    /// * `memories` - Slice of memories to index
    ///
    /// # Returns
    /// A new `InvertedIndex` ready for searching
    #[must_use]
    pub fn build(memories: &[Memory]) -> Self {
        let mut index: HashMap<String, HashSet<MemoryId>> = HashMap::new();
        let mut term_freqs: HashMap<MemoryId, HashMap<String, TermFreq>> = HashMap::new();
        let mut doc_freq: HashMap<String, DocFreq> = HashMap::new();

        for memory in memories {
            let memory_id = memory.id.clone();

            // Get term frequencies (not just unique terms)
            let tf_map = tokenize_with_freq(&memory.content);
            let unique_terms: HashSet<String> = tf_map.keys().cloned().collect();

            // Index each unique term
            for term in &unique_terms {
                index
                    .entry(term.clone())
                    .or_default()
                    .insert(memory_id.clone());
            }

            // Store term frequencies for this memory
            term_freqs.insert(memory_id.clone(), tf_map);

            // Update document frequency for each unique term
            for term in unique_terms {
                *doc_freq.entry(term).or_insert(0) += 1;
            }
        }

        Self {
            index,
            term_freqs,
            doc_freq,
            total_docs: memories.len() as u32,
        }
    }

    /// Searches the index using TF-IDF scoring.
    ///
    /// # Arguments
    /// * `query` - Search query string
    /// * `options` - Search options (limit, etc.)
    ///
    /// # Returns
    /// Vector of (memory_id, tfidf_score) tuples, sorted by score descending
    #[must_use]
    pub fn search(&self, query: &str, options: &SearchOptions) -> Vec<(MemoryId, TfidfScore)> {
        let query_terms = tokenize(query);

        if query_terms.is_empty() {
            return Vec::new();
        }

        // Find candidate memories (containing any query term)
        let mut candidates: HashSet<MemoryId> = HashSet::new();
        for term in &query_terms {
            if let Some(memory_ids) = self.index.get(term) {
                candidates.extend(memory_ids.iter().cloned());
            }
        }

        // Compute TF-IDF scores for each candidate
        let mut results: Vec<(MemoryId, TfidfScore)> = candidates
            .into_iter()
            .map(|memory_id| {
                let score = self.compute_tfidf(&memory_id, &query_terms);
                (memory_id, score)
            })
            .filter(|(_, score)| *score > 0.0)
            .collect();

        // Sort by score descending
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        // Apply limit
        if let Some(limit) = options.limit {
            results.truncate(limit);
        }

        results
    }

    /// Computes TF-IDF score for a memory given query terms.
    ///
    /// TF (Term Frequency) = count of term in memory / total terms in memory
    /// IDF (Inverse Document Frequency) = log(total_docs / docs_containing_term)
    /// TF-IDF = TF * IDF (summed across all query terms)
    fn compute_tfidf(&self, memory_id: &MemoryId, query_terms: &HashSet<String>) -> TfidfScore {
        let Some(tf_map) = self.term_freqs.get(memory_id) else {
            return 0.0;
        };

        let total_terms: u32 = tf_map.values().sum();
        if total_terms == 0 {
            return 0.0;
        }

        let mut tfidf_sum = 0.0;

        for term in query_terms {
            // Skip if term not in memory
            let Some(&term_freq) = tf_map.get(term) else {
                continue;
            };

            // Calculate term frequency in this memory
            let tf = f64::from(term_freq) / f64::from(total_terms);

            // Calculate IDF with smoothing (add 1 to avoid division by zero)
            let docs_with_term = f64::from(*self.doc_freq.get(term).unwrap_or(&1));
            let idf = (f64::from(self.total_docs) / (docs_with_term + 1.0)).ln_1p();

            tfidf_sum += tf * idf;
        }

        tfidf_sum
    }

    /// Returns the number of unique terms in the index.
    #[must_use]
    pub fn vocabulary_size(&self) -> usize {
        self.index.len()
    }

    /// Returns the number of indexed memories.
    #[must_use]
    pub fn doc_count(&self) -> u32 {
        self.total_docs
    }

    /// Returns all terms indexed for a given memory ID.
    #[must_use]
    pub fn get_terms(&self, memory_id: &MemoryId) -> Option<HashSet<String>> {
        self.term_freqs
            .get(memory_id)
            .map(|tf_map| tf_map.keys().cloned().collect())
    }
}

/// Options for memory search.
#[derive(Debug, Clone, Default)]
pub struct SearchOptions {
    /// Maximum number of results to return (None = unlimited)
    pub limit: Option<usize>,
}

impl SearchOptions {
    /// Creates a new SearchOptions with the specified limit.
    #[must_use]
    pub fn with_limit(limit: usize) -> Self {
        Self { limit: Some(limit) }
    }

    /// Creates SearchOptions with no limit.
    #[must_use]
    pub fn unlimited() -> Self {
        Self { limit: None }
    }
}

/// Tokenizes text into searchable terms with frequencies.
///
/// Returns a map of term -> frequency count.
fn tokenize_with_freq(text: &str) -> HashMap<String, TermFreq> {
    let mut freqs = HashMap::new();

    // Lowercase and split on non-alphanumeric characters
    let lower = text.to_lowercase();

    // Split on any character that's not alphanumeric or whitespace
    let words: Vec<String> = lower
        .split(|c: char| !c.is_alphanumeric())
        .map(|s| s.to_string())
        .filter(|w| w.len() >= 2)
        .collect();

    // Count word frequencies
    for word in &words {
        if !word.is_empty() {
            *freqs.entry(word.clone()).or_insert(0) += 1;
        }
    }

    // Add bigrams (consecutive word pairs) for phrase matching
    for window in words.windows(2) {
        let bigram = format!("{} {}", window[0], window[1]);
        *freqs.entry(bigram).or_insert(0) += 1;
    }

    freqs
}

/// Tokenizes text into searchable terms.
///
/// Tokenization strategy:
/// - Lowercase all text
/// - Split on whitespace and punctuation
/// - Filter out very short terms (< 2 chars)
/// - Extract both individual words and bigrams for phrases
///
/// # Arguments
/// * `text` - Text to tokenize
///
/// # Returns
/// Set of unique terms
fn tokenize(text: &str) -> HashSet<String> {
    tokenize_with_freq(text).keys().cloned().collect()
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
    fn test_build_index() {
        let memories = vec![
            create_test_memory("mem-1", "Uses barrel exports for modules"),
            create_test_memory("mem-2", "Uses named exports"),
            create_test_memory("mem-3", "Async await patterns"),
        ];

        let index = InvertedIndex::build(&memories);

        assert_eq!(index.doc_count(), 3);
        assert!(index.vocabulary_size() > 0);
    }

    #[test]
    fn test_search_single_term() {
        let memories = vec![
            create_test_memory("mem-1", "Uses barrel exports for modules"),
            create_test_memory("mem-2", "Uses named exports"),
            create_test_memory("mem-3", "Async await patterns"),
        ];

        let index = InvertedIndex::build(&memories);
        let results = index.search("barrel", &SearchOptions::default());

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].0, "mem-1");
    }

    #[test]
    fn test_search_multiple_terms() {
        let memories = vec![
            create_test_memory("mem-1", "Uses barrel exports for modules"),
            create_test_memory("mem-2", "Uses named exports for api"),
            create_test_memory("mem-3", "Async await patterns"),
        ];

        let index = InvertedIndex::build(&memories);
        let results = index.search("exports modules", &SearchOptions::default());

        // mem-1 should rank highest (contains both terms)
        assert_eq!(results[0].0, "mem-1");
        // mem-2 should rank second (contains "exports")
        assert_eq!(results[1].0, "mem-2");
    }

    #[test]
    fn test_search_with_limit() {
        let memories = vec![
            create_test_memory("mem-1", "Uses barrel exports"),
            create_test_memory("mem-2", "Uses named exports"),
            create_test_memory("mem-3", "Uses default exports"),
        ];

        let index = InvertedIndex::build(&memories);
        let results = index.search("exports", &SearchOptions::with_limit(2));

        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_search_empty_query() {
        let memories = vec![create_test_memory("mem-1", "Content here")];
        let index = InvertedIndex::build(&memories);

        let results = index.search("", &SearchOptions::default());
        assert!(results.is_empty());

        let results = index.search("   ", &SearchOptions::default());
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_case_insensitive() {
        let memories = vec![create_test_memory("mem-1", "Rust async patterns")];
        let index = InvertedIndex::build(&memories);

        let results_lower = index.search("rust", &SearchOptions::default());
        let results_upper = index.search("RUST", &SearchOptions::default());

        assert_eq!(results_lower.len(), 1);
        assert_eq!(results_upper.len(), 1);
    }

    #[test]
    fn test_bigram_matching() {
        let memories = vec![
            create_test_memory("mem-1", "async await"),
            create_test_memory("mem-2", "async programming"),
        ];

        let index = InvertedIndex::build(&memories);

        // Exact bigram match should rank highest
        let results = index.search("async await", &SearchOptions::default());
        assert_eq!(results[0].0, "mem-1");
    }

    #[test]
    fn test_get_terms() {
        let memories = vec![create_test_memory("mem-1", "Rust async patterns")];
        let index = InvertedIndex::build(&memories);

        let terms = index.get_terms(&"mem-1".to_string());
        assert!(terms.is_some());
        let terms = terms.unwrap();
        assert!(terms.contains("rust"));
        assert!(terms.contains("async"));
    }

    #[test]
    fn test_vocabulary_size() {
        let memories = vec![
            create_test_memory("mem-1", "rust patterns"),
            create_test_memory("mem-2", "async await"),
        ];

        let index = InvertedIndex::build(&memories);
        assert!(index.vocabulary_size() > 0);
    }

    #[test]
    fn test_doc_count() {
        let memories = vec![
            create_test_memory("mem-1", "content"),
            create_test_memory("mem-2", "content"),
            create_test_memory("mem-3", "content"),
        ];

        let index = InvertedIndex::build(&memories);
        assert_eq!(index.doc_count(), 3);
    }

    #[test]
    fn test_tfidf_scoring() {
        let memories = vec![
            create_test_memory("mem-1", "rust rust patterns"), // "rust" appears twice
            create_test_memory("mem-2", "rust async"),         // "rust" appears once
            create_test_memory("mem-3", "async await"),        // no "rust"
        ];

        let index = InvertedIndex::build(&memories);
        let results = index.search("rust", &SearchOptions::default());

        // mem-1 should rank highest (higher term frequency)
        assert_eq!(results[0].0, "mem-1");
        // mem-2 should rank second
        assert_eq!(results[1].0, "mem-2");
        // mem-3 should not appear (doesn't contain "rust")
        assert!(!results.iter().any(|(id, _)| id == "mem-3"));
    }

    #[test]
    fn test_empty_memories() {
        let memories: Vec<Memory> = vec![];
        let index = InvertedIndex::build(&memories);

        assert_eq!(index.doc_count(), 0);
        assert_eq!(index.vocabulary_size(), 0);

        let results = index.search("anything", &SearchOptions::default());
        assert!(results.is_empty());
    }

    #[test]
    fn test_search_options_default() {
        let options = SearchOptions::default();
        assert!(options.limit.is_none());
    }

    #[test]
    fn test_search_options_with_limit() {
        let options = SearchOptions::with_limit(10);
        assert_eq!(options.limit, Some(10));
    }

    #[test]
    fn test_search_options_unlimited() {
        let options = SearchOptions::unlimited();
        assert!(options.limit.is_none());
    }

    #[test]
    fn test_tokenize_filters_short_terms() {
        let terms = tokenize("a b c abc");
        assert!(!terms.contains("a"));
        assert!(!terms.contains("b"));
        assert!(!terms.contains("c"));
        assert!(terms.contains("abc"));
    }

    #[test]
    fn test_tokenize_creates_bigrams() {
        let terms = tokenize("rust async patterns");
        assert!(terms.contains("rust async"));
        assert!(terms.contains("async patterns"));
        assert!(terms.contains("rust"));
        assert!(terms.contains("async"));
        assert!(terms.contains("patterns"));
    }

    #[test]
    fn test_tokenize_case_insensitive() {
        let terms = tokenize("Rust Async");
        assert!(terms.contains("rust"));
        assert!(terms.contains("async"));
        assert!(!terms.contains("Rust"));
        assert!(!terms.contains("Async"));
    }

    #[test]
    fn test_tokenize_punctuation() {
        let terms = tokenize("rust, async; await!");
        assert!(terms.contains("rust"));
        assert!(terms.contains("async"));
        assert!(terms.contains("await"));
    }
}
