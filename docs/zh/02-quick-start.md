# 第2章：快速开始

## 2.1 安装 Ralph

### 2.1.1 系统要求

在安装 Ralph 之前，请确保您的系统满足以下要求：

| 要求 | 版本/说明 |
|------|----------|
| 操作系统 | macOS、Linux、Windows (WSL2) |
| Node.js | >= 18.0.0 |
| Git | 推荐使用 |
| AI CLI 工具 | 至少一个（见下文） |

### 2.1.2 安装 AI CLI 工具

Ralph 需要至少一个 AI CLI 工具作为后端。推荐使用 Claude Code：

**Claude Code（推荐）**

```bash
# 通过 npm 安装
npm install -g @anthropic-ai/claude-code

# 验证安装
claude --version
```

**其他支持的 AI CLI 工具**

| 工具 | 安装命令 |
|------|----------|
| Gemini CLI | `npm install -g @google/gemini-cli` |
| Copilot CLI | `npm install -g @github/copilot` |
| Kiro | 访问 https://kiro.dev/ |
| Codex | 访问 https://github.com/openai/codex |

### 2.1.3 安装 Ralph

**方式一：通过 npm（推荐）**

```bash
# 全局安装
npm install -g @ralph-orchestrator/ralph-cli

# 或使用 npx 直接运行
npx @ralph-orchestrator/ralph-cli --version
```

**方式二：通过 Homebrew（macOS）**

```bash
brew install ralph-orchestrator
```

**方式三：通过 Cargo（需要 Rust）**

```bash
cargo install ralph-cli
```

**方式四：从源码安装**

```bash
# 克隆仓库
git clone https://github.com/mikeyobrien/ralph-orchestrator.git
cd ralph-orchestrator

# 构建发布版本
cargo build --release

# 添加到 PATH
export PATH="$PATH:$(pwd)/target/release"

# 或创建符号链接
sudo ln -s $(pwd)/target/release/ralph /usr/local/bin/ralph
```

### 2.1.4 验证安装

```bash
# 检查版本
ralph --version

# 显示帮助
ralph --help

# 列出可用预设
ralph init --list-presets

# 运行环境检查（推荐）
ralph doctor
```

运行 `ralph doctor` 会检查您的环境并报告任何问题。修复所有 **WARN** 或 **FAIL** 项后再继续。

## 2.2 第一个 Ralph 任务

### 2.2.1 初始化项目

```bash
# 创建项目目录
mkdir my-ralph-project
cd my-ralph-project

# 初始化 Git（Ralph 与 Git 配合最佳）
git init

# 创建 Ralph 配置文件
ralph init --backend claude
```

这会在您的项目中创建 `ralph.yml` 配置文件。

### 2.2.2 配置 Ralph

编辑 `ralph.yml`：

```yaml
# 后端配置
backend:
  type: claude
  model: claude-sonnet-4-5-20250929

# 循环配置
loop:
  max_iterations: 100
  max_duration_minutes: 240

# 记忆和任务
memories:
  enabled: true

tasks:
  enabled: true

# RObot 人机交互（可选）
RObot:
  enabled: false
```

### 2.2.3 运行第一个任务

**方式一：命令行直接运行**

```bash
ralph run -p "创建一个计算斐波那契数列的 Python 函数，包含单元测试"
```

**方式二：使用 PROMPT.md 文件**

创建 `PROMPT.md`：

```markdown
# 任务：创建待办事项 CLI 工具

使用 Rust 构建一个命令行待办事项工具，包含以下功能：
- 添加任务
- 列出所有任务
- 标记任务完成
- 将数据保存到 JSON 文件

需要包含错误处理和单元测试。
```

然后运行：

```bash
ralph run
```

### 2.2.4 理解输出

Ralph 运行时会显示一个 TUI（终端用户界面），包含：

- 当前迭代次数
- 已运行时间
- 当前激活的 hat（如果使用基于 hat 的模式）
- 最近的代理输出

Ralph 在以下情况停止：

- 输出 `LOOP_COMPLETE`（成功）
- 达到最大迭代次数（默认：100）
- 超过最大运行时间（默认：4 小时）
- 用户退出 TUI

完成后，查看项目目录中的生成文件和 `.agent/` 运行日志。

## 2.3 命令行选项

### 2.3.1 常用选项

```bash
# 限制迭代次数
ralph run --max-iterations 50

# 使用不同的配置文件
ralph run -c custom-ralph.yml

# 恢复中断的会话
ralph run --continue

# 安静模式（适用于 CI）
ralph run -q

# 指定后端
ralph run --backend claude
```

### 2.3.2 命令参考

| 命令 | 描述 |
|------|------|
| `ralph --version` | 显示版本 |
| `ralph --help` | 显示帮助 |
| `ralph doctor` | 检查环境 |
| `ralph init` | 初始化项目 |
| `ralph init --list-presets` | 列出预设 |
| `ralph run` | 运行任务 |
| `ralph plan` | 规划功能 |
| `ralph tui` | 启动 TUI |
| `ralph web` | 启动 Web 仪表板 |
| `ralph loops` | 管理循环 |
| `ralph bot` | 机器人命令 |

## 2.4 示例任务

### 2.4.1 简单函数

```markdown
编写一个验证电子邮件地址的 TypeScript 函数。
包含单元测试。
```

### 2.4.2 网络爬虫

```markdown
创建一个网络爬虫：
1. 获取 Hacker News 首页
2. 提取前 10 条新闻
3. 保存到 JSON

使用 Node.js 和简单的 HTML 解析器。
```

### 2.4.3 CLI 工具

```markdown
构建一个 Markdown 到 HTML 的转换器：
- 接受输入/输出文件参数
- 支持基本 Markdown 语法
- 添加 --watch 模式
```

## 2.5 下一步

现在您已经了解了 Ralph 的基本用法，可以：

- 阅读 [第3章：核心概念](03-core-concepts.md) 深入了解编排循环、事件系统、帽子系统等核心概念
- 探索 [指南](../guide/index.md) 了解配置、预设、后端等高级用法
- 查看 [API 参考](../api/index.md) 了解完整的 CLI 和配置选项

---

**上一章**：[第1章：项目概述](01-overview.md) | **下一章**：[第3章：核心概念](03-core-concepts.md)
