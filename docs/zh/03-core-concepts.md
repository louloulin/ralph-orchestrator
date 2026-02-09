# 第3章：核心概念

## 3.1 Orchestration Loop（编排循环）

### 3.1.1 什么是编排循环

**Orchestration Loop**（编排循环）是 Ralph 的核心机制。它类似于一个持续运行的主循环，不断地协调 AI 智能体完成用户指定的任务。

想象一个项目经理（Ralph）和一个执行团队（AI 智能体）的工作方式：
1. 项目经理收到任务
2. 将任务分配给团队成员
3. 等待团队成员完成工作
4. 检查工作质量
5. 如果需要，分配下一个任务
6. 重复直到整个项目完成

Ralph 的编排循环正是这样工作的：

```
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestration Loop                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │   Receive   │───▶│   Delegate  │───▶│   Collect   │        │
│   │    Event    │    │   to Agent  │    │   Output    │        │
│   └─────────────┘    └─────────────┘    └──────┬──────┘        │
│                                                  │               │
│                     ┌────────────────────────────┘               │
│                     ▼                                          │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │     End     │◀───│   Quality   │◀───│   Parse     │        │
│   │    Loop     │    │   Checks    │    │   Events    │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1.2 循环的生命周期

编排循环有以下几种终止原因：

| 终止原因 | 说明 | 退出码 |
|----------|------|--------|
| `CompletionPromise` | 检测到完成承诺（成功） | 0 |
| `MaxIterations` | 达到最大迭代次数（限制） | 2 |
| `MaxRuntime` | 超过最大运行时间（限制） | 2 |
| `MaxCost` | 超过最大成本（限制） | 2 |
| `ConsecutiveFailures` | 连续失败次数过多（错误） | 1 |
| `LoopThrashing` | 检测到循环抖动（错误） | 1 |
| `ValidationFailure` | 验证失败（错误） | 1 |
| `Stopped` | 用户手动停止（错误） | 1 |
| `Interrupted` | 被信号中断 SIGINT（中断） | 130 |
| `RestartRequested` | 通过 Telegram 请求重启 | 3 |

### 3.1.3 代码实现

在 `ralph-core` 中，事件循环的核心代码位于 `crates/ralph-core/src/event_loop/mod.rs`：

```rust
/// Reason the event loop terminated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminationReason {
    /// Completion promise was detected in output.
    CompletionPromise,
    /// Maximum iterations reached.
    MaxIterations,
    /// Maximum runtime exceeded.
    MaxRuntime,
    /// Maximum cost exceeded.
    MaxCost,
    /// Too many consecutive failures.
    ConsecutiveFailures,
    /// Loop thrashing detected (repeated blocked events).
    LoopThrashing,
    /// Too many consecutive malformed JSONL lines in events file.
    ValidationFailure,
    /// Manually stopped.
    Stopped,
    /// Interrupted by signal (SIGINT/SIGTERM).
    Interrupted,
    /// Restart requested via Telegram `/restart` command.
    RestartRequested,
}
```

## 3.2 Event System（事件系统）

### 3.2.1 事件驱动架构

Ralph 使用**事件驱动架构**（Event-Driven Architecture）来协调不同的组件。事件是系统中各个部分通信的主要方式。

**为什么使用事件系统？**

1. **松耦合** - 组件之间不需要直接调用，只需发布和订阅事件
2. **可扩展** - 容易添加新的组件来处理事件
3. **可测试** - 可以单独测试事件处理器
4. **可追溯** - 所有交互都通过事件记录，便于调试

### 3.2.2 事件类型

Ralph 中有多种类型的事件：

| 事件类型 | 描述 | 示例 |
|----------|------|------|
| `Task` | 任务相关事件 | `task.start`, `task.complete` |
| `Review` | 审查相关事件 | `review.done`, `review.revision` |
| `Write` | 写入相关事件 | `write.done`, `write.section` |
| `Human` | 人机交互事件 | `human.interact`, `human.response` |
| `System` | 系统事件 | `loop.start`, `loop.terminate` |

### 3.2.3 事件总线

事件总线（Event Bus）是事件系统的核心组件，负责：
- 接收发布的事件
- 将事件路由到所有订阅者
- 管理订阅关系

```rust
// ralph-proto 中的 EventBus 定义
pub trait EventBus: Send + Sync {
    /// Publish an event to the bus.
    fn publish(&self, event: Event);

