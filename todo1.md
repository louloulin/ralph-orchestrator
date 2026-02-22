# Ralph Web Dashboard 开发计划

> 基于全面代码分析、竞品研究（vibe-kanban、Cursor、Windsurf 等）制定的综合 UI 开发路线图
>
> **愿景：** 将 Ralph 打造成 7×24 小时运行的顶级智能体编排平台
>
> 创建时间: 2026-02-22 | 版本: 3.0 | 更新时间: 2026-02-22

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

## 十一、7×24 智能体平台能力建设

### 11.1 平台愿景

**目标：** 将 Ralph 打造成能够 7×24 小时自主运行的顶级智能体编排平台，具备自愈、自监控、自优化的企业级能力。

**核心能力矩阵：**

| 能力域 | 描述 | 优先级 |
|--------|------|--------|
| **自愈架构** | 进程崩溃自动恢复、异常自动修复 | 🔴 高 |
| **健康监控** | 实时状态监控、异常检测告警 | 🔴 高 |
| **检查点系统** | 状态持久化、断点恢复 | 🔴 高 |
| **资源调度** | 动态扩展、负载均衡 | 🟡 中 |
| **任务调度** | 定时任务、事件驱动、依赖管理 | 🟡 中 |
| **安全治理** | 零信任、访问控制、审计日志 | 🟡 中 |

### 11.2 自愈架构设计

