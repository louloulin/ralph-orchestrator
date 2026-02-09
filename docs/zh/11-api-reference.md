# 第11章：API 参考

## 11.1 核心 API

### 11.1.1 RalphConfig

```rust
use ralph_core::RalphConfig;

impl RalphConfig {
    /// 从文件加载配置
    pub fn load(path: &Path) -> Result<Self, ConfigError>;

    /// 保存配置到文件
    pub fn save(&self, path: &Path) -> Result<(), ConfigError>;

    /// 获取默认配置
    pub fn default() -> Self;
}
```

### 11.1.2 EventLoop

```rust
use ralph_core::EventLoop;

impl EventLoop {
    /// 创建新的事件循环
    pub fn new(
        config: RalphConfig,
        context: LoopContext,
    ) -> Result<Self, Error>;

    /// 运行事件循环
    pub async fn run(&mut self) -> Result<TerminationReason, Error>;
}
```

### 11.1.3 MemoryStore

```rust
use ralph_core::MemoryStore;

impl MemoryStore {
    /// 从存储加载记忆
    pub fn load(&mut self) -> Result<(), MemoryError>;

    /// 保存记忆到存储
    pub fn save(&self) -> Result<(), MemoryError>;

    /// 添加新记忆
    pub fn add(&mut self, memory: Memory);

    /// 搜索记忆
    pub fn search(&self, query: &str, limit: usize) -> Vec<&Memory>;

    /// 获取格式化的记忆用于上下文注入
    pub fn prime(&self, budget: usize) -> String;
}
```

### 11.1.4 TaskStore

```rust
use ralph_core::TaskStore;

impl TaskStore {
    /// 从存储加载任务
    pub fn load(&mut self) -> Result<(), TaskError>;

    /// 保存任务到存储
    pub fn save(&self) -> Result<(), TaskError>;

    /// 添加新任务
    pub fn add(&mut self, task: Task);

    /// 获取所有未阻塞的任务
    pub fn get_ready_tasks(&self) -> Vec<&Task>;

    /// 更新任务状态
    pub fn update_status(&mut self, id: &TaskId, status: TaskStatus) -> Result<(), TaskError>;
}
```

## 11.2 配置选项

### 11.2.1 RalphConfig 结构

```yaml
# 完整配置示例
# 后端配置
backend:
  type: claude                    # 后端类型
  model: claude-sonnet-4-5-20250929  # 模型名称
  override_command: null           # 覆盖命令

# 循环配置
loop:
  max_iterations: 100              # 最大迭代次数
  max_duration_minutes: 240        # 最大运行时间（分钟）
  max_cost_usd: null              # 最大成本（美元）

# 完成承诺
completion:
  promise: "DOCS_COMPLETE"        # 完成承诺字符串

# 记忆系统
memories:
  enabled: true                   # 启用记忆
  storage: ".agent/memories.md"   # 存储文件路径

# 任务系统
tasks:
  enabled: true                   # 启用任务
  storage: ".agent/tasks.jsonl"  # 存储文件路径

# 诊断
diagnostics:
  enabled: false                  # 启用诊断

# RObot 人机交互
RObot:
  enabled: false                  # 启用 RObot
  timeout_seconds: 300           # 超时时间（秒）
  telegram:
    bot_token: null               # Bot token
```

### 11.2.2 BackendConfig

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | string | 否 | 后端类型（claude, kiro, gemini, etc.） |
| `model` | string | 否 | 模型名称 |
| `override_command` | string | 否 | 覆盖检测到的命令 |

### 11.2.3 LoopConfig

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `max_iterations` | usize | 否 | 100 | 最大迭代次数 |
| `max_duration_minutes` | usize | 否 | 240 | 最大运行时间（分钟） |
| `max_cost_usd` | float | 否 | null | 最大成本（美元） |

### 11.2.4 MemoryConfig

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enabled` | bool | 否 | true | 启用记忆系统 |
| `storage` | string | 否 | ".agent/memories.md" | 存储文件路径 |

### 11.2.5 TaskConfig

| 字段 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| `enabled` | bool | 否 | true | 启用任务系统 |
| `storage` | string | 否 | ".agent/tasks.jsonl" | 存储文件路径 |

## 11.3 事件类型

### 11.3.1 核心事件

```rust
/// 循环开始事件
pub struct LoopStart {
    pub iteration: usize,
    pub timestamp: DateTime<Utc>,
}