    /// Subscribe to events matching the given filter.
    fn subscribe(&self, filter: EventFilter) -> EventStream;
}
```

### 3.2.4 事件流程示例

一个典型的文档编写流程中的事件流：

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Ralph     │────▶│  Writer Hat │────▶│  write.done │
│ (Coordinator)│     │             │     │   event     │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                       ┌───────────────────────┘
                       ▼
              ┌─────────────┐
              │  Doc Reviewer│
              │    Hat       │
              └──────┬──────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐
    │approved │ │ revision│ │ blocked │
    │  event  │ │  event  │ │  event  │
    └────┬────┘ └────┬────┘ └────┬────┘
         │           │           │
         ▼           ▼           ▼
    [结束]      [重写]      [解决问题]
```

## 3.3 Hat System（帽子系统）

### 3.3.1 什么是帽子系统

**帽子系统（Hat System）**是 Ralph 中用于组织和协调不同专业角色的机制。每个"帽子"代表一个特定的角色或专业领域。

这个概念类似于：
- 一位经理在不同场合戴不同的帽子（项目经理帽、HR帽、技术顾问帽）
- 戏剧中的角色扮演，每个角色有自己的台词和行为

### 3.3.2 内置帽子

Ralph 包含以下内置帽子：

| 帽子 | 职责 | 触发事件 | 发布事件 |
|------|------|----------|----------|
| **Ralph** | 协调者，管理整个流程 | 所有事件 | `write.section`, `review.revision` |
| **Writer** | 编写文档和代码 | `write.section`, `review.revision` | `write.done` |
| **Doc Reviewer** | 审查文档质量 | `write.done` | `review.done`, `review.revision` |

### 3.3.3 Hatless Ralph

在 `crates/ralph-core/src/hatless_ralph.rs` 中定义了 `HatlessRalph` 结构体，这是整个系统的协调核心：

```rust
/// Hatless Ralph - the constant coordinator.
pub struct HatlessRalph {
    completion_promise: String,
    core: CoreConfig,
    hat_topology: Option<HatTopology>,
    /// Event to publish after coordination to start the hat workflow.
    starting_event: Option<String>,
    /// Whether memories mode is enabled.
    memories_enabled: bool,
    /// The user's original objective, stored at initialization.
    objective: Option<String>,
    /// Pre-built skill index section for prompt injection.
    skill_index: String,
    /// Collected robot guidance messages for injection into prompts.
    robot_guidance: Vec<String>,
}
```

### 3.3.4 帽子注册表

帽子注册表（`HatRegistry`）管理所有可用的帽子：

```rust
/// Registry of all available hats.
pub struct HatRegistry {
    hats: HashMap<String, Hat>,
    // ...
}

impl HatRegistry {
    /// Register a new hat.
    pub fn register(&mut self, hat: Hat) {
        self.hats.insert(hat.name.clone(), hat);
    }

    /// Get a hat by name.
    pub fn get(&self, name: &str) -> Option<&Hat> {
        self.hats.get(name)
    }

    /// Get all hats that subscribe to a given event.
    pub fn get_subscribers(&self, event: &str) -> Vec<&Hat> {
        // ...
    }
}
```

## 3.4 Memory System（记忆系统）

### 3.4.1 什么是记忆系统

**记忆系统（Memory System）**是 Ralph 中用于持久化存储代码库模式和约定的机制。记忆可以跨会话保留，让 AI 智能体在不同运行之间学习和积累经验。

### 3.4.2 记忆类型

Ralph 支持以下类型的记忆：

| 类型 | 用途 | 示例 |
|------|------|------|
| **Pattern** | 代码库约定 | "所有 API 处理器返回 `Result<Json<T>, AppError>`" |
| **Decision** | 架构决策 | "选择 JSONL 而非 SQLite：更简单、适合 Git、仅追加" |
| **Fix** | 问题解决方案 | "`cargo test` 挂起：杀死之前运行的 PostgreSQL 进程" |
| **Context** | 项目特定知识 | "`/legacy` 文件夹已弃用，使用 `/v2` 端点" |

### 3.4.3 记忆存储

记忆存储在 `.agent/memories.md` 文件中，使用 Markdown 格式：

```markdown
### mem-{timestamp}-{id}

**Type**: pattern
**Tags**: api, error-handling
**Created**: {ISO8601 timestamp}

内容：All API handlers return Result<Json<T>, AppError>
```

### 3.4.4 记忆管理命令

```bash
# 添加记忆
ralph tools memory add "内容" -t pattern --tags tag1,tag2

# 列出记忆
ralph tools memory list [-t type] [--tags tags]

# 搜索记忆
ralph tools memory search "查询" [-t type] [--tags tags]

# 获取记忆用于上下文注入
ralph tools memory prime --budget 2000

# 显示单条记忆
ralph tools memory show <mem-id>

# 删除记忆
ralph tools memory delete <mem-id>
```

### 3.4.5 代码实现

记忆系统的核心代码位于 `crates/ralph-core/src/memory.rs` 和 `memory_store.rs`：

