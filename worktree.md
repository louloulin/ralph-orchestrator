# Ralph Parallel Worktree Architecture - Complete Analysis

## Executive Summary

The Ralph orchestrator implements parallel loop execution using **git worktrees** as the primary isolation mechanism. Multiple Ralph loops can run concurrently, each in its own isolated filesystem workspace, while sharing memories, specs, and code tasks via symlinks. Coordination is achieved through file locks, a loop registry, and an event-sourced merge queue.

---

## 1. Core Components

### 1.1 Loop Lock (`loop_lock.rs`)

**Purpose**: Ensures only one **primary** loop runs in the main workspace at a time.

**Key Files**:
- `crates/ralph-core/src/loop_lock.rs`
- Lock file: `.ralph/loop.lock`

**Mechanism**:
- Uses Unix `flock()` for advisory locking
- Non-blocking `try_acquire()` returns `AlreadyLocked` if another process holds the lock
- Blocking `acquire_blocking()` waits for the lock (used with `--exclusive` flag)
- Lock is automatically released when the process exits (even on crash)
- Stores `LockMetadata` in the lock file (PID, prompt, started timestamp)

**Flow**:
```
1. Ralph run attempts try_acquire()
2. If lock available → Become PRIMARY loop, hold lock
3. If lock held → Either:
   a. --exclusive: Wait for lock (blocking)
   b. parallel enabled: Spawn into worktree
   c. parallel disabled: Error out
```

### 1.2 Worktree Module (`worktree.rs`)

**Purpose**: Creates and manages isolated git worktrees for parallel loops.

**Key Files**:
- `crates/ralph-core/src/worktree.rs`

**Worktree Creation Flow**:
```rust
create_worktree(repo_root, loop_id, config)
  1. Verify git repository exists
  2. Check worktree doesn't already exist
  3. Create .worktrees/ directory
  4. git worktree add -b ralph/{loop_id} {path}
  5. Sync untracked files from main repo
  6. Sync unstaged changes from main repo
  7. Return Worktree struct with path, branch, head
```

**File Syncing** (`sync_working_directory_to_worktree`):
- Copies untracked files (from `git ls-files --others --exclude-standard`)
- Copies unstaged modified files (from `git diff --name-only`)
- Excludes: `.git/` directory, `.worktrees/` directory
- Preserves symlinks on Unix
- Handles binary files correctly

**Worktree Removal**:
```rust
remove_worktree(repo_root, worktree_path)
  1. Get branch name before removal
  2. git worktree remove --force
  3. Delete ralph/* branch if it exists
  4. git worktree prune
```

### 1.3 Loop Registry (`loop_registry.rs`)

**Purpose**: Tracks all active Ralph loops (primary and worktree) across the workspace.

**Key Files**:
- `crates/ralph-core/src/loop_registry.rs`
- Registry file: `.ralph/loops.json`

**Registry Entry (`LoopEntry`)**:
```rust
struct LoopEntry {
    id: String,           // "loop-{timestamp}-{hex_suffix}"
    pid: u32,             // Process ID
    started: DateTime<Utc>,
    prompt: String,       // Task description
    worktree_path: Option<String>,  // None for primary, path for worktree
    workspace: String,    // Current working directory
}
```

**Stale Detection**:
- `is_alive()`: Checks PID is alive AND worktree directory exists
- `is_pid_alive()`: Only checks PID (for zombie detection)
- **Zombie loop**: PID alive but worktree directory removed externally

**Key Operations**:
- `register()`: Adds entry, removes any stale entry with same PID
- `deregister()`: Removes entry by ID
- `clean_stale()`: Removes entries for dead processes

### 1.4 Merge Queue (`merge_queue.rs`)

**Purpose**: Event-sourced queue tracking worktree loops awaiting merge.

**Key Files**:
- `crates/ralph-core/src/merge_queue.rs`
- Queue file: `.ralph/merge-queue.jsonl`

**Event-Sourced Design**:
- Append-only JSONL log (never modified, only appended)
- State derived by replaying events
- Uses `flock()` for concurrent access safety

**Merge States**:
```
Queued → Merging → Merged (terminal)
                  → NeedsReview → Merging (retry)
                  → Discarded (terminal)
```

**Event Types**:
```rust
enum MergeEventType {
    Queued { prompt: String },
    Merging { pid: u32 },
    Merged { commit: String },
    NeedsReview { reason: String },
    Discarded { reason: Option<String> },
}
```