#### 11.2.1 三层容错机制

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 3: Circuit Breaker                 │
│              (熔断器 - 防止级联故障，手动干预)                    │
├─────────────────────────────────────────────────────────────┤
│                    Layer 2: Ops Platform                     │
│           (运维平台 - 中等异常上报，自动诊断)                      │
├─────────────────────────────────────────────────────────────┤
│                    Layer 1: Agent Self-Healing              │
│            (Agent自愈 - 轻微异常自动修复，无需干预)                 │
└─────────────────────────────────────────────────────────────┘
```

#### 11.2.2 Agent 自愈能力

| 场景 | 检测方式 | 自愈动作 |
|------|----------|----------|
| 进程崩溃 | 进程监控、心跳检测 | 自动重启、恢复上下文 |
| 网络中断 | 连接状态监控 | 指数退避重连、降级轮询 |
| API 限流 | 响应状态码检测 | 自动降速、队列缓冲 |
| 内存溢出 | 资源监控 | 自动清理缓存、重启 |
| 任务超时 | 超时检测器 | 自动取消、重试或切换策略 |
| 工具调用失败 | 错误捕获 | 自动重试、备选工具 |

#### 11.2.3 实现计划

**P0-1: 进程守护系统**
```typescript
// 新增: backend/ralph-web-server/src/daemon/ProcessDaemon.ts
interface ProcessDaemon {
  // 健康检查
  healthCheck(): Promise<HealthStatus>;
  // 自动重启
  autoRestart(): Promise<void>;
  // 状态恢复
  restoreState(checkpoint: Checkpoint): Promise<void>;
  // 异常检测
  detectAnomaly(): Promise<AnomalyReport>;
}
```

**工作量：** 5-7 天
**文件：** 新增 `daemon/` 目录，修改 `ProcessSupervisor.ts`

### 11.3 检查点与状态持久化

#### 11.3.1 检查点架构

```
┌──────────────────────────────────────────────────────────────┐
│                     Checkpoint System                        │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐        │
│  │ Memory      │   │ Task        │   │ Event       │        │
│  │ Checkpoint  │   │ Checkpoint  │   │ Checkpoint  │        │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘        │
│         │                 │                 │                │
│         └────────────────┬┴─────────────────┘                │
│                          ▼                                   │
│              ┌─────────────────────┐                        │
│              │  State Serializer   │                        │
│              │  (JSON/ProtoBuf)    │                        │
│              └──────────┬──────────┘                        │
│                         ▼                                    │
│              ┌─────────────────────┐                        │
│              │  Persistent Storage │                        │
│              │  (SQLite/PostgreSQL)│                        │
│              └─────────────────────┘                        │
└──────────────────────────────────────────────────────────────┘
```

#### 11.3.2 检查点内容

| 组件 | 数据 | 序列化格式 |
|------|------|-----------|
| **Goal Stack** | 主任务、子任务状态 | JSON |
| **Action History** | 执行历史、结果 | JSONL |
| **Thought Chain** | 推理过程、决策 | JSON |
| **Tool Cache** | 工具调用结果缓存 | JSON |
| **File Records** | 生成的文件清单 | JSON |
| **Context Window** | 对话上下文压缩 | ProtoBuf |

#### 11.3.3 恢复机制

```typescript
// 新增: backend/ralph-web-server/src/checkpoint/CheckpointManager.ts
interface CheckpointManager {
  // 创建检查点
  createCheckpoint(loopId: string): Promise<Checkpoint>;
  // 恢复检查点
  restoreCheckpoint(checkpointId: string): Promise<LoopState>;
  // 列出检查点
  listCheckpoints(loopId: string): Promise<Checkpoint[]>;
  // 时间旅行
  timeTravel(loopId: string, timestamp: Date): Promise<LoopState>;
}
```

**工作量：** 7-10 天
**文件：** 新增 `checkpoint/` 目录，修改 `LoopState.ts`

### 11.4 健康监控与告警

#### 11.4.1 监控指标体系

| 指标类别 | 具体指标 | 阈值 | 告警级别 |
|----------|----------|------|----------|
| **进程健康** | CPU 使用率 | >80% | 🟡 Warning |
| **进程健康** | 内存使用率 | >85% | 🟡 Warning |
| **进程健康** | 进程存活 | 死亡 | 🔴 Critical |
| **任务健康** | 任务成功率 | <90% | 🟡 Warning |
| **任务健康** | 平均执行时间 | >预期2x | 🟡 Warning |
| **任务健康** | 队列积压 | >100 | 🟡 Warning |
| **网络健康** | API 响应时间 | >5s | 🟡 Warning |
| **网络健康** | 错误率 | >5% | 🔴 Critical |
| **业务健康** | 循环完成率 | <80% | 🟡 Warning |
| **业务健康** | 合并冲突率 | >20% | 🟡 Warning |

#### 11.4.2 告警渠道

| 渠道 | 场景 | 配置 |
|------|------|------|
| **WebSocket 推送** | 实时状态更新 | Dashboard 内置 |
| **Telegram 通知** | 重要告警、人工干预 | RObot 已集成 |
| **邮件通知** | 每日报告、严重告警 | 新增配置 |
| **Webhook** | 第三方系统集成 | 新增配置 |
| **Slack/钉钉** | 团队协作通知 | 可选集成 |

#### 11.4.3 监控面板

```typescript
// 新增: frontend/ralph-web/src/components/monitoring/MonitoringDashboard.tsx
interface MonitoringDashboard {
  // 系统健康概览
  systemHealth: SystemHealthCard;
  // 实时指标图表
  metricsCharts: MetricsChart[];
  // 告警列表
  alertList: AlertList;
  // 资源使用趋势
  resourceTrends: ResourceTrendChart;
}
```

**工作量：** 7-10 天
**文件：** 新增 `monitoring/` 组件目录，后端 `metrics/` 服务

### 11.5 任务调度系统

#### 11.5.1 调度类型

| 类型 | 描述 | 示例 |
|------|------|------|
| **即时任务** | 立即执行 | 用户提交任务 |
| **定时任务** | Cron 表达式 | 每日代码审查 |
| **事件驱动** | 条件触发 | Git push 触发测试 |
| **依赖任务** | DAG 工作流 | 测试→构建→部署 |

#### 11.5.2 调度器设计

```typescript
// 新增: backend/ralph-web-server/src/scheduler/TaskScheduler.ts
interface TaskScheduler {
  // 添加定时任务
  scheduleCron(task: TaskDefinition, cron: string): Promise<ScheduledTask>;
  // 添加事件驱动任务
  scheduleEvent(task: TaskDefinition, trigger: EventTrigger): Promise<void>;
  // 添加依赖任务
  scheduleDAG(workflow: DAGWorkflow): Promise<void>;
  // 查询调度状态
  getScheduleStatus(taskId: string): Promise<ScheduleStatus>;
}
```

**工作量：** 10-14 天
**文件：** 新增 `scheduler/` 目录

### 11.6 资源调度与弹性伸缩

#### 11.6.1 资源池管理

```
┌─────────────────────────────────────────────────────────────┐
│                    Resource Pool Manager                     │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐       │
│  │ API Quota   │   │ Process     │   │ Storage     │       │
│  │ Pool        │   │ Pool        │   │ Pool        │       │
│  └─────────────┘   └─────────────┘   └─────────────┘       │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Auto Scaler                            │    │
│  │  - Scale Up: 队列积压 > 阈值                        │    │
│  │  - Scale Down: 空闲 > 5分钟                        │    │
│  │  - Predictive: 基于历史预测                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 11.6.2 并发控制

