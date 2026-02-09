# 第8章：ralph-telegram 详解

## 8.1 机器人架构

`ralph-telegram` 是 Ralph Orchestrator 的 Telegram 机器人集成，用于实现人机交互（Human-in-the-Loop）功能。

### 8.1.1 设计目标

1. **双向通信** - AI 智能体可以向人类提问，人类也可以主动发送指导
2. **状态持久化** - 保存聊天 ID、待处理问题、回复路由等
3. **重试机制** - 发送失败时自动重试（指数退避）
4. **并行循环支持** - 支持多个并行循环的消息路由

### 8.1.2 目录结构

```
crates/ralph-telegram/src/
├── lib.rs               # 库入口，导出公共 API
├── bot.rs               # Telegram Bot API 封装
├── commands.rs          # 机器人命令处理
├── daemon.rs            # 机器人守护进程
├── error.rs             # 错误类型定义
├── handler.rs           # 消息处理器
├── loop_lock.rs         # 循环锁
├── service.rs           # 机器人服务
└── state.rs             # 状态管理
```

### 8.1.3 技术栈

| 技术 | 用途 |
|------|------|
| **teloxide** | Telegram Bot API 框架 |
| **tokio** | 异步运行时 |
| **async-trait** | 异步 trait 支持 |
| **serde** | 序列化/反序列化 |

## 8.2 事件类型

### 8.2.1 人机交互事件

```rust
/// Agent asks human a question.
pub struct HumanInteract {
    /// Question to ask.
    pub question: String,

    /// Timeout in seconds (optional).
    pub timeout: Option<u64>,
}

/// Human responds to a question.
pub struct HumanResponse {
    /// Response text.
    pub response: String,

    /// Original question message ID.
    pub question_message_id: i32,
}

/// Human sends proactive guidance.
pub struct HumanGuidance {
    /// Guidance text.
    pub guidance: String,
}
```

### 8.2.2 事件流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AI Agent    │────▶│ Ralph Event │────▶│ Telegram Bot │
│ (asks Q)    │     │   Bus       │     │   (sends)   │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   Human     │
                                        │  (Telegram) │
                                        └──────┬──────┘
                                               │
                                               ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ AI Agent    │◀────│ Ralph Event │◀────│ Telegram Bot │
│ (receives)  │     │   Bus       │     │  (receives) │
└─────────────┘     └─────────────┘     └─────────────┘
```

## 8.3 Bot API 封装

### 8.3.1 BotApi trait

```rust
/// Trait abstracting Telegram bot operations for testability.
#[async_trait]
pub trait BotApi: Send + Sync {
    /// Send a text message to the given chat.
    ///
    /// Returns the Telegram message ID of the sent message.
    async fn send_message(&self, chat_id: i64, text: &str) -> TelegramResult<i32>;

    /// Send a document (file) to the given chat with an optional caption.
    ///
    /// Returns the Telegram message ID of the sent message.
    async fn send_document(
        &self,
        chat_id: i64,
        file_path: &Path,
        caption: Option<&str>,
    ) -> TelegramResult<i32>;

    /// Send a photo to the given chat with an optional caption.
    ///
    /// Returns the Telegram message ID of the sent message.
    async fn send_photo(
        &self,
        chat_id: i64,
        file_path: &Path,
        caption: Option<&str>,
    ) -> TelegramResult<i32>;
}
```

### 8.3.2 TelegramBot

```rust
/// Wraps a `teloxide::Bot` and provides formatted messaging for Ralph.
pub struct TelegramBot {
    bot: teloxide::Bot,
}

impl TelegramBot {
    /// Create a new TelegramBot from a bot token.
    pub fn new(token: &str) -> Self {
        if cfg!(test) {
            let client = teloxide::net::default_reqwest_settings()
                .no_proxy()
                .build()
                .expect("Client creation failed");
            Self {
                bot: teloxide::Bot::with_client(token, client),
            }
        } else {
            Self {
                bot: teloxide::Bot::new(token),
            }
        }
    }

    /// Format an outgoing question message using Telegram HTML.
    pub fn format_question(hat: &str, iteration: u32, loop_id: &str, question: &str) -> String {
        let escaped_hat = escape_html(hat);
        let escaped_loop = escape_html(loop_id);
        let formatted_question = markdown_to_telegram_html(question);
        format!(
            "❓ <b>{escaped_hat}</b> (iteration {iteration}, loop <code>{escaped_loop}</code>)\n\n{formatted_question}",
        )
    }

