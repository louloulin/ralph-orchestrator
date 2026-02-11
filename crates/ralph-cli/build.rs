use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-changed=frontend/ralph-web/src");
    println!("cargo:rerun-if-changed=frontend/ralph-web/package.json");
    println!("cargo:rerun-if-changed=frontend/ralph-web/index.html");
    println!("cargo:rerun-if-changed=backend/ralph-web-server/src");
    println!("cargo:rerun-if-changed=backend/ralph-web-server/package.json");

    // Only build embedded assets if embedded-web feature is enabled
    let feature = env::var("CARGO_FEATURE_EMBEDDED_WEB").is_ok();

    if feature {
        println!("cargo:warning=Building embedded web assets - this may take a moment...");

        let workspace_root = env::var("CARGO_MANIFEST_DIR")
            .map(PathBuf::from)
            .expect("CARGO_MANIFEST_DIR not set");

        let backend_dir = workspace_root.join("../../backend/ralph-web-server");
        let frontend_dir = workspace_root.join("../../frontend/ralph-web");

        // Build and bundle backend as a binary using Bun
        println!("cargo:warning=Building backend binary with Bun...");

        let backend_binary = backend_dir.join("dist/ralph-web-server");

        // Check if bun is available
        let bun_check = Command::new("bun").arg("--version").output();

        let bun_available = match bun_check {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };

        if bun_available {
            // Build backend with bun
            let bun_build = Command::new("bun")
                .args([
                    "build",
                    "src/serve.ts",
                    "--compile",
                    "--outfile",
                    "dist/ralph-web-server",
                ])
                .current_dir(&backend_dir)
                .status();

            match bun_build {
                Ok(status) if status.success() => {
                    println!("cargo:warning=Backend binary built successfully");

                    // Tell cargo where to find the binary for embedding
                    if backend_binary.exists() {
                        println!("cargo:rustc-env=RALPH_BACKEND_BINARY={}", backend_binary.display());
                    }
                }
                Ok(_) => {
                    println!("cargo:warning=Backend binary build failed, continuing without embedded backend");
                }
                Err(e) => {
                    println!("cargo:warning=Failed to run bun build: {}, continuing without embedded backend", e);
                }
            }
        } else {
            println!("cargo:warning=Bun not found, skipping backend binary build");
        }

        // Build frontend (if node is available)
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