| 策略 | 描述 | 配置项 |
|------|------|--------|
| **最大并发数** | 同时运行的任务上限 | `maxConcurrency` |
| **速率限制** | 每分钟请求数限制 | `rateLimit` |
| **优先级队列** | 高优先级任务优先 | `priorityQueue` |
| **资源预留** | 为关键任务预留资源 | `reservedSlots` |

---

## 十二、多项目管理架构

### 12.1 项目隔离策略

**问题：** 当前 Ralph Web 绑定单个项目目录，无法管理多个项目。

**解决方案：** 多项目架构

#### 12.1.1 项目配置存储

```typescript
// 新增: backend/ralph-web-server/src/db/schema.ts 扩展
interface Project {
  id: string;                  // 项目唯一标识
  name: string;                // 项目名称
  path: string;                // 项目路径
  config: ProjectConfig;       // 项目配置
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectConfig {
  // ralph.yml 路径
  ralphConfigPath: string;
  // 默认 Hat Collection
  defaultHatCollection: string;
  // 环境变量
  envVars: Record<string, string>;
  // 后端配置
  backend: BackendConfig;
}
```

#### 12.1.2 项目切换机制

```
┌─────────────────────────────────────────────────────────────┐
│                    Project Manager                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐                    │
│   │Project A│  │Project B│  │Project C│  ...               │
│   └────┬────┘  └────┬────┘  └────┬────┘                    │
│        │            │            │                          │
│        ▼            ▼            ▼                          │
│   ┌─────────────────────────────────────┐                  │
│   │        Project Context              │                  │
│   │  - 当前活动项目                      │                  │
│   │  - 项目级配置缓存                    │                  │
│   │  - 项目级任务队列                    │                  │
│   └─────────────────────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 UI 改造

#### 12.2.1 项目选择器

```tsx
// 新增: frontend/ralph-web/src/components/layout/ProjectSelector.tsx
function ProjectSelector() {
  const { projects, activeProject, switchProject } = useProjects();

  return (
    <Select value={activeProject?.id} onValueChange={switchProject}>
      {projects.map(project => (
        <SelectItem key={project.id} value={project.id}>
          <FolderOpen className="h-4 w-4 mr-2" />
          {project.name}
        </SelectItem>
      ))}
    </Select>
  );
}
```

#### 12.2.2 项目管理页面

| 功能 | 描述 |
|------|------|
| 项目列表 | 显示所有注册的项目 |
| 添加项目 | 扫描或手动添加项目 |
| 项目配置 | 编辑项目级 ralph.yml |
| 项目统计 | 任务数、循环数、Token 消耗 |

**工作量：** 5-7 天
**文件：** 新增 `ProjectManager.tsx`, 后端 `ProjectService.ts`

---

## 十三、企业级部署方案

### 13.1 部署架构选项

| 部署模式 | 适用场景 | 复杂度 |
|----------|----------|--------|
| **单机部署** | 个人/小团队 | 🟢 低 |
| **Docker 容器** | 团队/CI 环境 | 🟡 中 |
| **Kubernetes** | 企业/多租户 | 🔴 高 |
| **混合部署** | 混合云场景 | 🔴 高 |

### 13.2 Docker 部署

```dockerfile
# 新增: docker/Dockerfile.web
FROM oven/bun:1 AS builder
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "run", "dist/bundle.js"]
```

```yaml
# 新增: docker-compose.yml
version: '3.8'
services:
  ralph-web:
    build:
      context: .
      dockerfile: docker/Dockerfile.web
    ports:
      - "3000:3000"
    volumes:
      - ./projects:/app/projects  # 项目目录挂载
      - ralph-data:/app/.ralph    # 持久化数据
    environment:
      - RALPH_PROJECTS_DIR=/app/projects
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  ralph-data:
```

### 13.3 Kubernetes 部署 (可选)

```yaml
# 新增: k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ralph-web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ralph-web
  template:
    spec:
      containers:
      - name: ralph-web
        image: ralph/web:latest
        ports:
        - containerPort: 3000
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 30
        volumeMounts:
        - name: projects
          mountPath: /app/projects
      volumes:
      - name: projects
        persistentVolumeClaim:
          claimName: ralph-projects-pvc