/// 帽子开始事件
pub struct HatStart {
    pub hat_name: String,
    pub hat_description: String,
    pub iteration: usize,
}

/// 帽子消息事件
pub struct HatMessage {
    pub content: String,
    pub timestamp: DateTime<Utc>,
}

/// 循环完成事件
pub struct LoopComplete {
    pub reason: String,
    pub iteration: usize,
    pub duration: Duration,
}
```

### 11.3.2 任务事件

```rust
/// 任务开始事件
pub struct TaskStart {
    pub task_id: TaskId,
    pub title: String,
    pub description: Option<String>,
}

/// 任务完成事件
pub struct TaskComplete {
    pub task_id: TaskId,
    pub result: TaskResult,
}

/// 任务失败事件
pub struct TaskFailed {
    pub task_id: TaskId,
    pub error: String,
}
```

### 11.3.3 人机交互事件

```rust
/// AI 向人类提问事件
pub struct HumanInteract {
    pub question: String,
    pub timeout: Option<u64>,
}

/// 人类回答事件
pub struct HumanResponse {
    pub response: String,
    pub question_message_id: i32,
}

/// 人类主动指导事件
pub struct HumanGuidance {
    pub guidance: String,
}
```

## 11.4 工具函数

### 11.4.1 文本处理

```rust
use ralph_core::text;

/// 安全截断字符串到字节边界
pub fn floor_char_boundary(s: &str, max: usize) -> usize;

/// 按字节截断字符串
pub fn truncate_to_budget(memories: &[Memory], budget: usize) -> Vec<&Memory>;

/// 格式化记忆为 Markdown
pub fn format_memories_as_markdown(memories: &[Memory]) -> String;
```

### 11.4.2 Git 操作

```rust
use ralph_core::git_ops;

/// 获取当前分支名
pub fn get_current_branch(repo_path: &Path) -> Result<String, GitError>;

/// 获取当前提交哈希
pub fn get_current_commit(repo_path: &Path) -> Result<String, GitError>;

/// 创建提交
pub fn create_commit(
    repo_path: &Path,
    message: &str,
) -> Result<String, GitError>;
```

### 11.4.3 文件操作

```rust
use ralph_core::file;

/// 确保目录存在
pub fn ensure_dir(path: &Path) -> Result<(), io::Error>;

/// 原子写入文件
pub fn write_atomic(path: &Path, content: &str) -> Result<(), io::Error>;

/// 读取文件到字符串
pub fn read_to_string(path: &Path) -> Result<String, io::Error>;
```

## 11.5 CLI 命令

### 11.5.1 ralph run

```bash
ralph run [OPTIONS]

OPTIONS:
    -p, --prompt <PROMPT>          任务提示
    -c, --config <CONFIG>          配置文件路径 [default: ralph.yml]
    --max-iterations <N>           最大迭代次数
    --max-duration <MINUTES>       最大运行时间
    --backend <BACKEND>            后端类型
    --continue                     继续之前的会话
    -q, --quiet                    安静模式
    -v, --verbose...               详细输出
    -h, --help                     显示帮助
```

### 11.5.2 ralph init

```bash
ralph init [OPTIONS]

OPTIONS:
    --backend <BACKEND>            后端类型
    --list-presets                 列出可用预设
    --preset <PRESET>              使用预设
    -h, --help                     显示帮助
```

### 11.5.3 ralph plan

```bash
ralph plan <DESCRIPTION>

ARGS:
    <DESCRIPTION>                  功能描述

OPTIONS:
    -o, --output <DIR>            输出目录 [default: .ralph/specs]
    -h, --help                     显示帮助
```

### 11.5.4 ralph tools task

```bash
ralph tools task <SUBCOMMAND>

SUBCOMMANDS:
    add                            添加新任务
    list                           列出任务
    ready                          显示可执行任务
    close <ID>                     关闭任务
    show <ID>                      显示任务详情
```

### 11.5.5 ralph tools memory

```bash
ralph tools memory <SUBCOMMAND>

