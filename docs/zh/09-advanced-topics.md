# 第9章：高级主题

## 9.1 并行循环（Parallel Loops）

### 9.1.1 概念

Ralph 支持同时运行多个编排循环，每个循环在独立的 Git 工作树中执行。这允许您并行处理多个任务，同时保持主工作区的整洁。

### 9.1.2 架构

```
Primary Loop (holds .ralph/loop.lock)
├── Runs in main workspace
├── Processes merge queue on completion
└── Spawns merge-ralph for queued loops

Worktree Loops (.worktrees/<loop-id>/)
├── Isolated filesystem via git worktree
├── Symlinked memories, specs, tasks → main repo
├── Queue for merge on completion
└── Exit cleanly (no spawn)
```

### 9.1.3 使用示例

```bash
# Terminal 1: 启动主循环
ralph run -p "实现用户认证功能" --max-iterations 50

# Terminal 2: 启动并行循环
ralph run -p "优化数据库查询" --max-iterations 30

# 监控所有循环
ralph loops
```

### 9.1.4 工作树管理

```rust
/// Create a new worktree for a parallel loop.
pub async fn create_worktree(
    repo_path: &Path,
    loop_id: &str,
    branch_name: &str,
) -> Result<PathBuf, WorktreeError> {
    let worktree_path = repo_path.join(".worktrees").join(loop_id);

    // Create worktree using git
    Command::new("git")
        .arg("worktree")
        .arg("add")
        .arg("-b")
        .arg(branch_name)
        .arg(&worktree_path)
        .current_dir(repo_path)
        .output()?;

    // Create symlinks for shared state
    symlink_shared_state(&worktree_path, repo_path)?;

    Ok(worktree_path)
}

/// Create symlinks for shared state (memories, specs, tasks).
fn symlink_shared_state(worktree_path: &Path, main_path: &Path) -> Result<(), WorktreeError> {
    let ralph_dir = worktree_path.join(".ralph");

    // Symlink memories
    let main_memories = main_path.join(".ralph").join("agent").join("memories.md");
    let work_memories = ralph_dir.join("agent").join("memories.md");
    symlink(main_memories, work_memories)?;

    // Symlink specs
    let main_specs = main_path.join(".ralph").join("specs");
    let work_specs = ralph_dir.join("specs");
    symlink(main_specs, work_specs)?;

    // Symlink tasks
    let main_tasks = main_path.join(".ralph").join("tasks");
    let work_tasks = ralph_dir.join("tasks");
    symlink(main_tasks, work_tasks)?;

    Ok(())
}
```

### 9.1.5 合并队列

```rust
/// Entry in the merge queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MergeQueueEntry {
    /// Merge a worktree loop.
    Merge {
        loop_id: String,
        commit_message: String,
    },
}

/// Process merge queue after primary loop completes.
pub async fn process_merge_queue(repo_path: &Path) -> Result<(), MergeError> {
    let queue_path = repo_path.join(".ralph").join("merge-queue.jsonl");

    if !queue_path.exists() {
        return Ok(());
    }

    // Read queue entries
    let file = File::open(&queue_path)?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        let entry: MergeQueueEntry = serde_json::from_str(&line?)?;

        match entry {
            MergeQueueEntry::Merge { loop_id, commit_message } => {
                merge_worktree(repo_path, &loop_id, &commit_message).await?;
            }
        }
    }

    // Clear queue
    fs::remove_file(queue_path)?;

    Ok(())
}

/// Merge a worktree into main branch.
async fn merge_worktree(
    repo_path: &Path,
    loop_id: &str,
    commit_message: &str,
) -> Result<(), MergeError> {
    let worktree_path = repo_path.join(".worktrees").join(loop_id);

    // Checkout main branch
    Command::new("git")
        .arg("checkout")
        .arg("main")
        .current_dir(repo_path)
        .output()?;

    // Merge worktree branch
    Command::new("git")
        .arg("merge")
        .arg("--no-ff")
        .arg(&format!("loop-{}", loop_id))
        .arg("-m")
        .arg(commit_message)
        .current_dir(repo_path)
        .output()?;

    // Remove worktree
    Command::new("git")
        .arg("worktree")
        .arg("remove")
        .arg(loop_id)
        .current_dir(repo_path)
        .output()?;

    Ok(())
}
```

## 9.2 工作树（Worktrees）

### 9.2.1 Git Worktree 基础

Git worktree 允许您在同一仓库中同时检出多个分支到不同的目录：

```bash
# 创建工作树
git worktree add ../feature-branch feature-branch

# 列出工作树
git worktree list

# 删除工作树
git worktree remove ../feature-branch
```

### 9.2.2 Ralph 的工作树管理

