// ABOUTME: Embedded web dashboard server for Ralph CLI.
// ABOUTME: Provides a single-binary web experience with frontend assets embedded at compile time.

use anyhow::{Context, Result};
use axum::{
    extract::{Path, Query, State},
    http::{StatusCode, Uri},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::signal;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

/// Embedded frontend assets from the build directory.
/// These are compiled into the binary at build time.
#[derive(RustEmbed)]
#[folder = "../../frontend/ralph-web/dist/"]
struct Assets;

/// Application state for the embedded server.
#[derive(Clone)]
struct AppState {
    workspace_root: PathBuf,
    tasks: Arc<RwLock<Vec<Task>>>,
}

/// Task representation matching the existing schema.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct Task {
    id: String,
    title: String,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default = "default_priority")]
    priority: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    blocked_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    merge_loop_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    closed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    archived_at: Option<String>,
    created_at: String,
    updated_at: String,
}

fn default_status() -> String {
    "open".to_string()
}

fn default_priority() -> i32 {
    2
}

/// Health check response.
#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
    timestamp: String,
}

/// List tasks query parameters.
#[derive(Deserialize)]
struct ListTasksQuery {
    status: Option<String>,
    include_archived: Option<bool>,
}

/// Create task request.
#[derive(Serialize, Deserialize)]
struct CreateTaskRequest {
    id: String,
    title: String,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default = "default_priority")]
    priority: i32,
    #[serde(default)]
    blocked_by: Option<String>,
    #[serde(default = "default_auto_execute")]
    auto_execute: bool,
    #[serde(default)]
    preset: Option<String>,
}

fn default_auto_execute() -> bool {
    true
}

/// Update task request.
#[derive(Deserialize)]
struct UpdateTaskRequest {
    title: Option<String>,
    status: Option<String>,
    priority: Option<i32>,
    blocked_by: Option<String>,
}

/// Error response.
#[derive(Serialize)]
struct ErrorResponse {
    error: String,
    message: String,
}

/// Serve embedded static files with proper MIME types.
async fn serve_static(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    // Default to index.html for root and SPA routes
    let path_to_use = if path.is_empty() || path == "index.html" {
        "index.html"
    } else if !path.contains('.') {
        // No extension - serve as SPA route, return index.html
        "index.html"
    } else {
        path
    };

    match Assets::get(path_to_use) {
        Some(content) => {
            let mime_type = mime_type_from_path(path_to_use);
            let headers = [(axum::http::header::CONTENT_TYPE, mime_type)];
            (headers, content.data.into_response()).into_response()
        }
        None => {
            // For SPA routing, if file not found, serve index.html
            if path_to_use != "index.html" {
                if let Some(index) = Assets::get("index.html") {
                    let headers = [(axum::http::header::CONTENT_TYPE, "text/html")];
                    return (headers, index.data.into_response()).into_response();
                }
            }
            (StatusCode::NOT_FOUND, "Not Found").into_response()
        }
    }
}

/// Determine MIME type from file path.
fn mime_type_from_path(path: &str) -> &'static str {
    match path.split('.').last() {
        Some("html") => "text/html",
        Some("css") => "text/css",
        Some("js") => "application/javascript",
        Some("json") => "application/json",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("eot") => "application/vnd.ms-fontobject",
        _ => "application/octet-stream",
    }
}

/// Health check endpoint.
async fn health_check() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    })
}

/// List all tasks.
async fn list_tasks(
    State(state): State<AppState>,
    Query(query): Query<ListTasksQuery>,
) -> impl IntoResponse {
    let tasks = state.tasks.read().await;
    let filtered: Vec<_> = tasks
        .iter()
        .filter(|task| {
            if let Some(ref status) = query.status {
                if &task.status != status {
                    return false;
                }
            }
            if !query.include_archived.unwrap_or(false) {
                if task.status == "archived" {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect();
    Json(filtered)
}

/// Get a single task by ID.
async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let tasks = state.tasks.read().await;
    match tasks.iter().find(|t| t.id == id) {
        Some(task) => Json(task.clone()).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Not Found".to_string(),
                message: format!("Task with id '{}' not found", id),
            }),
        )
            .into_response(),
    }
}

/// Create a new task.
async fn create_task(
    State(state): State<AppState>,
    Json(req): Json<CreateTaskRequest>,
) -> impl IntoResponse {
    // Validate request
    if req.id.is_empty() || req.title.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Bad Request".to_string(),
                message: "id and title are required".to_string(),
            }),
        )
            .into_response();
    }

    if !(1..=5).contains(&req.priority) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Bad Request".to_string(),
                message: "priority must be between 1 and 5".to_string(),
            }),
        )
            .into_response();
    }

    let now = chrono::Utc::now().to_rfc3339();
    let task = Task {
        id: req.id.clone(),
        title: req.title,
        status: req.status,
        priority: req.priority,
        blocked_by: req.blocked_by,
        merge_loop_prompt: None,
        closed_at: None,
        archived_at: None,
        created_at: now.clone(),
        updated_at: now,
    };

    // Check if task already exists
    {
        let tasks = state.tasks.read().await;
        if tasks.iter().any(|t| t.id == req.id) {
            return (
                StatusCode::CONFLICT,
                Json(ErrorResponse {
                    error: "Conflict".to_string(),
                    message: format!("Task with id '{}' already exists", req.id),
                }),
            )
                .into_response();
        }
    }

    // Add task
    let mut tasks = state.tasks.write().await;
    tasks.push(task.clone());

    // TODO: Auto-execute if requested
    // This would require spawning a ralph run process

    (StatusCode::CREATED, Json(task)).into_response()
}