```

---

## 十四、扩展开发阶段

### 阶段六：24/7 平台基础能力（优先级：🔴 高）- 2-3周

#### P6-1: 进程守护系统
- [ ] 实现进程健康检查
- [ ] 实现自动重启机制
- [ ] 实现异常检测
- [ ] 添加进程监控 API
- [ ] UI 显示进程状态

**工作量：** 5-7 天

#### P6-2: 检查点系统
- [ ] 设计检查点数据结构
- [ ] 实现状态序列化
- [ ] 实现检查点存储
- [ ] 实现断点恢复
- [ ] 添加时间旅行功能

**工作量：** 7-10 天

#### P6-3: 监控告警系统
- [ ] 实现指标采集
- [ ] 实现告警规则引擎
- [ ] 实现 Telegram 告警增强
- [ ] 添加邮件通知
- [ ] 创建监控 Dashboard

**工作量：** 7-10 天

### 阶段七：多项目与部署（优先级：🟡 中）- 2-3周

#### P7-1: 多项目管理
- [ ] 设计项目数据模型
- [ ] 实现项目 CRUD API
- [ ] 实现项目切换机制
- [ ] 创建项目选择器 UI
- [ ] 创建项目管理页面

**工作量：** 5-7 天

#### P7-2: 任务调度系统
- [ ] 实现 Cron 调度器
- [ ] 实现事件驱动触发
- [ ] 实现 DAG 工作流
- [ ] 添加调度管理 UI
- [ ] 实现调度历史记录

**工作量：** 10-14 天

#### P7-3: Docker 部署支持
- [ ] 创建 Dockerfile
- [ ] 创建 docker-compose.yml
- [ ] 配置健康检查
- [ ] 编写部署文档
- [ ] 测试一键部署

**工作量：** 3-5 天

### 阶段八：企业级特性（优先级：🟢 低）- 2-3周

#### P8-1: 资源调度与弹性
- [ ] 实现资源池管理
- [ ] 实现自动伸缩
- [ ] 实现并发控制
- [ ] 添加资源监控 UI
- [ ] 实现成本统计

**工作量：** 10-14 天

#### P8-2: 安全与治理
- [ ] 实现零信任架构
- [ ] 实现 RBAC 权限
- [ ] 实现审计日志
- [ ] 添加敏感数据加密
- [ ] 实现安全扫描

**工作量：** 10-14 天

#### P8-3: Kubernetes 部署
- [ ] 创建 K8s manifests
- [ ] 配置 Ingress
- [ ] 配置持久化存储
- [ ] 实现 Helm Chart
- [ ] 测试高可用部署

**工作量：** 7-10 天

---

## 十五、更新后的里程碑时间线

```
Week 1-2:   阶段一（基础完善）
Week 3-5:   阶段二（核心功能增强）
Week 6-7:   阶段三（用户体验优化）
Week 8-10:  阶段四（高级功能）
Week 11:    阶段五（测试和发布）
Week 12-14: 阶段六（24/7 平台基础能力）
Week 15-17: 阶段七（多项目与部署）
Week 18-20: 阶段八（企业级特性）
```

### 更新后版本规划

| 版本 | 内容 | 预计时间 |
|------|------|----------|
| v0.2.0 | 阶段一完成 | Week 2 |
| v0.3.0 | 阶段二完成 | Week 5 |
| v0.4.0 | 阶段三完成 | Week 7 |
| v0.5.0 | 阶段四完成 | Week 10 |
| v1.0.0 | 阶段五完成，正式发布 | Week 11 |
| v1.1.0 | 阶段六完成，24/7 能力 | Week 14 |
| v1.2.0 | 阶段七完成，多项目支持 | Week 17 |
| v2.0.0 | 阶段八完成，企业级就绪 | Week 20 |

---

## 十六、竞品对比与差异化

### 16.1 与主要竞品对比

| 能力 | Ralph (目标) | Vibe Kanban | Cursor | Windsurf |
|------|--------------|-------------|--------|----------|
| **多代理编排** | ✅ 强 | ✅ 强 | ⚠️ 中 | ⚠️ 中 |
| **24/7 自主运行** | ✅ 目标 | ❌ 无 | ❌ 无 | ❌ 无 |
| **自愈能力** | ✅ 目标 | ❌ 无 | ❌ 无 | ❌ 无 |
| **状态检查点** | ✅ 目标 | ❌ 无 | ❌ 无 | ⚠️ 有限 |
| **多项目管理** | ✅ 目标 | ❌ 单项目 | ✅ 多项目 | ✅ 多项目 |
| **Web Dashboard** | ✅ 强 | ✅ 强 | ❌ 无 | ❌ 无 |
| **可视化构建器** | ✅ React Flow | ❌ 无 | ❌ 无 | ❌ 无 |
| **Human-in-Loop** | ✅ Telegram | ❌ 无 | ✅ 聊天 | ✅ Cascade |
| **开源** | ✅ 是 | ✅ 是 | ❌ 否 | ❌ 否 |
| **自托管** | ✅ 是 | ✅ 是 | ❌ 否 | ❌ 否 |

### 16.2 Ralph 的差异化优势

1. **24/7 自主运行** - 市场上唯一专注于持续自主运行的代理编排平台
2. **自愈架构** - 三层容错机制，最大限度减少人工干预
3. **检查点系统** - 支持时间旅行、断点恢复
4. **开放架构** - 完全开源，支持自托管
5. **灵活的 Hat 系统** - 可视化构建代理工作流
6. **多后端支持** - Claude、Gemini、Codex、Kiro 等

---

## 十七、技术选型补充

### 17.1 24/7 平台新增依赖

```json
{
  "dependencies": {
    // 监控与指标
    "prom-client": "^15.0.0",           // Prometheus 指标导出

    // 调度
    "node-cron": "^3.0.0",              // Cron 调度
    "bullmq": "^5.0.0",                 // 任务队列 (可选，替代现有队列)

    // 序列化
    "protobufjs": "^7.2.0",             // Protocol Buffers (可选)

    // 告警
    "nodemailer": "^6.9.0",             // 邮件通知

    // 健康检查
    "terminus": "^4.0.0",               // 优雅关闭和健康检查
    "@fastify/under-pressure": "^8.0.0" // 负载监控
  }
}
```

### 17.2 可选基础设施

| 组件 | 推荐方案 | 用途 |
|------|----------|------|
| **时序数据库** | InfluxDB / TimescaleDB | 指标存储 |
| **日志聚合** | Loki / Elasticsearch | 日志搜索 |
| **可视化** | Grafana | 监控仪表盘 |
| **消息队列** | Redis / RabbitMQ | 任务队列 |
| **缓存** | Redis | 状态缓存 |

---

## 十八、总结与路线图

### 18.1 Ralph 的愿景

Ralph 致力于成为：

> **"世界上第一个 7×24 小时自主运行的 AI 代理编排平台"**

通过系统性的能力建设，Ralph 将具备：
- 🔄 **自我修复** - 无需人工干预的故障恢复
- 📊 **自我监控** - 实时健康状态感知
- 📈 **自我优化** - 基于历史的性能调优
- 🛡️ **自我保护** - 安全威胁自动防御

### 18.2 开发路线图总结

```
2026 Q1 (Week 1-11): Web Dashboard 完整版
├── 基础完善、核心功能、用户体验、高级功能
└── 发布 v1.0.0 - 功能完整的 Web Dashboard

2026 Q2 (Week 12-17): 24/7 平台能力
├── 进程守护、检查点、监控告警
├── 多项目管理、任务调度
└── 发布 v1.2.0 - 7×24 自主运行能力

2026 Q3 (Week 18-20): 企业级就绪
├── 资源调度、安全治理
├── Kubernetes 部署
└── 发布 v2.0.0 - 企业级智能体平台
```

### 18.3 关键成功因素

| 因素 | 重要性 | 措施 |
|------|--------|------|
| **稳定性** | 🔴 关键 | 自愈架构 + 检查点 |
| **可观测性** | 🔴 关键 | 监控 + 告警 + 日志 |
| **易用性** | 🟡 重要 | 优秀 UI + 文档 |
| **可扩展性** | 🟡 重要 | 插件架构 + API |
| **安全性** | 🟡 重要 | 零信任 + 审计 |
| **社区** | 🟢 有益 | 开源 + 文档 + 支持 |

---

*文档版本: 3.0*
*创建时间: 2026-02-22*
*更新时间: 2026-02-22*
*作者: Ralph 编排系统分析*
