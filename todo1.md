# Ralph Web Dashboard 开发计划

> 基于全面代码分析、竞品研究（vibe-kanban、Cursor、Windsurf 等）制定的综合 UI 开发路线图
>
> 创建时间: 2026-02-22 | 版本: 2.0

---

## 一、项目现状分析

### 1.1 技术栈概览

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | React | 19.1.0 | 最新版本 |
| **构建工具** | Vite | 7.0.0 | 极速构建 |
| **语言** | TypeScript | 5.9.3 | 类型安全 |
| **状态管理** | Zustand | 5.0.10 | 轻量级，支持持久化 |
| **样式方案** | TailwindCSS | 4.1.18 | 最新版本 |
| **路由** | React Router | 7.13.0 | 最新版本 |
| **API通信** | tRPC | 11.8.1 | 类型安全RPC |
| **实时通信** | WebSocket | - | 日志流、事件推送 |
| **工作流可视化** | React Flow | 12.10.0 (@xyflow/react) | Hat Collection构建器 |
| **后端运行时** | Bun | 1.3.9+ | 高性能JS运行时 |
| **Web框架** | Fastify | 5.7.1 | 高性能Web服务器 |
| **数据库** | SQLite + Drizzle ORM | 0.45.1 | 轻量级持久化 |
| **测试框架** | Vitest | 3.1.4 | 前端单元测试 |
| **E2E测试** | Playwright | 1.58.0 | 端到端测试 |

### 1.2 项目架构

```
ralph/
├── crates/              # Rust 后端核心
│   ├── ralph-cli/       # CLI 入口
│   ├── ralph-core/      # 编排逻辑、事件循环、帽子系统
│   ├── ralph-adapters/  # AI 后端集成（Claude、Kiro、Gemini 等）
│   ├── ralph-tui/       # 终端 UI（ratatui）
│   ├── ralph-telegram/  # Telegram 机器人集成
│   └── ralph-e2e/       # 端到端测试
├── backend/             # Web 服务器
│   └── ralph-web-server/
│       ├── api/         # tRPC 路由、REST 端点、WebSocket 广播
│       ├── db/          # SQLite 连接、Drizzle schema
│       ├── queue/       # EventBus、Dispatcher、任务队列服务
│       ├── repositories/# 数据访问层（Task、Settings、Collection）
│       ├── runner/      # RalphRunner、ProcessSupervisor、日志流
│       └── services/    # 业务逻辑（HatManager、LoopsManager、Planning）
└── frontend/            # Web Dashboard
    └── ralph-web/
        ├── components/  # UI 组件（layout、tasks、builder、plan、ui）
        ├── pages/       # 页面组件（Tasks、Builder、Plan、Settings）
        ├── hooks/       # 自定义 Hooks（WebSocket、通知、键盘）
        └── stores/      # Zustand 状态管理
```

### 1.3 后端架构详解

#### 1.3.1 API 层 (`api/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| tRPC 路由 | `trpc.ts` | 类型安全的 API 路由（task、hat、loops、collection、presets、config、planning） |
| REST API | `rest.ts` | 传统 HTTP 端点 |
| 日志广播 | `LogBroadcaster.ts` | WebSocket 实时日志流推送 |
| 服务器 | `server.ts` | Fastify 服务器配置 |

#### 1.3.2 队列系统 (`queue/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| EventBus | `EventBus.ts` | Pub/Sub 事件总线，解耦组件通信 |
| Dispatcher | `Dispatcher.ts` | 任务执行队列，管理并发 |
| TaskState | `TaskState.ts` | 任务状态机定义 |
| TaskQueueService | `TaskQueueService.ts` | 任务队列接口 |
| PersistentTaskQueueService | `PersistentTaskQueueService.ts` | 持久化任务队列实现 |

