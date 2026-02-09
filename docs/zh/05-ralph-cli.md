# 第5章：ralph-cli 详解

## 5.1 CLI 架构

`ralph-cli` 是 Ralph Orchestrator 的命令行界面入口，负责用户交互、命令解析和应用初始化。

### 5.1.1 目录结构

```
crates/ralph-cli/src/
├── main.rs              # 主入口和命令解析
├── lib.rs               # 库定义
├── loop_runner.rs       # 循环运行器
├── loops.rs             # 循环管理
├── init.rs              # 项目初始化
├── preflight.rs         # 预检查
├── doctor.rs            # 诊断工具
├── hats.rs              # 帽子相关命令
├── bot.rs               # 机器人命令
├── memory.rs            # 记忆命令
├── task_cli.rs          # 任务命令
├── tools.rs             # 工具命令
├── interact.rs          # 交互命令
├── web.rs               # Web 仪表板
├── presets.rs           # 预设管理
├── skill_cli.rs         # 技能命令
├── sop_runner.rs        # SOP 运行器
├── display.rs           # 显示工具
└── test_support.rs      # 测试支持
```

### 5.1.2 命令层次结构

```
ralph
├── run              # 运行编排循环
├── init             # 初始化项目
├── plan             # 规划功能（SOP）
├── code-task        # 生成代码任务
├── task             # 管理代码任务
├── tui              # 启动 TUI 界面
├── web              # 启动 Web 仪表板
├── loops            # 管理并行循环
├── bot              # 机器人命令
├── memory           # 记忆管理（运行时）
├── events           # 查看事件历史
├── hats             # 帽子管理
├── skills           # 技能管理
├── tools            # 运行时工具
├── doctor           # 环境诊断
└── completion       # Shell 自动完成
```

## 5.2 命令解析

### 5.2.1 Clap 定义

Ralph 使用 `clap` 框架进行命令行参数解析：

```rust
use clap::{Parser, Subcommand};

/// Ralph Orchestrator - Multi-agent orchestration framework
#[derive(Parser)]
#[command(name = "ralph")]
#[command(about = "Multi-agent orchestration framework", long_about = None)]
#[command(version)]
struct Cli {
    /// Increase verbosity (-v, -vv, -vvv)
    #[arg(short, long, action = ArgAction::Count)]
    verbose: u8,

    /// Quiet mode (minimal output)
    #[arg(short, long)]
    quiet: bool,

    /// Path to config file
    #[arg(short, long, default_value = "ralph.yml")]
    config: PathBuf,

    #[command(subcommand)]
    command: Commands,
}

/// Available subcommands
#[derive(Subcommand)]
enum Commands {
    /// Run the orchestration loop
    Run {
        /// Prompt for the task
        #[arg(short, long)]
        prompt: Option<String>,

        /// Maximum iterations
        #[arg(long)]
        max_iterations: Option<usize>,

        /// Maximum runtime in minutes
        #[arg(long)]
        max_duration: Option<usize>,

        /// Backend to use
        #[arg(long)]
        backend: Option<String>,

        /// Continue from previous session
        #[arg(long)]
        continue: bool,
    },

    /// Initialize a new project
    Init {
        /// Backend to use
        #[arg(long)]
        backend: Option<String>,

        /// List available presets
        #[arg(long)]
        list_presets: bool,

        /// Create from preset
        #[arg(long)]
        preset: Option<String>,
    },

    /// Plan a feature using SOP
    Plan {
        /// Feature description
        description: String,

        /// Output directory
        #[arg(short, long, default_value = ".ralph/specs")]
        output: PathBuf,
    },

    // ... 其他命令
}
```

### 5.2.2 主入口函数

```rust
#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();

    // Setup logging
    setup_logging(cli.verbose, cli.quiet)?;

    // Execute command
    match cli.command {
        Commands::Run { prompt, max_iterations, max_duration, backend, continue } => {
            run_loop(cli.config, prompt, max_iterations, max_duration, backend, continue).await
        }
        Commands::Init { backend, list_presets, preset } => {
            init_project(cli.config, backend, list_presets, preset).await
        }
        Commands::Plan { description, output } => {
            plan_feature(description, output).await
        }
        // ... 其他命令
    }
}
```

