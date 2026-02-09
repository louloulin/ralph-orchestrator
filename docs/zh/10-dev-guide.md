# 第10章：开发指南

## 10.1 构建系统

### 10.1.1 项目结构

Ralph 使用 Cargo workspace 管理多个 crates：

```toml
# Cargo.toml (workspace root)
[workspace]
members = [
    "crates/ralph-core",
    "crates/ralph-cli",
    "crates/ralph-adapters",
    "crates/ralph-tui",
    "crates/ralph-telegram",
    "crates/ralph-e2e",
    "crates/ralph-bench",
    "crates/ralph-proto",
]

[workspace.package]
version = "2.5.0"
edition = "2021"
license = "MIT"
```

### 10.1.2 构建命令

```bash
# 构建所有 crates
cargo build

# 构建发布版本
cargo build --release

# 构建特定 crate
cargo build -p ralph-core
cargo build -p ralph-cli

# 检查代码（不构建）
cargo check

# 更新依赖
cargo update
```

### 10.1.3 Feature Flags

```bash
# 启用 recording feature
cargo build --features recording

# 启用多个 features
cargo build --features recording,benchmarks
```

## 10.2 测试框架

### 10.2.1 运行测试

```bash
# 运行所有测试
cargo test

# 运行特定 crate 的测试
cargo test -p ralph-core

# 运行单个测试
cargo test -p ralph-core test_name

# 运行烟雾测试
cargo test -p ralph-core smoke_runner

# 显示测试输出
cargo test -- --nocapture

# 运行测试并显示详细信息
cargo test -- --show-output
```

### 10.2.2 编写测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_example() {
        let result = add(2, 3);
        assert_eq!(result, 5);
    }

    #[test]
    #[should_panic(expected = "error message")]
    fn test_panic() {
        panic!("error message");
    }

    #[tokio::test]
    async fn test_async() {
        let result = async_function().await.unwrap();
        assert!(result);
    }
}
```

### 10.2.3 测试组织

```
crates/
├── ralph-core/
│   ├── src/
│   │   └── module.rs          # 单元测试在模块内部
│   └── tests/
│       └── integration_test.rs # 集成测试在 tests/ 目录
└── ralph-e2e/
    └── scenarios/             # E2E 测试场景
        ├── connect.rs
        └── orchestration.rs
```

## 10.3 代码规范

### 10.3.1 Rust 惯用法

```rust
// 使用 Result 而非 Option 表示错误
pub fn parse_config(path: &Path) -> Result<Config, ConfigError> {
    let content = fs::read_to_string(path)?;
    let config = serde_json::from_str(&content)?;
    Ok(config)
}

// 使用 ? 传播错误
pub fn load_config(path: &Path) -> Result<Config, LoadError> {
    let content = fs::read_to_string(path)?; // ? 自动转换错误类型
    Ok(serde_json::from_str(&content)?)
}

// 使用 Into trait 提供灵活性
pub fn send_message<T: Into<String>>(message: T) {
    let msg: String = message.into();
    // ...
}
```

### 10.3.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| **结构体** | PascalCase | `Config`, `EventLoop` |
| **枚举** | PascalCase | `TaskStatus`, `ErrorKind` |
| **函数** | snake_case | `load_config`, `send_message` |
| **常量** | SCREAMING_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| **模块** | snake_case | `event_loop`, `memory_store` |

### 10.3.3 文档注释

```rust
/// Load configuration from a file.
///
/// # Arguments
///
/// * `path` - Path to the configuration file
///
/// # Returns
///
/// Returns `Ok(Config)` if the file exists and is valid.
/// Returns `Err(ConfigError)` if the file cannot be read or parsed.
///
/// # Examples
///
/// ```no_run
/// use ralph_core::Config;
///
/// let config = Config::load("ralph.yml").unwrap();
/// ```
///
/// # Errors
///
/// This function will return an error if:
/// - The file does not exist
/// - The file is not valid YAML
/// - Required fields are missing
pub fn load_config(path: &Path) -> Result<Config, ConfigError> {
    // ...
}
```

### 10.3.4 Lint 配置

```toml
# Cargo.toml
[lints]
workspace = true

[workspace.lints.clippy]
# Clippy lints
unwrap_used = "warn"
expect_used = "warn"
panic = "warn"
unimplemented = "warn"

[workspace.lints.rust]
# Rust lints
missing_docs = "warn"
rust_2018_idioms = "warn"
unused_lifetimes = "warn"
```

## 10.4 贡献指南

### 10.4.1 提交流程

1. **Fork 仓库**
   ```bash
   # Fork https://github.com/mikeyobrien/ralph-orchestrator
   git clone https://github.com/YOUR_USERNAME/ralph-orchestrator.git
   cd ralph-orchestrator
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **进行更改**
   ```bash
   # 编写代码
   # 添加测试
   # 更新文档
   ```

4. **运行测试**
   ```bash
   cargo test
   cargo clippy
   cargo fmt --check
   ```

5. **提交更改**
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

6. **推送到 Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **创建 Pull Request**
   - 访问 GitHub 仓库
   - 点击 "New Pull Request"
   - 填写 PR 模板

### 10.4.2 提交消息规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**类型：**
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更改
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 添加测试
- `chore`: 构建/工具更改

**示例：**
```
feat(adapters): add support for Gemini backend

- Implement GeminiStreamParser
- Add auto-detection for gemini CLI
- Update documentation

Closes #123
```

### 10.4.3 PR 模板

