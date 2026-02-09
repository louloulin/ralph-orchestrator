# 第12章：附录

## 12.1 术语表

| 术语 | 英文 | 说明 |
|------|------|------|
| **编排循环** | Orchestration Loop | 持续运行的主循环，协调 AI 智能体完成任务 |
| **帽子** | Hat | 代表特定专业角色的组件（如 Writer、Reviewer） |
| **帽子系统** | Hat System | 用于组织不同专业角色的机制 |
| **反向压力** | Backpressure | 通过质量闸门（测试、类型检查等）拒绝不合格工作 |
| **记忆** | Memory | 持久化存储的代码库模式和约定 |
| **任务** | Task | 运行时工作跟踪项 |
| **事件** | Event | 组件间通信的信号 |
| **事件总线** | Event Bus | 路由事件到订阅者的系统 |
| **工作树** | Worktree | 使用 Git worktree 创建的隔离工作区 |
| **并行循环** | Parallel Loops | 同时运行的多个编排循环 |
| **RObot** | RObot | Ralph 的人机交互功能（Human-in-the-Loop） |
| **完成承诺** | Completion Promise | 表示任务完成的事件或字符串 |
| **预设** | Preset | 预配置的工作模式设置 |
| **诊断** | Diagnostics | 详细记录智能体输出的调试功能 |
| **烟雾测试** | Smoke Test | 基于重放的测试，使用录制的 fixture |
| **E2E 测试** | End-to-End Test | 端到端测试，模拟真实场景 |
| **SOP** | Standard Operating Procedure | 标准作业程序，用于功能规划 |
| **PTY** | Pseudo Terminal | 伪终端，保留富终端特性 |
| **TUI** | Terminal User Interface | 终端用户界面 |

## 12.2 故障排除

### 12.2.1 常见问题

#### 问题：检测不到后端

**症状**：
```
Error: No AI backend found. Please install one of: claude, kiro, gemini, codex
```

**解决方案**：
1. 安装至少一个 AI CLI 工具：
   ```bash
   npm install -g @anthropic-ai/claude-code
   ```

2. 验证安装：
   ```bash
   claude --version
   ```

3. 或在配置中指定后端：
   ```yaml
   backend:
     type: claude
   ```

#### 问题：循环立即退出

**症状**：
```
Loop terminated: max_iterations (0)
```

**解决方案**：
1. 检查是否有 `.ralph/loop.lock` 文件：
   ```bash
   cat .ralph/loop.lock
   ```

2. 如果有残留的锁，删除它：
   ```bash
   rm .ralph/loop.lock
   ```

3. 确保没有其他循环正在运行：
   ```bash
   ralph loops
   ```

#### 问题：配置文件解析失败

**症状**：
```
Error: Failed to parse ralph.yml
```

**解决方案**：
1. 验证 YAML 语法：
   ```bash
   # 使用 yamllint
   yamllint ralph.yml
   ```

2. 检查缩进（YAML 使用空格，不要用 Tab）

3. 查看示例配置：
   ```bash
   ralph init --list-presets
   ```

#### 问题：Telegram Bot 不工作

**症状**：
```
Error: Telegram bot failed to send message
```

**解决方案**：
1. 验证 bot token：
   ```bash
   export RALPH_TELEGRAM_BOT_TOKEN="your-token"
   curl https://api.telegram.org/bot$TOKEN/getMe
   ```

2. 确保 bot 已启动：
   ```bash
   # 给 bot 发送 /start 命令
   ```

3. 检查聊天 ID 是否设置：
   ```bash
   cat .ralph/telegram-state.json
   ```

#### 问题：内存/任务文件损坏

**症状**：
```
Error: Failed to parse .agent/memories.md
```

**解决方案**：
1. 备份文件：
   ```bash
   cp .agent/memories.md .agent/memories.md.backup
   ```

2. 手动修复或删除损坏的条目

3. 或重置文件：
   ```bash
   rm .agent/memories.md
   ralph run  # 会自动创建新文件
   ```

#### 问题：Git 操作失败

**症状**：
```
Error: Git command failed
```

**解决方案**：
1. 检查 Git 是否初始化：
   ```bash
   git status
   ```

2. 如果没有初始化：
   ```bash
   git init
   ```

3. 确保当前分支存在：
   ```bash
   git branch --show-current
   ```

### 12.2.2 调试技巧

#### 启用详细日志

```bash
# 启用 debug 日志
RUST_LOG=debug ralph run -p "your prompt"

# 启用 trace 日志（更详细）
RUST_LOG=trace ralph run -p "your prompt"

# 特定模块
RUST_LOG=ralph_core::event_loop=debug ralph run -p "your prompt"
```

#### 启用诊断

```bash
# 生成诊断文件
RALPH_DIAGNOSTICS=1 ralph run -p "your prompt"

# 查看诊断数据
jq 'select(.type == "tool_call")' .ralph/diagnostics/*/agent-output.jsonl
jq 'select(.hat != null)' .ralph/diagnostics/*/orchestration.jsonl
jq '.error' .ralph/diagnostics/*/errors.jsonl
```

#### 使用 GDB/LLDB

```bash
# Linux (gdb)
cargo build
gdb target/debug/ralph
(gdb) run run -p "your prompt"
(gdb) bt  # 崩溃时查看堆栈

# macOS (lldb)
cargo build
lldb target/debug/ralph
(lldb) run run -p "your prompt"
(lldb) bt  # 崩溃时查看堆栈
```

### 12.2.3 获取帮助

如果问题仍未解决：

