# Changelog

All notable changes to ralph-orchestrator are documented here.

## [2.6.0] - 2026-02-25

### Added

- Rust RPC v1 control plane and web client migration to the new RPC contract.
- Shell completions support for `ralph` CLI.
- `fresh-eyes` preset with enforced review passes.

### Fixed

- Hat display no longer gets stuck on the previous iteration's hat.
- UTF-8 safe truncation to prevent panics on multi-byte characters.
- Hat-level backend shorthand `args` is honored for custom hats (including OpenCode).
- Deprecated `project.*` config keys now fail fast with a clear migration hint to `core.*`.

## [2.5.1] - 2026-02-14

### 新增 (Added)

- **Shell 补全支持**：新增 `ralph completions <SHELL>` 命令，支持生成 bash、zsh、fish 和 PowerShell 的自动补全脚本
- **Fresh-Eyes 预设**：新增强制审查轮次的预设配置，确保代码经过多轮独立审查
- **Teams 标志**：`ralph plan --teams` 和 `ralph code-task --teams` 支持 Claude Code 的实验性 Agent Teams 功能，实现并行研究和对抗性设计审查
- **后端 Pi 流可见性增强**：改进 Pi 后端的流事件可见性和配置，支持 provider/model 跟踪显示

### 修复 (Fixed)

- **UTF-8 安全字符串截断**：修复多字节字符（中文、emoji）导致的字符串截断崩溃问题（#169）
- **确定性 Hat 选择**：将 HashMap 改为 BTreeMap 确保 hat 选择顺序确定（按字母排序），修复 default_publishes 注入逻辑（#157）

### 变更 (Changed)

- **Homebrew 安装说明**：更新支持 Linux 平台
- **Pre-commit 钩子**：与 CI 检查对齐并修复格式问题
- **版本发布**：v2.5.1 版本发布

## [2.3.0] - 2025-01-28

### Added

- **Web Dashboard (Alpha)**: Full-featured web UI for monitoring and managing Ralph orchestration loops
  - React + Vite + TailwindCSS frontend with Fastify + tRPC + SQLite backend
  - `ralph web` command to launch both servers (backend:3000, frontend:5173)
  - Preflight checks and auto-install for fresh installs
  - Port conflict detection, labeled output, and automatic browser open
  - Node 22 pinned for backend dev with tsc+node compilation
- **Hats CLI**: Topology visualization and AI-powered diagrams (`ralph hats`)
- **Event Publishing Guide**: Skip topology display when a hat is already active
- **Parallel config gate**: `features.parallel` config option to control worktree spawning
- **Per-hat backend args**: `args` support in hat-level backend configurations
- **New presets**: Additional presets and improved workflow patterns
- **Documentation**: Reorganized docs with governance files and enhanced README

### Fixed

- Honor hat-level backend configuration and args overrides
- Backend dev workflow uses tsc+node instead of ts-node

## [2.2.5] - 2025-01-17

### Added

- Loop merge command (`ralph loop merge`) and custom backend args
- Config override support for core fields via CLI
- Mock adapter for cost-free E2E testing
- CI: Run mock E2E tests on every PR/push

### Fixed

- CI workaround for claude-code-action fork PR bug
- CI write permissions for handling fork PRs

## [2.2.4] - 2025-01-14

### Fixed

- TUI hang under npx process group
- Clarify cost display as estimate for subscription users

## [2.2.3] - 2025-01-12

### Added

- Multi-loop concurrency via git worktrees
- OBJECTIVE section in prompts to prevent goal drift
- Claude Code GitHub workflow

### Fixed

- UTF-8 truncation panics in event output

### Changed

- Updated preset configurations

## [2.2.2] - 2025-01-10

### Fixed

- Signal handler registration moved after TUI initialization
- Docs: markdown attribute on divs for badge rendering

## [2.2.1] - 2025-01-08

### Added

- CLI ergonomics: backend flag, builtin presets, URL configs
- Comprehensive MkDocs documentation site for v2

### Fixed

- TUI: require stdin to be terminal for TUI enablement
- MkDocs strict build failures
- Confession-loop preset updated to use `ralph emit` command

### Changed

- Modularized codebase and fixed TUI mode

[2.6.0]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.5.0...v2.5.1
[2.3.0]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.2.5...v2.3.0
[2.2.5]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.2.4...v2.2.5
[2.2.4]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.2.3...v2.2.4
[2.2.3]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/mikeyobrien/ralph-orchestrator/compare/v2.2.0...v2.2.1
