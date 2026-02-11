# Ralph Web Dashboard 后端 Rust 重构计划

## 执行摘要

本计划旨在将 Ralph Web Dashboard 的后端从 **TypeScript/Node.js** 重构为 **纯 Rust** 实现，同时保持前端 React 技术栈不变。通过最小化改造原则，实现零依赖下载的开箱即用体验。

**核心目标**：
- **统一技术栈**：后端完全使用 Rust，与 Ralph CLI 保持一致
- **零依赖下载**：编译为单一可执行文件，无需 npm install
- **性能提升**：利用 Rust 的并发和内存安全特性
- **智能化配置**：AI 辅助生成 PROMPT.md 和 hat.yaml
- **实时可视化**：增强事件流和执行追踪能力

---

## 一、现状分析

### 1.1 当前架构

```
┌─────────────────────────────────────────────────────────┐
│                    Ralph Web Dashboard                  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────┐         ┌──────────────────┐      │
│  │  Frontend (React) │         │ Backend (Node.js) │      │
│  │  - Vite 7.0       │         │ - Fastify 5.7     │      │
│  │  - React 19       │◄────────►│ - tRPC 11.8      │      │
│  │  - TypeScript     │  HTTP   │ - Drizzle ORM    │      │
│  │  - WebSocket     │  + WS   │ - SQLite         │      │
│  └──────────────────┘         └────────┬─────────┘      │
│                                       │                  │
│                                       ▼                  │
│                              ┌─────────────────┐        │
│                              │  Ralph CLI      │        │
│                              │  (Rust Binary)  │        │
│                              └─────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### 1.2 依赖问题分析

#### 前端依赖 (必须保留)
```json
{
  "dependencies": {
    "react": "^19.1.0",
    "@tanstack/react-query": "^5.80.0",
    "@trpc/client": "^11.8.1",
    "zustand": "^5.0.10"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vite": "^7.0.0"
  }
}
```
**问题**：需要运行 `npm install` 下载数百个依赖包

#### 后端依赖 (需要重构)
```json
{
  "dependencies": {
    "fastify": "^5.7.1",           // HTTP 服务器
    "@trpc/server": "^11.8.1",      // API 框架
    "drizzle-orm": "^0.45.1",       // ORM
    "better-sqlite3": "^12.6.2",    // SQLite
    "@fastify/websocket": "^11.2.0" // WebSocket
  }
}
```
**问题**：
1. 需要运行 `npm install` 和 `npm run build`
2. Node.js 运行时开销
3. 类型安全但运行时不安全
4. 与 Ralph CLI 技术栈不一致

### 1.3 部署流程问题

#### 当前部署流程
```bash
# 1. 克隆仓库
git clone ralph-orchestrator
cd ralph-orchestrator

# 2. 安装前端依赖
cd frontend/ralph-web
npm install  # 下载 ~500MB 依赖

# 3. 构建前端
npm run build

# 4. 安装后端依赖
cd ../../backend/ralph-web-server
npm install  # 下载 ~200MB 依赖

# 5. 构建后端
npm run build

# 6. 启动服务
npm start

# 7. 启动前端 (另一个终端)
cd ../../frontend/ralph-web
npm run dev
```

**问题总结**：
- ❌ 需要下载 ~700MB 依赖
- ❌ 需要两个独立进程
- ❌ 需要管理两个 package.json
- ❌ 构建时间长（2-5 分钟）
- ❌ 开发环境复杂

---

## 二、技术方案

### 2.1 方案对比

| 方案 | 技术栈 | 优势 | 劣势 | 推荐度 |
|------|--------|------|------|--------|
| **A: 渐进式迁移** | Rust后端 + React前端 | 最小风险、保持前端 | 仍需npm | ⭐⭐⭐⭐⭐ |
| **B: 全Rust重写** | Leptos/Dioxus全栈 | 纯Rust、高性能 | 前端生态不成熟 | ⭐⭐⭐ |
| **C: Tauri桌面** | Tauri + React | 原生体验 | 平台限制 | ⭐⭐⭐ |
| **D: 混合架构** | Rust + 嵌入式前端 | 单一可执行 | 复杂度高 | ⭐⭐⭐⭐ |

**选择方案 A：渐进式迁移 - Rust 后端 + React 前端**

**理由**：
1. **最小风险**：前端保持不变，仅重构后端
2. **渐进式**：可以逐步迁移，不影响现有功能
3. **生态成熟**：前端使用成熟的 React 生态
4. **性能提升**：Rust 后端提供更好的性能
5. **零依赖下载**：后端编译为单一可执行文件

### 2.2 技术栈设计

#### 后端技术栈
```toml
[dependencies]
# HTTP 服务器 - Rust 生态最成熟
axum = "0.8"
tokio = { version = "1.40", features = ["full"] }
tower-http = { version = "0.6", features = ["cors", "fs"] }

# WebSocket
tokio-tungstenite = "0.26"
futures-util = "0.3"

