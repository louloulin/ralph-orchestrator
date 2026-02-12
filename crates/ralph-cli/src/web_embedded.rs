// ABOUTME: Embedded web dashboard server for Ralph CLI.
// ABOUTME: Provides a single-binary web experience with backend binary and frontend assets embedded at compile time.
// ABOUTME: Uses Bun-compiled backend binary for full functionality.

use anyhow::{Context, Result};
use rust_embed::RustEmbed;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command as TokioCommand;
use tokio::time::sleep;
use tokio::signal;

/// Embedded backend binary compiled with Bun.
/// This is the actual Node.js backend server compiled to a standalone binary.
/// Frontend assets are also embedded under the frontend/ subdirectory.
#[derive(RustEmbed)]
#[folder = "../../backend/ralph-web-server/dist/"]
#[exclude = "*.map"]  // Exclude source maps
struct EmbeddedBackend;

/// Extract a directory from embedded files to target directory.
fn extract_embedded_directory(source_prefix: &str, target_dir: &PathBuf) -> Result<()> {
    fs::create_dir_all(target_dir)
        .with_context(|| format!("Failed to create target directory: {:?}", target_dir))?;

    let mut found_files = false;
    for file_path in EmbeddedBackend::iter() {
        let path = file_path.as_ref();
        // Only extract files that start with the source prefix
        if path.starts_with(source_prefix) {
            found_files = true;
            let relative_path = path.strip_prefix(source_prefix)
                .with_context(|| format!("Failed to strip prefix {} from path {}", source_prefix, path))?;

            // Skip empty relative path (e.g., when file_path == "frontend/")
            if relative_path.is_empty() {
                continue;
            }

            let target_path = target_dir.join(relative_path);

            // Create parent directories if needed
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("Failed to create parent directory: {:?}", parent))?;
            }

            // Extract file
            let embedded_file = EmbeddedBackend::get(path)
                .with_context(|| format!("Embedded file not found: {}", path))?;

            let content = embedded_file.data.as_ref();

            let mut file = File::create(&target_path)
                .with_context(|| format!("Failed to create file: {:#?}", target_path))?;
            file.write_all(content)
                .with_context(|| format!("Failed to write file: {:#?}", target_path))?;
        }
    }

    if !found_files {
        return Err(anyhow::anyhow!("No embedded files found with prefix: {}", source_prefix));
    }

    Ok(())
}

/// Start of embedded web server by running bundled backend binary.
pub async fn execute(
    backend_port: u16,
    workspace_root: PathBuf,
    no_open: bool,
) -> Result<()> {
    println!("Starting embedded Ralph web server...");
    println!("Using workspace: {}", workspace_root.display());

    // Get backend binary content from embedded files
    let backend_binary = EmbeddedBackend::get("bundle.js")
        .context("Embedded backend binary not found. Run build script first: cd backend/ralph-web-server && bun build src")
        .map(|f| f.data.to_vec())?;

    // Create temporary directory for extracted files
    let temp_dir = std::env::temp_dir().join("ralph-web");
    fs::create_dir_all(&temp_dir)
        .context("Failed to create temp directory")?;

    // Extract backend binary
    let extracted_binary = temp_dir.join("bundle.js");
    let mut file = File::create(&extracted_binary)
        .with_context(|| format!("Failed to create file: {:#?}", extracted_binary))?;
    file.write_all(&backend_binary)
        .context("Failed to write backend binary")?;

    println!("Extracted backend binary to: {}", extracted_binary.display());

    // Extract embedded frontend if available
    let frontend_dist = temp_dir.join("frontend");
    if extract_embedded_directory("frontend/", &frontend_dist).is_ok() {
        println!("Extracted frontend assets to: {}", frontend_dist.display());
    } else {
        println!("No embedded frontend found, will use repo frontend if available");
        // Create empty directory for fallback
        fs::create_dir_all(&frontend_dist).ok();
    }

    // Set environment variables for backend
    let port = backend_port.to_string();
    let frontend_dist_str = frontend_dist.to_string_lossy().to_string();

    let mut child = TokioCommand::new("bun")
        .arg(&extracted_binary)
        .env("PORT", &port)
        .env("RALPH_WORKSPACE_ROOT", &workspace_root)
        .env("RALPH_FRONTEND_DIST", &frontend_dist_str)
        .current_dir(&workspace_root)
        .spawn()
        .context("Failed to start backend server. Is Bun installed?")?;

    println!("Backend server starting on port {}...", backend_port);

    // Wait a moment for server to start
    sleep(Duration::from_secs(2)).await;

    // Check if process is still running
    match child.try_wait() {
        Ok(Some(status)) => {
            return Err(anyhow::anyhow!(
                "Backend server exited unexpectedly with status: {}",
                status
            ));
        }
        Ok(None) => {
            // Server is running, continue
        }
        Err(e) => {
            return Err(anyhow::anyhow!("Failed to check backend status: {}", e));
        }
    }

    let dashboard_url = format!("http://localhost:{}", backend_port);

    println!();
    println!("Server started successfully!");
    println!("  Dashboard: {}", dashboard_url);
    println!("  API:       {}/api/v1", dashboard_url);
    println!("  TRPC:      {}/trpc", dashboard_url);
    println!();

    // Open browser if requested
    if !no_open {
        if let Err(e) = open::that(&dashboard_url) {
            eprintln!("Failed to open browser: {}", e);
        }
    }

    println!("Press Ctrl+C to stop server");
    println!();

    // Wait for shutdown signal
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

    println!("\nShutting down backend server...");

    // Kill backend process gracefully
    #[cfg(unix)]
    {
        if let Some(pid) = child.id() {
            let _ = TokioCommand::new("kill")
                .arg("-SIGTERM")
                .arg(pid.to_string())
                .status()
                .await;
        }
    }

    // Wait for process to exit
    let timeout = sleep(Duration::from_secs(5));
    tokio::select! {
        _ = child.wait() => {}
        _ = timeout => {
            println!("Backend did not shut down gracefully, forcing...");
            let _ = child.kill();
        }
    }

    println!("Server stopped.");

    // Clean up extracted files
    let _ = std::fs::remove_file(&extracted_binary);
    let _ = std::fs::remove_dir_all(&frontend_dist);

    Ok(())
}
