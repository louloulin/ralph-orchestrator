// ABOUTME: Embedded web dashboard server for Ralph CLI.
// ABOUTME: Provides a single-binary web experience with backend binary and frontend assets embedded at compile time.
// ABOUTME: Uses the Bun-compiled backend binary for full functionality.

use anyhow::{Context, Result};
use rust_embed::RustEmbed;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;
use tokio::process::Command as TokioCommand;
use tokio::time::sleep;
use tokio::signal;

/// Embedded backend binary compiled with Bun.
/// This is the actual Node.js backend server compiled to a standalone binary.
#[derive(RustEmbed)]
#[folder = "../../backend/ralph-web-server/dist/"]
struct EmbeddedBackend;

/// Embedded frontend assets from the build directory.
/// These are compiled into the binary at build time.
#[derive(RustEmbed)]
#[folder = "../../frontend/ralph-web/dist/"]
struct Assets;

/// Start the embedded web server by running the bundled backend binary.
pub async fn execute(
    backend_port: u16,
    workspace_root: PathBuf,
    no_open: bool,
) -> Result<()> {
    println!("Starting embedded Ralph web server...");
    println!("Using workspace: {}", workspace_root.display());

    // Extract the backend binary to a temporary location
    let backend_binary = EmbeddedBackend::get("ralph-web-server")
        .context("Embedded backend binary not found. Run build script first.")?;

    let temp_dir = std::env::temp_dir().join("ralph-web");
    std::fs::create_dir_all(&temp_dir)
        .context("Failed to create temp directory for backend binary")?;

    let extracted_binary = temp_dir.join("ralph-web-server");

    // Write the embedded binary to a temp file
    let mut file = File::create(&extracted_binary)
        .context("Failed to create temporary backend binary file")?;
    file.write_all(&backend_binary.data)
        .context("Failed to write backend binary")?;

    // Make it executable
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&extracted_binary)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&extracted_binary, perms)?;
    }

    println!("Extracted backend binary to: {}", extracted_binary.display());

    // Set environment variables for the backend
    let port = backend_port.to_string();
    let mut child = TokioCommand::new(extracted_binary.to_str().unwrap())
        .env("PORT", &port)
        .env("RALPH_WORKSPACE_ROOT", workspace_root)
        .spawn()
        .context("Failed to start backend server")?;

    println!("Backend server starting on port {}...", backend_port);

    // Wait a moment for the server to start
    sleep(Duration::from_secs(2)).await;

    // Check if the process is still running
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

    println!("Press Ctrl+C to stop the server");
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

    // Kill the backend process
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

    // Wait for the process to exit
    let timeout = sleep(Duration::from_secs(5));
    tokio::select! {
        _ = child.wait() => {}
        _ = timeout => {
            println!("Backend did not shut down gracefully, forcing...");
            let _ = child.kill();
        }
    }

    println!("Server stopped.");

    // Clean up the extracted binary
    let _ = std::fs::remove_file(&extracted_binary);

    Ok(())
}
