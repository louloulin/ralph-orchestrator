# 第6章：ralph-adapters 详解

## 6.1 适配器模式

`ralph-adapters` 是 Ralph Orchestrator 的后端适配器层，负责与各种 AI CLI 工具（如 Claude、Gemini、Codex 等）进行交互。

### 6.1.1 设计目标

1. **统一接口** - 为所有后端提供一致的执行接口
2. **自动检测** - 自动检测系统可用的后端
3. **流式输出** - 支持实时流式输出
4. **PTY 支持** - 伪终端支持，保留富终端特性（颜色、动画等）
5. **可扩展** - 易于添加新的后端支持

### 6.1.2 目录结构

```
crates/ralph-adapters/src/
├── lib.rs               # 库入口，导出公共 API
├── auto_detect.rs       # 后端自动检测
├── cli_backend.rs       # CLI 后端抽象
├── cli_executor.rs      # CLI 执行器
├── pty_executor.rs      # PTY 执行器
├── pty_handle.rs        # PTY 句柄
├── claude_stream.rs     # Claude 流式解析
├── pi_stream.rs         # Pi 流式解析
└── stream_handler.rs    # 流处理器
```

### 6.1.3 支持的后端

| 后端 | 说明 | 检测命令 |
|------|------|----------|
| **Claude** | Anthropic Claude CLI | `claude --version` |
| **Kiro** | Kiro 代码助手 | `kiro --version` |
| **Gemini** | Google Gemini CLI | `gemini --version` |
| **Codex** | OpenAI Codex | `codex --version` |
| **Pi** | pi-coding-agent | `pi --version` |
| **Amp** | Amp 代码编辑器 | `amp --version` |
| **Copilot** | GitHub Copilot CLI | `copilot --version` |
| **Custom** | 自定义命令 | 用户指定 |

## 6.2 后端检测

### 6.2.1 自动检测机制

```rust
/// Detect available backend in PATH.
pub fn detect_backend() -> Result<String, NoBackendError> {
    let backends = [
        ("claude", "claude"),
        ("kiro", "kiro"),
        ("gemini", "gemini"),
        ("codex", "codex"),
        ("pi", "pi"),
        ("amp", "amp"),
        ("copilot", "copilot"),
    ];

    for (name, command) in backends {
        if is_backend_available(command) {
            return Ok(name.to_string());
        }
    }

    Err(NoBackendError {
        available: find_available_backends(),
    })
}

/// Check if a backend command is available in PATH.
pub fn is_backend_available(backend: &str) -> bool {
    #[cfg(unix)]
    {
        use std::process::Command;

        Command::new(backend)
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    #[cfg(not(unix))]
    {
        // Non-Unix platforms: check using which/where
        false
    }
}

/// Find all available backends.
pub fn find_available_backends() -> Vec<String> {
    let backends = ["claude", "kiro", "gemini", "codex", "pi", "amp", "copilot"];

    backends
        .iter()
        .filter(|&&backend| is_backend_available(backend))
        .map(|&backend| backend.to_string())
        .collect()
}
```

### 6.2.2 默认后端

```rust
/// Default priority order for backend detection.
pub const DEFAULT_PRIORITY: &[&str] = &[
    "claude",
    "kiro",
    "gemini",
    "codex",
    "pi",
    "amp",
    "copilot",
];

/// Detect backend with default priority.
pub fn detect_backend_default() -> Result<String, NoBackendError> {
    for backend in DEFAULT_PRIORITY {
        if is_backend_available(backend) {
            return Ok(backend.to_string());
        }
    }

    Err(NoBackendError {
        available: find_available_backends(),
    })
}
```

## 6.3 CLI 后端抽象

### 6.3.1 CliBackend trait

