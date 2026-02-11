use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=frontend/ralph-web/src");
    println!("cargo:rerun-if-changed=frontend/ralph-web/package.json");
    println!("cargo:rerun-if-changed=frontend/ralph-web/index.html");

    // Only build frontend if embedded-web feature is enabled
    let feature = env::var("CARGO_FEATURE_EMBEDDED_WEB").is_ok();

    if feature {
        println!("cargo:warning=Building embedded frontend - this may take a moment...");

        let workspace_root = env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .expect("CARGO_MANIFEST_DIR not set");

        let frontend_dir = workspace_root.join("../../frontend/ralph-web");

        // Check if node_modules exists, if not run npm install
        let node_modules = frontend_dir.join("node_modules");
        if !node_modules.exists() {
            println!("cargo:warning=Installing frontend dependencies...");
            let npm_install = Command::new("npm")
                .args(["install"])
                .current_dir(&frontend_dir)
                .status();

            match npm_install {
                Ok(status) if status.success() => {}
                Ok(_) => {
                    println!("cargo:warning=npm install failed, skipping frontend build");
                    return;
                }
                Err(e) => {
                    println!("cargo:warning=npm not found: {}, skipping frontend build", e);
                    return;
                }
            }
        }

        // Build the frontend
        println!("cargo:warning=Building frontend with npm run build...");
        let npm_build = Command::new("npm")
            .args(["run", "build"])
            .current_dir(&frontend_dir)
            .status();

        match npm_build {
            Ok(status) if status.success() => {
                println!("cargo:warning=Frontend built successfully");
            }
            Ok(_) => {
                println!("cargo:warning=Frontend build failed, continuing without embedded assets");
            }
            Err(e) => {
                println!("cargo:warning=Failed to run npm build: {}, continuing without embedded assets", e);
            }
        }
    }
}
