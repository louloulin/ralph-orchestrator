# 第7章：ralph-tui 详解

## 7.1 TUI 架构

`ralph-tui` 是 Ralph Orchestrator 的终端用户界面（TUI），基于 `ratatui` 和 `crossterm` 构建。它提供了一个只读观察仪表板，用于监控 AI 编排循环的执行。

### 7.1.1 设计目标

1. **只读观察** - TUI 是观察仪表板，不干预执行流程
2. **实时显示** - 实时显示代理消息和状态
3. **键盘导航** - 支持键盘快捷键和搜索
4. **状态同步** - 通过事件总线与主循环同步状态

### 7.1.2 目录结构

```
crates/ralph-tui/src/
├── lib.rs               # 库入口，Tui 主结构
├── app.rs               # 应用程序主循环
├── state.rs             # TUI 状态管理
├── input.rs             # 输入处理
└── widgets/             # UI 组件
    ├── mod.rs           # 组件导出
    ├── header.rs        # 头部组件
    ├── footer.rs        # 底部组件
    ├── content.rs       # 内容组件
    └── help.rs          # 帮助组件
```

### 7.1.3 技术栈

| 技术 | 用途 |
|------|------|
| **ratatui** | TUI 框架，用于构建终端界面 |
| **crossterm** | 跨平台终端操作库 |
| **tokio** | 异步运行时 |
| **anyhow** | 错误处理 |

## 7.2 状态管理

### 7.2.1 TuiState

```rust
/// TUI state container.
pub struct TuiState {
    /// Current loop iteration.
    pub iteration: usize,

    /// Hat name (if active).
    pub hat: Option<String>,

    /// Hat description (if active).
    pub hat_description: Option<String>,

    /// Recent agent messages (circular buffer).
    pub messages: VecDeque<String>,

    /// Maximum messages to keep.
    pub max_messages: usize,

    /// Current search query.
    pub search_query: Option<String>,

    /// Search results.
    pub search_results: Vec<usize>,

    /// Current search result index.
    pub search_index: usize,

    /// Whether help is visible.
    pub help_visible: bool,

    /// Path to events.jsonl for guidance writes.
    pub events_path: Option<PathBuf>,

    /// Guidance next-queue for guidance writing.
    pub guidance_next_queue: Arc<Mutex<Vec<String>>>,

    /// Map from topic to (hat_id, hat_name) for dynamic resolution.
    pub hat_map: HashMap<String, (HatId, String)>,

    /// Scroll offset for messages.
    pub scroll_offset: usize,

    /// Focus mode.
    pub focus: Focus,
}

/// Focus mode for keyboard navigation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Focus {
    /// Messages view.
    Messages,

    /// Search input.
    Search,
}
```

### 7.2.2 状态更新

```rust
impl TuiState {
    /// Create new TUI state.
    pub fn new() -> Self {
        TuiState {
            iteration: 0,
            hat: None,
            hat_description: None,
            messages: VecDeque::with_capacity(100),
            max_messages: 100,
            search_query: None,
            search_results: Vec::new(),
            search_index: 0,
            help_visible: false,
            events_path: None,
            guidance_next_queue: Arc::new(Mutex::new(Vec::new())),
            hat_map: HashMap::new(),
            scroll_offset: 0,
            focus: Focus::Messages,
        }
    }

    /// Create with hat map for dynamic resolution.
    pub fn with_hat_map(hat_map: HashMap<String, (HatId, String)>) -> Self {
        let mut state = Self::new();
        state.hat_map = hat_map;
        state
    }

    /// Update state from event.
    pub fn update(&mut self, event: &Event) {
        match event {
            Event::LoopStart(data) => {
                self.iteration = data.iteration;
                self.add_message(format!("Loop started: iteration {}", data.iteration));
            }
            Event::HatStart(data) => {
                self.hat = Some(data.hat_name.clone());
                self.hat_description = Some(data.hat_description.clone());
                self.add_message(format!("Hat started: {}", data.hat_name));
            }
            Event::HatMessage(data) => {
                self.add_message(data.content.clone());
            }
            Event::LoopComplete(data) => {
                self.add_message(format!("Loop complete: {}", data.reason));
            }
            _ => {}
        }
    }

    /// Add a message to the buffer.
    fn add_message(&mut self, message: String) {
        if self.messages.len() >= self.max_messages {
            self.messages.pop_front();
        }
        self.messages.push_back(message);
    }

    /// Scroll up.
    pub fn scroll_up(&mut self) {
        if self.scroll_offset > 0 {
            self.scroll_offset -= 1;
        }
    }

    /// Scroll down.
    pub fn scroll_down(&mut self) {
        let max_offset = self.messages.len().saturating_sub(1);
        if self.scroll_offset < max_offset {
            self.scroll_offset += 1;
        }
    }
}
```