```rust
/// Worktree configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeConfig {
    /// Base directory for worktrees.
    pub base_dir: PathBuf,

    /// Whether to use symlinks for shared state.
    pub symlink_shared: bool,

    /// Branch prefix for worktree branches.
    pub branch_prefix: String,
}

impl WorktreeConfig {
    /// Create a worktree for a loop.
    pub fn create_worktree(
        &self,
        loop_id: &str,
        repo_path: &Path,
    ) -> Result<Worktree, WorktreeError> {
        let worktree_path = self.base_dir.join(loop_id);
        let branch_name = format!("{}{}", self.branch_prefix, loop_id);

        // Create git worktree
        Command::new("git")
            .arg("worktree")
            .arg("add")
            .arg("-b")
            .arg(&branch_name)
            .arg(&worktree_path)
            .current_dir(repo_path)
            .output()?;

        let worktree = Worktree {
            id: loop_id.to_string(),
            path: worktree_path,
            branch: branch_name,
        };

        // Setup shared state symlinks if enabled
        if self.symlink_shared {
            self.symlink_shared_state(&worktree, repo_path)?;
        }

        Ok(worktree)
    }

    /// Symlink shared state directories.
    fn symlink_shared_state(
        &self,
        worktree: &Worktree,
        main_path: &Path,
    ) -> Result<(), WorktreeError> {
        let shared_dirs = ["memories", "specs", "tasks"];

        for dir in shared_dirs {
            let main_dir = main_path.join(".ralph").join(dir);
            let work_dir = worktree.path.join(".ralph").join(dir);

            fs::create_dir_all(work_dir.parent().unwrap())?;
            symlink(&main_dir, &work_dir)?;
        }

        Ok(())
    }
}

/// Represents a worktree.
#[derive(Debug, Clone)]
pub struct Worktree {
    /// Loop ID.
    pub id: String,

    /// Worktree path.
    pub path: PathBuf,

    /// Branch name.
    pub branch: String,
}
```

## 9.3 RObot（Human-in-the-Loop）

### 9.3.1 配置

```yaml
# ralph.yml
RObot:
  enabled: true
  timeout_seconds: 300
  telegram:
    bot_token: "YOUR_BOT_TOKEN"  # 或通过环境变量设置
```

### 9.3.2 事件流程

```
AI Agent 发出 human.interact 事件
        ↓
Ralph 检测到事件，发送问题到 Telegram
        ↓
事件循环阻塞，等待响应
        ↓
人类在 Telegram 中回复
        ↓
human.response 事件写入事件文件
        ↓
Ralph 读取响应，解除阻塞
        ↓
AI Agent 继续执行
```

### 9.3.3 使用示例

```bash
# 启用 RObot 运行循环
ralph run -p "需要用户输入的任务" --robot-enabled

# 查看待处理问题
ralph robot status

# 手动发送指导
ralph robot send "请优先实现核心功能"
```

## 9.4 诊断系统

### 9.4.1 启用诊断

```bash
# 启用诊断模式
RALPH_DIAGNOSTICS=1 ralph run -p "your prompt"

# 或在配置中启用
# ralph.yml
diagnostics:
  enabled: true
```

### 9.4.2 诊断输出

诊断模式会在 `.ralph/diagnostics/<timestamp>/` 目录下生成：

```
.ralph/diagnostics/20240209-123456/
├── agent-output.jsonl      # AI 智能体输出
├── orchestration.jsonl     # 编排事件、帽子选择、反向压力
└── errors.jsonl            # 解析错误、验证失败
```

### 9.4.3 分析诊断数据

```bash
# 查看工具调用
jq 'select(.type == "tool_call")' .ralph/diagnostics/*/agent-output.jsonl

# 查看编排事件
jq 'select(.hat != null)' .ralph/diagnostics/*/orchestration.jsonl

# 查看错误
jq '.error' .ralph/diagnostics/*/errors.jsonl

# 清理诊断文件
ralph clean --diagnostics
```

### 9.4.4 诊断日志

TUI 模式始终记录日志到 `.ralph/diagnostics/logs/`：

```
.ralph/diagnostics/logs/
├── ralph-20240209-123456.log
├── ralph-20240209-234567.log
└── ralph-20240209-345678.log  # 保留最近 5 个
```

## 9.5 测试策略

### 9.5.1 测试类型

Ralph 使用多种测试策略：

| 测试类型 | 描述 | 位置 |
|----------|------|------|
| **单元测试** | 测试单个函数和模块 | `crates/*/src/**/*.rs` |
| **集成测试** | 测试模块间交互 | `crates/*/tests/*.rs` |
| **烟雾测试** | 基于重放的测试 | `crates/ralph-core/tests/` |
| **E2E 测试** | 端到端测试 | `crates/ralph-e2e/` |

### 9.5.2 烟雾测试（Replay-Based）

烟雾测试使用录制的 JSONL fixture 而非实时 API 调用：

```bash
# 运行所有烟雾测试
cargo test -p ralph-core smoke_runner

# 运行特定后端的烟雾测试
cargo test -p ralph-core kiro
cargo test -p ralph-core claude
```

**Fixture 位置：** `crates/ralph-core/tests/fixtures/`

