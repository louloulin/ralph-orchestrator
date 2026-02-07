# Ralph 最佳实践指南

> "The orchestrator is a thin coordination layer, not a platform. Agents are smart; let them do the work."

本指南基于对 Ralph 代码库的全面分析，提供实用的最佳实践建议，帮助您高效使用 Ralph 编排器。

---

## 目录

1. [快速开始](#1-快速开始)
2. [选择合适的预设](#2-选择合适的预设)
3. [Prompt 工程技巧](#3-prompt-工程技巧)
4. [任务管理](#4-任务管理)
5. [内存系统](#5-内存系统)
6. [Hat 系统深入](#6-hat-系统深入)
7. [配置优化](#7-配置优化)
8. [调试和监控](#8-调试和监控)
9. [CI/CD 集成](#9-cicd-集成)
10. [常见陷阱](#10-常见陷阱)

---

## 1. 快速开始

### 1.1 基本命令

```bash
# 最简单的使用方式
ralph run -p "Add user authentication"

# 使用特定预设
ralph run --config presets/feature.yml -p "Add user authentication"

# 启用诊断（调试时使用）
RALPH_DIAGNOSTICS=1 ralph run -p "your prompt"

# 查看所有循环
ralph loops

# 启动 Web 仪表板
ralph web
```

### 1.2 项目初始化

```bash
# 在新项目中初始化 Ralph
ralph init

# 这将创建：
# .ralph/ - 配置和数据目录
# .ralph/specs/ - 规格目录
# .ralph/agent/ - 代理状态
# ralph.yml - 配置文件
```

### 1.3 预检查

```bash
# 运行所有预检查
ralph preflight

# 检查特定方面
ralph preflight --check git --check backend --check dependencies
```

---

## 2. 选择合适的预设

Ralph 提供了多种预设，针对不同的工作流程进行了优化：

### 2.1 预设对比表

| 预设 | 用途 | Hats | 最佳场景 |
|------|------|------|---------|
| **feature.yml** | 功能开发 | Builder → Reviewer | 新功能，需要代码审查 |
| **code-assist.yml** | TDD 实现 | Planner → Builder → Validator → Committer | 从 PDD/任务/描述实现 |
| **bugfix.yml** | Bug 修复 | Reproducer → Fixer → Verifier | 系统性的调试和修复 |
| **debug.yml** | 调试 | Investigator → Hypothesis Tester | 使用科学方法调试 |
| **refactor.yml** | 重构 | Refactorer → Validator | 安全的增量重构 |
| **review.yml** | 代码审查 | Reviewer | 不修改代码的审查 |
| **docs.yml** | 文档 | Writer → Editor | 文档编写与质量控制 |
| **research.yml** | 代码探索 | Explorer | 理解代码库，不做更改 |
| **spec-driven.yml** | 规格驱动 | Specifier → Builder → Reviewer | 从规格开始开发 |
| **deploy.yml** | 部署 | Planner → Deployer → Verifier | 生产部署工作流 |

### 2.2 预设使用示例

#### 功能开发

```bash
# 新功能，带内置审查循环
ralph run --config presets/feature.yml \
  -p "Add JWT-based authentication with refresh tokens"

# 适用场景：
# - 新 API 端点
# - 用户功能
# - 需要质量保证的更改
```

#### Bug 修复

```bash
# 系统性 Bug 修复
ralph run --config presets/bugfix.yml \
  -p "Fix: Login timeout after 5 minutes"

# 流程：
# 1. Reproducer - 创建失败测试
# 2. Fixer - 实现最小修复
# 3. Verifier - 验证修复
```

#### 从 PDD 实现

```bash
# 从 Prompt-Driven Design 输出实现
ralph run --config presets/code-assist.yml \
  -p "specs/user-auth"

# 或从单个代码任务
ralph run --config presets/code-assist.yml \
  -p "specs/user-auth/tasks/add-login.md"

# 或从简单描述
ralph run --config presets/code-assist.yml \
  -p "Add a --verbose flag to the CLI"
```

#### 代码探索

```bash
# 理解代码库如何工作
ralph run --config presets/research.yml \
  -p "How does the caching system work?"

# 适用场景：
# - 入队新开发者
# - 理解复杂系统
# - 文档生成
```

### 2.3 自定义预设

```bash
# 复制现有预设作为起点
cp presets/feature.yml my-workflow.yml

# 编辑以添加自定义 hats 或修改行为
# 然后使用：
ralph run --config my-workflow.yml -p "your prompt"
```

---

## 3. Prompt 工程技巧

### 3.1 好的 Prompt 结构

#### ❌ 不好的 Prompt

```
"Fix the login"
"Add auth"
"Make it faster"
```

#### ✅ 好的 Prompt

```
"Add JWT-based authentication to the API

Requirements:
- Email/password login endpoint: POST /auth/login
- JWT token generation with 1-hour expiry
- Refresh token mechanism: POST /auth/refresh
- Password hashing with bcrypt (cost factor 12)
- Rate limiting: 5 attempts per minute

Reference existing patterns in src/auth/ directory
Follow the error handling pattern from src/api/users.rs"
```

### 3.2 Prompt 模板库

#### 功能实现

```
"Implement [feature] following existing patterns in [codebase area]

Key considerations:
- Use [existing pattern] from [file:line]
- Test with [test command]
- Verify with [build command]
- Document any assumptions in memories

Requirements:
1. [Specific requirement 1]
2. [Specific requirement 2]
3. [Acceptance criteria]"
```

#### Bug 修复

```
"Fix: [bug description]

Context:
- Error message: [exact error]
- Steps to reproduce: [steps]
- Expected behavior: [what should happen]
- Actual behavior: [what's happening]

Please:
1. Reproduce the issue with a failing test
2. Identify root cause
3. Implement minimal fix
4. Verify fix resolves the issue
5. Add regression test"
```

#### 重构

```
"Refactor [code area] to improve [quality attribute]

Goals:
- [Specific goal 1: e.g., reduce duplication]
- [Specific goal 2: e.g., improve readability]
- [Specific goal 3: e.g., better error handling]

Constraints:
- Maintain all existing functionality
- Keep all tests passing
- Follow existing codebase patterns
- Document refactoring decisions in .ralph/agent/decisions.md"
```

### 3.3 上下文提供技巧

```bash
# 引用代码库中的具体位置
ralph run -p "Add error handling like src/api/users.rs:45-60"

# 指向相关文档
ralph run -p "Implement following the pattern in docs/api-design.md"

# 使用内存提供上下文
ralph tools memory prime --budget 2000 --tags api
ralph run -p "Add new API endpoint following established patterns"
```

### 3.4 迭代式改进

```bash
# 从粗略描述开始
ralph run -p "Add user search functionality"

# 基于 Ralph 的输出改进
# 如果遗漏了什么，添加具体的下一次迭代：
ralph run -p "Add pagination to user search (max 100 results per page)"

# 或审查代码后：
ralph run --config presets/review.yml \
  -p "Review the user search implementation for security issues"
```

---

## 4. 任务管理

### 4.1 运行时任务 vs 代码任务

Ralph 有两种任务系统：

**运行时任务**（执行期间跟踪）
```bash
ralph tools task list          # 列出所有任务
ralph tools task ready         # 显示可执行任务
ralph tools task add "Setup DB" -p 1
ralph tools task close <id>
```

**代码任务**（实施计划）
```bash
ralph task list                # 列出代码任务
ralph code-task --from specs/my-feature.md
ralph task start <task-id>
```

### 4.2 任务分解最佳实践

#### 大任务分解

```bash
# ❌ 不好：太大的任务
ralph tools task add "Build authentication system" -p 1

# ✅ 好：分解为小任务
ralph tools task add "Design user schema" -p 1
ralph tools task add "Implement password hashing" -p 2 --blocked-by task-1
ralph tools task add "Create login endpoint" -p 2 --blocked-by task-1
ralph tools task add "Add JWT generation" -p 2 --blocked-by task-2
ralph tools task add "Implement refresh tokens" -p 3 --blocked-by task-3
ralph tools task add "Write auth tests" -p 3 --blocked-by task-3,task-4
```

#### 任务大小规则

- **一个任务 = 一个可测试的工作单元**
- **可在 1-2 次迭代中完成**
- **有明确的完成标准**
- **可以独立验证**

### 4.3 优先级管理

```bash
# 优先级 1：关键（最高）
ralph tools task add "Fix security vulnerability" -p 1

# 优先级 3：正常（默认）
ralph tools task add "Add user profile" -p 3

# 优先级 5：低（可以等待）
ralph tools task add "Update color scheme" -p 5
```

### 4.4 依赖管理

```bash
# 创建依赖链
ralph tools task add "Setup database" -p 1
ralph tools task add "Create user model" -p 2 --blocked-by $(ralph tools task list | grep "Setup database" | awk '{print $1}')
ralph tools task add "Build auth API" -p 2 --blocked-by $(ralph tools task list | grep "Create user model" | awk '{print $1}')

# 查看依赖图
ralph tools task list --tree
```

---

## 5. 内存系统

### 5.1 内存类型

| 类型 | 用途 | 示例 |
|------|------|------|
| **pattern** | 代码库如何做事情 | "API handlers return Result<Json<T>, AppError>" |
| **decision** | 为什么选择某方案 | "Chose Postgres over SQLite: needed concurrent writes" |
| **fix** | 重复问题的解决方案 | "ECONNREFUSED: check docker-compose status first" |
| **context** | 项目特定知识 | "Project uses barrel exports in each module" |

### 5.2 创建有效记忆

```bash
# ✅ 好：具体和可操作
ralph tools memory add \
  "API routes use kebab-case naming: /api/user-profile, not /api/userProfile" \
  -t pattern --tags api,naming

ralph tools memory add \
  "Chose Redis for caching: needed distributed caching for multiple instances" \
  -t decision --tags architecture,caching

ralph tools memory add \
  "Docker ECONNREFUSED: Run 'docker-compose up' first" \
  -t fix --tags docker,troubleshooting

# ❌ 不好：模糊和通用
ralph tools memory add "Has good patterns"
ralph tools memory add "Fixed a bug"
```

### 5.3 内存搜索策略

```bash
# 按类型搜索
ralph tools memory search -t pattern "api"
ralph tools memory search -t fix "error"
ralph tools memory search -t decision "database"

# 按标签搜索
ralph tools memory search --tags api,naming

# 组合搜索
ralph tools memory search "auth" --tags api -t pattern

# 查看所有内存
ralph tools memory list
```

### 5.4 内存注入（为上下文优化）

```bash
# 为上下文注入准备内存（Token 预算优化）
ralph tools memory prime --budget 2000

# 只注入特定类型
ralph tools memory prime --budget 2000 -t pattern

# 只注入特定标签
ralph tools memory prime --budget 2000 --tags api
```

### 5.5 决策日志

使用 `.ralph/agent/decisions.md` 记录重要决策：

```markdown
## DEC-001: Choose PostgreSQL over SQLite

**Date**: 2025-02-06
**Confidence**: 85%
**Reversible**: No (high migration cost)

**Alternatives Considered**:
1. SQLite - Chosen for local dev, rejected for production
2. MongoDB - Rejected: too much flexibility, need schema
3. PostgreSQL - ✅ Selected

**Reasoning**:
- Need true concurrent writes (SQLite has limitations)
- Want ACID guarantees for transactions
- Team has PostgreSQL experience
- Good Cloud SQL support

**Impact**: Medium
- Requires database setup in CI/CD
- Slightly higher operational complexity
```

---

## 6. Hat 系统深入

### 6.1 理解 Hats

Hats 是专门的代理，每个都有特定的职责：

```yaml
hats:
  planner:
    name: "📋 Planner"
    triggers: ["task.start"]      # 什么激活这个 hat
    publishes: ["build.task"]     # 这个 hat 发出什么事件
    instructions: |
      # 这个 hat 做什么
```

### 6.2 Hat 工作流模式

#### 顺序工作流

```yaml
# feature.yml 使用这种模式
planner → builder → reviewer

# 事件流：
task.start → build.task → build.done → review.request → review.approved
```

#### 科学方法工作流

```yaml
# bugfix.yml 使用这种模式
reproducer → fixer → verifier

# 事件流：
repro.start → (repro.complete | verification.failed) → fix.complete → verification
```

#### TDD 工作流

```yaml
# code-assist.yml 使用这种模式
planner → builder → validator → committer

# RED → GREEN → REFACTOR → VALIDATE → COMMIT
```

### 6.3 创建自定义 Hats

```yaml
hats:
  security_reviewer:
    name: "🔒 Security Reviewer"
    description: "Reviews code for security vulnerabilities"
    triggers: ["build.done"]
    publishes: ["security.approved", "security.issues_found"]
    instructions: |
      ## SECURITY REVIEW MODE

      Review the implementation for security issues:

      ### Checklist
      - [ ] SQL injection vulnerabilities
      - [ ] XSS vulnerabilities in web output
      - [ ] Authentication bypass
      - [ ] Hardcoded secrets
      - [ ] Input validation
      - [ ] Authorization checks

      ### Event Format
      <event topic="security.approved">
      summary: No security issues found
      checks_passed: 6/6
      </event>

      OR

      <event topic="security.issues_found">
      issues:
        - "User input not sanitized in src/api/users.rs:45"
        - "Missing auth check on src/api/admin.rs:23"
      severity: high
      </event>

      ### DON'T
      - Don't fix issues yourself (that's for Builder)
      - Don't block on style nitpicks
      - Don't assume input is safe
```

### 6.4 Hat 设计原则

1. **单一职责**：每个 hat 做一件事并做好
2. **清晰的事件流**：明确定义触发器和发布
3. **文档化推理**：在记忆中捕获，不在指令中
4. **可测试输出**：hat 应该发出可以验证的事件

---

## 7. 配置优化

### 7.1 环境特定配置

#### 开发配置

```yaml
# ralph.dev.yml
event_loop:
  max_iterations: 200          # 更高的迭代限制
  max_runtime_seconds: 7200    # 2 小时
  checkpoint_interval: 3       # 更频繁的检查点

cli:
  backend: "claude"            # 使用更智能的后端
  prompt_mode: "arg"

core:
  guardrails:
    - "Fresh context each iteration"
    - "Enable debug logging for troubleshooting"
    - "Verbose output for development"
```

#### 生产配置

```yaml
# ralph.prod.yml
event_loop:
  max_iterations: 50           # 更低的迭代限制
  max_runtime_seconds: 3600    # 1 小时
  checkpoint_interval: 5       # 较少但可靠的检查点

cli:
  backend: "kiro"              # 更快的后端
  pty_mode: false              # 无交互

core:
  guardrails:
    - "Strict validation required"
    - "No speculative features"
    - "Automated commit handling"
    - "Minimal logging"
```

### 7.2 后端选择

| 后端 | 最佳用于 | Token 效率 | 速度 |
|------|---------|-----------|------|
| **Claude** | 复杂推理、创造力 | 高（缓存折扣） | 中 |
| **Kiro** | 快速迭代、TDD | 中 | 快 |
| **Gemini** | 多模态任务 | 中 | 中 |
| **Copilot** | GitHub 生态 | 高（GitHub 项目） | 快 |

### 7.3 Token 管理

```yaml
# 保持上下文在"智能区"（40-60% 的可用 tokens）
core:
  max_prompt_tokens: 100000    # Claude Opus 的 200K 的 50%
  max_completion_tokens: 40000  # 留出空间

# 使用内存注入优化
ralph tools memory prime --budget 2000

# 渐进式披露
# Level 1: 仅元数据
# Level 2: 完整指令（相关时）
# Level 3: 额外资源（按需）
```

### 7.4 性能调优

```yaml
# 快速开发模式
event_loop:
  max_iterations: 100
  idle_timeout_secs: 30        # 快速反馈
  checkpoint_interval: 1       # 频繁保存

cli:
  backend: "kiro"              # 更快的迭代
```

```yaml
# 质量保证模式
event_loop:
  max_iterations: 50
  idle_timeout_secs: 120
  checkpoint_interval: 5       # 不太频繁

hats:
  - builder
  - confessor                  # 额外的质量门
  - confession_handler
```

---

## 8. 调试和监控

### 8.1 启用诊断

```bash
# 启用完整诊断
RALPH_DIAGNOSTICS=1 ralph run -p "your prompt"

# 查看诊断输出
ls .ralph/diagnostics/

# 诊断文件结构
.ralph/diagnostics/2026-02-06T12:00:00Z/
├── agent-output.jsonl     # 代理文本和工具调用
├── orchestration.jsonl     # Hat 选择和事件
├── errors.jsonl           # 解析错误和失败
└── logs/                  # 原始日志文件
```

### 8.2 分析诊断数据

```bash
# 查看工具调用
jq 'select(.type == "tool_call")' .ralph/diagnostics/*/agent-output.jsonl

# 查看 hat 选择
jq 'select(.type == "hat_selected")' .ralph/diagnostics/*/orchestration.jsonl

# 查看错误
jq '.' .ralph/diagnostics/*/errors.jsonl

# Token 使用统计
jq '[.prompt_tokens, .completion_tokens] | add' .ralph/diagnostics/*/agent-output.jsonl
```

### 8.3 常见问题排查

#### 循环不终止

```bash
# 检查开放任务
ralph tools task list

# 查看事件流
jq 'select(.type == "event")' .ralph/diagnostics/*/orchestration.jsonl

# 检查任务状态
cat .ralph/agent/tasks.jsonl
```

#### 质量输出差

```bash
# 查看决策历史
cat .ralph/agent/decisions.md

# 检查内存相关性
ralph tools memory list

# 查看 hat 指令
cat ralph.yml | grep -A 20 "hats:"
```

#### 后端问题

```bash
# 测试后端连接
ralph preflight --check backend

# 查看后端配置
cat ralph.yml | grep backend

# 检查 API 密钥
echo $ANTHROPIC_API_KEY
```

### 8.4 Web 仪表板

```bash
# 启动完整堆栈（后端 + 前端）
ralph web

# 访问：
# 前端：http://localhost:5173
# 后端 API：http://localhost:3000

# 仅启动后端
ralph web --server

# 仅启动前端
ralph web --dashboard
```

### 8.5 TUI 模式

```bash
# 自动激活（非无头模式时）
ralph run -p "your prompt"

# 强制 TUI
ralph run --no-tui false

# 自主模式（无 TUI）
ralph run --autonomous

# TUI 功能：
# - 实时事件监控
# - 任务进度跟踪
# - 内存浏览
# - 交互式控件
```

---

## 9. CI/CD 集成

### 9.1 GitHub Actions

```yaml
# .github/workflows/ralph.yml
name: Ralph Orchestration
on:
  push:
    branches: [main]
  pull_request:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run preflight checks
        run: cargo run --bin ralph -- preflight

      - name: Run smoke tests
        run: cargo test -p ralph-core smoke_runner

      - name: Run E2E tests (mock)
        run: cargo run -p ralph-e2e -- --mock

  feature-workflow:
    needs: validate
    runs-on: ubuntu-latest
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Run feature development
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cargo run --bin ralph -- run \
            --config presets/feature.yml \
            --prompt "Implement feature based on PR #${{ github.event.pull_request.number }}"
```

### 9.2 Pre-commit Hook

```bash
# .git/hooks/pre-commit
#!/bin/bash
echo "Running Ralph pre-commit check..."

cargo run --bin ralph -- run \
  --config presets/review.yml \
  --prompt "Review staged changes for obvious issues" \
  --max-iterations 5

exit $?
```

### 9.3 Docker 集成

```dockerfile
# Dockerfile
FROM rust:1.70 as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates
COPY --from=builder /app/target/release/ralph /usr/local/bin/
ENTRYPOINT ["ralph"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  ralph:
    build: .
    volumes:
      - .:/workspace
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    working_dir: /workspace
```

### 9.4 Telegram Bot 集成

```yaml
# ralph.yml
RObot:
  enabled: true
  timeout_seconds: 300
  telegram:
    bot_token: "${RALPH_TELEGRAM_BOT_TOKEN}"

# 环境变量
export RALPH_TELEGRAM_BOT_TOKEN="your-bot-token"

# 可用命令：
# /status - 当前循环状态
# /tasks - 开放任务
# /memories - 最近记忆
# /tail - 最后 20 个事件
# /restart - 重启循环
# /stop - 停止循环
```

---

## 10. 常见陷阱

### 10.1 Token 管理

#### ❌ 上下文腐烂

```bash
# 问题：每次迭代都添加上下文，导致 token 溢出
# 结果：性能下降，质量降低

# ✅ 解决方案：Fresh Context 原则
core:
  guardrails:
    - "Fresh context each iteration - save learnings to memories"
```

#### ✅ 正确的 Token 预算

```yaml
# 保持上下文在"智能区"（40-60% 的可用 tokens）
core:
  max_prompt_tokens: 100000    # 200K 的 50%
  max_completion_tokens: 40000  # 留出空间
```

### 10.2 任务管理

#### ❌ 过于宽泛的任务

```bash
# 问题：太大，无法在一次迭代中完成
ralph tools task add "Build authentication system"

# ✅ 分解为小任务
ralph tools task add "Design user schema" -p 1
ralph tools task add "Implement password hashing" -p 2 --blocked-by task-1
ralph tools task add "Create login endpoint" -p 2 --blocked-by task-1
```

#### ✅ 正确的任务大小

- **一个任务 = 一个可测试的工作单元**
- **可在 1-2 次迭代中完成**
- **有明确的完成标准**

### 10.3 验证失败

#### ❌ 跳过验证

```bash
# 问题：不运行测试导致错误累积
# 结果：技术债务，后续失败

# ✅ 在 hat 指令中强制验证
builder:
  instructions: |
    1. Write tests first (RED phase)
    2. Implement minimal code to pass tests (GREEN phase)
    3. Refactor while keeping tests green
    4. Run: cargo test && cargo build && cargo clippy
    5. Only publish build.done after all pass
```

### 10.4 内存管理

#### ❌ 创建太多低信号记忆

```bash
# 问题：太多通用记忆，搜索困难
ralph tools memory add "Has good patterns"
ralph tools memory add "Fixed a bug"

# ✅ 创建具体、可搜索的记忆
ralph tools memory add \
  "API handlers use kebab-case: /api/user-profile" \
  -t pattern --tags api,naming

ralph tools memory add \
  "ECONNREFUSED: Run 'docker-compose up' first" \
  -t fix --tags docker,troubleshooting
```

#### ✅ 正确的内存创建

- **为有价值的发现创建记忆**
- **使用具体的、可搜索的文本**
- **使用相关的标签**
- **选择正确的类型**

### 10.5 Prompt 模糊

#### ❌ 模糊的 Prompt

```bash
# 问题：Ralph 不知道具体要做什么
ralph run -p "Fix the login"

# ✅ 具体的 Prompt
ralph run -p "Fix: Login times out after 5 minutes of inactivity

Context:
- Error: 'Connection timed out'
- Expected: Session should last 1 hour
- Current: Session expires after 5 minutes

Please:
1. Reproduce with a failing test
2. Identify root cause
3. Implement minimal fix
4. Verify fix works"
```

---

## 11. 高级模式

### 11.1 并行循环

```bash
# 终端 1：主循环（工作区根目录）
ralph run -p "Add header before <p>" --max-iterations 5

# 终端 2：工作树循环（隔离）
cd $(mktemp -d) && git init
ralph run -p "Add footer after </p>" --max-iterations 5

# 监控：
ralph loops
ralph loops --watch
```

### 11.2 自定义事件流

```yaml
hats:
  investigator:
    triggers: ["debug.start", "hypothesis.rejected"]
    publishes: ["hypothesis.test", "fix.propose"]

  tester:
    triggers: ["hypothesis.test"]
    publishes: ["hypothesis.confirmed", "hypothesis.rejected"]

  fixer:
    triggers: ["fix.propose", "fix.failed"]
    publishes: ["fix.applied", "fix.blocked"]
```

### 11.3 置信度协议

```yaml
# 在 hat 指令中使用
instructions: |
  当遇到模糊性或必须在方法之间选择时：

  **>80 置信度**：自主进行

  **50-80 置信度**：进行，但在 .ralph/agent/decisions.md 中记录

  **<50 置信度**：选择最安全的默认值并记录

  **安全默认偏好**：
  - 可逆 > 不可逆
  - 添加 > 破坏
  - 窄范围 > 宽范围
  - 现有模式 > 新方法
  - 显式 > 隐式
```

### 11.4 错误捕获

```bash
# 命令失败时
ralph tools memory add \
  "failure: cmd=cargo test, exit=101, error=test panicked, next=fix test" \
  -t fix --tags testing,error-handling

ralph tools task add "Fix: failing user auth test" -p 2
```

---

## 12. 成功指标

### 12.1 性能指标

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| Token 效率 | 保持在智能区（40-60%） | `ralph tools memory prime --budget N` |
| 任务完成率 | >80% 无人工干预 | `ralph tools task list` |
| 质量门通过率 | >90% 的实施通过验证 | 检查 commit 历史 |
| 内存相关性 | >70% 的搜索相关 | 搜索结果质量 |

### 12.2 质量指标

| 指标 | 目标 |
|------|------|
| 测试覆盖率 | >80% |
| 文档完整性 | >90% |
| Bug 密度 | <0.5/KLOC |

### 12.3 用户体验指标

| 指标 | 目标 |
|------|------|
| 设置时间 | 5 分钟 |
| 首次成功迭代 | 60% |
| TUI 响应性 | 优秀 |

---

## 13. 快速参考

### 13.1 常用命令

```bash
# 运行 Ralph
ralph run -p "your prompt"
ralph run --config presets/feature.yml -p "your prompt"
RALPH_DIAGNOSTICS=1 ralph run -p "your prompt"

# 任务管理
ralph tools task list
ralph tools task ready
ralph tools task add "Task description" -p 1
ralph tools task close <task-id>

# 内存管理
ralph tools memory list
ralph tools memory add "Pattern description" -t pattern --tags tag1,tag2
ralph tools memory search "keyword"
ralph tools memory prime --budget 2000

# 循环管理
ralph loops
ralph loops stop <loop-id>

# Web 仪表板
ralph web

# 诊断
ralph preflight
ralph preflight --check git --check backend
```

### 13.2 预设速查表

| 预设 | 用途 | 命令 |
|------|------|------|
| feature | 新功能 + 审查 | `ralph run --config presets/feature.yml -p "..."` |
| code-assist | TDD 实现 | `ralph run --config presets/code-assist.yml -p "..."` |
| bugfix | Bug 修复 | `ralph run --config presets/bugfix.yml -p "Fix: ..."` |
| debug | 调试 | `ralph run --config presets/debug.yml -p "Debug: ..."` |
| refactor | 重构 | `ralph run --config presets/refactor.yml -p "Refactor: ..."` |
| review | 代码审查 | `ralph run --config presets/review.yml -p "Review: ..."` |
| docs | 文档 | `ralph run --config presets/docs.yml -p "Document: ..."` |
| research | 代码探索 | `ralph run --config presets/research.yml -p "How does ... work?"` |

### 13.3 内存类型速查表

| 类型 | 用途 | 示例 |
|------|------|------|
| pattern | 代码库模式 | "API handlers return Result<Json<T>, AppError>" |
| decision | 为什么选择 | "Chose Postgres: needed concurrent writes" |
| fix | 问题解决方案 | "ECONNREFUSED: check docker-compose first" |
| context | 项目知识 | "Project uses barrel exports in each module" |

### 13.4 事件命名约定

```
# 命名模式：
<domain>.<action>.<state>

# 示例：
build.task         # 请求构建任务
build.done         # 构建完成
build.blocked      # 构建被阻塞
review.request     # 请求审查
review.approved    # 审查批准
review.changes_requested  # 需要更改
```

---

## 14. 总结

### Ralph 核心原则回顾

1. **Fresh Context Is Reliability** — 每次迭代清空上下文
2. **Backpressure Over Prescription** — 使用质量门而非指令
3. **The Plan Is Disposable** — 计划可以重新生成
4. **Disk Is State, Git Is Memory** — 文件是真相
5. **Steer With Signals, Not Scripts** — 添加信号而非步骤
6. **Let Ralph Ralph** — 坐在循环之上，不在其中

### 关键成功因素

1. **选择合适的预设** — 针对工作流程优化
2. **编写具体的 Prompt** — 明确的要求和验收标准
3. **维护良好的记忆** — 具体的、可搜索的知识
5. **使用质量门** — 验证是强制性的
6. **监控性能** — Token 效率和完成率
7. **迭代改进** — 基于结果优化 Prompt 和配置

### 下一步

1. **从简单开始** — 使用预设，不要过度配置
2. **测量一切** — 使用诊断了解性能
3. **渐进改进** — 基于结果迭代优化
4. **分享学习** — 使用记忆系统捕获知识

Ralph 是一个" thin coordination layer"—让 AI 代理做工作，而 Ralph 管理流程、处理 backpressure，并通过 hat 系统和验证门维护质量。

---

**参考资源**

- [Ralph 文档](https://github.com/mikeyobrien/ralph-orchestrator)
- [Ralph Wiggum 技术原文](https://ghuntley.com/ralph/)
- [Rust 异步编程](https://rust-lang.github.io/async-book/)
- [Tokio 文档](https://tokio.rs/)

**版本**: 1.0
**最后更新**: 2025-02-06
**维护者**: Ralph 社区