```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
- [ ] Added/updated tests if applicable
```

## 10.5 调试技巧

### 10.5.1 日志

```bash
# 启用详细日志
RUST_LOG=debug ralph run -p "your prompt"

# 启用跟踪日志
RUST_LOG=trace ralph run -p "your prompt"

# 启用特定模块的日志
RUST_LOG=ralph_core::event_loop=debug ralph run -p "your prompt"
```

### 10.5.2 诊断模式

```bash
# 启用诊断
RALPH_DIAGNOSTICS=1 ralph run -p "your prompt"

# 查看诊断数据
jq 'select(.type == "tool_call")' .ralph/diagnostics/*/agent-output.jsonl
jq 'select(.hat != null)' .ralph/diagnostics/*/orchestration.jsonl
```

### 10.5.3 LLDB/GDB

```bash
# 使用 LLDB 调试（macOS）
cargo build
lldb target/debug/ralph
(lldb) run run -p "your prompt"
(lldb) bt  # 查看堆栈

# 使用 GDB 调试（Linux）
cargo build
gdb target/debug/ralph
(gdb) run run -p "your prompt"
(gdb) bt  # 查看堆栈
```

### 10.5.4 VS Code 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "lldb",
      "request": "launch",
      "name": "Debug ralph",
      "cargo": {
        "args": ["build", "--bin=ralph"],
        "filter": {
          "name": "ralph",
          "kind": "bin"
        }
      },
      "args": ["run", "-p", "your prompt"],
      "cwd": "${workspaceFolder}",
      "env": {
        "RUST_LOG": "debug",
        "RALPH_DIAGNOSTICS": "1"
      }
    }
  ]
}
```

## 10.6 性能优化

### 10.6.1 Benchmark 测试

```bash
# 运行基准测试
cargo bench -p ralph-bench

# 运行特定基准测试
cargo bench -p ralph-bench -- test_name
```

### 10.6.2 编写 Benchmark

```rust
// benches/example.rs
use criterion::{black_box, criterion_group, criterion_main, Criterion};

fn fibonacci(n: u64) -> u64 {
    match n {
        0 => 1,
        1 => 1,
        _ => fibonacci(n - 1) + fibonacci(n - 2),
    }
}

fn criterion_benchmark(c: &mut Criterion) {
    c.bench_function("fib 20", |b| b.iter(|| fibonacci(black_box(20))));
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
```

### 10.6.3 Profiling

```bash
# 使用 flamegraph（macOS/Linux）
cargo install flamegraph
cargo flamegraph --bin ralph -- run -p "your prompt"

# 使用 perf（Linux）
perf record -g cargo run --bin ralph -- run -p "your prompt"
perf report
```

## 10.7 发布流程

### 10.7.1 版本号

Ralph 遵循语义化版本（SemVer）：

```
MAJOR.MINOR.PATCH

示例：2.5.0
- MAJOR: 2（不兼容的 API 更改）
- MINOR: 5（向后兼容的功能新增）
- PATCH: 0（向后兼容的问题修复）
```

### 10.7.2 发布步骤

1. **更新版本号**
   ```bash
   # 更新 Cargo.toml
   vim Cargo.toml
   # version = "2.6.0"
   ```

2. **更新 CHANGELOG**
   ```markdown
   ## [2.6.0] - 2024-02-09

   ### Added
   - Support for new backend

   ### Fixed
   - Bug in event parsing

   ### Changed
   - Improved error messages
   ```

3. **创建 Git 标签**
   ```bash
   git add .
   git commit -m "chore: bump version to 2.6.0"
   git tag -a v2.6.0 -m "Release v2.6.0"
   git push origin main --tags
   ```

4. **发布到 crates.io**
   ```bash
   cargo publish
   ```

## 10.8 资源链接

### 10.8.1 官方资源

- **GitHub**: https://github.com/mikeyobrien/ralph-orchestrator
- **文档**: https://docs.rs/ralph-orchestrator
- **crates.io**: https://crates.io/crates/ralph-orchestrator

### 10.8.2 相关项目

- **Rust**: https://www.rust-lang.org/
- **Tokio**: https://tokio.rs/
- **Clap**: https://github.com/clap-rs/clap
- **Ratatui**: https://github.com/ratatui-org/ratatui
- **Teloxide**: https://github.com/teloxide/teloxide

### 10.8.3 学习资源

- **Rust Book**: https://doc.rust-lang.org/book/
- **Rust by Example**: https://doc.rust-lang.org/rust-by-example/
- **Async Rust**: https://rust-lang.github.io/async-book/
- **Cargo Guide**: https://doc.rust-lang.org/cargo/

## 10.9 小结

本章介绍了 Ralph 的开发指南：

1. **构建系统** - Cargo workspace 管理、构建命令、Feature flags。

2. **测试框架** - 运行测试、编写测试、测试组织。

3. **代码规范** - Rust 惯用法、命名规范、文档注释、Lint 配置。

4. **贡献指南** - 提交流程、提交消息规范、PR 模板。

5. **调试技巧** - 日志、诊断模式、LLDB/GDB、VS Code 调试配置。

6. **性能优化** - Benchmark 测试、编写 Benchmark、Profiling。

7. **发布流程** - 版本号、发布步骤。

8. **资源链接** - 官方资源、相关项目、学习资源。

这些指南帮助开发者快速上手 Ralph 的开发和贡献。

---

**上一章**：[第9章：高级主题](09-advanced-topics.md) | **下一章**：[第11章：API 参考](11-api-reference.md)