## 7.3 组件系统

### 7.3.1 Header 组件

```rust
/// Header widget showing loop status.
pub fn header(state: &TuiState) -> impl Widget {
    let hat_text = state.hat.as_ref().map(|h| h.as_str()).unwrap_or("None");
    let hat_desc = state.hat_description.as_deref().unwrap_or("");

    Row::new()
        .spacers(Spacer::DEFAULT)
        .children([
            // Iteration counter
            Cell::from(Span::styled(
                format!("Iter: {}", state.iteration),
                Style::default().fg(Color::Cyan),
            ))
            .style(Style::default().bg(Color::DarkGray)),

            // Hat name
            Cell::from(Span::styled(
                format!("Hat: {}", hat_text),
                Style::default().fg(Color::Yellow),
            ))
            .style(Style::default().bg(Color::DarkGray)),

            // Hat description
            Cell::from(Span::styled(
                hat_desc,
                Style::default().fg(Color::Gray),
            ))
            .style(Style::default().bg(Color::DarkGray)),
        ])
        .style(Style::default().bg(Color::DarkGray))
        .width(Length::Fill)
}
```

### 7.3.2 Footer 组件

```rust
/// Footer widget showing keybindings and status.
pub fn footer(state: &TuiState) -> impl Widget {
    let help_text = if state.help_visible {
        "[ESC] Close help"
    } else {
        "[?] Help [q] Quit [/] Search [n] Next result [N] Prev result"
    };

    let search_text = if let Some(query) = &state.search_query {
        if !state.search_results.is_empty() {
            format!(
                "Search: \"{}\" ({}/{})",
                query,
                state.search_index + 1,
                state.search_results.len()
            )
        } else {
            format!("Search: \"{}\" (no results)", query)
        }
    } else {
        String::new()
    };

    Row::new()
        .spacers(Spacer::DEFAULT)
        .children([
            // Help text
            Cell::from(help_text)
                .style(Style::default().bg(Color::DarkGray)),

            // Search indicator
            Cell::from(search_text)
                .style(Style::default().bg(Color::DarkGray).fg(Color::Yellow)),
        ])
        .style(Style::default().bg(Color::DarkGray))
}
```

### 7.3.3 Content 组件

```rust
/// Content widget showing messages.
pub fn content(state: &TuiState) -> impl Widget {
    let messages: Vec<Line> = state
        .messages
        .iter()
        .rev()
        .skip(state.scroll_offset)
        .map(|msg| {
            Line::from(vec![
                Span::styled("> ", Style::default().fg(Color::DarkGray)),
                Span::raw(msg.clone()),
            ])
        })
        .collect();

    Paragraph::new(messages)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title("Agent Output")
        )
        .wrap(Wrap { trim: true })
        .scroll((0, 0))
}
```

### 7.3.4 Help 组件

```rust
/// Help widget showing keybindings.
pub fn help() -> impl Widget {
    let text = vec![
        Line::from("Keybindings:"),
        Line::from(""),
        Line::from("  q / Ctrl+C  - Quit"),
        Line::from("  ?          - Toggle this help"),
        Line::from("  /          - Search"),
        Line::from("  n          - Next search result"),
        Line::from("  N          - Previous search result"),
        Line::from("  ↑ / k      - Scroll up"),
        Line::from("  ↓ / j      - Scroll down"),
        Line::from("  g          - Go to top"),
        Line::from("  G          - Go to bottom"),
        Line::from(""),
        Line::from("Press any key to close"),
    ];

    Paragraph::new(text)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_type(BorderType::Rounded)
                .title("Help")
        )
        .wrap(Wrap { trim: true })
}
```

## 7.4 事件处理

### 7.4.1 输入处理

