# 第4章：ralph-core 详解

## 4.1 模块结构

`ralph-core` 是 Ralph Orchestrator 的核心库，包含了编排循环、配置管理、状态管理等核心功能。

### 4.1.1 目录结构

```
crates/ralph-core/src/
├── lib.rs                   # 库入口
├── config.rs                # 配置系统
├── event_loop/              # 事件循环模块
│   ├── mod.rs              # 事件循环实现
│   └── loop_state.rs       # 循环状态
├── event_parser.rs          # 事件解析器
├── event_reader.rs          # 事件读取器
├── event_logger.rs          # 事件日志记录
├── hatless_ralph.rs         # Ralph 协调器
├── hat_registry.rs          # 帽子注册表
├── skill_registry.rs        # 技能注册表
├── memory.rs                # 记忆系统
├── memory_store.rs          # 记忆存储
├── memory_parser.rs         # 记忆解析器
├── task.rs                  # 任务系统
├── task_store.rs            # 任务存储
├── task_definition.rs       # 任务定义
├── loop_context.rs          # 循环上下文
├── loop_history.rs          # 循环历史
├── loop_lock.rs             # 循环锁
├── loop_name.rs             # 循环命名
├── loop_registry.rs         # 循环注册表
├── loop_completion.rs       # 循环完成检测
├── merge_queue.rs           # 合并队列
├── worktree.rs              # 工作树管理
├── workspace.rs             # 工作空间管理
├── git_ops.rs               # Git 操作
├── file_lock.rs             # 文件锁
├── preflight.rs             # 预检查
├── instructions.rs          # 指令构建
├── landing.rs               # 着陆区处理
├── handoff.rs               # 交接处理
├── diagnostics/             # 诊断模块
│   ├── mod.rs
│   ├── tracer.rs
│   └── ...
├── testing/                 # 测试支持
│   └── mod.rs
├── session_recorder.rs      # 会话记录
├── session_player.rs        # 会话回放
├── planning_session.rs      # 规划会话
├── summary_writer.rs        # 摘要写入
├── skill.rs                 # 技能定义
├── cli_capture.rs           # CLI 捕获
├── text.rs                  # 文本处理工具
└── utils.rs                 # 工具函数
```

### 4.1.2 依赖关系

```toml
[dependencies]
ralph-proto      # 协议定义
tokio            # 异步运行时
async-trait      # 异步 trait
serde            # 序列化框架
serde_json       # JSON 支持
serde_yaml       # YAML 支持
thiserror        # 错误处理
anyhow           # 错误处理
tracing          # 日志追踪
chrono           # 时间处理
crossterm        # 终端操作
regex            # 正则表达式
keyring          # 密钥环访问
reqwest          # HTTP 客户端
```

## 4.2 配置系统（Config）

### 4.2.1 配置文件结构

Ralph 使用 YAML 格式的配置文件，默认为 `ralph.yml`：

```yaml
# 后端配置
backend:
  type: claude
  model: claude-sonnet-4-5-20250929
  # 可选：覆盖检测到的后端
  # override_command: "custom-command"

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
```

### 4.2.2 配置结构体

在 `config.rs` 中定义了核心配置结构：

```rust
/// Complete Ralph configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphConfig {
    /// Backend configuration.
    pub backend: BackendConfig,

    /// Loop configuration.
    pub loop_config: LoopConfig,

    /// Completion promise configuration.
    pub completion: CompletionConfig,

    /// Memory configuration.
    pub memories: MemoryConfig,

    /// Task configuration.
    pub tasks: TaskConfig,

    /// Diagnostics configuration.
    pub diagnostics: DiagnosticsConfig,

    /// RObot (human-in-the-loop) configuration.
    pub robot: Option<RobotConfig>,
}

/// Backend configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    /// Backend type (auto-detect if not specified).
    #[serde(rename = "type")]
    pub backend_type: Option<HatBackend>,

    /// Model to use.
    pub model: Option<String>,

    /// Override auto-detected backend command.
    pub override_command: Option<String>,
}

/// Loop configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopConfig {
    /// Maximum number of iterations.
    #[serde(default = "default_max_iterations")]
    pub max_iterations: usize,

    /// Maximum runtime in minutes.
    #[serde(default = "default_max_duration")]
    pub max_duration_minutes: usize,

    /// Maximum cost in USD.
    #[serde(default)]
    pub max_cost_usd: Option<f64>,
}
```

