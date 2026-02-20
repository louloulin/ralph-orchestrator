# 安装

本指南介绍 Ralph Orchestrator 的所有安装方式。

## 前置要求

### AI CLI 工具

Ralph 需要至少一个 AI CLI 工具才能运行。请安装以下工具之一：

=== "Claude Code（推荐）"

    ```bash
    # 通过 npm 安装
    npm install -g @anthropic-ai/claude-code

    # 或访问 https://claude.ai/code 获取设置说明
    ```

=== "Kiro"

    ```bash
    # 访问 https://kiro.dev/ 获取安装说明
    ```

=== "Gemini CLI"

    ```bash
    npm install -g @google/gemini-cli
    ```

=== "Codex"

    ```bash
    # 访问 https://github.com/openai/codex
    ```

=== "Amp"

    ```bash
    # 访问 https://github.com/sourcegraph/amp
    ```

=== "Copilot CLI"

    ```bash
    npm install -g @github/copilot
    ```

=== "OpenCode"

    ```bash
    curl -fsSL https://opencode.ai/install | bash
    ```

## 安装 Ralph

### 通过 npm 安装（推荐）

安装 Ralph 最简单的方式：

```bash
# 全局安装
npm install -g @ralph-orchestrator/ralph-cli

# 或使用 npx 直接运行
npx @ralph-orchestrator/ralph-cli --version
```

### 通过 Homebrew 安装（macOS）

```bash
brew install ralph-orchestrator
```

### 通过 Cargo 安装

如果您已安装 Rust：

```bash
cargo install ralph-cli
```

### 从源码构建

获取最新开发版本：

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

## 验证安装

```bash
# 检查版本
ralph --version

# 显示帮助
ralph --help

# 列出可用的预设配置
ralph init --list-presets
```

## 从 v1 版本迁移（旧版）

如果您已安装旧版 Ralph v1，请先卸载：

```bash
# 如果通过 pip 安装
pip uninstall ralph-orchestrator

# 如果通过 pipx 安装
pipx uninstall ralph-orchestrator

# 如果通过 uv 安装
uv tool uninstall ralph-orchestrator

# 验证已卸载
which ralph  # 应该不返回任何内容，或指向新的 Rust 版本
```

v1 版本已不再维护。详情请参阅 [从 v1 迁移](../reference/migration-v1.md)。

## 故障排除

### 命令未找到

如果安装后找不到 `ralph` 命令：

```bash
# 对于 npm 全局安装，确保 npm bin 目录在 PATH 中
export PATH="$PATH:$(npm config get prefix)/bin"

# 对于 cargo 安装
export PATH="$PATH:$HOME/.cargo/bin"
```

### 未检测到 AI 代理

Ralph 会自动检测可用的 AI CLI 工具。如果未找到任何工具：

1. 安装受支持的 AI CLI 工具之一（参见前置要求）
2. 确保工具在您的 PATH 中
3. 尝试直接运行 AI CLI 以验证其是否正常工作

### 权限被拒绝

如果遇到权限错误：

```bash
# 对于 npm
sudo npm install -g @ralph-orchestrator/ralph-cli

# 对于符号链接
sudo ln -s $(pwd)/target/release/ralph /usr/local/bin/ralph
```

## 下一步

Ralph 安装完成后，请继续阅读 [快速入门](quick-start.md) 指南。