1. **查看文档**：https://docs.rs/ralph-orchestrator
2. **搜索 Issues**：https://github.com/mikeyobrien/ralph-orchestrator/issues
3. **创建 Issue**：https://github.com/mikeyobrien/ralph-orchestrator/issues/new
4. **加入社区**：讨论区或 Discord

## 12.3 升级指南

### 12.3.1 从 v2.x 升级到 v2.5.0

#### 新增功能

- ✅ 改进的 UTF-8 字符边界处理
- ✅ 增强的 TUI 状态显示
- ✅ 更好的错误消息

#### 破坏性变更

无

#### 升级步骤

1. **更新 Ralph**：
   ```bash
   cargo install ralph-cli
   # 或
   npm update -g @ralph-orchestrator/ralph-cli
   ```

2. **验证安装**：
   ```bash
   ralph --version
   ```

3. **运行测试**：
   ```bash
   cargo test
   ```

### 12.3.2 从 v1.x 升级到 v2.0

#### 破坏性变更

- 配置文件格式从 TOML 改为 YAML
- 环境变量命名更改
- CLI 命令结构重组

#### 迁移配置

**旧配置 (v1.x, TOML)**：
```toml
[backend]
type = "claude"
model = "claude-sonnet-4-5-20250929"

[loop]
max_iterations = 100
```

**新配置 (v2.x, YAML)**：
```yaml
backend:
  type: claude
  model: claude-sonnet-4-5-20250929

loop:
  max_iterations: 100
```

#### 迁移步骤

1. **备份配置**：
   ```bash
   cp ralph.toml ralph.toml.backup
   ```

2. **转换为 YAML**：
   - 手动转换（参考示例）
   - 或使用预设重新初始化：
     ```bash
     ralph init --preset default
     ```

3. **更新环境变量**：
   ```bash
   # 旧: RALPH_CLAUDE_API_KEY
   # 新: ANTHROPIC_API_KEY（由 Claude CLI 使用）
   ```

4. **测试新配置**：
   ```bash
   ralph run -p "测试提示"
   ```

### 12.3.3 版本兼容性

| Ralph 版本 | Rust 版本 | Node.js 版本 |
|------------|-----------|--------------|
| 2.5.x | 1.70+ | 18+ |
| 2.0.x | 1.70+ | 18+ |
| 1.x | 1.65+ | 16+ |

## 12.4 参考资料

### 12.4.1 官方文档

- **Ralph 文档**：https://docs.rs/ralph-orchestrator
- **GitHub 仓库**：https://github.com/mikeyobrien/ralph-orchestrator
- **crates.io**：https://crates.io/crates/ralph-orchestrator

### 12.4.2 相关技术

- **Rust**：https://www.rust-lang.org/
  - [The Rust Book](https://doc.rust-lang.org/book/)
  - [Rust by Example](https://doc.rust-lang.org/rust-by-example/)
  - [Async Rust](https://rust-lang.github.io/async-book/)

- **Tokio**：https://tokio.rs/
  - [Tokio Documentation](https://tokio.rs/docs/)

- **Clap**：https://github.com/clap-rs/clap
  - [Clap Documentation](https://docs.rs/clap/)

- **Ratatui**：https://github.com/ratatui-org/ratatui
  - [Ratatui Documentation](https://docs.rs/ratatui/)

- **Teloxide**：https://github.com/teloxide/teloxide
  - [Teloxide Documentation](https://docs.rs/teloxide/)

### 12.4.3 AI 工具

- **Claude Code**：https://claude.ai/code
  - [npm package](https://www.npmjs.com/package/@anthropic-ai/claude-code)

- **Gemini CLI**：https://github.com/google/gemini-cli

- **GitHub Copilot CLI**：https://github.com/github/copilot-cli

### 12.4.4 相关文章

- [Introducing Ralph Orchestrator](https://ghuntley.com/ralph/)
- [Human-in-the-Loop AI Orchestration](https://blog.example.com/hitl-orchestration)
- [Building Multi-Agent Systems with Rust](https://blog.example.com/multi-agent-rust)

### 12.4.5 社区资源

- **GitHub Discussions**：https://github.com/mikeyobrien/ralph-orchestrator/discussions
- **Issue Tracker**：https://github.com/mikeyobrien/ralph-orchestrator/issues
- **Discord Server**：（如有）

## 12.5 许可证

Ralph Orchestrator 使用 MIT 许可证：

```
MIT License

Copyright (c) 2024 Ralph Orchestrator contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 12.6 贡献者

感谢所有贡献者使 Ralph Orchestrator 变得更好！

- **Mike O'Brien** - 创建者
- **Contributors** - https://github.com/mikeyobrien/ralph-orchestrator/graphs/contributors

## 12.7 致谢

Ralph Orchestrator 受以下项目启发：

- **Ralph Wiggum** - 技术理念的来源
- **Claude Code** - 主要的后端支持
- **Rust 社区** - 提供优秀的工具和库

## 12.8 小结

本附录提供了：

1. **术语表** - Ralph 中使用的所有重要术语的中英文对照和说明。

2. **故障排除** - 常见问题、调试技巧和获取帮助的方法。

3. **升级指南** - 从旧版本升级的详细步骤，包括配置迁移和兼容性信息。

4. **参考资料** - 官方文档、相关技术、AI 工具、相关文章和社区资源的链接。

5. **许可证** - MIT 许可证全文。

6. **贡献者和致谢** - 感谢所有贡献者及相关项目。

感谢您阅读 Ralph Orchestrator 的完整技术文档！

---

**上一章**：[第11章：API 参考](11-api-reference.md)
