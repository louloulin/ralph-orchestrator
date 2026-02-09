# 第1章：项目概述

## 1.1 什么是 Ralph Orchestrator

**Ralph Orchestrator** 是一个基于 Rust 编写的多智能体编排框架（Multi-agent orchestration framework），它实现了 [Ralph Wiggum 技术](https://ghuntley.com/ralph/)——通过持续迭代实现自主任务完成。

Ralph 这个名字来源于《辛普森一家》中的角色 Ralph Wiggum，他以天真但充满热情的方式学习和执行任务。框架的设计哲学是：让 AI 智能体在循环中持续工作，直到任务完成，而不是期望一次交互就能解决复杂问题。

> "Me fail English? That's unpossible!" - Ralph Wiggum

## 1.2 核心特性

### 1.2.1 多后端支持

Ralph 支持多种 AI 后端，让您可以选择最适合的工具：

| 后端 | 描述 |
|------|------|
| **Claude Code** | Anthropic 的 Claude 代码助手 |
| **Kiro** | Kiro 代码助手 |
| **Gemini CLI** | Google Gemini 命令行工具 |
| **Codex** | OpenAI Codex |
| **Amp** | Amp 代码编辑器 |
| **Copilot CLI** | GitHub Copilot 命令行 |
| **OpenCode** | OpenCode 框架 |

### 1.2.2 帽子系统（Hat System）

Ralph 使用**帽子系统**来组织不同的专业角色。每个"帽子"代表一个特定的专业领域或角色：

- **Writer** - 负责编写文档和代码
- **Reviewer** - 负责审查和验证
- **Planner** - 负责规划和设计
- 等等...

帽子之间通过**事件系统**进行协调，实现松耦合的协作。

### 1.2.3 反向压力机制（Backpressure）

Ralph 使用反向压力来确保工作质量，而不是预设详细的执行步骤。系统通过以下"闸门"来拒绝不合格的工作：

- **测试** - 所有测试必须通过
- **类型检查** - 代码必须通过类型检查
- **构建** - 项目必须成功构建
- **审计** - 安全检查必须通过
- **LLM 评估** - 对于主观标准，使用 LLM 作为评判者

### 1.2.4 记忆与任务系统

- **记忆（Memories）** - 持久化学习，跨会话保留代码库模式和约定
- **任务（Tasks）** - 运行时工作跟踪，管理进行中的工作项

### 1.2.5 31 种预设模式

Ralph 提供 31 种预设（Presets），涵盖不同的工作模式：

- **TDD** - 测试驱动开发
- **Spec-driven** - 规范驱动开发
- **Debugging** - 调试模式
- 等等...

## 1.3 系统架构

### 1.3.1 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Ralph Orchestrator                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  ralph-cli   │  │  ralph-tui   │  │ ralph-tele- │  │   ralph-web  │   │
│  │   (CLI)      │  │   (TUI)      │  │   gram      │  │  (Dashboard) │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │           │
│         └─────────────────┴─────────┬───────┴─────────────────┘           │
│                                     │                                     │
│                         ┌───────────▼───────────┐                         │
│                         │     ralph-core        │                         │
│                         │  (Orchestration)      │                         │
│                         └───────────┬───────────┘                         │
│                                     │                                     │
│                         ┌───────────▼───────────┐                         │
│                         │   ralph-adapters      │                         │
│                         │  (Backend Clients)    │                         │
│                         └─────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3.2 Crate 结构

Ralph 使用 Rust 的 workspace 结构，包含以下 crates：

| Crate | 描述 |
|-------|------|
| **ralph-core** | 核心编排逻辑、事件循环、帽子、记忆、任务 |
| **ralph-cli** | 命令行界面入口，提供 `ralph` 命令 |
| **ralph-adapters** | 后端适配器（Claude、Kiro、Gemini、Codex 等）|
| **ralph-tui** | 终端用户界面（基于 ratatui）|
| **ralph-telegram** | Telegram 机器人集成，支持人机交互 |
| **ralph-e2e** | 端到端测试框架 |
| **ralph-bench** | 基准测试 |
| **ralph-proto** | 协议定义 |

### 1.3.3 技术栈

| 类别 | 技术 |
|------|------|
| **语言** | Rust (Edition 2024) |
| **异步运行时** | Tokio |
| **序列化** | serde, serde_json, serde_yaml |
| **CLI** | clap |
| **TUI** | ratatui, crossterm |
| **错误处理** | thiserror, anyhow |
| **Tracing** | tracing, tracing-subscriber |

## 1.4 适用场景

### 1.4.1 何时使用 Ralph

Ralph 特别适合以下场景：

1. **复杂开发任务** - 需要多步骤、多文件修改的开发工作
2. **规范驱动开发** - 需要详细设计和规划的功能
3. **持续迭代改进** - 需要反复打磨的代码或文档
4. **多智能体协作** - 需要不同角色（开发、审查、测试）协作的任务
5. **长时间运行的任务** - 需要持续执行直到完成的任务

### 1.4.2 示例用例

```bash
# 规划并实现一个新功能
ralph plan "Add user authentication with JWT"
ralph run -p "Implement the feature in specs/user-authentication/"

# 直接运行简单任务
ralph run -p "Add input validation to the /users endpoint"

# 使用 TUI 界面
ralph tui

# 启动 Web 仪表板
ralph web
```

## 1.5 设计哲学

### 1.5.1 Ralph 十诫

1. **Fresh Context Is Reliability** — 每次迭代都清除上下文。每个循环都重新阅读规范、计划、编码。优化"智能区"（约 176K 可用令牌的 40-60%）。

2. **Backpressure Over Prescription** — 不要规定如何做；创建拒绝不良工作的闸门。测试、类型检查、构建、lint。对于主观标准，使用 LLM 作为评判者，给出通过/失败。

3. **The Plan Is Disposable** — 重新生成计划只需要一个规划循环。便宜。永远不要试图挽救一个计划。

4. **Disk Is State, Git Is Memory** — 记忆和任务传递机制。不需要复杂的协调。

5. **Steer With Signals, Not Scripts** — 代码库就是说明书。当 Ralph 以特定方式失败时，为下次添加一个标记。

6. **Let Ralph Ralph** — 坐在循环上，而不是在循环中。像调吉他一样调整，不要像指挥管弦乐队一样指挥。

### 1.5.2 反模式

- ❌ 在编排器中构建智能体能处理的功能
- ❌ 复杂的重试逻辑（新鲜上下文处理恢复）
- ❌ 详细的逐步指令（使用反向压力代替）
- ❌ 在任务选择时确定工作范围（在计划创建时确定范围）
- ❌ 不验证代码就假设功能缺失

## 1.6 小结

Ralph Orchestrator 是一个强大的多智能体编排框架，它通过以下核心能力帮助开发者更高效地完成复杂任务：

1. **多后端支持** - 灵活选择最适合的 AI 工具
2. **帽子系统** - 专业角色协调协作
3. **反向压力机制** - 质量闸门确保工作质量
4. **记忆与任务系统** - 持久化学习和运行时跟踪
5. **31 种预设模式** - 适应不同工作场景

通过理解 Ralph 的设计哲学和核心概念，开发者可以更有效地使用这个框架来完成复杂的开发任务。

---

**下一章**：[第2章：快速开始](02-quick-start.md) - 学习如何安装和配置 Ralph，运行第一个示例。
