# Ralph 1.1 改进计划

> 基于代码库全面分析制定的完善改进方案
>
> 分析日期: 2026-02-12

## 目录

1. [概述](#概述)
2. [高优先级问题](#高优先级问题)
3. [中优先级问题](#中优先级问题)
4. [低优先级问题](#低优先级问题)
5. [架构改进建议](#架构改进建议)
6. [嵌入式 Web 最佳实践](#嵌入式-web-最佳实践)
7. [实施路线图](#实施路线图)

---

## 概述

### 当前架构

```
ralph-orchestrator/
├── crates/
│   ├── ralph-cli/        # CLI 入口，web 命令，嵌入式服务器
│   ├── ralph-core/       # 核心编排逻辑，事件循环
│   ├── ralph-adapters/   # 后端适配器 (Claude, Kiro, Gemini)
│   ├── ralph-telegram/   # Telegram 机器人集成
│   ├── ralph-tui/        # 终端 UI (ratatui)
│   ├── ralph-e2e/        # E2E 测试框架
│   └── ralph-proto/      # 协议定义
├── backend/
│   └── ralph-web-server/ # Fastify + tRPC + SQLite (Bun)
└── frontend/
    └── ralph-web/        # React + Vite + TailwindCSS
```

### 运行模式

| 模式 | 触发条件 | 服务器 |
|------|----------|--------|
| **npm 开发模式** | Node.js 可用 | Backend (3000) + Frontend (5173) |
| **嵌入式模式** | Node.js 不可用 + `embedded-web` feature | 单端口服务器 (3000) |

---

## 高优先级问题

### 1. 安全: 命令注入风险

**位置**: `crates/ralph-cli/src/loops.rs:800`

```rust
// 当前实现 - 有风险
let output = Command::new("sh")
    .arg("-c")
    .arg(format!("git branch -D {}", branch_name))  // branch_name 未转义
    .output();
```

**修复方案**:
```rust
// 安全实现 - 使用参数数组
let output = Command::new("git")
    .args(["branch", "-D", &branch_name])
    .current_dir(&worktree_path)
    .output();
```

**影响范围**:
- `loops.rs:800` - git branch 删除
- `loops.rs:557-558` - tail -f 命令

---

### 2. 安全: execSync 命令执行

**位置**: `backend/ralph-web-server/src/services/TaskBridge.ts:40`

```typescript
// 当前实现 - 有风险
const result = execSync("git rev-parse --show-toplevel", {
  cwd: potentialDir,
  encoding: "utf-8",
});
```

**修复方案**:
```typescript
// 使用参数数组，避免 shell 解析
import { spawnSync } from "child_process";

const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  cwd: potentialDir,
  encoding: "utf-8",
});
```

---

### 3. Bug: 动态端口后显示错误 URL

**位置**: `crates/ralph-cli/src/web.rs:448-449`

```rust
// 当前实现 - 使用请求的端口而非实际端口
let dashboard_url = format!("http://localhost:{}", args.frontend_port);  // 错误
let api_url = format!("http://localhost:{}", args.backend_port);         // 错误
```

**修复方案**:
```rust
// 使用实际分配的端口
let dashboard_url = format!("http://localhost:{}", frontend_port);
let api_url = format!("http://localhost:{}", backend_port);
```

---

## 中优先级问题

### 4. 错误处理: Telegram 代码中的 .unwrap()

**位置**: `crates/ralph-telegram/src/bot.rs`

| 行号 | 问题 |
|------|------|
| 377, 390-391 | Lock poisoning 处理 |
| 414-415, 438-439 | Lock poisoning 处理 |

**修复方案**:
```rust
// 当前
let state = state.lock().unwrap();

// 改进
let state = state.lock().map_err(|e| {
    anyhow::anyhow!("Failed to acquire lock: {}", e)
})?;
```

---

### 5. 安全: 可预测的临时目录

**位置**: `crates/ralph-cli/src/web_embedded.rs:85`

```rust
// 当前实现 - 可预测路径
let temp_dir = std::env::temp_dir().join("ralph-web");
```

**修复方案**:
```rust
// 使用 tempfile crate 创建安全随机临时目录
use tempfile::tempdir;

let temp_dir = tempdir().context("Failed to create temp directory")?;
let temp_path = temp_dir.path();
```

---

### 6. 跨平台: Unix 信号处理

**位置**: `crates/ralph-cli/src/web.rs:546-580`

**当前状态**:
- Unix: 完整的 SIGTERM/SIGHUP 处理
- Windows: 仅 Ctrl+C，无优雅关闭

**改进方案**:
```rust
#[cfg(windows)]
async fn terminate_gracefully(child: &mut Child, grace_period: Duration) {
    // Windows 使用 taskkill /WMIC 实现优雅关闭
    if let Some(pid) = child.id() {
        let _ = TokioCommand::new("taskkill")
            .args(["/PID", &pid.to_string()])
            .status()
            .await;
    }
    // 等待进程退出
    let _ = child.wait().await;
}
```

---

### 7. 安全: 进程命令白名单

**位置**: `backend/ralph-web-server/src/runner/ProcessSupervisor.ts:49,76`

**当前状态**: 无命令验证

**改进方案**:
```typescript
const ALLOWED_COMMANDS = ["ralph", "git", "node", "bun"];

function validateCommand(command: string): boolean {
  const baseCmd = path.basename(command);
  return ALLOWED_COMMANDS.includes(baseCmd);
}

// 在 spawn 前验证
if (!validateCommand(command)) {
  throw new Error(`Command not allowed: ${command}`);
}
```

---

## 低优先级问题

### 8. 死代码清理

**需要审查的文件**:

| 文件 | 标记 |
|------|------|
| `ralph-tui/src/widgets/header.rs:24` | 断点层级文档 |
| `ralph-core/src/diagnostics/stream_handler.rs:10,64` | 流处理器组件 |
| `ralph-e2e/src/runner.rs:558` | E2E runner |

**操作**: 评估每个 `#[allow(dead_code)]` 是否仍需要，移除无用代码。

---

### 9. 性能: 低效克隆

**位置**: `crates/ralph-core/src/hatless_ralph.rs:78,113-114,122-123`

```rust
// 当前 - 多次克隆
base_args: args.iter().map(|s| s.clone()).collect(),

// 改进 - 使用引用或 Cow
base_args: args.to_vec(),  // 如果需要所有权
// 或
base_args: args.into_iter().map(Into::into).collect(),
```

---

### 10. 路径: 构建脚本硬编码相对路径

**位置**: `crates/ralph-cli/build.rs:22-23`

```rust
// 当前
let backend_dir = workspace_root.join("../../backend/ralph-web-server");
let frontend_dir = workspace_root.join("../../frontend/ralph-web");
```

**改进方案**:
```rust
// 使用 CARGO_MANIFEST_DIR 正确计算
let manifest_dir = env::var("CARGO_MANIFEST_DIR")
    .map(PathBuf::from)
    .expect("CARGO_MANIFEST_DIR not set");
let workspace_root = manifest_dir.join("../..");  // 更可靠
```

---

## 架构改进建议

### A. 嵌入式资源压缩优化

**问题**: rust-embed 的内置压缩会在运行时同时存储压缩和解压数据。

**参考**: [Rust Embed 压缩探索](https://amto.cc/articles/rust-embed-compression)

**建议**:
1. 禁用 rust-embed 压缩: `#[exclude = "*.map"]` 已使用
2. 在 build.rs 中预压缩静态资源 (gzip/brotli)
3. 运行时按需解压

```rust
// build.rs 添加预压缩
fn compress_assets(dist_dir: &Path) -> Result<()> {
    for entry in fs::read_dir(dist_dir)? {
        let path = entry?.path();
        if path.extension() == Some("js".as_ref())
           || path.extension() == Some("css".as_ref()) {
            // 使用 brotli 压缩
            let compressed = brotli_compress(&path)?;
            fs::write(path.with_extension("br"), compressed)?;
        }
    }
    Ok(())
}
```

---

### B. Bun 编译优化

**参考**: [Bun 单文件可执行文件](https://bun.com/docs/bundler/executables)

**当前**: 使用 `bun build --target bun` 生成 bundle.js

**改进建议**:

1. **使用 `--compile` 生成原生二进制**:
   ```bash
   bun build src/serve.ts --compile --outfile dist/ralph-web-server
   ```

2. **启用字节码缓存提升启动速度**:
   ```bash
   bun build src/serve.ts --compile --bytecode --outfile dist/ralph-web-server
   ```

3. **跨平台编译**:
   ```bash
   # Linux x64
   bun build src/serve.ts --compile --target=bun-linux-x64 --outfile dist/ralph-web-server-linux
   # macOS arm64
   bun build src/serve.ts --compile --target=bun-darwin-arm64 --outfile dist/ralph-web-server-macos
   # Windows
   bun build src/serve.ts --compile --target=bun-windows-x64 --outfile dist/ralph-web-server.exe
   ```

---

### C. SPA 路由处理改进

**参考**: [Axum SPA + rust-embed](https://stackoverflow.com/questions/73464479)

**当前**: TypeScript 后端处理 SPA fallback

**建议**: 可选地使用 Rust 嵌入式服务器直接处理 (当 Bun 不可用时)

```rust
// web_embedded.rs 添加 Axum 服务器选项
#[cfg(feature = "axum-server")]
async fn run_axum_server(port: u16, frontend_dist: PathBuf) -> Result<()> {
    use axum::{routing::get, Router};
    use axum_embed::Embed;
    use tower_http::services::ServeDir;

    let app = Router::new()
        .fallback_service(ServeDir::new(&frontend_dist).fallback(get(|| async {
            // SPA fallback: 返回 index.html
            include_str!("../../frontend/ralph-web/dist/index.html")
        })));

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await?;
    Ok(())
}
```

---

### D. API 安全增强

**建议添加**:

1. **Rate Limiting**:
   ```typescript
   // backend middleware
   import rateLimit from "@fastify/rate-limit";

   server.register(rateLimit, {
     max: 100,
     timeWindow: "1 minute",
   });
   ```

2. **Input Sanitization**:
   ```typescript
   // TRPC middleware
   const sanitizeInput = t.middleware(async ({ input, next }) => {
     if (typeof input === 'string') {
       input = sanitizeHtml(input);
     }
     return next({ input });
   });
   ```

3. **CORS 严格配置**:
   ```typescript
   // 生产环境
   await server.register(cors, {
     origin: ['https://ralph.example.com'],
     methods: ['GET', 'POST'],
     credentials: true,
   });
   ```

---

## 嵌入式 Web 最佳实践

### 参考资料

| 来源 | 主题 |
|------|------|
| [Bun Single-file Executables](https://bun.com/docs/bundler/executables) | 官方编译文档 |
| [Bun 1.3 Release](https://bun.com/blog/bun-v1.3) | 全栈编译支持 |
| [Bun Cross-Compile](https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/) | 跨平台编译 |
| [Rust Embed 压缩](https://amto.cc/articles/rust-embed-compression) | 压缩优化 |
| [static-web-server](https://github.com/static-web-server/static-web-server) | 生产级静态服务器 |
| [axum-embed](https://lib.rs/crates/axum-embed-files) | Axum 集成 |

### 推荐架构

```
┌─────────────────────────────────────────────────────────┐
│                    ralph binary (22MB)                   │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐    │
│  │           Rust Embed Assets                      │    │
│  │  ├── bundle.js (2.7MB)                          │    │
│  │  └── frontend/                                   │    │
│  │      ├── index.html                             │    │
│  │      ├── favicon.svg                            │    │
│  │      └── assets/                                │    │
│  │          ├── index-*.js (758KB)                 │    │
│  │          └── index-*.css (60KB)                 │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Runtime Extraction                     │    │
│  │  /var/folders/.../ralph-web/                    │    │
│  │  ├── bundle.js                                  │    │
│  │  └── frontend/                                  │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Bun Runtime                            │    │
│  │  bun /var/.../bundle.js                         │    │
│  │  ├── PORT=3000                                  │    │
│  │  ├── RALPH_WORKSPACE_ROOT=...                   │    │
│  │  └── RALPH_FRONTEND_DIST=.../frontend           │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                               │
│                          ▼                               │
│  ┌─────────────────────────────────────────────────┐    │
│  │           Fastify Server                         │    │
│  │  http://localhost:3000                          │    │
│  │  ├── /health → {"status":"ok"}                  │    │
│  │  ├── /trpc/... → tRPC API                       │    │
│  │  ├── /api/v1/... → REST API                     │    │
│  │  └── /* → SPA (index.html)                      │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### 优化建议

1. **二进制大小优化**:
   ```toml
   # Cargo.toml
   [profile.release]
   opt-level = "z"      # 优化大小
   lto = true           # Link-time optimization
   codegen-units = 1    # 单代码生成单元
   strip = true         # 移除符号
   ```

2. **资源压缩**:
   - 前端: Vite 默认 gzip 压缩
   - 考虑 Brotli 压缩以获得更好压缩率

3. **懒加载**:
   - 大型依赖按需加载
   - 前端代码分割 (已实现)

---

## 实施路线图

### Phase 1: 安全修复 (1-2 天)

| 优先级 | 任务 | 文件 |
|--------|------|------|
| 🔴 高 | 修复命令注入 | `loops.rs:800` |
| 🔴 高 | 修复 execSync | `TaskBridge.ts:40` |
| 🔴 高 | 修复端口显示 Bug | `web.rs:448-449` |
| 🟡 中 | 添加命令白名单 | `ProcessSupervisor.ts` |
| 🟡 中 | 安全临时目录 | `web_embedded.rs:85` |

### Phase 2: 错误处理改进 (1 天)

| 优先级 | 任务 | 文件 |
|--------|------|------|
| 🟡 中 | Telegram lock 处理 | `bot.rs:377+` |
| 🟡 中 | 添加上下文到 expect | `loop_registry.rs:121` |

### Phase 3: 跨平台支持 (2-3 天)

| 优先级 | 任务 | 文件 |
|--------|------|------|
| 🟡 中 | Windows 优雅关闭 | `web.rs:576-580` |
| 🟡 中 | Windows 嵌入式服务器 | `web_embedded.rs` |
| 🟢 低 | PTY 替代方案 | `loop_context.rs` |

### Phase 4: 性能优化 (2 天)

| 优先级 | 任务 | 文件 |
|--------|------|------|
| 🟢 低 | 减少克隆 | `hatless_ralph.rs` |
| 🟢 低 | 死代码清理 | 多个文件 |
| 🟢 低 | 二进制大小优化 | `Cargo.toml` |

### Phase 5: 架构改进 (可选, 3-5 天)

| 优先级 | 任务 | 描述 |
|--------|------|------|
| 🔵 可选 | Bun --compile | 使用原生二进制替代 bundle.js |
| 🔵 可选 | 跨平台编译 | 支持 Linux/macOS/Windows 预编译 |
| 🔵 可选 | 资源预压缩 | build.rs 中添加 brotli |
| 🔵 可选 | Axum 嵌入服务器 | 无 Bun 依赖的备选方案 |

---

## 测试计划

### 单元测试

```bash
# 运行所有测试
cargo test

# 特定 crate
cargo test -p ralph-core
cargo test -p ralph-cli
```

### 集成测试

```bash
# E2E 测试
cargo run -p ralph-e2e -- --mock

# Web 端到端
ralph web --no-open --workspace /tmp/test-workspace
curl http://localhost:3000/health
```

### 安全测试

```bash
# 检查依赖漏洞
cargo audit

# 静态分析
cargo clippy -- -W warnings
```

---

## 文档更新

### 需要更新的文档

| 文件 | 内容 |
|------|------|
| `CLAUDE.md` | 更新构建流程说明 |
| `crates/ralph-cli/README.md` | 添加嵌入式模式文档 |
| `backend/ralph-web-server/README.md` | API 安全最佳实践 |
| `docs/` | 架构决策记录 |

---

## 参考资源

### Rust Embedding

- [rust-embed crate](https://docs.rs/rust-embed)
- [axum-embed](https://lib.rs/crates/axum-embed-files)
- [Rust Embed 压缩探索](https://amto.cc/articles/rust-embed-compression)

### Bun Bundling

- [Bun Single-file Executables](https://bun.com/docs/bundler/executables)
- [Bun Bytecode Caching](https://bun.com/docs/bundler/bytecode)
- [Bun Cross-Compilation](https://developer.mamezou-tech.com/en/blogs/2024/05/20/bun-cross-compile/)

### Web Server Best Practices

- [static-web-server](https://github.com/static-web-server/static-web-server)
- [Actix Static Files](https://actix.rs/docs/static-files/)
- [Axum SPA Discussion](https://github.com/tokio-rs/axum/discussions/1309)

---

## 版本目标

### v1.1.0

- [x] 修复 `ralph web` 返回 test 的问题
- [ ] 修复所有高优先级安全问题
- [ ] 改进错误处理
- [ ] 完善跨平台支持

### v1.2.0 (可选)

- [ ] Bun --compile 原生二进制
- [ ] 跨平台预编译发布
- [ ] 资源预压缩
- [ ] 可选 Axum 嵌入服务器

---

*文档生成: 2026-02-12*
*分析工具: Claude Code*
