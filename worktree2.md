# Worktree Reuse Analysis: Can Multiple Loops Share One Worktree?

## Executive Summary

**Answer: NO, the current Ralph architecture does NOT support multiple loops reusing a single worktree.** Each loop is designed to have its own isolated git worktree with a unique `loop_id` and corresponding branch `ralph/{loop_id}`.

This analysis explores why reuse is not supported, the technical challenges, and potential design changes if reuse were desired.

---

## 1. Current Architecture: One Loop Per Worktree

### 1.1 Loop ID Generation

**Source**: `crates/ralph-cli/src/main.rs` (implicit loop creation)  
**Format**: `loop-{unix_timestamp}-{4_hex_chars}`

```rust
// Each loop gets a UNIQUE ID
let loop_id = format!("loop-{}-{:04x}", 
    SystemTime::now().duration_since(UNIX_EPOCH).as_secs(),
    subsec_micros % 0x10000
);
```

**Properties**:
- Timestamp-based uniqueness ensures no collisions
- No mechanism to "reuse" an existing loop ID
- Loop ID is embedded in worktree path and branch name

### 1.2 Worktree Creation Flow

**Source**: `crates/ralph-core/src/worktree.rs:140-219`

```rust
pub fn create_worktree(
    repo_root: impl AsRef<Path>,
    loop_id: &str,
    config: &WorktreeConfig,
) -> Result<Worktree, WorktreeError> {
    let worktree_path = worktree_base.join(loop_id);
    let branch_name = format!("ralph/{loop_id}");
    
    // Check if worktree already exists → ERROR
    if worktree_path.exists() {
        return Err(WorktreeError::AlreadyExists(...));
    }
    
    // Create worktree with UNIQUE branch
    git worktree add -b ralph/{loop_id} {path}
}
```

**Key Constraints**:
1. Worktree path is `{worktree_dir}/{loop_id}` — one directory per loop
2. Branch is `ralph/{loop_id}` — one branch per loop
3. **If worktree exists, creation fails** with `AlreadyExists` error

### 1.3 Loop Registry Tracking

**Source**: `crates/ralph-core/src/loop_registry.rs`

```rust
struct LoopEntry {
    id: String,                    // Unique loop ID
    pid: u32,                      // Process ID
    started: DateTime<Utc>,
    prompt: String,
    worktree_path: Option<String>, // Path for worktree loops
    workspace: String,
}
```

**Invariants**:
- Each registry entry has a unique `loop_id`
- Worktree path is derived from `loop_id`
- No mechanism to map multiple loop IDs to one worktree path

---

## 2. Why Reuse is Not Supported

### 2.1 Isolation Guarantees

The current design prioritizes **complete isolation** between parallel loops:

| Resource | Isolation | Reason |
|----------|-----------|--------|
| Events | Per-worktree | Each loop has its own event stream |
| Runtime Tasks | Per-worktree | Task tracking is loop-specific |
| Scratchpad | Per-worktree | Loop-specific WIP state |
| Git State | Per-worktree | Independent working directories |
| Branch | Per-worktree | Independent commit history |

**If multiple loops shared a worktree**:
- ❌ Event streams would conflict (`.ralph/events.jsonl`)
- ❌ Runtime tasks would be mixed (`.ralph/agent/tasks.jsonl`)
- ❌ Scratchpad state would be corrupted
- ❌ Git working directory state would be unpredictable
- ❌ Two loops trying to commit different changes would race

### 2.2 Merge Queue Integration

**Source**: `crates/ralph-core/src/merge_queue.rs`

The merge queue tracks loops by their unique `loop_id`:

```rust
// Each queue entry corresponds to ONE loop/branch
{"ts":"...","loop_id":"loop-abc123","event":{"type":"queued",...}}
{"ts":"...","loop_id":"loop-abc123","event":{"type":"merging",...}}
{"ts":"...","loop_id":"loop-abc123","event":{"type":"merged",...}}
```

**Shared worktree problem**:
- Which `loop_id` would be used in merge queue?
- How to distinguish which loop's changes to merge?
- How to handle partial merges (loop A done, loop B still running)?

### 2.3 Process Lifecycle