```rust
/// Handle a key event.
pub fn handle_key(state: &mut TuiState, key: KeyEvent) -> Result<Action> {
    // If help is visible, any key closes it
    if state.help_visible {
        state.help_visible = false;
        return Ok(Action::Redraw);
    }

    match key.code {
        KeyCode::Char('q') | KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            Ok(Action::Quit)
        }
        KeyCode::Char('?') => {
            state.help_visible = true;
            Ok(Action::Redraw)
        }
        KeyCode::Char('/') => {
            state.focus = Focus::Search;
            state.search_query = Some(String::new());
            Ok(Action::EnterSearchMode)
        }
        KeyCode::Char('n') => {
            if !state.search_results.is_empty() {
                state.search_index = (state.search_index + 1) % state.search_results.len();
                let msg_idx = state.search_results[state.search_index];
                state.scroll_offset = state.messages.len().saturating_sub(msg_idx + 1);
            }
            Ok(Action::Redraw)
        }
        KeyCode::Char('N') => {
            if !state.search_results.is_empty() {
                state.search_index = if state.search_index == 0 {
                    state.search_results.len() - 1
                } else {
                    state.search_index - 1
                };
                let msg_idx = state.search_results[state.search_index];
                state.scroll_offset = state.messages.len().saturating_sub(msg_idx + 1);
            }
            Ok(Action::Redraw)
        }
        KeyCode::Up | KeyCode::Char('k') => {
            state.scroll_up();
            Ok(Action::Redraw)
        }
        KeyCode::Down | KeyCode::Char('j') => {
            state.scroll_down();
            Ok(Action::Redraw)
        }
        KeyCode::Char('g') => {
            state.scroll_offset = 0;
            Ok(Action::Redraw)
        }
        KeyCode::Char('G') => {
            state.scroll_offset = state.messages.len().saturating_sub(1);
            Ok(Action::Redraw)
        }
        KeyCode::Esc => {
            if state.focus == Focus::Search {
                state.focus = Focus::Messages;
                state.search_query = None;
                state.search_results.clear();
            }
            Ok(Action::Redraw)
        }
        KeyCode::Char(c) if state.focus == Focus::Search => {
            if let Some(ref mut query) = state.search_query {
                query.push(c);
                perform_search(state);
            }
            Ok(Action::Redraw)
        }
        KeyCode::Backspace if state.focus == Focus::Search => {
            if let Some(ref mut query) = state.search_query {
                query.pop();
                perform_search(state);
            }
            Ok(Action::Redraw)
        }
        _ => Ok(Action::None),
    }
}

/// Perform search in messages.
fn perform_search(state: &mut TuiState) {
    if let Some(ref query) = state.search_query {
        if query.is_empty() {
            state.search_results.clear();
            return;
        }

        let query_lower = query.to_lowercase();
        state.search_results = state
            .messages
            .iter()
            .enumerate()
            .filter(|(_, msg)| msg.to_lowercase().contains(&query_lower))
            .map(|(idx, _)| idx)
            .collect();

        state.search_index = 0;
    }
}
```

### 7.4.2 Action 类型

```rust
/// Action to take after handling input.
pub enum Action {
    /// No action needed.
    None,

    /// Redraw the UI.
    Redraw,

    /// Quit the TUI.
    Quit,

    /// Enter search mode.
    EnterSearchMode,
}

/// Dispatch an action to update TUI state.
pub fn dispatch_action(state: &mut TuiState, action: Action) {
    match action {
        Action::None => {}
        Action::Redraw => {}
        Action::Quit => {}
        Action::EnterSearchMode => {
            state.focus = Focus::Search;
        }
    }
}
```

## 7.5 应用程序主循环

### 7.5.1 App 结构

```rust
/// TUI application.
pub struct App {
    /// Shared TUI state.
    state: Arc<Mutex<TuiState>>,

    /// Termination signal receiver.
    terminated_rx: watch::Receiver<bool>,

    /// Interrupt sender for Ctrl+C signaling.
    interrupt_tx: Option<watch::Sender<bool>>,
}
```

### 7.5.2 主循环实现