    /// Format a greeting message sent when the bot starts.
    pub fn format_greeting(loop_id: &str) -> String {
        let escaped = escape_html(loop_id);
        format!("🤖 Ralph bot online — monitoring loop <code>{escaped}</code>")
    }

    /// Format a farewell message sent when the bot shuts down.
    pub fn format_farewell(loop_id: &str) -> String {
        let escaped = escape_html(loop_id);
        format!("👋 Ralph bot shutting down — loop <code>{escaped}</code> complete")
    }
}

/// Escape special HTML characters for Telegram's HTML parse mode.
pub fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Convert Ralph-generated markdown to Telegram HTML.
///
/// Handles:
/// - `**bold**` → `<b>bold</b>`
/// - `*italic*` → `<i>italic</i>`
/// - `` `code` `` → `<code>code</code>`
/// - `> quote` → `<blockquote>quote</blockquote>`
pub fn markdown_to_telegram_html(markdown: &str) -> String {
    // Implementation details...
}
```

## 8.4 状态管理

### 8.4.1 TelegramState

```rust
/// Persistent state for Telegram integration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelegramState {
    /// Chat ID for this loop.
    pub chat_id: Option<i64>,

    /// Pending question (if any).
    pub pending_question: Option<PendingQuestion>,

    /// Whether this is the primary loop.
    pub is_primary: bool,
}

/// A pending question waiting for response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingQuestion {
    /// Question message ID.
    pub message_id: i32,

    /// Hat that asked the question.
    pub hat: String,

    /// Iteration number.
    pub iteration: u32,

    /// Loop ID.
    pub loop_id: String,

    /// Question text.
    pub question: String,

    /// Timeout timestamp (optional).
    pub timeout_at: Option<DateTime<Utc>>,
}
```

### 8.4.2 StateManager

```rust
/// Manages persistent Telegram state.
pub struct StateManager {
    /// State file path.
    state_path: PathBuf,

    /// In-memory state cache.
    state: TelegramState,
}

impl StateManager {
    /// Load state from file.
    pub fn load(state_path: PathBuf) -> Result<Self, TelegramError> {
        let state = if state_path.exists() {
            let content = fs::read_to_string(&state_path)?;
            serde_json::from_str(&content)?
        } else {
            TelegramState::default()
        };

        Ok(StateManager {
            state_path,
            state,
        })
    }

    /// Save state to file.
    pub fn save(&self) -> Result<(), TelegramError> {
        let content = serde_json::to_string_pretty(&self.state)?;
        fs::write(&self.state_path, content)?;
        Ok(())
    }

    /// Get chat ID.
    pub fn chat_id(&self) -> Option<i64> {
        self.state.chat_id
    }

    /// Set chat ID.
    pub fn set_chat_id(&mut self, chat_id: i64) {
        self.state.chat_id = Some(chat_id);
    }

    /// Get pending question.
    pub fn pending_question(&self) -> Option<&PendingQuestion> {
        self.state.pending_question.as_ref()
    }

    /// Set pending question.
    pub fn set_pending_question(&mut self, question: PendingQuestion) {
        self.state.pending_question = Some(question);
    }

    /// Clear pending question.
    pub fn clear_pending_question(&mut self) {
        self.state.pending_question = None;
    }

    /// Check if pending question has timed out.
    pub fn is_question_timed_out(&self) -> bool {
        if let Some(ref q) = self.state.pending_question {
            if let Some(timeout_at) = q.timeout_at {
                return Utc::now() > timeout_at;
            }
        }
        false
    }
}
```

## 8.5 消息处理

### 8.5.1 MessageHandler

```rust
/// Processes incoming Telegram messages and writes events to JSONL.
pub struct MessageHandler {
    /// State manager.
    state_manager: Arc<Mutex<StateManager>>,

    /// Events file path.
    events_path: PathBuf,

    /// Loop ID.
    loop_id: String,
}

impl MessageHandler {
    /// Create a new message handler.
    pub fn new(
        state_manager: Arc<Mutex<StateManager>>,
        events_path: PathBuf,
        loop_id: String,
    ) -> Self {
        Self {
            state_manager,
            events_path,
            loop_id,
        }
    }