```rust
/// CLI backend abstraction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliBackend {
    /// Backend name (e.g., "claude", "kiro").
    pub name: String,

    /// Command to invoke (e.g., "claude", "kiro").
    pub command: String,

    /// Arguments to pass to the command.
    pub args: Vec<String>,

    /// Output format to expect.
    pub output_format: OutputFormat,

    /// Prompt mode (inline, file, stdin).
    pub prompt_mode: PromptMode,

    /// Environment variables to set.
    pub env: HashMap<String, String>,
}

/// Output format expected from the backend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum OutputFormat {
    /// Plain text output.
    Text,

    /// Markdown output.
    Markdown,

    /// JSON output.
    Json,

    /// Stream format (SSE-like).
    Stream,
}

/// How to pass the prompt to the backend.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PromptMode {
    /// Inline via command line argument.
    Inline,

    /// Via temporary file.
    File,

    /// Via stdin.
    Stdin,
}

impl CliBackend {
    /// Create a new CLI backend.
    pub fn new(name: &str, command: &str) -> Self {
        CliBackend {
            name: name.to_string(),
            command: command.to_string(),
            args: Vec::new(),
            output_format: OutputFormat::Text,
            prompt_mode: PromptMode::Stdin,
            env: HashMap::new(),
        }
    }

    /// Add an argument to the command.
    pub fn arg(mut self, arg: &str) -> Self {
        self.args.push(arg.to_string());
        self
    }

    /// Set the output format.
    pub fn output_format(mut self, format: OutputFormat) -> Self {
        self.output_format = format;
        self
    }

    /// Set the prompt mode.
    pub fn prompt_mode(mut self, mode: PromptMode) -> Self {
        self.prompt_mode = mode;
        self
    }

    /// Set an environment variable.
    pub fn env(mut self, key: &str, value: &str) -> Self {
        self.env.insert(key.to_string(), value.to_string());
        self
    }

    /// Build the command to execute.
    pub fn build_command(&self, prompt: &str) -> Result<Vec<String>, CustomBackendError> {
        let mut cmd = vec![self.command.clone()];

        // Add configured arguments
        cmd.extend(self.args.clone());

        // Add prompt based on mode
        match self.prompt_mode {
            PromptMode::Inline => {
                cmd.push(prompt.to_string());
            }
            PromptMode::File => {
                // Write prompt to temp file
                let temp_file = write_prompt_to_temp_file(prompt)?;
                cmd.push(temp_file);
            }
            PromptMode::Stdin => {
                // Prompt will be written to stdin
            }
        }

        Ok(cmd)
    }
}
```

## 6.4 CLI 执行器

### 6.4.1 执行结果

```rust
/// Result of executing a CLI command.
#[derive(Debug, Clone)]
pub struct ExecutionResult {
    /// Standard output.
    pub stdout: String,

    /// Standard error.
    pub stderr: String,

    /// Exit status.
    pub status: ExitStatus,

    /// Whether execution timed out.
    pub timed_out: bool,
}
```

### 6.4.2 CliExecutor

```rust
/// Executor for CLI backends.
pub struct CliExecutor {
    /// Backend configuration.
    backend: CliBackend,

    /// Working directory.
    work_dir: PathBuf,

    /// Timeout for execution.
    timeout: Duration,
}

impl CliExecutor {
    /// Create a new CLI executor.
    pub fn new(backend: CliBackend, work_dir: PathBuf) -> Self {
        CliExecutor {
            backend,
            work_dir,
            timeout: Duration::from_secs(300), // 5 minutes default
        }
    }

    /// Set timeout.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// Execute the backend with a prompt.
    pub async fn execute(&self, prompt: &str) -> Result<ExecutionResult, CliError> {
        // Build command
        let cmd = self.backend.build_command(prompt)?;

        // Spawn process
        let mut child = Command::new(&cmd[0])
            .args(&cmd[1..])
            .current_dir(&self.work_dir)
            .envs(&self.backend.env)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .stdin(Stdio::piped())
            .spawn()
            .map_err(|e| CliError::SpawnFailed(e.to_string()))?;

        // Write prompt to stdin if needed
        if self.backend.prompt_mode == PromptMode::Stdin {
            if let Some(mut stdin) = child.stdin.take() {
                tokio::time::timeout(
                    self.timeout,
                    async move {
                        stdin.write_all(prompt.as_bytes()).await?;
                        stdin.shutdown().await?;
                        Ok::<_, io::Error>(())
                    }
                )
                .await
                .map_err(|_| CliError::Timeout)?
                .map_err(|e| CliError::WriteFailed(e.to_string()))?;
            }
        }

        // Wait for completion with timeout
        let output = tokio::time::timeout(self.timeout, child.wait_with_output())
            .await
            .map_err(|_| CliError::Timeout)?
            .map_err(|e| CliError::ExecutionFailed(e.to_string()))?;

        Ok(ExecutionResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            status: output.status,
            timed_out: false,
        })
    }
}
```