```rust
impl App {
    /// Create a new app.
    pub fn new(
        state: Arc<Mutex<TuiState>>,
        terminated_rx: watch::Receiver<bool>,
        interrupt_tx: Option<watch::Sender<bool>>,
    ) -> Self {
        App {
            state,
            terminated_rx,
            interrupt_tx,
        }
    }

    /// Run the TUI application loop.
    pub async fn run(self) -> Result<()> {
        // Setup terminal
        enable_raw_mode()?;
        let mut stdout = io::stdout();
        execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;

        // Create terminal
        let backend = CrosstermBackend::new(stdout);
        let mut terminal = Terminal::new(backend)?;

        // Main loop
        let result = self.run_loop(&mut terminal).await;

        // Restore terminal
        disable_raw_mode()?;
        execute!(
            terminal.backend_mut(),
            LeaveAlternateScreen,
            DisableMouseCapture
        )?;
        terminal.show_cursor()?;

        result
    }

    /// Inner run loop.
    async fn run_loop(&mut self, terminal: &mut Terminal<impl Backend>) -> Result<()> {
        loop {
            // Check termination signal
            if *self.terminated_rx.borrow() {
                return Ok(());
            }

            // Draw UI
            self.draw(terminal)?;

            // Wait for event (with timeout)
            let timeout = Duration::from_millis(100);
            if let Ok(event) = crossterm::event::poll(timeout) {
                if event {
                    // Handle input event
                    if let Ok(key_event) = crossterm::event::read() {
                        if let Event::Key(key) = key_event {
                            let mut state = self.state.lock().unwrap();
                            let action = handle_key(&mut state, key)?;

                            // Handle Ctrl+C by signaling main loop
                            if matches!(action, Action::Quit) {
                                if let Some(ref tx) = self.interrupt_tx {
                                    let _ = tx.send(true);
                                }
                                return Ok(());
                            }

                            dispatch_action(&mut state, action);
                        }
                    }
                }
            }
        }
    }

    /// Draw the UI.
    fn draw(&self, terminal: &mut Terminal<impl Backend>) -> Result<()> {
        let state = self.state.lock().unwrap();

        terminal.draw(|f| {
            let size = f.size();

            // Layout
            let chunks = Layout::default()
                .direction(Direction::Vertical)
                .margin(0)
                .constraints([
                    Constraint::Length(3),  // Header
                    Constraint::Min(0),     // Content
                    Constraint::Length(2),  // Footer
                ])
                .split(size);

            // Draw header
            f.render_widget(header(&state), chunks[0]);

            // Draw content or help
            if state.help_visible {
                f.render_widget(help(), chunks[1]);
            } else {
                f.render_widget(content(&state), chunks[1]);
            }

            // Draw footer
            f.render_widget(footer(&state), chunks[2]);
        })?;

        Ok(())
    }
}
```

## 7.6 事件总线集成

### 7.6.1 Observer 模式

```rust
impl Tui {
    /// Returns an observer closure that updates TUI state from events.
    pub fn observer(&self) -> impl Fn(&Event) + Send + 'static {
        let state = Arc::clone(&self.state);
        move |event: &Event| {
            if let Ok(mut s) = state.lock() {
                s.update(event);
            }
        }
    }
}
```

### 7.6.2 与主循环集成

```rust
// In the main loop runner
let tui = Tui::new()
    .with_termination_signal(terminated_rx)
    .with_interrupt_tx(interrupt_tx)
    .with_events_path(events_path)
    .with_hat_map(hat_map);

// Subscribe the TUI observer to the event bus
event_bus.subscribe(Box::new(tui.observer()));

// Run TUI in background
tokio::spawn(async move {
    tui.run().await
});
```

## 7.7 小结

本章详细探讨了 `ralph-tui` crate 的实现：

1. **TUI 架构** - 基于 ratatui 和 crossterm 构建的只读观察仪表板，用于监控 AI 编排循环。

2. **状态管理** - TuiState 管理迭代次数、帽子状态、消息缓冲、搜索状态等。

3. **组件系统** - 包括 Header（循环状态）、Footer（快捷键）、Content（消息显示）、Help（帮助）等组件。

4. **事件处理** - 支持键盘快捷键（q 退出、? 帮助、/ 搜索、n/N 导航、滚动等）。

5. **应用程序主循环** - 使用 ratatui 终端后端，监听键盘事件和终止信号。

6. **事件总线集成** - 通过 Observer 模式订阅事件总线，实时更新 TUI 状态。

ralph-tui 提供了一个直观的终端界面，让用户可以实时监控 Ralph 编排循环的执行状态。

---

**上一章**：[第6章：ralph-adapters 详解](06-ralph-adapters.md) | **下一章**：[第8章：ralph-telegram 详解](08-ralph-telegram.md)
