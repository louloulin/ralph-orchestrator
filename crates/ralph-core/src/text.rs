//! Text utilities for the Ralph Orchestrator.
//!
//! This module provides common text manipulation functions used throughout
//! the codebase, including UTF-8 safe string truncation.

/// Finds the largest byte index <= `index` that is a valid UTF-8 character boundary.
///
/// This is needed because Rust strings cannot be sliced at arbitrary byte positions -
/// only at valid character boundaries. Multi-byte characters (emojis, etc.) would cause
/// a panic if sliced in the middle.
///
/// This is a stable Rust implementation of `str::floor_char_boundary` (nightly-only).
///
/// # Examples
///
/// ```
/// use ralph_core::floor_char_boundary;
///
/// let s = "Hello 🦀 World";  // 🦀 is at bytes 6-9
/// assert_eq!(floor_char_boundary(s, 6), 6);   // At start of emoji - valid boundary
/// assert_eq!(floor_char_boundary(s, 7), 6);   // Inside emoji - returns start
/// assert_eq!(floor_char_boundary(s, 8), 6);   // Inside emoji - returns start
/// assert_eq!(floor_char_boundary(s, 10), 10); // After emoji - valid boundary
/// ```
#[must_use]
pub fn floor_char_boundary(s: &str, index: usize) -> usize {
    if index >= s.len() {
        return s.len();
    }
    // Walk backwards from index until we find a valid char boundary
    let mut boundary = index;
    while boundary > 0 && !s.is_char_boundary(boundary) {
        boundary -= 1;
    }
    boundary
}

/// Truncates a string to a maximum number of characters, adding "..." if truncated.
///
/// This function is UTF-8 safe: it uses character boundaries, not byte boundaries,
/// so it will never split a multi-byte character (emoji, non-ASCII, etc.).
///
/// # Arguments
///
/// * `s` - The string to truncate
/// * `max_chars` - Maximum number of characters (not bytes) before truncation
///
/// # Returns
///
/// - The original string if its character count is <= `max_chars`
/// - A truncated string with "..." appended if longer
///
/// # Examples
///
/// ```
/// use ralph_core::truncate_with_ellipsis;
///
/// // Short strings pass through unchanged
/// assert_eq!(truncate_with_ellipsis("hello", 10), "hello");
///
/// // Long strings are truncated with ellipsis
/// assert_eq!(truncate_with_ellipsis("hello world", 5), "hello...");
///
/// // UTF-8 safe: emojis are not split
/// assert_eq!(truncate_with_ellipsis("🎉🎊🎁🎄", 2), "🎉🎊...");
/// ```
pub fn truncate_with_ellipsis(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        // Find the byte index of the max_chars-th character
        // This ensures we never slice in the middle of a multi-byte character
        let byte_idx = s
            .char_indices()
            .nth(max_chars)
            .map(|(idx, _)| idx)
            .unwrap_or(s.len());
        format!("{}...", &s[..byte_idx])
    }
}