#### 1.3.3 运行器系统 (`runner/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| RalphRunner | `RalphRunner.ts` | 启动和管理 Ralph 进程 |
| ProcessSupervisor | `ProcessSupervisor.ts` | 进程 detach 和重连支持 |
| LogStream | `LogStream.ts` | 日志流处理 |
| FileOutputStreamer | `FileOutputStreamer.ts` | 日志文件输出 |
| RalphEventParser | `RalphEventParser.ts` | 解析 Ralph 事件输出 |
| RalphTaskHandler | `RalphTaskHandler.ts` | 任务处理器 |
| RunnerState | `RunnerState.ts` | 运行器状态管理 |
| PromptWriter | `PromptWriter.ts` | 写入任务提示文件 |

#### 1.3.4 服务层 (`services/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| TaskBridge | `TaskBridge.ts` | 数据库与执行队列的桥接层 |
| HatManager | `HatManager.ts` | Hat Collection 和预设管理 |
| LoopsManager | `LoopsManager.ts` | 循环注册和状态管理 |
| CollectionService | `CollectionService.ts` | Hat Collection 业务逻辑 |
| PlanningService | `PlanningService.ts` | 规划会话管理 |
| ConfigMerger | `ConfigMerger.ts` | 配置合并和验证 |
| SettingsService | `SettingsService.ts` | 用户设置管理 |

#### 1.3.5 数据层 (`db/`, `repositories/`)

| 模块 | 文件 | 功能 |
|------|------|------|
| Schema | `db/schema.ts` | Drizzle ORM 表定义 |
| TaskRepository | `repositories/TaskRepository.ts` | 任务数据访问 |
| TaskLogRepository | `repositories/TaskLogRepository.ts` | 任务日志数据访问 |
| QueuedTaskRepository | `repositories/QueuedTaskRepository.ts` | 队列任务持久化 |
| CollectionRepository | `repositories/CollectionRepository.ts` | Hat Collection 存储 |
| SettingsRepository | `repositories/SettingsRepository.ts` | 设置存储 |

### 1.5 现有页面结构

```
/                    → 重定向到 /tasks
/tasks               → 任务列表页 (TasksPage)
/tasks/:id           → 任务详情页 (TaskDetailPage)
/builder             → Hat构建器 (BuilderPage)
/plan                → 规划页面 (PlanPage)
/settings            → 设置页面 (SettingsPage)
```

### 1.6 现有功能清单

#### ✅ 已实现功能

| 功能 | 组件 | 完成度 | 说明 |
|------|------|--------|------|
| 任务列表展示 | ThreadList | 80% | 支持状态过滤、骨架屏加载 |
| 任务创建和输入 | TaskInput | 85% | 预设选择、提示词输入 |
| 任务详情查看 | TaskDetailPage | 75% | 状态栏、元数据网格、操作按钮 |
| 实时日志流 | EnhancedLogViewer | 90% | 自动滚动、语法高亮 |
| 实时状态更新 | LiveStatus | 85% | 状态徽章、进度指示 |
| Hat Collection可视化构建器 | CollectionBuilder | 75% | 拖拽节点、属性面板、连接管理 |
| Hat 模板面板 | HatPalette | 85% | **已从后端 API 获取模板**，支持搜索 |
| YAML配置编辑器 | SettingsPage | 60% | 配置文件读写 |
| WebSocket连接和重连 | useTaskWebSocket | 85% | 自动重连、心跳检测 |
| 侧边栏导航 | Sidebar | 90% | 响应式、活动状态 |
| Loop状态徽章 | LoopBadge | 80% | 显示循环状态 |
| Worktree徽章 | WorktreeBadge | 80% | 显示 worktree 信息 |
| 键盘导航 | useKeyboardShortcuts | 60% | 基础快捷键支持 |
| 浏览器通知 | useNotifications | 75% | 任务完成通知 |
| 日志持久化 | logStore | 85% | IndexedDB 存储 |
| 规划系统 | PlanLanding/PlanSession | 70% | 规划会话创建和管理 |
| 循环操作 | LoopActions | 80% | 启动、停止、重启循环 |
| 任务状态栏 | TaskStatusBar | 85% | 实时状态显示 |
| 空状态展示 | EmptyState | 90% | 优雅的空列表提示 |

