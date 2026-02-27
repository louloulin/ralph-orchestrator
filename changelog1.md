# Changelog - Main 分支合并到 feature-web3

合并日期: 2026-02-27
合并提交: 8d24d90

## 新功能 (Features)

### RPC v1 控制平面 (feat: add Rust RPC v1 control plane and migrate web client)
- **提交**: 7b53ead
- **描述**: 新增 Rust RPC v1 控制平面，并将 Web 客户端迁移到新的 RPC 架构
- **影响**:
  - 新增 `ralph-api` crate，提供 JSON-RPC v1 协议支持
  - Web 前端通过 RPC 客户端与后端通信
  - 支持流式订阅、任务管理、循环管理等核心功能
  - 提供完整的 API 契约测试和 JSON Schema 定义

### Kiro ACP 后端支持 (feat: add kiro-acp backend with ACP executor)
- **提交**: 504fa82
- **描述**: 添加 Kiro ACP 后端支持，实现 ACP 执行器和改进的 TUI 工具渲染
- **影响**:
  - 新增 `acp_executor.rs` 模块
  - 改进 TUI 中的工具渲染效果
  - 支持 Kiro 后端的 ACP (Agent Communication Protocol) 协议

### 子进程 TUI JSON-RPC 协议 (feat(rpc): subprocess TUI via JSON-RPC stdin/stdout protocol)
- **提交**: bc6a4bf
- **描述**: 通过 JSON-RPC stdin/stdout 协议实现子进程 TUI
- **影响**:
  - TUI 可以作为子进程通过标准输入输出通信
  - 新增 RPC 桥接、客户端和写入器模块
  - 支持文本渲染器进行工具输出格式化

### 资金支持 (web: harden tsx preflight + add funding metadata)
- **提交**: 63f8c78
- **描述**: 添加资金元数据和 GitHub Funding 配置
- **影响**:
  - 新增 `FUNDING.yml` 和 `FUNDING.md` 文件
  - 改进 TSX 预检流程

### llms.txt 地图生成 (docs: add llms.txt map generation and CI validation)
- **提交**: 3a705fb
- **描述**: 添加 llms.txt 地图生成和 CI 验证
- **影响**:
  - 新增 `scripts/validate_llms_txt.py` 脚本
  - 在 CI 中自动验证 llms.txt 格式
  - 改进文档工作流

## 修复 (Fixes)

### UTF-8 安全截断 (fix: use UTF-8 safe truncation to prevent panics)
- **提交**: f9df019
- **描述**: 使用 UTF-8 安全截断防止多字节字符崩溃
- **影响**:
  - 使用 `floor_char_boundary` 函数安全截断字符串
  - 防止在中文等多字节字符处发生 panic
  - 影响 `handoff.rs` 和 `text.rs` 模块

### Hat 显示卡住 (fix: hat display stuck on previous iteration's hat)
- **提交**: bcce410
- **描述**: 修复 Hat 显示卡在上一次迭代的 Hat 上的问题
- **影响**:
  - 修正事件循环中的 Hat 状态管理
  - 确保 Hat 正确更新

### 僵尸 Worktree 循环 (fix: detect and clean up zombie worktree loops)
- **提交**: 0d84a15
- **描述**: 检测并清理僵尸 worktree 循环
- **影响**:
  - 新增僵尸循环检测逻辑
  - 自动清理孤立的 worktree 进程
  - 改进循环注册表管理

### Clippy 警告 (fix: resolve clippy warnings and add missing struct fields)
- **提交**: 16dafe3
- **描述**: 解决 Clippy 警告并添加缺失的结构体字段
- **影响**:
  - 修复所有 Clippy 警告
  - 补充缺失的结构体字段
  - 提高代码质量

## 重构 (Refactoring)

### Duration 方法迁移 (refactor: replace deprecated Duration methods with from_secs)
- **提交**: 114c9a9
- **描述**: 用 `from_secs` 替换已弃用的 Duration 方法
- **影响**:
  - 迁移到新的 Duration API
  - 影响核心、API、E2E 和 TUI 模块
  - 提高代码现代化程度

## 文档改进 (Documentation)

### v2.6.0 发布 (chore(release): v2.6.0)
- **提交**: 70af970
- **描述**: 发布 v2.6.0 版本
- **影响**:
  - 更新 CHANGELOG.md
  - 版本号更新到 2.6.0

## 架构改进 (Architecture)

### ralph-api 新增 Crate
- **路径**: `crates/ralph-api/`
- **功能**:
  - JSON-RPC v1 协议实现
  - 认证和授权
  - 流式事件支持
  - 任务、循环、集合、配置等领域管理
  - 幂等性保证
  - 完整的测试套件

### ralph-adapters 扩展
- **新增模块**:
  - `acp_executor.rs`: ACP 执行器
  - `json_rpc_handler.rs`: JSON-RPC 处理器
  - 改进的 PTY 执行器和流处理器

### ralph-tui RPC 支持
- **新增模块**:
  - `rpc_bridge.rs`: RPC 桥接
  - `rpc_client.rs`: RPC 客户端
  - `rpc_source.rs`: RPC 源
  - `rpc_writer.rs`: RPC 写入器
  - `state_mutations.rs`: 状态变更
  - `text_renderer.rs`: 文本渲染器

## 测试改进 (Testing)

### RPC v1 契约测试
- **新增测试文件**:
  - `rpc_v1_bootstrap.rs`
  - `rpc_v1_loop_parity_regressions.rs`
  - `rpc_v1_planning_config_preset_collection.rs`
  - `rpc_v1_streaming.rs`
  - `rpc_v1_task_loop.rs`
  - `rpc_v1_uncovered.rs`
  - `rpc_v1_contract_conformance.rs`

### 测试固件
- **新增固件目录**: `crates/ralph-core/tests/fixtures/rpc-v1/`
- **包含**:
  - 有效的请求/响应示例
  - 无效的请求/响应示例
  - 错误处理示例
  - 事件流示例

## Web 前端改进 (Frontend)

### RPC 客户端集成
- **新增**: `frontend/ralph-web/src/rpc/client.ts`
- **功能**:
  - 连接到 RPC v1 API
  - 支持流式订阅
  - 自动重连机制

### 组件更新
- **改进的组件**:
  - `LogViewer.tsx`: 改进的日志查看器
  - `TaskList.tsx`: 改进的任务列表
  - `PlanLanding.tsx` 和 `PlanSession.tsx`: 计划管理界面
  - `TaskInput.tsx`: 任务输入组件
  - `SettingsPage.tsx`: 设置页面
  - `BuilderPage.tsx`: 构建器页面

## 总结

本次合并从 main 分支引入了 12 个重要提交，主要包括:

1. **核心架构升级**: RPC v1 控制平面，提供更强大的 API 支持
2. **后端扩展**: Kiro ACP 支持，扩展后端能力
3. **稳定性改进**: UTF-8 安全截断、僵尸进程清理、Clippy 警告修复
4. **TUI 增强**: 子进程 RPC 支持，改进的工具渲染
5. **文档完善**: llms.txt 生成、资金支持、版本发布

这些改进显著提升了 Ralph 的稳定性、可扩展性和开发者体验。