## 6.5 PTY 执行器

### 6.5.1 为什么需要 PTY

PTY（伪终端）允许 Ralph 与 CLI 后端交互时保留富终端特性：
- **颜色和格式** - ANSI 转义序列
- **光标控制** - 光标移动、清屏等
- **动画效果** - 加载动画、进度条
- **交互式输入** - 用户可以实时响应 CLI 提示

### 6.5.2 PtyExecutor

```rust
/// PTY-based executor for rich terminal UI backends.
pub struct PtyExecutor {
    /// Command to execute.
    command: String,

    /// Arguments.
    args: Vec<String>,

    /// Working directory.
    work_dir: PathBuf,

    /// PTY configuration.
    config: PtyConfig,
}

/// PTY configuration.
#[derive(Debug, Clone)]
pub struct PtyConfig {
    /// Whether to forward user input to the PTY.
    pub forward_input: bool,

    /// How to handle Ctrl+C.
    pub ctrl_c_action: CtrlCAction,

    /// Size of the PTY.
    pub size: (u16, u16),
}

/// How to handle Ctrl+C.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CtrlCAction {
    /// Forward to the child process.
    Forward,

    /// Terminate the executor.
    Terminate,

    /// Ignore (don't forward).
    Ignore,
}

/// Result of PTY execution.
#[derive(Debug)]
pub struct PtyExecutionResult {
    /// Output from the PTY.
    pub output: String,

    /// Whether the process completed normally.
    pub completed: bool,

    /// Exit status if available.
    pub exit_status: Option<i32>,

    /// Termination type.
    pub termination: TerminationType,
}

/// How the PTY execution terminated.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TerminationType {
    /// Normal exit.
    Normal,

    /// User interrupted (Ctrl+C).
    Interrupted,

    /// Timeout.
    Timeout,

    /// Error.
    Error,
}
```

### 6.5.3 PTY 执行实现

```rust
impl PtyExecutor {
    /// Create a new PTY executor.
    pub fn new(command: String, work_dir: PathBuf) -> Self {
        PtyExecutor {
            command,
            args: Vec::new(),
            work_dir,
            config: PtyConfig {
                forward_input: true,
                ctrl_c_action: CtrlCAction::Forward,
                size: (80, 24),
            },
        }
    }

    /// Set PTY configuration.
    pub fn with_config(mut self, config: PtyConfig) -> Self {
        self.config = config;
        self
    }

    /// Execute the command in a PTY.
    pub async fn execute(&self) -> Result<PtyExecutionResult, PtyError> {
        // Fork a PTY
        let fork = Fork::from_ptmx().map_err(|e| PtyError::PtyFailed(e.to_string()))?;

        // Child process: exec the command
        match fork.is_child() {
            true => {
                // Set up PTY as stdin/stdout/stderr
                // Execute command
                exec::execvp(&self.command, &self.args)?;
                unreachable!();
            }
            false => {
                // Parent process: read from PTY
                let mut reader = fork.ptmx().clone();

                let mut output = String::new();
                let mut buf = [0u8; 4096];

                loop {
                    // Read from PTY
                    let n = reader.read(&mut buf)?;

                    if n == 0 {
                        break;
                    }

                    let chunk = String::from_utf8_lossy(&buf[..n]);
                    output.push_str(&chunk);

                    // Check if child process exited
                    if let Some(status) = fork.try_wait()? {
                        return Ok(PtyExecutionResult {
                            output,
                            completed: status.success(),
                            exit_status: status.code(),
                            termination: TerminationType::Normal,
                        });
                    }
                }
            }
        }
    }
}
```

## 6.6 流式处理

### 6.6.1 Claude 流式解析