#### ❌ 缺失/不完整功能

- [ ] 仪表盘/概览页面
- [ ] Kanban看板视图
- [ ] 任务搜索和过滤
- [ ] 批量操作
- [ ] 命令面板 (Cmd+K)
- [ ] 暗色/亮色主题切换
- [ ] 移动端响应式优化
- [ ] 错误边界和降级UI
- [ ] 懒加载和代码分割
- [ ] 国际化支持
- [ ] 代码差异可视化
- [ ] Agent思考过程可视化

---

## 二、UI问题诊断

### 2.1 功能层面问题

| 问题 | 严重程度 | 描述 | 解决方案 |
|------|----------|------|----------|
| PlanPage不完整 | 🔴 高 | 页面存在但功能不完整 | 完善规划工作流 |
| 缺少Dashboard | 🟡 中 | 用户无法快速了解系统状态 | 新增Dashboard页面 |
| 无任务搜索 | 🟡 中 | 任务多时难以查找 | 添加搜索和过滤 |
| Hat系统连接不清 | 🟡 中 | Builder创建的Collection如何使用? | 改进UI引导 |
| 预设选择不持久 | 🟡 中 | sessionStorage刷新后丢失 | 改用localStorage |

### 2.2 用户体验问题

| 问题 | 严重程度 | 描述 |
|------|----------|------|
| 加载状态不一致 | 🟡 中 | 部分页面缺少骨架屏 |
| 错误处理不完善 | 🟡 中 | 缺少统一的错误展示 |
| 实时反馈不明显 | 🟢 低 | 状态变化不够直观 |
| 缺少命令面板 | 🟡 中 | 无法快速执行操作 |

### 2.3 视觉设计问题

| 问题 | 严重程度 | 描述 |
|------|----------|------|
| 缺少亮色主题 | 🟡 中 | 仅支持暗色，无切换选项 |
| 缺少品牌设计 | 🟢 低 | Logo和品牌色系待完善 |
| 动画效果缺失 | 🟢 低 | 状态转换生硬 |
| 移动端适配 | 🟡 中 | 小屏幕体验差 |
| 信息密度 | 🟢 低 | 任务卡片可优化 |

### 2.4 技术债务

| 问题 | 严重程度 | 描述 |
|------|----------|------|
| 缺少Error Boundary | 🔴 高 | 组件错误会崩溃整个应用 |
| 无代码分割 | 🟡 中 | 首屏加载时间可能过长 |
| 测试覆盖不足 | 🟡 中 | E2E测试仅1个文件 |
| WebSocket优化 | 🟢 低 | 日志量大时可能卡顿 |

---

## 三、竞品研究与最佳实践

### 3.1 Vibe Kanban (14.2k+ Stars)

**项目定位：** 专为编排多个 AI 编码代理设计的开源看板平台

**核心特性：**
| 特性 | 描述 |
|------|------|
| Kanban看板视图 | To Do / In Progress / In Review / Done / Cancelled |
| Git Worktree隔离 | 每个任务独立的工作树 |
| 多AI代理支持 | Claude Code, Codex, Gemini CLI, Cursor, Amp |
| 实时日志流 | WebSocket实时通信 |
| 代码差异查看 | 实时代码变更可视化 |
| IDE图标系统 | VS Code, Cursor, Windsurf图标适配主题 |

**技术架构：**
- 前端：Vite + TypeScript + Radix UI
- 后端：Rust workspace 模块化架构
- 类型安全：Rust 生成 TypeScript 类型

**可借鉴：**
- ✅ 响应式拖拽看板界面设计
- ✅ 亮/暗主题自动检测
- ✅ "在编辑器中打开"快捷按钮
- ✅ Git worktree 隔离状态可视化
- ✅ 实时代码差异显示

### 3.2 Cursor IDE