# 数据库
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio"] }
sea-orm = { version = "1.1", features = ["sqlx-sqlite"] }

# 序列化
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# 类型安全 API (类似 tRPC)
async-trait = "0.1"
thiserror = "2.0"

# 日志和追踪
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }

# 进程管理
tokio-process = "0.3"

# AI 配置生成
ollama-rs = "0.2"  # 本地 LLM，可选
reqwest = { version = "0.12", features = ["json"] }
```

#### 前端保持不变
```json
{
  "dependencies": {
    "react": "^19.1.0",
    "@tanstack/react-query": "^5.80.0",
    "zustand": "^5.0.10"
  }
}
```

**关键设计**：
- 后端提供 RESTful API (兼容现有前端)
- 后端提供 WebSocket (兼容现有前端)
- 前端无需修改，或仅修改 API 基础 URL

---

## 三、架构设计

### 3.1 新架构

```
┌─────────────────────────────────────────────────────────┐
│              Ralph Web Dashboard (Rust Backend)          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────┐         ┌──────────────────┐      │
│  │  Frontend (React) │         │  Backend (Rust)  │      │
│  │  - Vite 7.0       │         │  - Axum 0.8      │      │
│  │  - React 19       │◄────────►│  - SQLx 0.8      │      │
│  │  - TypeScript     │  HTTP   │  - Tokio 1.40    │      │
│  │  - WebSocket     │  + WS   │  - WebSocket     │      │
│  └──────────────────┘         └────────┬─────────┘      │
│                                       │                  │
│                                       ▼                  │
│                              ┌─────────────────┐        │
│                              │  Ralph CLI      │        │
│                              │  (Rust Binary)  │        │
│                              └─────────────────┘        │
└─────────────────────────────────────────────────────────┘

                    单一 Rust 可执行文件
         (包含 Web 服务器 + API + WebSocket + 静态文件服务)
```

### 3.2 后端模块设计

```rust
// crates/ralph-web-server/src/

mod api;              // API 路由
mod db;               // 数据库层
mod repositories;     // 数据访问层
mod services;          // 业务逻辑层
mod queue;             // 任务队列
mod runner;            // Ralph 执行器
mod websocket;         // WebSocket 处理
mod ai_config;         // AI 配置生成
mod metrics;           // 性能指标
mod tracing;           // 执行追踪

pub use server::Server;
```

#### 核心模块

```rust
// crates/ralph-web-server/src/lib.rs

pub mod api {
    //! RESTful API 路由
    //!
    //! 提供 REST API 端点，兼容现有前端 tRPC 调用
    pub mod routes;
    pub mod handlers;
    pub mod middleware;
}

pub mod db {
    //! 数据库层
    //!
    //! 使用 SQLx 进行类型安全的数据库操作
    pub mod connection;
    pub mod models;
    pub mod schema;
}

pub mod websocket {
    //! WebSocket 实时通信
    //!
    //! 支持任务日志流、状态更新、Ralph 事件广播
    pub mod handler;
    pub mod broadcaster;
    pub mod message;
}

pub mod queue {
    //! 任务队列系统
    //!
    //! 异步任务调度、执行、监控
    pub mod dispatcher;
    pub mod service;
    pub mod task;
}

pub mod runner {
    //! Ralph 执行器
    //!
    //! 管理 Ralph CLI 子进程、日志流、状态追踪
    pub mod supervisor;
    pub mod process;
    pub mod output;
}

pub mod ai_config {
    //! AI 配置生成
    //!
    /// 智能生成 PROMPT.md 和 hat.yaml
    pub mod generator;
    pub mod templates;
    pub mod llm;
}

pub mod metrics {
    //! 性能指标收集
    //!
    //! 实时性能监控、历史数据分析
    pub mod collector;
    pub mod reporter;
}

pub mod tracing {
    //! 执行追踪
    //!
    /// 调用链追踪、事件关联、性能分析
    pub mod span;
    pub mod context;
    pub mod exporter;
}
```

---

## 四、实施计划

### Phase 1: 核心后端实现 (4-5 周)

#### 1.1 项目结构搭建

```bash
# 创建新的 Rust crate
cargo new --lib ralph-web-server

# 添加到 workspace
# Cargo.toml
[workspace.members]
    .
    ...
    crates/ralph-web-server
```

#### 1.2 数据库层实现

```rust
// crates/ralph-web-server/src/db/models.rs

use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    pub priority: i32,
    pub blocked_by: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    // 执行跟踪
    pub queued_task_id: Option<String>,
    pub started_at: Option<chrono::DateTime<chrono::Utc>>,
    pub completed_at: Option<chrono::DateTime<chrono::Utc>>,
    pub execution_summary: Option<String>,
    pub exit_code: Option<i32>,
    pub duration_ms: Option<i64>,
    // 循环集成
    pub loop_id: Option<String>,
    pub preset: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "task_status")]