## 5.3 子命令实现

### 5.3.1 run 命令

`run` 命令启动编排循环，是最常用的命令：

```rust
async fn run_loop(
    config_path: PathBuf,
    prompt: Option<String>,
    max_iterations: Option<usize>,
    max_duration: Option<usize>,
    backend: Option<String>,
    continue_session: bool,
) -> Result<()> {
    // Load configuration
    let config = RalphConfig::load(&config_path)?;

    // Detect backend if not specified
    let backend = backend.unwrap_or_else(|| {
        detect_backend().unwrap_or_else(|_| "claude".to_string())
    });

    // Setup loop context
    let context = LoopContext::new(
        std::env::current_dir()?,
        // ... other parameters
    );

    // Acquire loop lock
    let _lock = LoopLock::acquire(&context.lock_path)?;

    // Create event loop
    let mut event_loop = EventLoop::new(config, context)?;

    // Run the loop
    let termination_reason = event_loop.run().await?;

    // Handle termination
    match termination_reason {
        TerminationReason::CompletionPromise => {
            println!("Loop completed successfully");
            Ok(())
        }
        TerminationReason::MaxIterations => {
            bail!("Loop terminated: maximum iterations reached");
        }
        // ... other cases
    }
}
```

### 5.3.2 init 命令

`init` 命令初始化项目并创建配置文件：

```rust
async fn init_project(
    config_path: PathBuf,
    backend: Option<String>,
    list_presets: bool,
    preset: Option<String>,
) -> Result<()> {
    // List presets if requested
    if list_presets {
        let presets = load_presets()?;
        for preset in presets {
            println!("  - {}", preset.name);
        }
        return Ok(());
    }

    // Detect backend
    let backend = backend.unwrap_or_else(|| {
        detect_backend().unwrap_or_else(|_| "claude".to_string())
    });

    // Load preset if specified
    let config = if let Some(preset_name) = preset {
        load_preset(&preset_name)?
    } else {
        RalphConfig::default_with_backend(&backend)
    };

    // Create .ralph directory structure
    fs::create_dir_all(".ralph/specs")?;
    fs::create_dir_all(".ralph/tasks")?;
    fs::create_dir_all(".ralph/agent")?;

    // Save config
    config.save(&config_path)?;

    println!("Project initialized successfully");
    println!("Config file: {}", config_path.display());

    Ok(())
}
```

### 5.3.3 plan 命令

`plan` 命令使用 SOP（标准作业程序）生成功能规划：

```rust
async fn plan_feature(description: String, output_dir: PathBuf) -> Result<()> {
    // Load SOP template
    let sop_template = load_sop_template()?;

    // Run SOP runner
    let runner = SopRunner::new(sop_template);
    let spec = runner.run(&description).await?;

    // Write spec to file
    let filename = format!("{}.md", slugify(&description));
    let output_path = output_dir.join(filename);

    fs::write(&output_path, spec.content)?;

    println!("Specification written to: {}", output_path.display());

    Ok(())
}
```

### 5.3.4 loops 命令

`loops` 命令管理并行循环：

```rust
async fn manage_loops() -> Result<()> {
    let registry = LoopRegistry::load()?;

    println!("Active loops:");
    for entry in registry.entries() {
        println!(
            "  - {} (PID: {}, started: {})",
            entry.loop_name,
            entry.pid,
            entry.started_at
        );
    }

    Ok(())
}
```

### 5.3.5 memory 命令

`memory` 命令管理运行时记忆（非持久化，仅用于当前会话）：

```rust
async fn manage_memory(subcommand: MemorySubcommand) -> Result<()> {
    match subcommand {
        MemorySubcommand::Add { content, memory_type, tags } => {
            let memory = Memory {
                id: generate_id(),
                content,
                memory_type: parse_memory_type(&memory_type)?,
                tags: tags.split(',').map(|s| s.to_string()).collect(),
                created_at: Utc::now(),
            };

            let mut store = MemoryStore::load()?;
            store.add(memory);
            store.save()?;

            println!("Memory added: {}", memory.id);
            Ok(())
        }
        MemorySubcommand::List { memory_type, tags } => {
            let store = MemoryStore::load()?;
            let memories = store.filter(memory_type, tags);

            println!("Memories:");
            for memory in memories {
                println!("  - {}: {}", memory.id, memory.content);
            }

            Ok(())
        }
        // ... 其他子命令
    }
}
```