**项目定位：** AI原生代码编辑器，AI作为核心驱动力

**核心特性：**
| 特性 | 描述 |
|------|------|
| **Composer** | 多文件协作编辑 - "灵魂功能" |
| **Tab Autocomplete** | 上下文感知代码补全 |
| **Built-in Chat** | 编辑器内AI对话 |
| **/Edit Commands (Cmd+K)** | 自然语言代码修改 |
| **Visual Editor (2025)** | AI优先的可视化界面 |

**设计哲学（Ryo Lu, 设计负责人）：**
- AI原生集成：AI嵌入骨髓，不是附加功能
- 上下文优先：本地索引理解多文件关系
- 意图优于交互：工具适应用户意图
- 打破设计师-开发者壁垒
- 向"思想到代码"的未来迈进

**可借鉴：**
- ✅ 命令面板（Cmd+K）设计
- ✅ 上下文感知自动完成
- ✅ 意图预测机制
- ✅ 快捷键系统设计

### 3.3 Windsurf IDE (Cascade)

**项目定位：** 世界首个基于 AI Flow 范式的 IDE

**核心创新 - Cascade：**
| 能力 | 描述 |
|------|------|
| 深度上下文 | 追踪光标移动和依赖图 |
| 多文件理解 | 长会话中保持上下文 |
| 意图预测 | 理解用户下一步想做什么 |
| Flow State | 与用户操作同步 |
| 自动错误检测 | 右键检测并修复错误 |

**UI特性：**
- **Cascade面板：** 实时显示 AI 思考过程
- **写模式 vs 聊天模式：** 切换自主执行与指导
- **图片上传：** 多模态支持（拖放Figma设计）
- **实时预览：** IDE内实时Web应用预览
- **Turbo模式：** 自动执行终端命令

**可借鉴：**
- ✅ 思考过程可视化面板
- ✅ 写/聊模式切换
- ✅ 多模态输入支持
- ✅ 实时预览集成

### 3.4 其他工具参考

| 工具 | 特点 | 可借鉴 |
|------|------|--------|
| **Sourcegraph Cody** | 大型代码库深度理解 | 代码搜索和QA |
| **Aider** | 语音集成、时间线回滚 | 语音输入、历史回滚 |
| **Continue.dev** | IDE注入、丰富插件生态 | 插件架构 |

### 3.5 最佳实践总结

| 模式 | 来源 | 应用到Ralph |
|------|------|-------------|
| 上下文感知自动完成 | Cursor, Windsurf | 帽子选择智能建议 |
| 意图预测 | Windsurf Cascade | 预测下一个编排操作 |
| 思考过程展示 | Windsurf Cascade | Agent推理实时显示 |
| 写vs聊模式 | Windsurf | 自主执行/指导切换 |
| 拖拽看板 | Vibe Kanban | 循环和任务可视化编排 |
| 代码差异可视化 | Vibe Kanban | 任务线程中显示文件变更 |
| 实时预览 | Windsurf | Dashboard中预览开发服务器 |

---

## 四、开发计划

### 阶段一：基础完善（优先级：🔴 高）- 1-2周

#### P1-1: 实时通信增强
**目标：** 提升实时日志的稳定性

- [ ] 完善指数退避重连机制
- [ ] 添加断开状态 UI 指示器
- [ ] 实现离线消息缓存
- [ ] 添加重连按钮手动触发
- [ ] 实现降级轮询作为备选

**工作量：** 3-5 天
**文件：** `useTaskWebSocket.ts`, `LogViewer.tsx`

#### P1-2: 错误处理优化
**目标：** 提供用户友好的错误提示

- [ ] 创建统一错误边界组件
- [ ] 实现 Toast 通知系统增强
- [ ] 添加错误分类（网络/服务器/业务）
- [ ] 实现一键重试机制
- [ ] 添加错误反馈入口

**工作量：** 2-3 天
**文件：** 新增 `ErrorBoundary.tsx`, 修改 `useNotifications.ts`