### 4.2.3 配置加载

```rust
impl RalphConfig {
    /// Load configuration from a file.
    pub fn load(path: &Path) -> Result<Self, ConfigError> {
        let content = fs::read_to_string(path)?;
        let config: RalphConfig = serde_yaml::from_str(&content)?;
        Ok(config)
    }

    /// Save configuration to a file.
    pub fn save(&self, path: &Path) -> Result<(), ConfigError> {
        let content = serde_yaml::to_string(self)?;
        fs::write(path, content)?;
        Ok(())
    }

    /// Get default configuration.
    pub fn default() -> Self {
        RalphConfig {
            backend: BackendConfig::default(),
            loop_config: LoopConfig::default(),
            completion: CompletionConfig::default(),
            memories: MemoryConfig::default(),
            tasks: TaskConfig::default(),
            diagnostics: DiagnosticsConfig::default(),
            robot: None,
        }
    }
}
```

## 4.3 事件循环（Event Loop）

### 4.3.1 事件循环结构

事件循环是 Ralph 的核心协调机制，位于 `event_loop/mod.rs`：

```rust
/// Event loop orchestrator.
pub struct EventLoop {
    /// Loop configuration.
    config: RalphConfig,

    /// Hat registry.
    hat_registry: HatRegistry,

    /// Skill registry.
    skill_registry: SkillRegistry,

    /// Event bus.
    event_bus: Arc<dyn EventBus>,

    /// Loop state.
    state: LoopState,

    /// Robot service for human-in-the-loop.
    robot_service: Option<Box<dyn RobotService>>,
}
```

### 4.3.2 事件循环执行

```rust
impl EventLoop {
    /// Run the event loop until completion or termination.
    pub async fn run(&mut self) -> Result<TerminationReason, Error> {
        // Initialize loop
        self.initialize().await?;

        // Main loop
        loop {
            // Check termination conditions
            if let Some(reason) = self.check_termination()? {
                return Ok(reason);
            }

            // Read events from previous iteration
            let events = self.event_reader.read_events()?;

            // Parse events
            let parsed = self.event_parser.parse(&events)?;

            // Build prompt for current iteration
            let prompt = self.build_prompt(&parsed).await?;

            // Delegate to appropriate hat
            let output = self.delegate_to_hat(prompt).await?;

            // Check for completion promise
            if self.contains_completion_promise(&output) {
                return Ok(TerminationReason::CompletionPromise);
            }
        }
    }
}
```

### 4.3.3 循环状态管理

```rust
/// State of the event loop.
#[derive(Debug, Clone)]
pub struct LoopState {
    /// Current iteration number.
    pub iteration: usize,

    /// Start time of the loop.
    pub start_time: DateTime<Utc>,

    /// Number of consecutive failures.
    pub consecutive_failures: usize,

    /// Last event published.
    pub last_event: Option<Event>,

    /// Active hat for this iteration.
    pub active_hat: Option<String>,
}

impl LoopState {
    /// Create new loop state.
    pub fn new() -> Self {
        LoopState {
            iteration: 0,
            start_time: Utc::now(),
            consecutive_failures: 0,
            last_event: None,
            active_hat: None,
        }
    }

    /// Increment iteration counter.
    pub fn increment(&mut self) {
        self.iteration += 1;
    }

    /// Check if loop has exceeded maximum runtime.
    pub fn exceeds_max_runtime(&self, max_minutes: usize) -> bool {
        let elapsed = Utc::now().signed_duration_since(self.start_time);
        elapsed.num_minutes() as usize > max_minutes
    }
}
```

## 4.4 状态管理

### 4.4.1 循环上下文（LoopContext）

```rust
/// Context passed to each loop iteration.
pub struct LoopContext {
    /// Working directory.
    pub work_dir: PathBuf,

    /// Landing zone for agent output.
    pub landing_path: PathBuf,

    /// Events file for reading/writing events.
    pub events_path: PathBuf,

    /// Loop lock file path.
    pub lock_path: PathBuf,

    /// Loop name.
    pub loop_name: String,

    /// Whether this is a primary or worktree loop.
    pub is_primary: bool,
}
```

### 4.4.2 循环历史（LoopHistory）