```rust
/// Claude stream event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ClaudeStreamEvent {
    /// Message start event.
    MessageStart(MessageStart),

    /// Content block start.
    ContentBlockStart(ContentBlockStart),

    /// Content block delta.
    ContentBlockDelta(ContentBlockDelta),

    /// Content block stop.
    ContentBlockStop,

    /// Message delta.
    MessageDelta(MessageDelta),

    /// Message stop event.
    MessageStop,

    /// Error event.
    Error { error: Error },
}

/// Parser for Claude stream events.
pub struct ClaudeStreamParser {
    buffer: String,
}

impl ClaudeStreamParser {
    /// Create a new parser.
    pub fn new() -> Self {
        ClaudeStreamParser {
            buffer: String::new(),
        }
    }

    /// Parse a chunk of data.
    pub fn parse(&mut self, chunk: &str) -> Result<Vec<ClaudeStreamEvent>, ParseError> {
        self.buffer.push_str(chunk);

        let mut events = Vec::new();

        while let Some(newline_pos) = self.buffer.find('\n') {
            let line = self.buffer.drain(..=newline_pos).collect::<String>();

            // Skip empty lines
            if line.trim().is_empty() {
                continue;
            }

            // Parse SSE format: "data: {...}"
            if let Some(data_start) = line.strip_prefix("data: ") {
                match serde_json::from_str::<ClaudeStreamEvent>(data_start) {
                    Ok(event) => events.push(event),
                    Err(e) => {
                        // Try to parse as error
                        if let Ok(error_event) =
                            serde_json::from_str::<ErrorEvent>(data_start)
                        {
                            events.push(ClaudeStreamEvent::Error {
                                error: error_event.error,
                            });
                        } else {
                            return Err(ParseError::InvalidJson(e.to_string()));
                        }
                    }
                }
            }
        }

        Ok(events)
    }
}
```

### 6.6.2 流处理器

```rust
/// Stream handler for backend output.
pub trait StreamHandler: Send + Sync {
    /// Handle a chunk of output.
    fn handle_chunk(&mut self, chunk: &str);

    /// Handle completion.
    fn handle_complete(&mut self, result: &SessionResult);
}

/// Console stream handler (prints to stdout).
pub struct ConsoleStreamHandler;

impl StreamHandler for ConsoleStreamHandler {
    fn handle_chunk(&mut self, chunk: &str) {
        print!("{}", chunk);
        stdout().flush().ok();
    }

    fn handle_complete(&mut self, result: &SessionResult) {
        println!("\nSession complete: {:?}", result);
    }
}

/// TUI stream handler (for TUI integration).
pub struct TuiStreamHandler {
    tx: tokio::sync::mpsc::UnboundedSender<String>,
}

impl StreamHandler for TuiStreamHandler {
    fn handle_chunk(&mut self, chunk: &str) {
        let _ = self.tx.send(chunk.to_string());
    }

    fn handle_complete(&mut self, result: &SessionResult) {
        let _ = self.tx.send(format!("\nSession complete: {:?}", result));
    }
}

/// Quiet stream handler (suppresses output).
pub struct QuietStreamHandler;

impl StreamHandler for QuietStreamHandler {
    fn handle_chunk(&mut self, _chunk: &str) {
        // Do nothing
    }

    fn handle_complete(&mut self, _result: &SessionResult) {
        // Do nothing
    }
}
```

## 6.7 小结

本章详细探讨了 `ralph-adapters` crate 的实现：

1. **适配器模式** - 为各种 AI CLI 工具提供统一的接口，支持自动检测、流式输出、PTY 支持。

2. **后端检测** - 自动检测系统可用的后端，按优先级选择最佳后端。

3. **CLI 后端抽象** - 定义 `CliBackend` 结构，封装命令、参数、输出格式、提示模式等。

4. **CLI 执行器** - 实现异步命令执行，支持超时、环境变量、stdin 输入等。

5. **PTY 执行器** - 使用伪终端保留富终端特性（颜色、动画、交互式输入）。

6. **流式处理** - 支持 Claude SSE 流式输出，提供多种流处理器（Console、TUI、Quiet）。

ralph-adapters 是 Ralph 与各种 AI 工具交互的关键层，通过抽象和适配器模式实现了后端的可插拔和可扩展性。

---

**上一章**：[第5章：ralph-cli 详解](05-ralph-cli.md) | **下一章**：[第7章：ralph-tui 详解](07-ralph-tui.md)