### 5.3.6 tools 命令

`tools` 命令提供运行时工具访问（任务、记忆等）：

```rust
async fn run_tools(subcommand: ToolsSubcommand) -> Result<()> {
    match subcommand {
        ToolsSubcommand::Task { task_command } => {
            match task_command {
                TaskCommand::Add { title, priority, description, blocked_by } => {
                    let task = Task {
                        id: generate_task_id(),
                        title,
                        description,
                        priority,
                        blocked_by: parse_ids(blocked_by)?,
                        status: TaskStatus::Open,
                        created_at: Utc::now(),
                        updated_at: Utc::now(),
                    };

                    let mut store = TaskStore::load()?;
                    store.add(task);
                    store.save()?;

                    println!("Task added: {}", task.id);
                    Ok(())
                }
                TaskCommand::List { status, format } => {
                    let store = TaskStore::load()?;
                    let tasks = store.filter(status)?;

                    match format {
                        OutputFormat::Table => {
                            print_tasks_as_table(&tasks);
                        }
                        OutputFormat::Json => {
                            print_tasks_as_json(&tasks);
                        }
                        OutputFormat::Quiet => {
                            for task in tasks {
                                println!("{}", task.id);
                            }
                        }
                    }

                    Ok(())
                }
                // ... 其他任务命令
            }
        }
        // ... 其他工具命令
    }
}
```

### 5.3.7 doctor 命令

`doctor` 命令检查环境并报告问题：

```rust
async fn run_doctor() -> Result<()> {
    let mut report = PreflightReport::new();

    // Check backend
    match detect_backend() {
        Ok(backend) => {
            report.add_check(CheckStatus::Pass, "Backend detected", &backend);
        }
        Err(e) => {
            report.add_check(CheckStatus::Fail, "Backend detection", &e.to_string());
        }
    }

    // Check git
    if std::process::Command::new("git").arg("--version").output().is_ok() {
        report.add_check(CheckStatus::Pass, "Git", "installed");
    } else {
        report.add_check(CheckStatus::Warn, "Git", "not found (optional)");
    }

    // Check config file
    if Path::new("ralph.yml").exists() {
        report.add_check(CheckStatus::Pass, "Config file", "ralph.yml exists");
    } else {
        report.add_check(CheckStatus::Warn, "Config file", "ralph.yml not found");
    }

    // Print report
    println!("{}", report.format());

    Ok(())
}
```

## 5.4 初始化流程

### 5.4.1 项目初始化步骤

```rust
pub async fn initialize_project(backend: Option<String>) -> Result<()> {
    // Step 1: Detect backend
    let backend = backend.unwrap_or_else(|| {
        detect_backend().unwrap_or_else(|_| "claude".to_string())
    });

    // Step 2: Create directory structure
    create_directories()?;

    // Step 3: Generate config
    let config = generate_config(&backend)?;

    // Step 4: Save config
    config.save("ralph.yml")?;

    // Step 5: Initialize git if needed
    if !Path::new(".git").exists() {
        run_git_init()?;
    }

    // Step 6: Setup .gitignore
    setup_gitignore()?;

    Ok(())
}

fn create_directories() -> Result<()> {
    fs::create_dir_all(".ralph/specs")?;
    fs::create_dir_all(".ralph/tasks")?;
    fs::create_dir_all(".ralph/agent")?;
    fs::create_dir_all(".ralph/memories")?;
    Ok(())
}

fn setup_gitignore() -> Result<()> {
    let gitignore_path = ".gitignore";
    let mut content = String::new();

    if Path::new(gitignore_path).exists() {
        content = fs::read_to_string(gitignore_path)?;
    }

    if !content.contains(".ralph/") {
        content.push_str("\n# Ralph\n.ralph/\n");
        fs::write(gitignore_path, content)?;
    }

    Ok(())
}
```