### 9.5.3 E2E 测试

```bash
# 实时 API 测试
cargo run -p ralph-e2e -- claude

# CI 安全的模拟模式
cargo run -p ralph-e2e -- --mock

# 过滤场景
cargo run -p ralph-e2e -- --mock --filter connect

# 列出场景
cargo run -p ralph-e2e -- --list
```

报告生成在 `.e2e-tests/`。

### 9.5.4 录制新 Fixture

```bash
# 录制会话为 JSONL
cargo run --bin ralph -- run -c ralph.claude.yml --record-session session.jsonl -p "your prompt"

# 使用录制的 fixture 进行测试
cargo test -p ralph-core smoke_runner -- --fixture session.jsonl
```

## 9.6 循环注册表

### 9.6.1 循环注册

```bash
# 查看所有活跃循环
ralph loops

# 输出示例：
# Active loops:
#   - primary (PID: 12345, started: 2024-02-09T12:34:56Z)
#   - worktree-abc (PID: 12346, started: 2024-02-09T12:35:00Z)
```

### 9.6.2 循环状态文件

```json
// .ralph/loops.json
{
  "loops": [
    {
      "id": "primary",
      "pid": 12345,
      "started_at": "2024-02-09T12:34:56Z",
      "work_dir": "/path/to/project",
      "is_primary": true
    },
    {
      "id": "worktree-abc",
      "pid": 12346,
      "started_at": "2024-02-09T12:35:00Z",
      "work_dir": "/path/to/project/.worktrees/abc",
      "is_primary": false
    }
  ]
}
```

### 9.6.3 循环锁

```rust
/// Loop lock file.
///
/// Contains PID + prompt of primary loop.
pub struct LoopLock {
    lock_path: PathBuf,
}

impl LoopLock {
    /// Acquire the loop lock.
    pub fn acquire(lock_path: &Path) -> Result<Self, LockError> {
        // Check if already locked
        if lock_path.exists() {
            let existing = Self::read_lock(lock_path)?;
            bail!("Loop already locked by PID {}", existing.pid);
        }

        // Create lock file
        let lock = LoopLockData {
            pid: std::process::id(),
            prompt: std::env::var("RALPH_PROMPT").ok(),
            timestamp: Utc::now(),
        };

        let content = serde_json::to_string(&lock)?;
        fs::write(lock_path, content)?;

        Ok(LoopLock {
            lock_path: lock_path.to_path_buf(),
        })
    }

    /// Release the lock (dropped automatically).
    fn release(&self) {
        let _ = fs::remove_file(&self.lock_path);
    }
}

impl Drop for LoopLock {
    fn drop(&mut self) {
        self.release();
    }
}
```

## 9.7 高级配置

### 9.7.1 环境变量

| 环境变量 | 说明 |
|----------|------|
| `RALPH_TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `RALPH_DIAGNOSTICS` | 启用诊断模式 (1=启用) |
| `RALPH_PROMPT` | 当前循环的提示 |
| `RALPH_LOOP_ID` | 循环 ID |
| `RALPH_BACKEND` | 覆盖后端选择 |

### 9.7.2 完整配置示例

```yaml
# ralph.yml
# 后端配置
backend:
  type: claude
  model: claude-sonnet-4-5-20250929
  override_command: null

# 循环配置
loop:
  max_iterations: 100
  max_duration_minutes: 240
  max_cost_usd: null

# 完成承诺
completion:
  promise: "DOCS_COMPLETE"

# 记忆系统
memories:
  enabled: true
  storage: ".agent/memories.md"

# 任务系统
tasks:
  enabled: true
  storage: ".agent/tasks.jsonl"

# 诊断
diagnostics:
  enabled: false

# RObot 人机交互
RObot:
  enabled: false
  timeout_seconds: 300
  telegram:
    bot_token: null

# 工作树配置
worktrees:
  base_dir: ".worktrees"
  symlink_shared: true
  branch_prefix: "loop-"

# 循环注册表
loops:
  registry_file: ".ralph/loops.json"
```

## 9.8 小结

本章介绍了 Ralph 的高级主题：

1. **并行循环** - 支持同时运行多个编排循环，使用 Git 工作树隔离。

2. **工作树** - 使用 Git worktree 实现并行循环的文件系统隔离。

3. **RObot** - 人机交互功能，通过 Telegram 实现双向通信。

4. **诊断系统** - 详细记录智能体输出、编排事件和错误，用于调试。

5. **测试策略** - 包括单元测试、集成测试、烟雾测试和 E2E 测试。

6. **循环注册表** - 跟踪所有活跃循环，管理循环锁。

7. **高级配置** - 环境变量和完整配置示例。

这些高级功能让 Ralph 能够处理复杂的开发场景，从并行处理到人机协作，再到详细的诊断和测试。

---

**上一章**：[第8章：ralph-telegram 详解](08-ralph-telegram.md) | **下一章**：[第10章：开发指南](10-dev-guide.md)