#### P1-3: 持久化改进
**目标：** 解决状态丢失问题

- [ ] 预设选择改用 localStorage
- [ ] 实现用户偏好持久化
- [ ] 添加"清除缓存"功能
- [ ] 主题偏好持久化

**工作量：** 1-2 天
**文件：** `TaskInput.tsx`, 新增 `usePreferences.ts`

#### P1-4: 代码分割和懒加载
**目标：** 优化首屏加载性能

- [ ] 路由级别懒加载
- [ ] 组件级别动态导入
- [ ] 配置Vite打包优化
- [ ] 添加加载骨架屏

**工作量：** 2-3 天
**文件：** `App.tsx`, Vite配置

**交付物：**
- 稳定的实时日志系统
- 统一错误处理
- 持久化用户偏好
- 优化的首屏加载

---

### 阶段二：核心功能增强（优先级：🟡 中）- 2-3周

#### P2-1: 思考过程可视化面板
**目标：** 类似 Windsurf Cascade 的透明度面板

- [ ] 创建可折叠的 Agent 思考面板
- [ ] 实时显示推理步骤
- [ ] 添加步骤时间戳
- [ ] 支持面板位置调整
- [ ] 添加思考过程搜索

**工作量：** 5-7 天
**文件：** 新增 `ThinkingPanel.tsx`, 修改 `TaskDetailPage.tsx`

#### P2-2: 代码差异可视化
**目标：** 实时显示任务产生的代码变更

- [ ] 集成 diff2html 或类似库
- [ ] 实现并排差异视图
- [ ] 添加语法高亮
- [ ] 支持差异统计（+X/-Y 行）
- [ ] 实现差异过滤（仅显示变更）

**工作量：** 5-7 天
**文件：** 新增 `DiffViewer.tsx`, 修改后端 API

#### P2-3: 循环可视化增强
**目标：** 直观展示循环关系和状态

- [ ] 循环依赖关系图
- [ ] 颜色编码状态指示
- [ ] 合并队列可视化
- [ ] 并行循环状态对比
- [ ] Worktree状态实时更新

**工作量：** 5-7 天
**文件：** 新增 `LoopVisualization.tsx`, 修改 `trpc.ts`

#### P2-4: 命令面板（Cmd+K）
**目标：** Cursor 风格的全局命令面板

- [ ] 实现全局快捷键监听（Cmd/Ctrl+K）
- [ ] 创建模糊搜索命令列表
- [ ] 支持自然语言任务输入
- [ ] 添加最近使用命令历史
- [ ] 实现命令分类和图标

**工作量：** 3-5 天
**文件：** 新增 `CommandPalette.tsx`, `useCommandPalette.ts`

#### P2-5: 任务搜索和过滤
**目标：** 快速查找和管理任务

- [ ] 实现搜索框组件
- [ ] 添加状态过滤器
- [ ] 添加时间范围过滤
- [ ] 实现搜索高亮
- [ ] 保存搜索条件

**工作量：** 2-3 天
**文件：** 新增 `TaskSearch.tsx`, 修改 `ThreadList.tsx`

**交付物：**
- Agent思考过程可视化
- 代码差异实时显示
- 循环状态可视化
- 命令面板
- 任务搜索功能

---

### 阶段三：用户体验优化（优先级：🟢 中低）- 1-2周

#### P3-1: 国际化支持
**目标：** 支持中英文切换

- [ ] 集成 i18next 或类似库
- [ ] 提取所有硬编码文本
- [ ] 创建中英文翻译文件
- [ ] 添加语言切换器
- [ ] 语言偏好持久化

**工作量：** 3-5 天
**文件：** 新增 `i18n/` 目录，修改所有组件

#### P3-2: 主题系统
**目标：** 支持亮/暗主题切换

- [ ] 创建亮色主题变量
- [ ] 实现系统主题自动检测
- [ ] 添加主题切换器
- [ ] 主题持久化
- [ ] IDE图标主题适配