**State Transitions** (enforced):
- `Queued` → `Merging` (valid)
- `Merging` → `Merged` OR `NeedsReview` (valid)
- `NeedsReview` → `Merging` (retry, valid)
- `Queued` OR `NeedsReview` → `Discarded` (valid)
- All other transitions return `InvalidTransition` error

### 1.5 Loop Context (`loop_context.rs`)

**Purpose**: Provides path resolution for each loop's isolated state.

**Key Files**:
- `crates/ralph-core/src/loop_context.rs`

**Context Types**:
```rust
LoopContext::primary(workspace)
  - workspace == repo_root
  - is_primary() == true
  - All paths resolve to main .ralph/

LoopContext::worktree(loop_id, worktree_path, repo_root)
  - workspace == worktree_path
  - is_primary() == false
  - Isolated paths in worktree, symlinks to shared resources
```

**Directory Structure**:
```
.ralph/
├── agent/
│   ├── memories.md      # Symlinked in worktrees
│   ├── tasks.jsonl      # Isolated per worktree
│   ├── scratchpad.md    # Isolated per worktree
│   └── context.md       # Worktree metadata only
├── specs/               # Symlinked in worktrees
├── tasks/               # Code tasks, symlinked in worktrees
├── loop.lock            # Primary loop only
├── loops.json           # Shared registry
├── merge-queue.jsonl    # Shared queue
└── events.jsonl         # Isolated per worktree
```

**Symlink Setup** (Unix only):
```rust
setup_worktree_symlinks()
  1. setup_memory_symlink()    → .ralph/agent/memories.md
  2. setup_specs_symlink()     → .ralph/specs/
  3. setup_code_tasks_symlink() → .ralph/tasks/
```

---

## 2. Parallel Loop Lifecycle

### 2.1 Loop Spawning Flow (Entry Point)

```
┌─────────────────────────────────────────────────────────────────┐
│                    ralph run -p "prompt"                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              LoopLock::try_acquire(workspace, prompt)           │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
         [SUCCESS]    [ALREADY_LOCKED]  [ERROR]
              │               │
              │    ┌──────────┴──────────┐
              │    │                     │
              │    ▼                     ▼
              │  [--exclusive]    [parallel enabled]
              │    │                     │
              │    ▼                     ▼
              │  Wait for lock    Spawn Worktree Loop
              │    │                     │
              │    │           ┌─────────┴─────────┐
              │    │           │                   │
              │    │           ▼                   ▼
              │    │   Generate Loop ID    Create Git Worktree
              │    │           │                   │
              │    │           │           git worktree add
              │    │           │           -b ralph/{loop_id}
              │    │           │                   │
              │    │           ▼                   ▼
              │    │   ensure_gitignore()  Setup Symlinks
              │    │   (.worktrees/)              │
              │    │           │           ┌─────┴─────┐
              │    │           │           │           │
              │    │           │           ▼           ▼
              │    │           │     memories    specs/tasks
              │    │           │     symlink     symlinks
              │    │           │           │           │
              │    │           │           └─────┬─────┘
              │    │           │                 │
              │    │           ▼                 ▼
              │    │   create_worktree()  LoopContext::worktree()
              │    │           │                 │
              │    │           └────────┬────────┘
              │    │                    │
              │    │                    ▼
              │    │        Register in LoopRegistry
              │    │        (pending until preflight)
              │    │                    │
              │    │                    ▼
              │    │           Run Preflight Check
              │    │                    │
              │    │           ┌────────┴────────┐
              │    │           │                 │
              │    │           ▼                 ▼
              │    │        [PASS]            [FAIL]
              │    │           │                 │
              │    │           │         Remove worktree
              │    │           │         Return error
              │    │           │                 │
              │    │           ▼                 ▼
              │    │   Register in Registry   [EXIT]
              │    │                    │
              └────┴────────────────────┘
                              │
                              ▼
                   Run Event Loop
                   in Context
```

### 2.2 Worktree Loop Completion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              Worktree Loop: CompletionPromise Detected          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│           LoopCompletionHandler::handle_completion(ctx, prompt) │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
             [auto_merge=true]   [auto_merge=false]
                    │                   │
                    ▼                   ▼
             Enqueue in           Return ManualMerge
             MergeQueue                 │
                    │                   │
                    ▼                   ▼
          MergeQueue::enqueue()         │
                    │                   │
                    ▼                   ▼
             Return Enqueued      Print instructions
                    │             for manual merge
                    │
                    ▼
         ┌──────────────────────────────────┐
         │  Worktree loop exits cleanly     │
         │  - Does NOT hold loop.lock       │
         │  - Does NOT spawn merge-ralph    │
         │  - Queued for primary to merge   │
         └──────────────────────────────────┘