**Source**: `crates/ralph-core/src/loop_lock.rs`, `crates/ralph-cli/src/main.rs:1500-1530`

```
1. Loop 1 starts → create_worktree(loop-001) → runs
2. Loop 1 completes → enqueues for merge → exits
3. Worktree removed → directory deleted
```

**If reuse were attempted**:
- Loop 2 would try to use existing worktree directory
- State from Loop 1 might still exist (events, tasks, scratchpad)
- Git working directory could have uncommitted changes
- **No cleanup mechanism** for "resetting" a worktree

---

## 3. Technical Challenges for Worktree Reuse

### 3.1 State Contamination

**Problem**: Previous loop's state would leak to next loop

| File | Issue if Reused |
|------|-----------------|
| `.ralph/events.jsonl` | Loop 2 sees Loop 1's events → confusion |
| `.ralph/agent/tasks.jsonl` | Loop 2 sees Loop 1's completed tasks |
| `.ralph/agent/scratchpad.md` | Loop 2 sees Loop 1's WIP thoughts |
| Git working dir | Uncommitted changes, dirty state |

**Required cleanup** (not implemented):
```bash
# Would need to reset ALL state before reuse
rm .ralph/events.jsonl
rm .ralph/agent/tasks.jsonl
rm .ralph/agent/scratchpad.md
git reset --hard HEAD
git clean -fd
```

### 3.2 Concurrent Access Conflicts

**Problem**: Two loops in same worktree would race

**Scenario**: Loop A and Loop B try to run concurrently in same worktree

```
Loop A: writes to .ralph/events.jsonl
Loop B: writes to .ralph/events.jsonl  ← CORRUPTION

Loop A: modifies src/file.rs
Loop B: modifies src/file.rs  ← RACE CONDITION

Loop A: git commit -m "change A"
Loop B: git commit -m "change B"  ← UNPREDICTABLE STATE
```

**No locking mechanism** exists for:
- Event file writes (append-only, no coordination)
- Scratchpad file writes (no file locking)
- Git operations (no coordination between loops)

### 3.3 Git Branch Semantics

**Current**: `ralph/{loop_id}` — one branch per loop

```
git branch
  main
  ralph/loop-20250227-143000-a3f2
  ralph/loop-20250227-143100-b4d3
  ralph/loop-20250227-143200-c5e6
```

**If reused**: Same branch for multiple loops

```
git branch
  main
  ralph/reusable-worktree  # Used by Loop A, then Loop B?
```

**Problems**:
- How to merge "partial work" from Loop A before Loop B starts?
- What if Loop A failed and left bad state?
- How to track which loop owns which commits?

---

## 4. Loop Context Design Analysis

### 4.1 Path Resolution

**Source**: `crates/ralph-core/src/loop_context.rs`

```rust
impl LoopContext {
    pub fn worktree(loop_id, worktree_path, repo_root) -> Self {
        Self {
            loop_id: Some(loop_id),  // Bound to context
            workspace: worktree_path,
            repo_root,
            is_primary: false,
        }
    }
    
    pub fn events_path(&self) -> PathBuf {
        self.ralph_dir().join("events.jsonl")  // Fixed per worktree
    }
}
```

**Design assumption**: One `LoopContext` instance per loop execution

**If reused**:
- Multiple loop IDs would need to map to same worktree path
- `loop_id()` would return stale value from previous loop
- Path resolution couldn't distinguish between loop instances

### 4.2 Symlinked Resources

**Shared across all loops via symlinks**:
- Memories: `.ralph/agent/memories.md` → symlink to main repo
- Specs: `.ralph/specs/` → symlink to main repo
- Code Tasks: `.ralph/tasks/` → symlink to main repo

**Isolated per worktree** (cannot be shared):
- Events, runtime tasks, scratchpad, handoff

**If reused**: Symlinks are fine, but isolated files would conflict

---

## 5. Hypothetical: How to Support Worktree Reuse

### 5.1 Design Requirements

To support worktree reuse, the following would be needed:

1. **State Reset Mechanism**
   ```rust
   fn reset_worktree_for_reuse(worktree_path: &Path) -> Result<()> {
       // Delete all per-loop state
       fs::remove_file(worktree_path.join(".ralph/events.jsonl"))?;
       fs::remove_file(worktree_path.join(".ralph/agent/tasks.jsonl"))?;
       fs::remove_file(worktree_path.join(".ralph/agent/scratchpad.md"))?;
       
       // Reset git state
       Command::new("git")
           .args(["reset", "--hard", "HEAD"])
           .current_dir(worktree_path)
           .output()?;
       
       Command::new("git")
           .args(["clean", "-fd"])
           .current_dir(worktree_path)
           .output()?;
   }
   ```

2. **Worktree Lease/Reservation System**
   ```rust
   struct WorktreeLease {
       worktree_id: String,    // e.g., "wt-001"
       current_loop_id: Option<String>,  // None if available
       last_used: DateTime<Utc>,
       state: LeaseState,  // Available, InUse, NeedsReset
   }
   ```

3. **Multi-Loop Context**
   ```rust
   struct ReusableWorktreeContext {
       worktree_path: PathBuf,
       current_loop_id: String,  // Changes per loop
       session_id: String,  // Unique for this loop execution
   }
   
   impl ReusableWorktreeContext {
       fn events_path(&self) -> PathBuf {
           // Use session_id instead of fixed path
           self.ralph_dir().join(format!("events-{}.jsonl", self.session_id))
       }
   }
   ```

4. **Merge Queue Changes**
   ```json
   {
     "ts": "...",
     "worktree_id": "wt-001",
     "loop_id": "loop-abc123",
     "branch": "ralph/reusable-wt-001",
     "session_id": "session-xyz789"
   }
   ```

### 5.2 Complexity Trade-offs

| Aspect | Current (No Reuse) | With Reuse |
|--------|-------------------|------------|
| **Simplicity** | ✅ Simple: 1 loop = 1 worktree | ❌ Complex: lease system, state reset |
| **Isolation** | ✅ Complete: no shared state | ⚠️ Partial: need careful cleanup |
| **Disk Usage** | ⚠️ Higher: N worktrees for N loops | ✅ Lower: fixed pool of worktrees |
| **Concurrency** | ✅ Unlimited: create as needed | ❌ Limited: pool size constraint |
| **Merge Safety** | ✅ Simple: 1 branch per loop | ⚠️ Complex: multiple loops per branch |
| **Debugging** | ✅ Easy: inspect loop's worktree | ⚠️ Harder: state from previous loops |

### 5.3 Use Case Analysis

**When would reuse be beneficial?**

1. **Limited Disk Space**
   - Large repos (monorepos with many files)
   - Many parallel loops (e.g., 10+ concurrent)
   - **Alternative**: Increase disk capacity, use `.worktrees` on external drive

2. **Fast Loop Spin-Up**
   - Avoid `git worktree add` overhead
   - **Alternative**: Keep worktree pool warm, pre-create worktrees

3. **Resource Constraints**
   - Limited inodes on filesystem
   - **Alternative**: Use worktree pool pattern with fixed size

**When is current design better?**

1. **Debugging**: Inspect a loop's worktree after failure
2. **Isolation**: No cross-loop contamination
3. **Simplicity**: Easy to understand and reason about
4. **Merge Safety**: Each loop has its own branch history

---

## 6. Current Behavior Summary

### 6.1 Attempting to Reuse a Worktree

**Scenario**: Try to run a new loop with same `loop_id` as previous loop

```bash
# Terminal 1: First loop
ralph run -p "task A"
# Creates: .worktrees/loop-20250227-143000-a3f2
# Creates branch: ralph/loop-20250227-143000-a3f2
# Loop completes → worktree removed

# Terminal 2: Try to reuse (if we could specify loop_id)
ralph run -p "task B" --loop-id loop-20250227-143000-a3f2
# ❌ NOT SUPPORTED: No --loop-id flag exists
# ❌ Loop ID is auto-generated, cannot be specified
```

### 6.2 Worktree Already Exists Error

**Source**: `crates/ralph-core/src/worktree.rs:159-163`

```rust
if worktree_path.exists() {
    return Err(WorktreeError::AlreadyExists(
        worktree_path.to_string_lossy().to_string(),
    ));
}
```