**工作量：** 3-5 天
**文件：** `index.css`, 新增 `ThemeProvider.tsx`

#### P3-3: 无障碍访问
**目标：** WCAG 2.1 AA 级合规

- [ ] 添加 ARIA 标签
- [ ] 键盘导航增强
- [ ] 屏幕阅读器支持
- [ ] 对比度优化
- [ ] 焦点管理

**工作量：** 5-7 天
**文件：** 所有组件

#### P3-4: 移动端优化
**目标：** 响应式布局优化

- [ ] 响应式布局调整
- [ ] 移动端导航优化
- [ ] 触摸手势支持
- [ ] PWA配置
- [ ] 离线功能基础

**工作量：** 3-5 天
**文件：** 布局组件，新增移动端样式

**交付物：**
- 中英文界面支持
- 亮/暗主题切换
- 无障碍访问支持
- 移动端适配

---

### 阶段四：高级功能（优先级：🔵 低）- 2-3周

#### P4-1: Dashboard仪表盘
**目标：** 系统状态概览

- [ ] 系统状态概览卡片
- [ ] 活跃任务统计
- [ ] 最近活动时间线
- [ ] 快速操作入口
- [ ] Token使用统计

**工作量：** 5-7 天
**文件：** 新增 `DashboardPage.tsx`, 统计组件

#### P4-2: Kanban看板视图
**目标：** 拖拽式任务管理

- [ ] 实现看板布局组件
- [ ] 添加拖拽排序功能
- [ ] 实现状态列管理
- [ ] 添加快速编辑功能
- [ ] 任务卡片优化

**工作量：** 5-7 天
**文件：** 新增 `KanbanPage.tsx`, 拖拽组件

#### P4-3: 实时预览集成
**目标：** 在 Dashboard 中预览运行中的开发服务器

- [ ] 端口检测和自动嵌入
- [ ] iframe 预览面板
- [ ] 预览控制（刷新、设备模拟）
- [ ] 多预览标签页
- [ ] 预览状态指示

**工作量：** 7-10 天
**文件：** 新增 `PreviewPanel.tsx`, 后端端口检测

#### P4-4: 多模态输入
**目标：** 支持图片上传创建任务

- [ ] 图片拖拽上传
- [ ] 设计稿到任务流程
- [ ] 截图识别和描述
- [ ] Figma 集成（可选）

**工作量：** 7-10 天
**文件：** 新增 `ImageUpload.tsx`, 后端图片处理

#### P4-5: 时间线历史视图
**目标：** 可视化循环执行历史并支持回滚

- [ ] 循环执行时间线
- [ ] 状态快照存储
- [ ] 一键回滚功能
- [ ] 分支可视化
- [ ] 执行统计图表

**工作量：** 10-14 天
**文件：** 新增 `TimelineView.tsx`, 后端状态管理

#### P4-6: 智能建议系统
**目标：** 基于上下文的智能推荐

- [ ] 任务类型识别
- [ ] 帽子选择建议
- [ ] 常见模式模板
- [ ] 学习用户偏好
- [ ] 历史模式分析

**工作量：** 10-14 天
**文件：** 新增 `SuggestionEngine.ts`, AI 集成

**交付物：**
- Dashboard仪表盘
- Kanban看板视图
- 实时预览功能
- 多模态输入
- 历史时间线
- 智能建议系统

---

### 阶段五：测试和发布（1周）

#### P5-1: 测试覆盖

| 类型 | 当前状态 | 目标 |
|------|----------|------|
| 单元测试 | Vitest 配置完成 | 80% 覆盖率 |
| E2E 测试 | 1 个测试文件 | 20+ 场景 |
| 组件测试 | 基础配置 | 所有关键组件 |
| 无障碍测试 | 无 | WCAG 2.1 AA |

**行动项：**
- [ ] 添加任务管理 E2E 测试
- [ ] 添加循环协调测试
- [ ] 组件快照测试
- [ ] 无障碍自动化测试