```rust
/// Memory entry with metadata.
pub struct Memory {
    pub id: String,
    pub content: String,
    pub memory_type: MemoryType,
    pub tags: Vec<String>,
    pub created_at: DateTime<Utc>,
}

/// Types of memories.
pub enum MemoryType {
    Pattern,
    Decision,
    Fix,
    Context,
}

/// Store for managing memories.
pub struct MemoryStore {
    memories: Vec<Memory>,
    storage_path: PathBuf,
}

impl MemoryStore {
    /// Load memories from storage.
    pub fn load(&mut self) -> Result<(), Error> {
        // Load from .agent/memories.md
    }

    /// Save memories to storage.
    pub fn save(&self) -> Result<(), Error> {
        // Save to .agent/memories.md
    }

    /// Search memories by query.
    pub fn search(&self, query: &str, limit: usize) -> Vec<&Memory> {
        // Search implementation
    }
}
```

## 3.5 Task System（任务系统）

### 3.5.1 什么是任务系统

**任务系统（Task System）**是 Ralph 中用于跟踪运行时工作项的机制。与记忆系统不同，任务系统关注当前正在进行的工作，而不是长期存储的知识。

### 3.5.2 任务状态

任务可以处于以下状态之一：

| 状态 | 说明 |
|------|------|
| **Open** | 任务已创建，等待处理 |
| **In Progress** | 任务正在进行中 |
| **Blocked** | 任务被阻塞（依赖其他任务） |
| **Closed** | 任务已完成 |

### 3.5.3 任务依赖

任务可以设置依赖关系：

```bash
# 创建任务 A
ralph tools task add "Setup database" -p 1
# 返回: task-1737372000-a1b2

# 创建任务 B，依赖于任务 A
ralph tools task add "Add API endpoints" --blocked-by task-1737372000-a1b2
```

### 3.5.4 任务管理命令

```bash
# 添加任务
ralph tools task add "标题" -p 2 -d "描述" --blocked-by id1,id2

# 列出任务
ralph tools task list [--status open|in_progress|closed] [--format table|json|quiet]

# 显示可执行的任务（无阻塞）
ralph tools task ready

# 关闭任务
ralph tools task close <task-id>

# 显示任务详情
ralph tools task show <task-id>
```

### 3.5.5 代码实现

任务系统的核心代码位于 `crates/ralph-core/src/task.rs` 和 `task_store.rs`：

```rust
/// Task with metadata and status.
pub struct Task {
    pub id: TaskId,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: Priority,
    pub blocked_by: Vec<TaskId>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Task status.
pub enum TaskStatus {
    Open,
    InProgress,
    Blocked,
    Closed,
}

/// Task priority (1 = highest).
pub type Priority = u8;

/// Store for managing tasks.
pub struct TaskStore {
    tasks: HashMap<TaskId, Task>,
    storage_path: PathBuf,
}

impl TaskStore {
    /// Load tasks from storage.
    pub fn load(&mut self) -> Result<(), Error> {
        // Load from .agent/tasks.jsonl
    }

    /// Save tasks to storage.
    pub fn save(&self) -> Result<(), Error> {
        // Save to .agent/tasks.jsonl
    }

    /// Get all unblocked tasks (ready to work on).
    pub fn get_ready_tasks(&self) -> Vec<&Task> {
        self.tasks.values()
            .filter(|t| t.status == TaskStatus::Open)
            .filter(|t| t.blocked_by.iter().all(|id| {
                self.tasks.get(id).map(|t| t.status == TaskStatus::Closed).unwrap_or(true)
            }))
            .collect()
    }
}
```

## 3.6 小结

本章介绍了 Ralph 的五个核心概念：

1. **Orchestration Loop（编排循环）** - 持续运行的主循环，协调 AI 智能体完成任务。支持多种终止原因，如完成承诺、最大迭代次数、运行时间等。

2. **Event System（事件系统）** - 基于发布-订阅模式的通信机制。组件通过事件进行松耦合的通信，包括任务事件、审查事件、写入事件等。

3. **Hat System（帽子系统）** - 用于组织不同专业角色的机制。每个帽子代表一个特定角色（如 Writer、Doc Reviewer），通过事件系统进行协调。

4. **Memory System（记忆系统）** - 用于持久化存储代码库模式和约定的机制。支持四种类型：Pattern、Decision、Fix、Context。

5. **Task System（任务系统）** - 用于跟踪运行时工作项的机制。支持任务依赖、状态管理（Open、In Progress、Blocked、Closed）。

理解这些核心概念对于深入使用 Ralph 至关重要。在下一章中，我们将详细探讨 `ralph-core` crate 的实现细节。

---

**上一章**：[第2章：快速开始](02-quick-start.md) | **下一章**：[第4章：ralph-core 详解](04-ralph-core.md)