**Behavior**:
- Worktree creation fails if directory exists
- No automatic cleanup or reuse
- User must manually remove worktree: `rm -rf .worktrees/loop-xxx`

### 6.3 Zombie Worktrees

**Problem**: Worktree directory exists but loop is dead

**Detection**: `crates/ralph-core/src/loop_registry.rs`

```rust
fn is_alive(&self) -> bool {
    let pid_alive = kill(Pid::from_raw(self.pid as i32), None).is_ok();
    if !pid_alive { return false; }
    
    // For worktree loops, verify directory exists
    if let Some(ref wt_path) = self.worktree_path {
        return Path::new(wt_path).is_dir();  // ← false if deleted
    }
    true
}
```

**Cleanup**: `ralph loops prune` removes stale registry entries

---

## 7. Recommendations

### 7.1 Current Design Guidance

**DO NOT** try to reuse worktrees. The architecture is designed for:

```
1 loop = 1 worktree = 1 branch = 1 set of isolated state files
```

**If you need multiple loops**:
- Let Ralph create new worktrees automatically
- Use `ralph loops prune` to clean up old worktrees
- Monitor disk usage: `du -sh .worktrees/`

**If disk space is a concern**:
- Move `.worktrees` to external drive (symlink or config)
- Adjust worktree directory via `WorktreeConfig::with_dir()`
- Reduce parallelism: run fewer concurrent loops

### 7.2 If Worktree Reuse is Desired

**Minimal viable approach**:
1. Add worktree pool with fixed size (e.g., 3 worktrees)
2. Add lease tracking (available/in-use)
3. Add state reset between loops
4. Use session-based state files (events-{session}.jsonl)

**Complexity estimate**: Significant redesign required
- `LoopContext`: Add session-based path resolution
- `WorktreeManager`: New module for lease management
- `MergeQueue`: Track sessions, not just loop IDs
- `LoopRegistry`: Track worktree leases separately

**Estimated effort**: 2-3 weeks of development + testing

### 7.3 Alternative: Worktree Pool Pattern

**Compromise approach**: Pre-create worktrees, assign to loops

```yaml
# ralph.yml config
worktree_pool:
  enabled: true
  size: 3  # Maintain 3 pre-created worktrees
  directory: ".worktrees-pool"
```

**Behavior**:
- Pool manager pre-creates: `wt-0`, `wt-1`, `wt-2`
- On loop spawn: assign available worktree from pool
- On loop completion: return worktree to pool, reset state
- If pool exhausted: fall back to dynamic worktree creation

**Benefits**:
- Faster spin-up (no `git worktree add` on critical path)
- Bounded disk usage (fixed pool size)
- Backward compatible (fall back to current behavior)

---

## 8. Conclusion

### Summary

| Question | Answer |
|----------|--------|
| **Can multiple loops reuse one worktree?** | **NO** — Not supported in current architecture |
| **Why not?** | Isolation guarantees, state conflicts, merge complexity |
| **Can it be added?** | Yes, but requires significant redesign |
| **Is it worth it?** | Depends on use case (disk space vs. complexity) |

### Key Takeaways

1. **Current design**: 1 loop = 1 worktree (simple, isolated, safe)
2. **Reuse challenges**: State reset, concurrency control, merge tracking
3. **If needed**: Implement worktree pool with lease system
4. **Alternative**: Use dynamic worktree creation with cleanup

### Recommended Next Steps

**If you need worktree reuse**:
1. File a feature request describing your use case
2. Evaluate worktree pool pattern as compromise
3. Consider architectural trade-offs (complexity vs. disk space)

**If you can work within current design**:
- Monitor and prune worktrees regularly
- Use external storage for `.worktrees` if needed
- Adjust parallelism based on available disk space

---

## References

- **Worktree Module**: `crates/ralph-core/src/worktree.rs`
- **Loop Context**: `crates/ralph-core/src/loop_context.rs`
- **Loop Registry**: `crates/ralph-core/src/loop_registry.rs`
- **Merge Queue**: `crates/ralph-core/src/merge_queue.rs`
- **CLI Entry Point**: `crates/ralph-cli/src/main.rs:1500-1650`
- **Documentation**: `worktree.md` (comprehensive architecture overview)