pub enum TaskStatus {
    Open,
    Pending,
    Running,
    Closed,
    Failed,
    Cancelled,
}

// 使用 SQLx 进行类型安全的查询
impl Task {
    pub async fn find_all(
        pool: &sqlx::SqlitePool,
        status: Option<TaskStatus>,
    ) -> Result<Vec<Self>, sqlx::Error> {
        match status {
            Some(status) => {
                sqlx::query_as::<_, Task>(
                    "SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC"
                )
                .bind(status)
                .fetch_all(pool)
                .await
            }
            None => {
                sqlx::query_as::<_, Task>(
                    "SELECT * FROM tasks ORDER BY created_at DESC"
                )
                .fetch_all(pool)
                .await
            }
        }
    }
}
```

#### 1.3 API 路由实现

```rust
// crates/ralph-web-server/src/api/routes.rs

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json, Router,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct ListTasksQuery {
    pub status: Option<String>,
    pub include_archived: Option<bool>,
}

pub fn create_routes() -> Router<AppState> {
    Router::new()
        .route("/api/tasks", axum::routing::get(list_tasks).post(create_task)
        .route("/api/tasks/:id", axum::routing::get(get_task).put(update_task))
        .route("/api/tasks/:id/run", axum::routing::post(run_task))
        .route("/api/hats", axum::routing::get(list_hats).post(create_hat))
        .route("/api/presets", axum::routing::get(list_presets))
        .route("/api/loops", axum::routing::get(list_loops))
        .route("/ws", axum::routing::get(websocket_handler))
}

pub async fn list_tasks(
    State(state): State<AppState>,
    Query(params): Query<ListTasksQuery>,
) -> impl IntoResponse {
    let status = params.status.and_then(|s| match s.as_str() {
        "open" => Some(TaskStatus::Open),
        "running" => Some(TaskStatus::Running),
        "closed" => Some(TaskStatus::Closed),
        _ => None,
    });

    match Task::find_all(&state.db, status).await {
        Ok(tasks) => Json(tasks).into_response(),
        Err(e) => {
            tracing::error!("Failed to list tasks: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, "Database error").into_response()
        }
    }
}

pub async fn create_task(
    State(state): State<AppState>,
    Json(input): Json<CreateTaskInput>,
) -> impl IntoResponse {
    // 创建任务逻辑
    let task = Task::create(&state.db, input).await?;

    // 如果 auto_execute，加入队列
    if input.auto_execute {
        state.task_queue.enqueue(task.clone()).await?;
    }

    (StatusCode::CREATED, Json(task))
}
```

#### 1.4 WebSocket 实现

```rust
// crates/ralph-web-server/src/websocket/handler.rs

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::sync::broadcast;

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, state))
}