### 5.4.2 预设加载

```rust
pub fn load_preset(name: &str) -> Result<RalphConfig> {
    let preset_path = format!("presets/{}.yml", name);

    if !Path::new(&preset_path).exists() {
        bail!("Preset not found: {}", name);
    }

    let config = RalphConfig::load(Path::new(&preset_path))?;
    Ok(config)
}

pub fn list_presets() -> Result<Vec<String>> {
    let presets_dir = Path::new("presets");

    if !presets_dir.exists() {
        return Ok(vec![]);
    }

    let mut presets = Vec::new();

    for entry in fs::read_dir(presets_dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("yml") {
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                presets.push(name.to_string());
            }
        }
    }

    Ok(presets)
}
```

## 5.5 循环运行器

### 5.5.1 循环执行

```rust
pub struct LoopRunner {
    config: RalphConfig,
    context: LoopContext,
}

impl LoopRunner {
    pub async fn run(&mut self) -> Result<TerminationReason> {
        // Acquire lock
        let _lock = LoopLock::acquire(&self.context.lock_path)?;

        // Create event loop
        let mut event_loop = EventLoop::new(self.config.clone(), self.context.clone())?;

        // Run loop
        let reason = event_loop.run().await?;

        // Process merge queue if primary loop
        if self.context.is_primary {
            self.process_merge_queue().await?;
        }

        Ok(reason)
    }

    async fn process_merge_queue(&self) -> Result<()> {
        let merge_queue_path = ".ralph/merge-queue.jsonl";

        if !Path::new(merge_queue_path).exists() {
            return Ok(());
        }

        // Read and process merge queue
        let entries = read_merge_queue(merge_queue_path)?;

        for entry in entries {
            match entry {
                MergeQueueEntry::Merge { worktree_id, commit_message } => {
                    self.merge_worktree(&worktree_id, &commit_message).await?;
                }
            }
        }

        Ok(())
    }
}
```

### 5.5.2 进程组管理（Unix）

```rust
#[cfg(unix)]
mod process_management {
    use nix::unistd::{setpgid, Pid};

    pub fn setup_process_group() {
        let pid = Pid::this();

        // Make ourselves the process group leader
        if let Err(e) = setpgid(pid, pid) {
            tracing::warn!("Failed to set process group: {}", e);
        }
    }
}
```

## 5.6 Web 命令

```rust
pub async fn start_web_dashboard() -> Result<()> {
    // Start backend server
    let backend_handle = tokio::spawn(async {
        backend_server::run(([127, 0, 0, 1], 3000)).await
    });

    // Start frontend dev server
    let frontend_handle = tokio::spawn(async {
        frontend_dev_server::run(([127, 0, 0, 1], 5173)).await
    });

    println!("Web dashboard started:");
    println!("  Backend: http://localhost:3000");
    println!("  Frontend: http://localhost:5173");

    // Wait for Ctrl+C
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            println!("Shutting down...");
            backend_handle.abort();
            frontend_handle.abort();
        }
    }

    Ok(())
}
```

## 5.7 小结

本章详细探讨了 `ralph-cli` crate 的实现：

1. **CLI 架构** - 使用 clap 框架解析命令行参数，提供 20+ 个子命令。

2. **命令解析** - 通过 Clap 定义命令层次结构，支持参数、选项和子命令。

3. **子命令实现** - 包括 run（运行循环）、init（初始化项目）、plan（规划功能）、loops（循环管理）等。

4. **初始化流程** - 创建目录结构、生成配置文件、设置 gitignore 等。

5. **循环运行器** - 获取锁、创建事件循环、运行循环、处理合并队列。

6. **Web 命令** - 启动后端和前端服务器，提供 Web 仪表板界面。

ralph-cli 是用户与 Ralph 交互的主要接口，提供了丰富的命令来管理项目、运行循环、查看状态等。

---

**上一章**：[第4章：ralph-core 详解](04-ralph-core.md) | **下一章**：[第6章：ralph-adapters 详解](06-ralph-adapters.md)