/// Truncates a string to a maximum number of bytes, adding "..." if truncated.
///
/// This function is UTF-8 safe: it uses `floor_char_boundary` to ensure we never
/// slice in the middle of a multi-byte character. This is useful when you need
/// to truncate based on byte length (e.g., for display width limits).
///
/// # Arguments
///
/// * `s` - The string to truncate
/// * `max_bytes` - Maximum number of bytes before truncation
///
/// # Returns
///
/// - The original string if its byte length is <= `max_bytes`
/// - A truncated string with "..." appended if longer
///
/// # Examples
///
/// ```
/// use ralph_core::truncate_by_bytes;
///
/// // Short strings pass through unchanged
/// assert_eq!(truncate_by_bytes("hello", 10), "hello");
///
/// // Long strings are truncated with ellipsis
/// assert_eq!(truncate_by_bytes("hello world", 5), "hello...");
///
/// // UTF-8 safe: Chinese characters are not split (3 bytes each)
/// // "先" occupies bytes 98-101, so truncating at 100 bytes is safe
/// let s = "Migrate TranslateFlow to Mastra 实现存在问题";
/// let result = truncate_by_bytes(s, 100);
/// assert!(!result.contains('�')); // No replacement character
/// ```
pub fn truncate_by_bytes(s: &str, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        s.to_string()
    } else {
        let safe_bytes = floor_char_boundary(s, max_bytes);
        format!("{}...", &s[..safe_bytes])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_floor_char_boundary_ascii() {
        let s = "hello";
        assert_eq!(floor_char_boundary(s, 0), 0);
        assert_eq!(floor_char_boundary(s, 3), 3);
        assert_eq!(floor_char_boundary(s, 5), 5);
        assert_eq!(floor_char_boundary(s, 10), 5); // Beyond string length
    }

    #[test]
    fn test_floor_char_boundary_emoji() {
        // 🦀 is 4 bytes (U+1F980)
        let s = "hi🦀ok"; // h=0, i=1, 🦀=2-5, o=6, k=7
        assert_eq!(floor_char_boundary(s, 2), 2); // Start of emoji
        assert_eq!(floor_char_boundary(s, 3), 2); // Inside emoji
        assert_eq!(floor_char_boundary(s, 4), 2); // Inside emoji
        assert_eq!(floor_char_boundary(s, 5), 2); // Inside emoji
        assert_eq!(floor_char_boundary(s, 6), 6); // After emoji
    }

    #[test]
    fn test_floor_char_boundary_checkmark() {
        // ✅ is 3 bytes (U+2705)
        let s = "a✅b"; // a=0, ✅=1-3, b=4
        assert_eq!(floor_char_boundary(s, 1), 1); // Start of checkmark
        assert_eq!(floor_char_boundary(s, 2), 1); // Inside checkmark
        assert_eq!(floor_char_boundary(s, 3), 1); // Inside checkmark
        assert_eq!(floor_char_boundary(s, 4), 4); // At 'b'
    }

    #[test]
    fn test_floor_char_boundary_empty() {
        assert_eq!(floor_char_boundary("", 0), 0);
        assert_eq!(floor_char_boundary("", 5), 0);
    }

    #[test]
    fn test_short_string_unchanged() {
        assert_eq!(truncate_with_ellipsis("short", 10), "short");
        assert_eq!(truncate_with_ellipsis("", 5), "");
        assert_eq!(truncate_with_ellipsis("exact", 5), "exact");
    }

    #[test]
    fn test_long_string_truncated() {
        assert_eq!(
            truncate_with_ellipsis("this is a long string", 10),
            "this is a ..."
        );
        assert_eq!(truncate_with_ellipsis("abcdef", 3), "abc...");
    }

    #[test]
    fn test_utf8_boundaries_arrows() {
        // Arrow characters are 3 bytes each in UTF-8
        let arrows = "→→→→→→→→";
        assert_eq!(truncate_with_ellipsis(arrows, 5), "→→→→→...");
    }

    #[test]
    fn test_utf8_boundaries_mixed() {
        let mixed = "a→b→c→d";
        assert_eq!(truncate_with_ellipsis(mixed, 5), "a→b→c...");
    }

    #[test]
    fn test_utf8_boundaries_emoji() {
        // Emojis are 4 bytes each in UTF-8
        let emoji = "🎉🎊🎁🎄";
        assert_eq!(truncate_with_ellipsis(emoji, 3), "🎉🎊🎁...");
    }

    #[test]
    fn test_utf8_complex_emoji() {
        // Rust crab emoji
        let s = "hi 🦀 there";
        // "hi 🦀" = 4 characters (h, i, space, 🦀)
        assert_eq!(truncate_with_ellipsis(s, 4), "hi 🦀...");
    }

    #[test]
    fn test_zero_max_chars() {
        assert_eq!(truncate_with_ellipsis("hello", 0), "...");
    }

    #[test]
    fn test_single_char_truncation() {
        assert_eq!(truncate_with_ellipsis("hello", 1), "h...");
        assert_eq!(truncate_with_ellipsis("🎉hello", 1), "🎉...");
    }

    // Tests for truncate_by_bytes

    #[test]
    fn test_truncate_by_bytes_short() {
        assert_eq!(truncate_by_bytes("hello", 10), "hello");
        assert_eq!(truncate_by_bytes("", 5), "");
        assert_eq!(truncate_by_bytes("hello", 5), "hello");
    }

    #[test]
    fn test_truncate_by_bytes_long() {
        assert_eq!(truncate_by_bytes("hello world", 5), "hello...");
        assert_eq!(truncate_by_bytes("abcdef", 3), "abc...");
    }

    #[test]
    fn test_truncate_by_bytes_chinese_safe() {
        // Chinese characters are 3 bytes each
        // "先" occupies bytes 98-101, so truncating at 100 should be safe
        let s = "Migrate TranslateFlow to Mastra + React + shadcn/ui 实现存在问题，充分复用mastra库 优先完善整个代码结构，分析存在的问题";
        let result = truncate_by_bytes(s, 100);
        // Should not contain the Unicode replacement character
        assert!(!result.contains('\u{FFFD}'));
        // Should end with ...
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_by_bytes_chinese_truncates_at_boundary() {
        let s = "测试中文abc"; // Each Chinese char is 3 bytes, total 6 + 3 = 9 bytes
        let result = truncate_by_bytes(s, 7); // Should truncate after 2 Chinese chars (6 bytes)
        assert_eq!(result, "测试...");
    }

    #[test]
    fn test_truncate_by_bytes_emoji_safe() {
        // Emojis are 4 bytes each
        let s = "🎉🎊🎁🎄abc";
        let result = truncate_by_bytes(s, 10); // 2 emojis = 8 bytes, safe
        assert!(!result.contains('\u{FFFD}'));
        assert!(result.ends_with("..."));
    }

    #[test]
    fn test_truncate_by_bytes_mixed_utf8() {
        let s = "a测试b🎉c"; // a=1, 测试=6, b=1, 🎉=4, c=1 = 13 bytes
        let result = truncate_by_bytes(s, 9); // Should include a + 测试 + b = 8 bytes
        assert!(!result.contains('\u{FFFD}'));
        assert_eq!(result, "a测试b...");
    }
}