#### P5-2: 性能优化

- [ ] 虚拟滚动优化
- [ ] WebSocket 性能测试
- [ ] 状态管理优化
- [ ] 打包体积优化
- [ ] 缓存策略优化

#### P5-3: 文档完善

- [ ] 组件文档（Storybook 可选）
- [ ] API 文档
- [ ] 用户指南
- [ ] 开发指南
- [ ] 变更日志

---

## 五、技术选型建议

### 5.1 推荐添加的依赖

```json
{
  "dependencies": {
    "@radix-ui/react-*": "最新",     // UI 原语 - 无障碍、无样式、可定制
    "cmdk": "^1.0.0",                // 命令面板 - shadcn/ui 同款
    "diff2html": "^3.4.0",           // 代码差异 - 成熟、高性能
    "i18next": "^23.0.0",            // 国际化 - React 生态标准
    "react-i18next": "^14.0.0",      // React 国际化绑定
    "framer-motion": "^11.0.0",      // 动画 - 流畅的过渡效果
    "@dnd-kit/core": "^6.0.0",       // 拖拽功能
    "@dnd-kit/sortable": "^8.0.0",   // 排序拖拽
    "recharts": "^2.12.0",           // 图表库
    "react-error-boundary": "^4.0.0" // 错误边界
  },
  "devDependencies": {
    "@testing-library/react": "^14.0.0",
    "@testing-library/user-event": "^14.0.0",
    "vitest": "^1.0.0",
    "@playwright/test": "^1.40.0",
    "@axe-core/react": "^4.8.0"      // 无障碍测试
  }
}
```

### 5.2 架构决策

| 决策点 | 建议 | 理由 |
|--------|------|------|
| 组件库 | Radix UI + Tailwind | 可访问性 + 灵活性 |
| 状态管理 | 保持 Zustand | 已有投入，性能优秀 |
| 图表库 | Recharts | React 原生，轻量 |
| 测试框架 | Vitest + Playwright | 已配置，保持一致 |
| 动画库 | Framer Motion | 声明式，性能优秀 |
| 国际化 | i18next | 生态成熟，功能完善 |

### 5.3 目录结构优化

```
frontend/ralph-web/src/
├── components/
│   ├── ui/                    # shadcn/ui 组件
│   ├── layout/                # 布局组件
│   ├── tasks/                 # 任务相关组件
│   ├── builder/               # Hat 构建器组件
│   ├── dashboard/             # Dashboard 组件 (新增)
│   ├── kanban/                # Kanban 看板组件 (新增)
│   ├── shared/                # 共享组件 (新增)
│   │   ├── ErrorBoundary.tsx  # 错误边界
│   │   ├── CommandPalette.tsx # 命令面板
│   │   └── ThinkingPanel.tsx  # 思考面板
│   └── diff/                  # 代码差异组件 (新增)
├── pages/
│   ├── TasksPage.tsx
│   ├── TaskDetailPage.tsx
│   ├── DashboardPage.tsx      # 新增
│   ├── KanbanPage.tsx         # 新增
│   └── ...
├── hooks/
│   ├── useTaskWebSocket.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useTheme.ts            # 新增
│   ├── useCommandPalette.ts   # 新增
│   └── usePreferences.ts      # 新增
├── stores/
│   ├── store.ts
│   ├── logStore.ts
│   ├── themeStore.ts          # 新增
│   └── preferencesStore.ts    # 新增
├── i18n/                      # 新增
│   ├── index.ts
│   ├── en.json
│   └── zh.json
└── lib/
    ├── utils.ts
    ├── shortcuts.ts           # 新增
    └── suggestions.ts         # 新增
```

---

## 六、里程碑时间线