/// Update an existing task.
async fn update_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(req): Json<UpdateTaskRequest>,
) -> impl IntoResponse {
    let mut tasks = state.tasks.write().await;
    match tasks.iter_mut().find(|t| t.id == id) {
        Some(task) => {
            if let Some(title) = req.title {
                if title.is_empty() {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ErrorResponse {
                            error: "Bad Request".to_string(),
                            message: "title must not be empty".to_string(),
                        }),
                    )
                        .into_response();
                }
                task.title = title;
            }
            if let Some(status) = req.status {
                task.status = status;
            }
            if let Some(priority) = req.priority {
                if !(1..=5).contains(&priority) {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ErrorResponse {
                            error: "Bad Request".to_string(),
                            message: "priority must be between 1 and 5".to_string(),
                        }),
                    )
                        .into_response();
                }
                task.priority = priority;
            }
            if let Some(blocked_by) = req.blocked_by {
                task.blocked_by = Some(blocked_by);
            }
            task.updated_at = chrono::Utc::now().to_rfc3339();
            Json(task.clone()).into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Not Found".to_string(),
                message: format!("Task with id '{}' not found", id),
            }),
        )
            .into_response(),
    }
}

/// Delete a task.
async fn delete_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let mut tasks = state.tasks.write().await;
    match tasks.iter().position(|t| t.id == id) {
        Some(pos) => {
            let task = &tasks[pos];
            // Only allow deletion of terminal states
            if !matches!(task.status.as_str(), "failed" | "closed") {
                return (
                    StatusCode::CONFLICT,
                    Json(ErrorResponse {
                        error: "Conflict".to_string(),
                        message: format!(
                            "Cannot delete task in '{}' state. Only failed or closed tasks can be deleted.",
                            task.status
                        ),
                    }),
                )
                    .into_response();
            }
            tasks.remove(pos);
            StatusCode::NO_CONTENT.into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Not Found".to_string(),
                message: format!("Task with id '{}' not found", id),
            }),
        )
            .into_response(),
    }
}

/// Run a task (placeholder for now).
async fn run_task(
    State(_state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    // TODO: Implement task execution by spawning ralph run process
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(ErrorResponse {
            error: "Not Implemented".to_string(),
            message: format!("Task execution for '{}' not yet implemented", id),
        }),
    )
        .into_response()
}

/// Build the API router.
fn build_api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health_check))
        .route("/tasks", get(list_tasks).post(create_task))
        .route("/tasks/{id}", get(get_task).patch(update_task).delete(delete_task))
        .route("/tasks/{id}/run", post(run_task))
}

/// Build the complete application router.
fn build_app(state: AppState) -> Router {
    Router::new()
        .nest("/api/v1", build_api_router())
        .fallback(serve_static)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Start the embedded web server.
pub async fn execute(
    backend_port: u16,
    workspace_root: PathBuf,
    no_open: bool,
) -> Result<()> {
    println!("Starting embedded Ralph web server...");
    println!("Using workspace: {}", workspace_root.display());

    // Create application state
    let state = AppState {
        workspace_root,
        tasks: Arc::new(RwLock::new(Vec::new())),
    };

    // Build the router
    let app = build_app(state);

    // Bind to address
    let addr = SocketAddr::from(([0, 0, 0, 0], backend_port));
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .context("Failed to bind to port")?;

    let dashboard_url = format!("http://localhost:{}", backend_port);

    println!();
    println!("Server started successfully!");
    println!("  Dashboard: {}", dashboard_url);
    println!("  API:       {}/api/v1", dashboard_url);
    println!();

    // Open browser if requested
    if !no_open {
        if let Err(e) = open::that(&dashboard_url) {
            eprintln!("Failed to open browser: {}", e);
        }
    }

    println!("Press Ctrl+C to stop the server");
    println!();

    // Start the server
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .context("Server error")?;

    println!("Server stopped.");
    Ok(())
}

/// Wait for shutdown signal.
async fn shutdown_signal() {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(unix)]
    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }

    #[cfg(not(unix))]
    ctrl_c.await;
}

#[cfg(test)]
mod tests {
    use super::*;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_health_check() {
        let state = AppState {
            workspace_root: PathBuf::from("/tmp"),
            tasks: Arc::new(RwLock::new(Vec::new())),
        };
        let app = build_app(state);

        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/health")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_create_and_list_tasks() {
        let state = AppState {
            workspace_root: PathBuf::from("/tmp"),
            tasks: Arc::new(RwLock::new(Vec::new())),
        };
        let app = build_app(state.clone());

        // Create a task
        let create_req = CreateTaskRequest {
            id: "test-1".to_string(),
            title: "Test Task".to_string(),
            status: "open".to_string(),
            priority: 2,
            blocked_by: None,
            auto_execute: false,
            preset: None,
        };

        let response = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .method("POST")
                    .uri("/api/v1/tasks")
                    .header("content-type", "application/json")
                    .body(axum::body::Body::from(serde_json::json!(create_req).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::CREATED);

        // List tasks
        let response = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/v1/tasks")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_mime_types() {
        assert_eq!(mime_type_from_path("index.html"), "text/html");
        assert_eq!(mime_type_from_path("style.css"), "text/css");
        assert_eq!(mime_type_from_path("app.js"), "application/javascript");
        assert_eq!(mime_type_from_path("data.json"), "application/json");
        assert_eq!(mime_type_from_path("image.png"), "image/png");
        assert_eq!(mime_type_from_path("icon.svg"), "image/svg+xml");
    }
}