    /// Handle an incoming message.
    pub async fn handle_message(&self, message: &Message) -> Result<(), TelegramError> {
        // Get chat ID
        let chat_id = message.chat.id;

        // Save chat ID if not set
        {
            let mut state = self.state_manager.lock().unwrap();
            if state.chat_id().is_none() {
                state.set_chat_id(chat_id);
                state.save()?;
            }
        }

        // Process message text
        if let Some(text) = &message.text() {
            // Check if this is a response to a pending question
            if let Some(response) = self.check_response(text).await? {
                self.write_response_event(response).await?;
                return Ok(());
            }

            // Check if this is a command
            if text.starts_with('/') {
                return self.handle_command(text, chat_id).await;
            }

            // Treat as proactive guidance
            self.write_guidance_event(text).await?;
        }

        Ok(())
    }

    /// Check if message is a response to pending question.
    async fn check_response(&self, text: &str) -> Result<Option<HumanResponse>, TelegramError> {
        let state = self.state_manager.lock().unwrap();

        if let Some(ref q) = state.pending_question() {
            Ok(Some(HumanResponse {
                response: text.to_string(),
                question_message_id: q.message_id,
            }))
        } else {
            Ok(None)
        }
    }

    /// Write a human.response event to the events file.
    async fn write_response_event(&self, response: HumanResponse) -> Result<(), TelegramError> {
        let event = serde_json::json!({
            "type": "human.response",
            "response": response.response,
            "question_message_id": response.question_message_id,
            "timestamp": Utc::now().to_rfc3339(),
        });

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.events_path)?;

        writeln!(file, "{}", event)?;

        Ok(())
    }

    /// Write a human.guidance event to the events file.
    async fn write_guidance_event(&self, guidance: &str) -> Result<(), TelegramError> {
        let event = serde_json::json!({
            "type": "human.guidance",
            "guidance": guidance,
            "timestamp": Utc::now().to_rfc3339(),
        });

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.events_path)?;

        writeln!(file, "{}", event)?;

        Ok(())
    }
}
```

### 8.5.2 命令处理

```rust
impl MessageHandler {
    /// Handle a bot command.
    async fn handle_command(&self, command: &str, chat_id: i64) -> Result<(), TelegramError> {
        let parts: Vec<&str> = command.splitn(2, ' ').collect();
        let cmd = parts[0];

        match cmd {
            "/start" => self.handle_start(chat_id).await?,
            "/status" => self.handle_status(chat_id).await?,
            "/restart" => self.handle_restart(chat_id).await?,
            _ => {}
        }

        Ok(())
    }

    /// Handle /start command.
    async fn handle_start(&self, chat_id: i64) -> Result<(), TelegramError> {
        let greeting = format!(
            "👋 Welcome to Ralph bot!\n\n\
             Monitoring loop: <code>{}</code>\n\n\
             Use /status to check loop status.",
            escape_html(&self.loop_id)
        );

        self.send_message(chat_id, &greeting).await?;
        Ok(())
    }

    /// Handle /status command.
    async fn handle_status(&self, chat_id: i64) -> Result<(), TelegramError> {
        let state = self.state_manager.lock().unwrap();

        let status = if let Some(ref q) = state.pending_question() {
            format!(
                "⏳ Waiting for response to question from <b>{}</b>\n\n\
                 Iteration: {}\n\
                 Loop: <code>{}</code>",
                escape_html(&q.hat),
                q.iteration,
                escape_html(&q.loop_id)
            )
        } else {
            format!(
                "✅ Loop running: <code>{}</code>\n\n\
                 No pending questions.",
                escape_html(&self.loop_id)
            )
        };

        self.send_message(chat_id, &status).await?;
        Ok(())
    }

    /// Handle /restart command.
    async fn handle_restart(&self, chat_id: i64) -> Result<(), TelegramError> {
        // Write restart event
        let event = serde_json::json!({
            "type": "loop.restart",
            "timestamp": Utc::now().to_rfc3339(),
        });

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.events_path)?;

        writeln!(file, "{}", event)?;

        let message = "🔄 Restart requested. The loop will restart on next iteration.";
        self.send_message(chat_id, message).await?;

        Ok(())
    }
}
```

## 8.6 机器人服务

### 8.6.1 TelegramService

```rust
/// Manages the Telegram bot lifecycle within the event loop.
pub struct TelegramService {
    /// Bot API.
    bot: Box<dyn BotApi>,

    /// State manager.
    state_manager: Arc<Mutex<StateManager>>,

    /// Message handler.
    handler: Arc<MessageHandler>,

    /// Loop ID.
    loop_id: String,

    /// Whether the service is running.
    running: Arc<AtomicBool>,
}