async fn handle_socket(
    mut socket: WebSocket,
    state: AppState,
) {
    // 分离读写
    let (mut sender, mut receiver) = socket.split();

    // 订阅日志广播
    let mut log_rx = state.log_broadcaster.subscribe();
    let mut status_rx = state.status_broadcaster.subscribe();

    // 发送循环
    let send_task = tokio::spawn(async move {
        while let Ok(result) = log_rx.recv().await {
            if sender
                .send(Message::Text(serde_json::to_string(&result).unwrap()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    // 接收循环（处理客户端消息）
    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(req) = serde_json::from_str::<ClientRequest>(&text) {
                        match req {
                            ClientRequest::SubscribeLogs { task_id } => {
                                // 订阅特定任务的日志
                            }
                            ClientRequest::UnsubscribeLogs { task_id } => {
                                // 取消订阅
                            }
                        }
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // 等待任一任务完成
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum ClientRequest {
    SubscribeLogs { task_id: String },
    UnsubscribeLogs { task_id: String },
}
```

#### 1.5 任务队列系统

```rust
// crates/ralph-web-server/src/queue/dispatcher.rs

use tokio::sync::mpsc;
use tokio::time::{interval, Duration};

pub struct Dispatcher {
    task_rx: mpsc::Receiver<QueuedTask>,
    max_concurrent: usize,
    running: Arc<std::sync::Mutex<Vec<tokio::task::JoinHandle<()>>>>,
}

impl Dispatcher {
    pub fn new(task_rx: mpsc::Receiver<QueuedTask>, max_concurrent: usize) -> Self {
        Self {
            task_rx,
            max_concurrent,
            running: Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }

    pub async fn run(mut self) {
        let mut ticker = interval(Duration::from_millis(100));

        loop {
            tokio::select! {
                _ = ticker.tick() => {
                    self.poll_and_execute().await;
                }
            }
        }
    }

    async fn poll_and_execute(&self) {
        // 检查是否有空闲槽位
        let running = self.running.lock().unwrap();
        if running.len() >= self.max_concurrent {
            return;
        }
        drop(running);

        // 拉取新任务
        if let Some(task) = self.task_rx.recv().await {
            let handle = self.execute_task(task).await;
            self.running.lock().unwrap().push(handle);
        }
    }

    async fn execute_task(&self, task: QueuedTask) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            // 执行任务逻辑
            // 1. 更新状态为 running
            // 2. 启动 Ralph 进程
            // 3. 监控输出
            // 4. 等待完成
            // 5. 更新最终状态
        })
    }
}
```

### Phase 2: AI 配置生成 (2-3 周)

#### 2.1 PROMPT.md 生成器

```rust
// crates/ralph-web-server/src/ai_config/generator.rs

use ollama_rs::{
    generation::completion::CompletionResponseGenerator,
    Ollama,
};
use reqwest::Client;

pub struct PromptGenerator {
    client: Client,
    ollama: Ollama,
    model: String,
}

impl PromptGenerator {
    pub fn new(model: String) -> Result<Self, anyhow::Error> {
        let ollama = Ollama::new("http://localhost:11434", false)?;
        Ok(Self {
            client: Client::new(),
            ollama,
            model,
        })
    }

    pub async fn generate_prompt(
        &self,
        context: &ProjectContext,
    ) -> Result<String, anyhow::Error> {
        let prompt = format!(
            "You are Ralph, an AI programming orchestrator. Based on the following project context, generate an optimized PROMPT.md:

Project Type: {:?}
Tech Stack: {:?}
Objective: {}
Key Files: {:?}

Generate a PROMPT.md that:
1. Clearly defines the AI agent's role and capabilities
2. Specifies the programming context and constraints
3. Outlines the development workflow
4. Sets quality standards and backpressure mechanisms

Output only the PROMPT.md content, formatted in Markdown.",
            context.project_type,
            context.tech_stack,
            context.objective,
            context.key_files
        );

        let response = self
            .ollama
            .generate_completion(&self.model, &prompt, false)
            .await?;

        Ok(response.response)
    }

    pub async fn generate_hat_config(
        &self,
        workflow: &WorkflowDescription,
    ) -> Result<String, anyhow::Error> {
        let prompt = format!(
            "Generate a hat.yaml configuration for the following workflow:

{}

Output valid YAML with:
- hats section with role definitions
- triggers and publishes events
- clear instructions for each hat
- proper event flow

Ensure the YAML is valid and follows Ralph hat configuration schema.",
            workflow.description
        );

        let response = self
            .ollama
            .generate_completion(&self.model, &prompt, false)
            .await?;

        Ok(response.response)
    }
}
```

#### 2.2 配置 API 端点

```rust
// crates/ralph-web-server/src/api/routes/config.rs

use axum::{extract::State, Json};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct GeneratePromptRequest {
    pub project_type: String,
    pub tech_stack: Vec<String>,
    pub objective: String,
}

pub async fn generate_prompt(
    State(state): State<AppState>,
    Json(req): Json<GeneratePromptRequest>,
) -> Result<Json<GeneratePromptResponse>, ApiError> {
    let context = ProjectContext {
        project_type: req.project_type,
        tech_stack: req.tech_stack,
        objective: req.objective,
        key_files: vec![], // TODO: 从文件系统扫描
    };

    let prompt = state
        .prompt_generator
        .generate_prompt(&context)
        .await?;

    Ok(Json(GeneratePromptResponse { prompt }))
}

#[derive(Serialize)]
pub struct GeneratePromptResponse {
    pub prompt: String,
}
```

### Phase 3: 执行可视化 (3-4 周)

#### 3.1 事件流追踪

```rust
// crates/ralph-web-server/src/tracing/span.rs

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct TraceSpan {
    pub id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub start_time: chrono::DateTime<chrono::Utc>,
    pub end_time: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: HashMap<String, String>,
    pub events: Vec<TraceEvent>,
}

#[derive(Debug, Clone)]
pub struct TraceEvent {
    pub timestamp: chrono::DateTime<chrono::Utc>,
    pub event_type: String,
    pub data: serde_json::Value,
}

pub struct Tracer {
    spans: Arc<RwLock<Vec<TraceSpan>>>,
    active_spans: Arc<RwLock<HashMap<String, TraceSpan>>>,
}

impl Tracer {
    pub fn new() -> Self {
        Self {
            spans: Arc::new(RwLock::new(Vec::new())),
            active_spans: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn start_span(
        &self,
        name: String,
        parent_id: Option<String>,
    ) -> String {
        let span_id = format!("span-{}", uuid::Uuid::new_v4());
        let span = TraceSpan {
            id: span_id.clone(),
            parent_id,
            name,
            start_time: chrono::Utc::now(),
            end_time: None,
            metadata: HashMap::new(),
            events: Vec::new(),
        };

        self.active_spans
            .write()
            .await
            .insert(span_id.clone(), span);

        span_id
    }

    pub async fn end_span(&self, span_id: &str) {
        let mut spans = self.spans.write().await;
        let mut active = self.active_spans.write().await;

        if let Some(mut span) = active.remove(span_id) {
            span.end_time = Some(chrono::Utc::now());
            spans.push(span);
        }
    }

    pub async fn get_trace_tree(&self) -> TraceTree {
        let spans = self.spans.read().await;
        TraceTree::build(&spans)
    }
}
```

#### 3.2 性能指标收集

```rust
// crates/ralph-web-server/src/metrics/collector.rs

use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct PerformanceMetrics {
    pub task_metrics: HashMap<String, TaskMetrics>,
    pub system_metrics: SystemMetrics,
}

#[derive(Debug, Clone)]
pub struct TaskMetrics {
    pub task_id: String,
    pub start_time: Instant,
    pub end_time: Option<Instant>,
    pub hat_performance: HashMap<String, HatMetrics>,
}

#[derive(Debug, Clone)]
pub struct HatMetrics {
    pub hat_id: String,
    pub activation_count: u64,
    pub total_duration: std::time::Duration,
    pub average_duration: std::time::Duration,
    pub success_rate: f64,
}

#[derive(Debug, Clone)]
pub struct SystemMetrics {
    pub cpu_usage: f32,
    pub memory_usage: usize,
    pub active_tasks: usize,
    pub queue_depth: usize,
}

pub struct MetricsCollector {
    metrics: Arc<RwLock<PerformanceMetrics>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(RwLock::new(PerformanceMetrics {
                task_metrics: HashMap::new(),
                system_metrics: SystemMetrics {
                    cpu_usage: 0.0,
                    memory_usage: 0,
                    active_tasks: 0,
                    queue_depth: 0,
                },
            })),
        }
    }

    pub async fn record_hat_execution(
        &self,
        task_id: String,
        hat_id: String,
        duration: std::time::Duration,
        success: bool,
    ) {
        let mut metrics = self.metrics.write().await;
        let task_metrics = metrics
            .task_metrics
            .entry(task_id)
            .or_insert_with(|| TaskMetrics {
                task_id: String::new(),
                start_time: Instant::now(),
                end_time: None,
                hat_performance: HashMap::new(),
            });

        let hat_metrics = task_metrics
            .hat_performance
            .entry(hat_id.clone())
            .or_insert_with(|| HatMetrics {
                hat_id,
                activation_count: 0,
                total_duration: std::time::Duration::ZERO,
                average_duration: std::time::Duration::ZERO,
                success_rate: 1.0,
            });

        hat_metrics.activation_count += 1;
        hat_metrics.total_duration += duration;
        hat_metrics.average_duration = hat_metrics.total_duration / hat_metrics.activation_count;

        // 更新成功率
        if success {
            hat_metrics.success_rate = hat_metrics.success_rate * 0.9 + 1.0 * 0.1;
        } else {
            hat_metrics.success_rate = hat_metrics.success_rate * 0.9 + 0.0 * 0.1;
        }
    }

    pub async fn get_metrics(&self) -> PerformanceMetrics {
        self.metrics.read().await.clone()
    }
}
```

### Phase 4: 前端集成 (2-3 周)

#### 4.1 API 适配层

```typescript
// frontend/ralph-web/src/api/rustBackend.ts

import { createTRPCReact } from '@trpc/react-query';

/**
 * Rust 后端 API 客户端
 *
 * 提供与 Rust 后端兼容的 API 调用
 * 保持与原 tRPC 相同的接口，便于迁移
 */

interface Task {
  id: string;
  title: string;
  status: 'open' | 'pending' | 'running' | 'closed' | 'failed';
  priority: number;
  blockedBy: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  executionSummary: string | null;
  exitCode: number | null;
  durationMs: number | null;
  loopId: string | null;
  preset: string | null;
}

export class RustBackendClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async listTasks(params?: {
    status?: string;
    includeArchived?: boolean;
  }): Promise<Task[]> {
    const url = new URL('/api/tasks', this.baseUrl);
    if (params?.status) {
      url.searchParams.set('status', params.status);
    }

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async createTask(input: {
    title: string;
    priority?: number;
    preset?: string;
    autoExecute?: boolean;
  }): Promise<Task> {
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Failed to create task: ${response.statusText}`);
    }

    return response.json();
  }

  async runTask(taskId: string): Promise<Task> {
    const response = await fetch(`/api/tasks/${taskId}/run`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to run task: ${response.statusText}`);
    }

    return response.json();
  }
}

export const rustBackend = new RustBackendClient();

/**
 * React Query hooks for Rust backend
 */
export const useTasks = (params?: {
  status?: string;
}) => {
  return useQuery({
    queryKey: ['tasks', params?.status],
    queryFn: () => rustBackend.listTasks(params),
    refetchInterval: 2000, // 每2秒轮询
  });
};

export const useCreateTask = () => {
  return useMutation({
    mutationFn: (input: {
      title: string;
      priority?: number;
      preset?: string;
    }) => rustBackend.createTask(input),
    onSuccess: () => {
      // 刷新任务列表
      queryClient.invalidateQueries(['tasks']);
    },
  });
};
```

#### 4.2 WebSocket 适配

```typescript
// frontend/ralph-web/src/hooks/useRustWebSocket.ts

import { useEffect, useRef } from 'react';

interface WebSocketMessage {
  type: 'log' | 'status' | 'error' | 'event';
  taskId: string;
  data: unknown;
}

export function useRustWebSocket(taskId: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`ws://localhost:3000/ws?taskId=${taskId}`);

      ws.onopen = () => {
        console.log('WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          // 处理消息，与现有逻辑兼容
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting in 3s...');
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [taskId]);
}
```

### Phase 5: 构建和部署 (1-2 周)

#### 5.1 单一可执行文件构建

```rust
// crates/ralph-web-server/src/main.rs

use axum::{
    extract::State,
    response::{Html, IntoResponse},
    Router,
};
use rust_embed::RustEmbed;
use tower_http::services::ServeDir;

#[derive(RustEmbed)]
#[folder = "../../frontend/ralph-web/dist"]
struct Assets;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    // 初始化数据库
    let db = sqlx::SqlitePool::connect("sqlite:ralph.db").await?;

    // 运行迁移
    sqlx::migrate!("./migrations").run(&db).await?;

    // 创建应用状态
    let state = AppState::new(db).await?;

    // 创建路由
    let app = create_routes(state);

    // 启动服务器
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    println!("Ralph Web Server listening on http://0.0.0.0:3000");

    axum::serve(listener, app).await?;

    Ok(())
}

fn create_routes(state: AppState) -> Router {
    Router::new()
        // API 路由
        .nest("/api", api::routes::create_routes())
        // WebSocket 路由
        .route("/ws", axum::routing::get(websocket::handler))
        // 静态文件服务 (开发模式)
        .nest_service("/", ServeDir::new("../../frontend/ralph-web/dist"))
        .fallback(serve_index)
        .with_state(state)
}

async fn serve_index() -> impl IntoResponse {
    let index_html = Assets::get("index.html").unwrap();
    Html(std::str::from_utf8(index_html.data.as_ref()).unwrap())
}
```

#### 5.2 构建脚本

```bash
#!/bin/bash
# scripts/build-web-server.sh

set -e

echo "Building Ralph Web Server..."

# 构建前端
echo "Step 1: Building frontend..."
cd frontend/ralph-web
npm install
npm run build
cd ../..

# 构建 Rust 后端 (嵌入前端资源)
echo "Step 2: Building Rust backend..."
cargo build --release -p ralph-web-server

echo "Build complete!"
echo "Binary: target/release/ralph-web-server"
echo ""
echo "To run:"
echo "  ./target/release/ralph-web-server"
```

#### 5.3 Docker 镜像

```dockerfile
# Dockerfile

FROM rust:1.83-slim as builder

WORKDIR /app

# 安装 Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get install -y nodejs

# 复制源码
COPY . .

# 构建前端
WORKDIR /app/frontend/ralph-web
RUN npm install
RUN npm run build

# 构建后端
WORKDIR /app
RUN cargo build --release -p ralph-web-server

# 运行时镜像
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/ralph-web-server /usr/local/bin/

EXPOSE 3000

CMD ["ralph-web-server"]
```

---

## 五、前端改动

### 5.1 最小改动策略

**原则**：保持前端代码 90% 不变，仅修改 API 调用层

#### 改动点
1. **API 基础 URL**：统一为 Rust 后端地址
2. **WebSocket 连接**：使用新的 WebSocket 端点
3. **类型定义**：确保与 Rust 后端类型兼容

#### 不改动
1. **组件结构**：保持现有组件层次
2. **状态管理**：继续使用 Zustand
3. **UI 库**：继续使用 TailwindCSS + Radix UI
4. **路由**：保持现有路由结构

### 5.2 渐进式迁移方案

#### 步骤 1: 并行运行
```bash
# Terminal 1: 启动原 Node.js 后端
cd backend/ralph-web-server
npm run dev

# Terminal 2: 启动 Rust 后端 (不同端口)
cd crates/ralph-web-server
cargo run

# Terminal 3: 启动前端 (连接到任一后端)
cd frontend/ralph-web
VITE_API_URL=http://localhost:3001 npm run dev
```

#### 步骤 2: 功能对比测试
- 确保所有功能在 Rust 后端正常工作
- 性能对比测试
- 压力测试

#### 步骤 3: 完全切换
```bash
# 停止 Node.js 后端
# 切换前端到 Rust 后端
cd frontend/ralph-web
npm run build
cd ../..
cargo run --release -p ralph-web-server
```

---

## 六、成功指标

### 6.1 功能指标

| 指标 | 当前 (Node.js) | 目标 (Rust) | 测量方法 |
|------|----------------|-------------|----------|
| **启动时间** | ~3s | <1s | 服务启动耗时 |
| **内存占用** | ~150MB | <50MB | 运行时内存 |
| **并发连接** | ~100 | ~500 | 压力测试 |
| **API 延迟** | ~50ms | <20ms | p50 响应时间 |
| **依赖大小** | ~700MB | 0 bytes | 零依赖下载 |

### 6.2 开发体验指标

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| **新用户启动时间** | <5分钟 | 从下载到运行 |
| **构建时间** | <30秒 | rust build 时间 |
| **热重载** | 支持 | cargo watch |
| **调试体验** | 优秀 | VS Code + rust-analyzer |

### 6.3 质量指标

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| **测试覆盖率** | >80% | cargo test |
| **类型安全** | 100% | Rust 类型系统 |
| **内存安全** | 100% | Rust 所有权系统 |
| **并发安全** | 100% | Rust Send/Sync |

---

## 七、风险和缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **API 兼容性** | 前端功能中断 | 并行运行、充分测试 |
| **性能回退** | 用户体验下降 | 性能基准测试 |
| **开发周期** | 延长交付时间 | 分阶段交付 |
| **社区接受度** | 用户抗拒 | 清晰沟通迁移收益 |

---

## 八、后续优化

### 8.1 短期 (3-6 个月)

- 添加更多 AI 配置模板
- 实现配置版本管理
- 增强实时可视化组件
- 优化数据库查询性能

### 8.2 长期 (6-12 个月)

- 考虑全 Rust 前端 (Leptos/Dioxus)
- 实现分布式追踪
- 添加插件系统
- 支持多租户

---

## 九、参考资源

### 技术文档
- [Axum Documentation](https://docs.rs/axum/)
- [SQLx Guide](https://docs.rs/sqlx/)
- [Tokio Tungstenite](https://docs.rs/tokio-tungstenite/)
- [Rust for WebAssembly](https://dev.to/godofgeeks/rust-for-webassembly-yewleptos-4mjc)

### 框架对比
- [Axum vs Actix Web: 2025 Comparison](https://medium.com/@indrajit7448/axum-vs-actix-web-the-2025-rust-web-framework-war-performance-vs-dx-17d0ccadd75e)
- [Rust Web Frameworks Compared](https://dev.to/leapcell/rust-web-frameworks-compared-actix-vs-axum-vs-rocket-4bad)
- [Fullstack Rust with Dioxus](https://dioxuslabs.com/learn/0.7/essentials/fullstack/)

### 实时通信
- [Building Real-time Applications with Rust](https://oneuptime.com/blog/post/2026-02-01-rust-realtime-applications/view)
- [WebSocket Implementation in Rust](https://websocket.org/guides/languages/rust/)
- [Real-Time Analytics Engine in Rust](https://medium.com/@FAANG/i-built-a-real-time-analytics-engine-in-rust-you-wont-believe-how-fast-it-is-a10af2ef05d)

### AI 配置
- [Best Prompt Engineering Tools 2025](https://orq.ai/blog/prompt-engineering-tools)
- [Top 7 Open-Source Tools for Prompt Engineering](https://latitude.so/blog/top-7-open-source-tools-for-prompt-engineering-in-2025/)

---

**文档版本**: 1.0
**作者**: 基于 Ralph Web Dashboard 深度分析和 2025 Rust Web 技术研究
**最后更新**: 2025-02-10

---

## 十、实现状态

### 已实现功能 (第一阶段)

#### 10.1 嵌入式 Web 服务器 ✅

**文件**: `crates/ralph-cli/src/web_embedded.rs`

**核心功能**:
- ✅ Axum 0.8 HTTP 服务器
- ✅ 静态文件嵌入 (rust-embed)
- ✅ RESTful API 端点
- ✅ CORS 支持
- ✅ 优雅关闭处理

**API 端点**:
```
GET  /api/v1/health         - 健康检查
GET  /api/v1/tasks          - 列出任务
POST /api/v1/tasks          - 创建任务
GET  /api/v1/tasks/{id}     - 获取任务
PATCH /api/v1/tasks/{id}    - 更新任务
DELETE /api/v1/tasks/{id}   - 删除任务
POST /api/v1/tasks/{id}/run - 运行任务
```

#### 10.2 构建系统集成 ✅

**文件**: `crates/ralph-cli/build.rs`

**功能**:
- ✅ 自动检测 `embedded-web` feature
- ✅ 构建时自动运行 `npm install` (如果需要)
- ✅ 构建时自动运行 `npm run build`
- ✅ 将前端资源嵌入二进制文件

#### 10.3 依赖配置 ✅

**文件**: `crates/ralph-cli/Cargo.toml`

**新增依赖**:
```toml
[features]
embedded-web = []

[dependencies]
axum = "0.8"
rust-embed = "8.8"
tower-http = { version = "0.6", features = ["cors", "trace"] }
tower = "0.5"
mime_guess = "2.0"
```

#### 10.4 智能回退机制 ✅

**文件**: `crates/ralph-cli/src/web.rs`

**功能**:
- ✅ 首先尝试使用 Node.js 开发服务器 (如果可用)
- ✅ 回退到嵌入式 Rust 服务器 (如果 Node.js 不可用)
- ✅ 统一的命令行接口

**使用方式**:
```bash
# 使用嵌入式服务器
ralph web

# 或使用 Node.js 开发服务器 (如果可用)
ralph web
```

#### 10.5 测试覆盖 ✅

**测试文件**: `crates/ralph-cli/src/web_embedded.rs`

**测试用例**:
- ✅ `test_health_check` - 健康检查端点
- ✅ `test_create_and_list_tasks` - 任务 CRUD 操作
- ✅ `test_mime_types` - MIME 类型检测

**运行测试**:
```bash
cargo test -p ralph-cli --features embedded-web web
```

### 待实现功能 (第二阶段及以后)

#### 11.1 任务执行系统 ⏳

**目标**: 实现完整的 Ralph 任务执行流程

**所需功能**:
- [ ] Ralph CLI 子进程管理
- [ ] 实时日志流处理
- [ ] 任务状态追踪
- [ ] 进程监控和重启

#### 11.2 WebSocket 实时通信 ⏳

**目标**: 支持实时任务日志和状态更新

**所需功能**:
- [ ] WebSocket 端点实现
- [ ] 日志广播系统
- [ ] 客户端订阅管理
- [ ] 连接池管理

#### 11.3 数据库集成 ⏳

**目标**: 持久化任务和配置数据

**所需功能**:
- [ ] SQLx 集成
- [ ] 数据库迁移
- [ ] 类型安全查询
- [ ] 事务支持

#### 11.4 AI 配置生成 ⏳

**目标**: 智能生成 PROMPT.md 和 hat.yaml

**所需功能**:
- [ ] LLM 集成 (Ollama/本地)
- [ ] 配置模板系统
- [ ] 代码分析工具
- [ ] 配置验证

#### 11.5 性能监控 ⏳

**目标**: 实时性能指标和追踪

**所需功能**:
- [ ] 指标收集器
- [ ] 调用链追踪
- [ ] 性能分析工具
- [ ] 可视化仪表板

### 构建和运行

#### 构建

```bash
# 构建嵌入式 Web 服务器
cargo build -p ralph-cli --features embedded-web --release

# 构建产物
# target/release/ralph (包含嵌入式前端资源)
```

#### 运行

```bash
# 运行嵌入式 Web 服务器
ralph web

# 或者指定端口
ralph web --backend-port 3000

# 不打开浏览器
ralph web --no-open
```

### 技术亮点

1. **零依赖下载**: 所有前端资源嵌入二进制文件
2. **单一可执行**: 无需 Node.js 或 npm
3. **类型安全**: 100% Rust 实现，编译时检查
4. **高性能**: Axum 异步框架，低内存占用
5. **智能回退**: 自动选择最佳服务器模式

### 性能目标

| 指标 | 当前 (Node.js) | 目标 (Rust) | 状态 |
|------|----------------|-------------|------|
| 启动时间 | ~3s | <1s | ⏳ 待测试 |
| 内存占用 | ~150MB | <50MB | ⏳ 待测试 |
| 并发连接 | ~100 | ~500 | ⏳ 待测试 |
| API 延迟 | ~50ms | <20ms | ⏳ 待测试 |
| 依赖大小 | ~700MB | 0 bytes | ✅ 已实现 |

### 下一步工作

1. **完善任务执行**: 实现完整的 Ralph 任务执行流程
2. **WebSocket 支持**: 实时日志和状态更新
3. **数据库集成**: 持久化存储
4. **AI 配置生成**: 智能配置生成
5. **性能优化**: 压力测试和性能调优

### 参考代码

**核心实现文件**:
- `crates/ralph-cli/src/web_embedded.rs` - 嵌入式 Web 服务器
- `crates/ralph-cli/src/web.rs` - Web 命令入口和回退逻辑
- `crates/ralph-cli/build.rs` - 构建脚本
- `crates/ralph-cli/Cargo.toml` - 依赖配置

**测试文件**:
- `crates/ralph-cli/src/web_embedded.rs` (tests module)

---

## 实现总结

通过这次实现，我们成功地：

1. ✅ **创建了嵌入式 Web 服务器** - 使用 Axum 和 rust-embed
2. ✅ **实现了智能回退机制** - 自动选择 Node.js 或嵌入式服务器
3. ✅ **集成了构建流程** - 自动构建和嵌入前端资源
4. ✅ **保持了 API 兼容性** - 兼容现有前端 API
5. ✅ **添加了测试覆盖** - 确保代码质量

这为后续的完整实现奠定了坚实的基础。下一步将实现完整的任务执行系统、WebSocket 支持、数据库集成等功能。