```rust
/// History of loop iterations.
pub struct LoopHistory {
    /// Maximum number of iterations to keep in history.
    max_history: usize,

    /// History entries.
    entries: Vec<HistoryEntry>,
}

/// Single history entry.
#[derive(Debug, Clone)]
pub struct HistoryEntry {
    /// Iteration number.
    pub iteration: usize,

    /// Timestamp.
    pub timestamp: DateTime<Utc>,

    /// Event that triggered this iteration.
    pub event: Option<Event>,

    /// Hat that was active.
    pub hat: Option<String>,

    /// Output from the hat.
    pub output: String,
}
```

## 4.5 内存存储（MemoryStore）

### 4.5.1 记忆结构

```rust
/// Memory entry with metadata.
pub struct Memory {
    /// Unique ID.
    pub id: String,

    /// Memory content.
    pub content: String,

    /// Type of memory.
    pub memory_type: MemoryType,

    /// Tags for categorization.
    pub tags: Vec<String>,

    /// Creation timestamp.
    pub created_at: DateTime<Utc>,
}

/// Types of memories.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    /// Code patterns and conventions.
    Pattern,

    /// Architectural decisions.
    Decision,

    /// Solutions to recurring problems.
    Fix,

    /// Project-specific knowledge.
    Context,
}
```

### 4.5.2 记忆存储实现

```rust
/// Store for managing memories.
pub struct MemoryStore {
    /// In-memory cache of memories.
    memories: Vec<Memory>,

    /// Storage file path.
    storage_path: PathBuf,
}

impl MemoryStore {
    /// Load memories from markdown file.
    pub fn load(&mut self) -> Result<(), MemoryError> {
        if !self.storage_path.exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&self.storage_path)?;
        self.memories = parse_memories_from_markdown(&content)?;
        Ok(())
    }

    /// Save memories to markdown file.
    pub fn save(&self) -> Result<(), MemoryError> {
        let content = format_memories_as_markdown(&self.memories);
        fs::write(&self.storage_path, content)?;
        Ok(())
    }

    /// Add a new memory.
    pub fn add(&mut self, memory: Memory) {
        self.memories.push(memory);
    }

    /// Search memories by query.
    pub fn search(&self, query: &str, limit: usize) -> Vec<&Memory> {
        self.memories
            .iter()
            .filter(|m| {
                m.content.to_lowercase().contains(&query.to_lowercase())
                    || m.tags.iter().any(|t| t.to_lowercase().contains(&query.to_lowercase()))
            })
            .take(limit)
            .collect()
    }

    /// Get memories formatted for context injection.
    pub fn prime(&self, budget: usize) -> String {
        let truncated = truncate_to_budget(&self.memories, budget);
        format_memories_as_markdown(&truncated)
    }
}
```

## 4.6 任务管理（TaskStore）

### 4.6.1 任务结构

```rust
/// Task with metadata and status.
pub struct Task {
    /// Unique ID.
    pub id: TaskId,

    /// Task title.
    pub title: String,

    /// Optional description.
    pub description: Option<String>,

    /// Current status.
    pub status: TaskStatus,

    /// Priority (1 = highest).
    pub priority: Priority,

    /// Tasks this task depends on.
    pub blocked_by: Vec<TaskId>,

    /// Creation timestamp.
    pub created_at: DateTime<Utc>,

    /// Last update timestamp.
    pub updated_at: DateTime<Utc>,
}

/// Task ID type.
pub type TaskId = String;

/// Task status.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    /// Task is open and ready to work on.
    Open,

    /// Task is currently being worked on.
    InProgress,

    /// Task is blocked by dependencies.
    Blocked,

    /// Task is completed.
    Closed,
}

/// Task priority (1 = highest, 5 = lowest).
pub type Priority = u8;
```

### 4.6.2 任务存储实现