impl TelegramService {
    /// Create a new Telegram service.
    pub fn new(
        bot: Box<dyn BotApi>,
        state_manager: Arc<Mutex<StateManager>>,
        handler: Arc<MessageHandler>,
        loop_id: String,
    ) -> Self {
        Self {
            bot,
            state_manager,
            handler,
            loop_id,
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Start the Telegram bot.
    pub async fn start(&self) -> Result<(), TelegramError> {
        self.running.store(true, Ordering::SeqCst);

        // Send greeting
        if let Some(chat_id) = self.state_manager.lock().unwrap().chat_id() {
            let greeting = TelegramBot::format_greeting(&self.loop_id);
            self.bot.send_message(chat_id, &greeting).await?;
        }

        Ok(())
    }

    /// Stop the Telegram bot.
    pub async fn stop(&self) -> Result<(), TelegramError> {
        self.running.store(false, Ordering::SeqCst);

        // Send farewell
        if let Some(chat_id) = self.state_manager.lock().unwrap().chat_id() {
            let farewell = TelegramBot::format_farewell(&self.loop_id);
            self.bot.send_message(chat_id, &farewell).await?;
        }

        Ok(())
    }

    /// Send a question to Telegram.
    pub async fn send_question(
        &self,
        hat: &str,
        iteration: u32,
        question: &str,
        timeout: Option<u64>,
    ) -> Result<(), TelegramError> {
        let chat_id = self.state_manager.lock().unwrap()
            .chat_id()
            .ok_or(TelegramError::NoChatId)?;

        // Format question
        let formatted = TelegramBot::format_question(hat, iteration, &self.loop_id, question);

        // Send message with retry
        let message_id = retry_with_backoff(|| {
            self.bot.send_message(chat_id, &formatted)
        }).await?;

        // Store pending question
        let timeout_at = timeout.map(| secs| Utc::now() + chrono::Duration::seconds(secs as i64));
        let pending = PendingQuestion {
            message_id,
            hat: hat.to_string(),
            iteration,
            loop_id: self.loop_id.clone(),
            question: question.to_string(),
            timeout_at,
        };

        self.state_manager.lock().unwrap().set_pending_question(pending);
        self.state_manager.lock().unwrap().save()?;

        Ok(())
    }
}
```

### 8.6.2 重试机制

```rust
/// Maximum number of send retries.
pub const MAX_SEND_RETRIES: usize = 3;

/// Base retry delay in milliseconds.
pub const BASE_RETRY_DELAY: u64 = 1000;

/// Retry with exponential backoff.
pub async fn retry_with_backoff<F, Fut, T>(mut f: F) -> Result<T, TelegramError>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = Result<T, TelegramError>>,
{
    let mut attempts = 0;

    loop {
        match f().await {
            Ok(result) => return Ok(result),
            Err(e) if attempts >= MAX_SEND_RETRIES => {
                return Err(TelegramError::MaxRetriesExceeded);
            }
            Err(e) => {
                attempts += 1;
                let delay = BASE_RETRY_DELAY * 2_u64.pow(attempts as u32 - 1);
                tokio::time::sleep(Duration::from_millis(delay)).await;
            }
        }
    }
}
```

## 8.7 配置

### 8.7.1 ralph.yml 配置

```yaml
# RObot human-in-the-loop configuration
RObot:
  enabled: true
  timeout_seconds: 300
  telegram:
    bot_token: "YOUR_BOT_TOKEN"  # Or set RALPH_TELEGRAM_BOT_TOKEN env var
```

### 8.7.2 环境变量

| 环境变量 | 说明 |
|----------|------|
| `RALPH_TELEGRAM_BOT_TOKEN` | Telegram bot token |

## 8.8 小结

本章详细探讨了 `ralph-telegram` crate 的实现：

1. **机器人架构** - 基于 teloxide 的 Telegram Bot 集成，支持双向人机通信。

2. **事件类型** - `human.interact`（AI 向人类提问）、`human.response`（人类回答）、`human.guidance`（主动指导）。

3. **Bot API 封装** - `BotApi` trait 提供可测试的抽象，`TelegramBot` 实现消息格式化和 HTML 转义。

4. **状态管理** - `StateManager` 持久化聊天 ID、待处理问题、超时时间等状态。

5. **消息处理** - `MessageHandler` 处理传入消息，区分回答、命令、主动指导。

6. **机器人服务** - `TelegramService` 管理机器人生命周期，支持重试机制（指数退避）。

ralph-telegram 通过 Telegram 实现了 Ralph 的人机交互能力，让 AI 智能体可以在执行过程中向人类提问并接收反馈。

---

**上一章**：[第7章：ralph-tui 详解](07-ralph-tui.md) | **下一章**：[第9章：高级主题](09-advanced-topics.md)