```

### 2.3 Primary Loop Merge Processing

```
┌─────────────────────────────────────────────────────────────────┐
│      Primary Loop: CompletionPromise + process_pending_merges   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  MergeQueue::list_by_state(Queued)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
              [Queue Empty]      [Pending Entries]
                    │                   │
                    ▼                   ▼
                  Done          For each entry (FIFO):
                                        │
                                        ▼
                        ┌───────────────┴───────────────┐
                        │                               │
                        ▼                               ▼
                 [auto_spawn=true]             [auto_spawn=false]
                        │                               │
                        ▼                               ▼
                Spawn merge-ralph              Skip (manual merge)
                        │
                        ▼
          ┌──────────────────────────────────────┐
          │  ralph run -H builtin:merge-loop     │
          │    --exclusive                       │
          │    -p "Merge loop {id}"              │
          │    RALPH_MERGE_LOOP_ID={id}          │
          └──────────────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────────────────┐
          │  Merge Loop (merge-ralph):           │
          │  1. Mark queue entry as Merging      │
          │  2. git merge ralph/{loop_id}        │
          │  3. On success: mark Merged          │
          │  4. On conflict: mark NeedsReview    │
          └──────────────────────────────────────┘
                        │
                        ▼
                Remove Worktree
                Delete Branch
```

---

## 3. File System Isolation

### 3.1 Isolation Model

```
Main Repository                        Worktree (.worktrees/loop-abc123/)
─────────────                         ─────────────────────────────────
.ralph/                               .ralph/
├── agent/                            ├── agent/
│   ├── memories.md ◄─────────────────│── memories.md (symlink)
│   ├── tasks.jsonl                   │   ├── tasks.jsonl (isolated)
│   ├── scratchpad.md                 │   ├── scratchpad.md (isolated)
│   └── summary.md                    │   └── context.md (worktree info)
├── specs/ ◄──────────────────────────│── specs/ (symlink)
├── tasks/ ◄──────────────────────────│── tasks/ (symlink)
├── loop.lock (primary only)          ├── events.jsonl (isolated)
├── loops.json (shared)               └── history.jsonl (isolated)
├── merge-queue.jsonl (shared)
└── events.jsonl (primary only)

Git State
─────────
main branch                           ralph/loop-abc123 branch
(worktree shares .git via git)
```

### 3.2 What Gets Shared (Symlinked)

| Resource | Location | Shared Because |
|----------|----------|----------------|
| Memories | `.ralph/agent/memories.md` | Cross-loop learning |
| Specs | `.ralph/specs/` | Specs define requirements for all loops |
| Code Tasks | `.ralph/tasks/` | Shared task queue access |

### 3.3 What Gets Isolated

| Resource | Location | Isolated Because |
|----------|----------|------------------|
| Events | `.ralph/events.jsonl` | Each loop has own event stream |
| Tasks (runtime) | `.ralph/agent/tasks.jsonl` | Per-loop task tracking |
| Scratchpad | `.ralph/agent/scratchpad.md` | Loop-specific WIP state |
| History | `.ralph/history.jsonl` | Debugging per loop |
| Summary | `.ralph/agent/summary.md` | Completion state per loop |
| Context | `.ralph/agent/context.md` | Worktree metadata only |

---

## 4. Coordination Mechanisms

### 4.1 Lock Coordination

```
┌──────────────────────────────────────────────────────────────────┐
│                      .ralph/loop.lock                            │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  LockMetadata:                                           │    │
│  │    pid: 12345                                            │    │
│  │    started: 2025-01-24T10:30:00Z                        │    │
│  │    prompt: "implement authentication"                    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  flock() held by PRIMARY loop process                           │
│  Automatically released on process exit                         │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         │ try_acquire()                │ read_existing()
         ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│    PRIMARY Loop     │      │    WORKTREE Loop Spawn      │