```
Week 1-2:  阶段一（基础完善）
├── P1-1 实时通信增强
├── P1-2 错误处理优化
├── P1-3 持久化改进
└── P1-4 代码分割和懒加载

Week 3-5:  阶段二（核心功能增强）
├── P2-1 思考过程可视化
├── P2-2 代码差异可视化
├── P2-3 循环可视化增强
├── P2-4 命令面板
└── P2-5 任务搜索和过滤

Week 6-7:  阶段三（用户体验优化）
├── P3-1 国际化支持
├── P3-2 主题系统
├── P3-3 无障碍访问
└── P3-4 移动端优化

Week 8-10: 阶段四（高级功能）
├── P4-1 Dashboard仪表盘
├── P4-2 Kanban看板视图
├── P4-3 实时预览集成
├── P4-4 多模态输入
├── P4-5 时间线历史
└── P4-6 智能建议系统

Week 11:   阶段五（测试和发布）
├── P5-1 测试覆盖
├── P5-2 性能优化
└── P5-3 文档完善
```

### 版本规划

| 版本 | 内容 | 预计时间 |
|------|------|----------|
| v0.2.0 | 阶段一完成 | Week 2 |
| v0.3.0 | 阶段二完成 | Week 5 |
| v0.4.0 | 阶段三完成 | Week 7 |
| v0.5.0 | 阶段四完成 | Week 10 |
| v1.0.0 | 阶段五完成，正式发布 | Week 11 |

---

## 七、风险与缓解

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| WebSocket 连接不稳定 | 中 | 高 | 实现降级轮询作为备选 |
| 大型差异渲染性能 | 中 | 中 | 虚拟滚动、分页加载 |
| 国际化工作量 | 中 | 中 | 渐进式迁移，优先关键页面 |
| 主题切换闪烁 | 低 | 低 | CSS 变量 + 预加载 |
| 开发时间不足 | 中 | 高 | 优先级排序，MVP优先 |
| 测试覆盖不足 | 中 | 中 | CI强制测试覆盖 |

---

## 八、成功指标

| 指标 | 当前 | 目标 |
|------|------|------|
| 页面加载时间 | 未测量 | < 2s |
| 首次内容绘制 (FCP) | 未测量 | < 1s |
| 最大内容绘制 (LCP) | 未测量 | < 2.5s |
| WebSocket 重连时间 | 未测量 | < 3s |
| E2E 测试通过率 | N/A | 100% |
| 单元测试覆盖率 | <50% | >80% |
| 无障碍评分 | 未测量 | > 90 |
| Lighthouse 性能分 | 未测量 | > 90 |

---

## 九、下一步行动

1. **立即开始：** P1-1 实时通信增强（最高优先级）
2. **本周完成：** 阶段一所有任务
3. **两周内：** 完成阶段二至少 2 项
4. **持续进行：** 测试覆盖提升

---

## 十、总结

Ralph Orchestrator 的 Web Dashboard 已经具备了良好的技术基础：

**现有优势：**
- 现代化的技术栈（React 19.1 + Vite 7 + TailwindCSS 4.1.18）
- 类型安全的 API 层（tRPC 11.8.1）
- 实时通信能力（WebSocket）
- 可视化编排工具（React Flow 12.10.0）
- 完善的后端架构（EventBus、Dispatcher、ProcessSupervisor）
- 规划系统支持（PlanningService、PlanSession）

**主要改进方向：**
1. **稳定性增强：** 实时通信稳定性、错误处理
2. **透明度提升：** Agent 思考过程可视化、代码差异显示
3. **效率优化：** 命令面板、键盘导航、任务搜索
4. **体验提升：** 主题切换、国际化、移动端适配
5. **功能扩展：** Dashboard、Kanban、实时预览

通过系统性的开发计划，可以在 **11 周** 内完成一个功能完善、体验优秀的 Web Dashboard，为 Ralph Orchestrator 提供强大的 Web 界面支持，对标 Cursor、Windsurf 等顶级 AI 开发工具的用户体验。

---

*文档版本: 2.1*
*创建时间: 2026-02-22*
*更新时间: 2026-02-22*
*作者: Ralph 编排系统分析*
