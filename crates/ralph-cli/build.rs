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

        // Check if bun is available
        let bun_check = Command::new("bun").arg("--version").output();
        let bun_available = match bun_check {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };

        // Check if npm is available
        let npm_check = Command::new("npm").arg("--version").output();
        let npm_available = match npm_check {
            Ok(output) => output.status.success(),
            Err(_) => false,
        };

        // Build frontend first (npm required)
        if npm_available {
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
                        println!("cargo:warning=npm install error: {}, skipping frontend build", e);
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
        } else {
            println!("cargo:warning=npm not found, skipping frontend build");
        }

        // Build backend bundle (bun required)
        if bun_available {
            println!("cargo:warning=Building backend bundle with Bun...");

            // Create dist directory
            let dist_dir = backend_dir.join("dist");
            std::fs::create_dir_all(&dist_dir).ok();

            // Build bundle.js (not native binary - we need JS for extraction)
            let bun_build = Command::new("bun")
                .args([
                    "build",
                    "src/serve.ts",
                    "--outfile",
                    "dist/bundle.js",
                    "--target",
                    "bun",
                ])
                .current_dir(&backend_dir)
                .status();

            match bun_build {
                Ok(status) if status.success() => {
                    println!("cargo:warning=Backend bundle built successfully");

                    // Copy frontend dist to backend dist for embedding
                    let frontend_dist = frontend_dir.join("dist");
                    let backend_dist_frontend = backend_dir.join("dist/frontend");

                    if frontend_dist.exists() {
                        // Remove old frontend
                        let _ = std::fs::remove_dir_all(&backend_dist_frontend);

                        // Copy new frontend
                        let copy_result = copy_dir_all(&frontend_dist, &backend_dist_frontend);
                        match copy_result {
                            Ok(_) => {
                                println!("cargo:warning=Frontend assets copied to backend dist");
                            }
                            Err(e) => {
                                println!("cargo:warning=Failed to copy frontend: {}", e);
                            }
                        }
                    } else {
                        println!("cargo:warning=Frontend dist not found at {:?}", frontend_dist);
                    }
                }
                Ok(_) => {
                    println!("cargo:warning=Backend bundle build failed, continuing without embedded backend");
                }
                Err(e) => {
                    println!("cargo:warning=Failed to run bun build: {}, continuing without embedded backend", e);
                }
            }
        } else {
            println!("cargo:warning=Bun not found, skipping backend bundle build");
        }
    }
}

/// Recursively copy a directory
fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;

    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