```rust
/// Store for managing tasks.
pub struct TaskStore {
    /// In-memory cache of tasks.
    tasks: HashMap<TaskId, Task>,

    /// Storage file path (JSONL format).
    storage_path: PathBuf,
}

impl TaskStore {
    /// Load tasks from JSONL file.
    pub fn load(&mut self) -> Result<(), TaskError> {
        if !self.storage_path.exists() {
            return Ok(());
        }

        let file = File::open(&self.storage_path)?;
        let reader = BufReader::new(file);

        for line in reader.lines() {
            let task: Task = serde_json::from_str(&line?)?;
            self.tasks.insert(task.id.clone(), task);
        }

        Ok(())
    }

    /// Save tasks to JSONL file.
    pub fn save(&self) -> Result<(), TaskError> {
        let file = File::create(&self.storage_path)?;
        let writer = BufWriter::new(file);

        for task in self.tasks.values() {
            let line = serde_json::to_string(task)?;
            writeln!(writer, "{}", line)?;
        }

        writer.flush()?;
        Ok(())
    }

    /// Add a new task.
    pub fn add(&mut self, task: Task) {
        self.tasks.insert(task.id.clone(), task);
    }

    /// Get all unblocked tasks (ready to work on).
    pub fn get_ready_tasks(&self) -> Vec<&Task> {
        self.tasks
            .values()
            .filter(|t| t.status == TaskStatus::Open)
            .filter(|t| self.is_unblocked(t))
            .collect()
    }

    /// Check if a task is unblocked (all dependencies closed).
    fn is_unblocked(&self, task: &Task) -> bool {
        task.blocked_by
            .iter()
            .all(|id| match self.tasks.get(id) {
                Some(dep) => dep.status == TaskStatus::Closed,
                None => true, // Missing dependencies are considered closed
            })
    }

    /// Update task status.
    pub fn update_status(&mut self, id: &TaskId, status: TaskStatus) -> Result<(), TaskError> {
        let task = self.tasks.get_mut(id).ok_or(TaskError::NotFound(id.clone()))?;
        task.status = status;
        task.updated_at = Utc::now();
        Ok(())
    }
}
```

## 4.7 帽子系统（Hat Registry）

### 4.7.1 帽子定义

```rust
/// Hat represents a specialized role in the system.
pub struct Hat {
    /// Unique hat identifier.
    pub id: HatId,

    /// Human-readable name.
    pub name: String,

    /// Description of what this hat does.
    pub description: String,

    /// Events this hat subscribes to.
    pub subscribes_to: Vec<String>,

    /// Events this hat publishes.
    pub publishes: Vec<String>,

    /// Instructions for this hat.
    pub instructions: String,

    /// Backend to use for this hat.
    pub backend: Option<HatBackend>,
}

/// Hat identifier type.
pub type HatId = String;
```

### 4.7.2 帽子注册表

```rust
/// Registry of all available hats.
pub struct HatRegistry {
    /// Registered hats keyed by ID.
    hats: HashMap<HatId, Hat>,
}

impl HatRegistry {
    /// Create a new hat registry.
    pub fn new() -> Self {
        HatRegistry {
            hats: HashMap::new(),
        }
    }

    /// Register a new hat.
    pub fn register(&mut self, hat: Hat) {
        self.hats.insert(hat.id.clone(), hat);
    }

    /// Get a hat by ID.
    pub fn get(&self, id: &HatId) -> Option<&Hat> {
        self.hats.get(id)
    }

    /// Get all hats that subscribe to a given event.
    pub fn get_subscribers(&self, event: &str) -> Vec<&Hat> {
        self.hats
            .values()
            .filter(|hat| hat.subscribes_to.contains(&event.to_string()))
            .collect()
    }
}
```

## 4.8 小结

本章深入探讨了 `ralph-core` crate 的实现细节：

1. **模块结构** - ralph-core 包含 40+ 个模块，涵盖配置、事件循环、记忆、任务、帽子等核心功能。

2. **配置系统** - 使用 YAML 格式的配置文件，支持后端配置、循环配置、记忆/任务配置等。

3. **事件循环** - 核心协调机制，负责读取事件、构建提示、委托给帽子、检测完成等。

4. **状态管理** - 包括循环上下文、循环历史等，用于跟踪循环执行状态。

5. **记忆存储** - 使用 Markdown 格式持久化存储代码库模式和约定。

6. **任务管理** - 使用 JSONL 格式存储任务，支持依赖关系和状态管理。

7. **帽子系统** - 通过 HatRegistry 管理所有可用的专业角色。

理解 ralph-core 的实现细节对于扩展和定制 Ralph 至关重要。在下一章中，我们将探讨 `ralph-cli` crate 的实现。

---

**上一章**：[第3章：核心概念](03-core-concepts.md) | **下一章**：[第5章：ralph-cli 详解](05-ralph-cli.md)