SUBCOMMANDS:
    add                            添加新记忆
    list                           列出记忆
    search <QUERY>                 搜索记忆
    prime                          获取记忆用于上下文注入
    show <ID>                      显示记忆详情
    delete <ID>                    删除记忆
```

## 11.6 环境变量

### 11.6.1 RALPH_TELEGRAM_BOT_TOKEN

设置 Telegram bot token：

```bash
export RALPH_TELEGRAM_BOT_TOKEN="your-bot-token"
ralph run -p "your prompt"
```

或在配置文件中：

```yaml
RObot:
  telegram:
    bot_token: ${RALPH_TELEGRAM_BOT_TOKEN}
```

### 11.6.2 RALPH_DIAGNOSTICS

启用诊断模式：

```bash
export RALPH_DIAGNOSTICS=1
ralph run -p "your prompt"
```

或在配置文件中：

```yaml
diagnostics:
  enabled: true  # 等同于 RALPH_DIAGNOSTICS=1
```

### 11.6.3 RUST_LOG

设置日志级别：

```bash
export RUST_LOG=debug
ralph run -p "your prompt"

# 特定模块
export RUST_LOG=ralph_core::event_loop=trace
ralph run -p "your prompt"
```

日志级别：`error`, `warn`, `info`, `debug`, `trace`

## 11.7 错误类型

### 11.7.1 ConfigError

```rust
pub enum ConfigError {
    FileNotFound(PathBuf),
    ParseError(String),
    ValidationError(String),
}
```

### 11.7.2 MemoryError

```rust
pub enum MemoryError {
    FileNotFound(PathBuf),
    ParseError(String),
    WriteError(io::Error),
}
```

### 11.7.3 TaskError

```rust
pub enum TaskError {
    NotFound(TaskId),
    ParseError(String),
    WriteError(io::Error),
}
```

### 11.7.4 TelegramError

```rust
pub enum TelegramError {
    NoChatId,
    SendFailed(String),
    MaxRetriesExceeded,
}
```

## 11.8 类型定义

### 11.8.1 TaskId

```rust
/// 任务 ID 类型
pub type TaskId = String;

/// 格式: task-{timestamp}-{4hex}
/// 示例: task-1737372000-a1b2
```

### 11.8.2 TaskStatus

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Open,       // 待处理
    InProgress, // 进行中
    Blocked,    // 被阻塞
    Closed,     // 已完成
}
```

### 11.8.3 MemoryType

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MemoryType {
    Pattern,   // 代码模式
    Decision,  // 决策
    Fix,       // 修复
    Context,   // 上下文
}
```

### 11.8.4 TerminationReason

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminationReason {
    CompletionPromise,   // 完成承诺
    MaxIterations,       // 最大迭代次数
    MaxRuntime,          // 最大运行时间
    MaxCost,             // 最大成本
    ConsecutiveFailures, // 连续失败
    LoopThrashing,       // 循环抖动
    ValidationFailure,   // 验证失败
    Stopped,             // 手动停止
    Interrupted,         // 信号中断
    RestartRequested,    // 重启请求
}
```

## 11.9 小结

本章提供了 Ralph 的详细 API 参考：

1. **核心 API** - RalphConfig、EventLoop、MemoryStore、TaskStore 等核心结构和方法。

2. **配置选项** - 完整的配置结构、字段说明和默认值。

3. **事件类型** - 核心事件、任务事件、人机交互事件的定义。

4. **工具函数** - 文本处理、Git 操作、文件操作等辅助函数。

5. **CLI 命令** - ralph run、init、plan、tools 等命令的详细用法。

6. **环境变量** - RALPH_TELEGRAM_BOT_TOKEN、RALPH_DIAGNOSTICS、RUST_LOG 等。

7. **错误类型** - ConfigError、MemoryError、TaskError、TelegramError 等。

8. **类型定义** - TaskId、TaskStatus、MemoryType、TerminationReason 等类型。

这些 API 详细信息帮助开发者深入理解和使用 Ralph 的各种功能。

---

**上一章**：[第10章：开发指南](10-dev-guide.md) | **下一章**：[第12章：附录](12-appendix.md)