│  (holds lock)       │      │  (detects lock, spawns)     │
└─────────────────────┘      └─────────────────────────────┘
```

### 4.2 Registry Coordination

```
┌──────────────────────────────────────────────────────────────────┐
│                    .ralph/loops.json                             │
│                                                                  │
│  [                                                               │
│    {                                                             │
│      "id": "loop-1737684400-a3f2",                              │
│      "pid": 12345,                                              │
│      "prompt": "implement auth",                                │
│      "worktree_path": null,           ← PRIMARY                 │
│      "workspace": "/project"                                    │
│    },                                                            │
│    {                                                             │
│      "id": "loop-1737684500-b4d3",                              │
│      "pid": 12456,                                              │
│      "prompt": "add footer",                                    │
│      "worktree_path": "/project/.worktrees/loop-...b4d3",       │
│      "workspace": "/project/.worktrees/loop-...b4d3"            │
│    }                                                             │
│  ]                                                               │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         │ register()                   │ clean_stale()
         ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│   Loop Startup      │      │    Stale Cleanup            │
│  Add entry          │      │  Remove dead PID entries    │
└─────────────────────┘      └─────────────────────────────┘
```

### 4.3 Merge Queue Coordination

```
┌──────────────────────────────────────────────────────────────────┐
│               .ralph/merge-queue.jsonl (Event Log)               │
│                                                                  │
│  {"ts":"...","loop_id":"loop-abc","event":{"type":"queued",...}}
│  {"ts":"...","loop_id":"loop-abc","event":{"type":"merging",...}}
│  {"ts":"...","loop_id":"loop-abc","event":{"type":"merged",...}}
│                                                                  │
│  State derived by replay: Queued → Merging → Merged             │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         │ enqueue()                    │ mark_merged()
         ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────────┐
│  Worktree Complete  │      │    Merge Success            │
│  Queue for merge    │      │  Record commit SHA          │
└─────────────────────┘      └─────────────────────────────┘
```

---

## 5. Event Coordination Between Loops

### 5.1 No Direct Event Coordination

Loops do **not** communicate directly via events. Instead:

1. **Shared State Files**: Coordination happens through file system
   - `loop.lock` for primary slot
   - `loops.json` for discovery
   - `merge-queue.jsonl` for merge ordering

2. **Process Lifecycle Signals**:
   - Primary loop completion triggers `process_pending_merges()`
   - Worktree loop completion enqueues itself
   - Merge loops are spawned as separate processes

### 5.2 Indirect Coordination Flow

```
Terminal 1: Primary Loop              Terminal 2: Worktree Loop
───────────────────────              ───────────────────────────
    ralph run -p "auth"                  ralph run -p "footer"
           │                                    │
           ▼                                    ▼
    try_acquire() → OK                   try_acquire() → FAIL
           │                                    │
           ▼                                    ▼
    Run as PRIMARY                        create_worktree()
           │                                    │
           ▼                                    ▼
    ...executing...                       Run in worktree
           │                                    │
           │                                    ▼
           │                             CompletionPromise
           │                                    │
           │                                    ▼
           │                        enqueue("loop-footer", ...)
           │                                    │
           │                                    ▼
           │                              Exit cleanly
           │
           ▼
    CompletionPromise
           │
           ▼
    process_pending_merges()
           │
           ▼
    Spawn merge-ralph for "loop-footer"
           │
           ▼
    git merge ralph/loop-footer
```

---

## 6. Error Handling and Recovery

### 6.1 Zombie Loop Detection

A **zombie loop** has its PID alive but worktree directory removed:

```rust
// loop_registry.rs
fn is_alive(&self) -> bool {
    // Check PID
    let pid_alive = kill(Pid::from_raw(self.pid as i32), None).is_ok();

    if !pid_alive {
        return false;
    }

    // For worktree loops, also verify directory exists
    if let Some(ref wt_path) = self.worktree_path {
        return Path::new(wt_path).is_dir();
    }

    true
}
```

### 6.2 Cleanup on Preflight Failure

```rust
// main.rs:1567-1578
if preflight_fails && !loop_context.is_primary() {
    remove_worktree(loop_context.repo_root(), loop_context.workspace());
    return Err(preflight_error);
}
```

### 6.3 Merge Conflict Handling

```rust
// merge_queue.rs
// On merge failure:
queue.mark_needs_review(loop_id, "Conflicting changes in src/auth.rs");

// User can retry:
ralph loops retry <loop_id>
// Spawns new merge-ralph process
```

---

## 7. Configuration

### 7.1 Parallel Loop Settings

```yaml
# ralph.yml
features:
  parallel: true           # Enable auto-spawn into worktrees
  auto_merge: true         # Auto-merge completed worktree loops
  loop_naming:
    adjectives: ["swift", "bright", ...]
    nouns: ["maple", "river", ...]
```

### 7.2 CLI Flags

| Flag | Effect |
|------|--------|
| `--exclusive` | Wait for primary slot instead of spawning worktree |
| `--no-auto-merge` | Disable auto-merge on completion |

---

## 8. Key Implementation Details

### 8.1 Loop ID Generation

```rust
// Format: loop-{unix_timestamp}-{4_hex_chars}
fn generate_id() -> String {
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).as_secs();
    let hex_suffix = format!("{:04x}", subsec_micros % 0x10000);
    format!("loop-{}-{}", timestamp, hex_suffix)
}
```

### 8.2 Branch Naming Convention

```
Branch: ralph/{loop_id}
Example: ralph/loop-1737684500-b4d3
```

### 8.3 Worktree Directory Structure

```
.worktrees/
├── loop-1737684500-a3f2/     ← Worktree directory
│   ├── .ralph/
│   │   ├── agent/
│   │   │   ├── memories.md   ← Symlink to main
│   │   │   ├── tasks.jsonl   ← Isolated
│   │   │   └── context.md    ← Worktree metadata
│   │   ├── specs/            ← Symlink to main
│   │   └── events.jsonl      ← Isolated
│   └── src/...               ← Working copy
└── loop-1737684600-c5e6/
    └── ...
```

---

## 9. Summary

The Ralph parallel worktree architecture provides:

1. **Filesystem Isolation**: Each parallel loop gets its own git worktree with isolated working directory
2. **Shared Learning**: Memories, specs, and code tasks are symlinked for cross-loop knowledge sharing
3. **Lock-Based Coordination**: `flock()` on `.ralph/loop.lock` ensures only one primary loop
4. **Event-Sourced Merging**: Append-only merge queue tracks loop completion through merge
5. **Automatic Worktree Management**: Auto-creation on lock conflict, auto-cleanup on completion
6. **Zombie Detection**: Registry tracks loops and detects orphaned worktrees
7. **Merge Automation**: Primary loop processes pending merges on completion

This design enables true parallel execution while maintaining safety through git's native worktree isolation and careful coordination of shared state.

---

## 10. Key Source Files

| File | Purpose |
|------|---------|
| `crates/ralph-core/src/worktree.rs` | Git worktree creation/removal |
| `crates/ralph-core/src/loop_lock.rs` | Primary loop lock coordination |
| `crates/ralph-core/src/loop_registry.rs` | Loop tracking and zombie detection |
| `crates/ralph-core/src/merge_queue.rs` | Event-sourced merge queue |
| `crates/ralph-core/src/loop_context.rs` | Path resolution for loops |
| `crates/ralph-core/src/loop_runner.rs` | Loop lifecycle and merge processing |
| `crates/ralph-cli/src/main.rs` | CLI entry point, worktree spawning |

---

## 附录：中文概述 (Chinese Summary)

## 概述

Ralph 通过 Git Worktree 机制实现多个编排循环的并行执行。每个并行循环在独立的 Git worktree 中运行，主循环保留在主工作区中。

### 核心隔离策略

- **事件**: 每个循环独立的事件流 (`.ralph/events.jsonl`)
- **任务**: 每个循环独立的任务队列 (`.agent/tasks.jsonl`)
- **思考**: 每个循环独立的草稿本 (`.agent/scratchpad.md`)
- **记忆**: 所有循环共享学习内容 (`.agent/memories.md` 符号链接)
- **规范**: 所有循环共享规范和任务定义 (符号链接)

### 并行执行流程

1. **启动**: `ralph run -p "prompt"` 尝试获取 `.ralph/loop.lock`
2. **主循环**: 成功获取锁 → 在主工作区运行
3. **工作树循环**: 锁已被持有 → 创建 git worktree → 在工作树中运行
4. **完成**: 工作树循环完成 → 加入合并队列 → 主循环处理合并

### CLI 命令

```bash
# 主循环
ralph run -p "Add authentication"

# 并行工作树循环
ralph run -p "Add logging"

# 管理循环
ralph loops                    # 列出所有循环
ralph loops logs <id> -f       # 查看循环日志
ralph loops merge <id>         # 合并循环
ralph loops discard <id>       # 放弃循环
ralph loops prune              # 清理僵尸循环
```

### 相关规范

- `.ralph/specs/multi-loop-concurrency.code-task.md`
- `.ralph/specs/web-dashboard/phase4-24-7-platform.spec.md`
