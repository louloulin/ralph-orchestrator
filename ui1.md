# Ralph Web UI 1.0 - AI 原生界面设计

> **状态**: 草稿 | **版本**: 1.0 | **创建日期**: 2026-02-26

## 执行摘要

本文档概述了 Ralph Web Dashboard 从传统多页仪表板到 AI 原生聊天中心的 UI/UX 转换方案，灵感来源于 Claude Code、Cursor 和现代 AI 产品。

**核心变化:**
- **主界面**: 基于聊天的交互（类似 Claude Code）
- **渐进式展示**: 侧边面板用于任务、规划、监控
- **多任务可见性**: 始终可见的活动循环坞
- **简化导航**: 3 层结构（聊天 → 面板 → 设置）
- **删除**: Skills 页面（底层 Claude Code 已支持 skills）

---

## 目录

1. [设计理念](#设计理念)
2. [当前状态分析](#当前状态分析)
3. [目标用户体验: AI Chatbox + 编排](#目标用户体验-ai-chatbox--编排)
4. [架构图](#架构图)
5. [UI 组件系统](#ui-组件系统)
6. [导航结构](#导航结构)
7. [技术增强](#技术增强)
8. [实施路线图](#实施路线图)
9. [设计规范](#设计规范)
10. [Claude Agent Skills 协议](#claude-agent-skills-协议)
11. [参考文献](#参考文献)

---

## 设计理念

### 从传统到 AI 原生

**传统仪表板模式**（当前）:
```
用户 → 导航到页面 → 填写表单 → 提交 → 查看结果
```

**AI 原生模式**（目标）:
```
用户 → 聊天界面 → Agent 规划 → Agent 执行 → 实时反馈
```

### 核心原则

#### 1. 对话作为主要界面
- 聊天不是功能，它是主界面
- 始终可访问的输入（持久底部栏）
- 消息线程显示 Agent 推理、工具调用、结果
- 代码变更内联显示在对话中

#### 2. 渐进式展示
- 从最简开始（仅聊天输入）
- 按需揭示面板（任务、规划、监控）
- 折叠以保持专注
- 上下文感知提示

#### 3. 多任务可见性
- 始终看到 Agent 正在做什么
- 实时状态指示器
- 快速切换活动任务
- 一目了然的任务生命周期

#### 4. 混合工作流支持
- **Cursor 风格**: 实时内联编辑
- **Claude Code 风格**: 自主任务委托
- **规划模式**: 规格 → 设计 → 实现
- 无缝模式切换

#### 5. 设计智能
- 行业标准配色方案
- 一致的间距（8px 网格）
- 专业图标
- 可访问对比度（WCAG 2.1 AA）
- 用于反馈的微交互

---

## 当前状态分析

### 架构概览

**技术栈:**
- React 19, TypeScript, Vite 7
- Tailwind CSS v4 (OKLCH 颜色系统)
- Zustand（状态管理）
- tRPC（类型安全 API）
- React Router v7
- WebSocket（实时日志）
- Lucide React（图标）

**当前页面（12个）:**
1. Dashboard（默认）
2. Tasks
3. Kanban
4. Plan
5. Teams
6. Monitoring
7. Checkpoints
8. Healing
9. Skills（待删除）
10. Projects
11. Builder
12. Settings

### 组件结构

```
frontend/ralph-web/src/
├── components/
│   ├── ui/              # 基础组件（Button, Card, Input）
│   ├── shared/          # 可复用（CommandPalette, ErrorBoundary, ThemeToggle）
│   ├── dashboard/       # StatCard, ActivityTimeline, QuickActions
│   ├── tasks/           # TaskInput, ThreadList, TaskThread
│   ├── kanban/          # KanbanCard, KanbanColumn
│   ├── builder/         # Flow builder 组件
│   ├── plan/            # PlanLanding, PlanSession
│   ├── teams/           # Team 管理
│   └── monitoring/      # Process 监控
├── pages/               # 路由级页面组件
├── stores/              # Zustand stores
└── store.ts             # 主 UI store
```

### 状态管理

**Zustand Stores:**
- store.ts - UI 状态（侧边栏、任务展开）
- themeStore.ts - 主题偏好
- i18nStore.ts - 国际化
- projectStore.ts - 活动项目
- commandPaletteStore.ts - Cmd+K 调色板
- diffStore.ts - Diff 查看器
- thinkingStore.ts - Thinking 面板
- logStore.ts - 日志流
- toastStore.ts - 通知

---

## 目标用户体验: AI Chatbox + 编排

### 主视图: 聊天界面

```
┌───────────────────────────────────────────────────────────────────┐
│  Ralph  ● 运行中: 3  任务: 12  [⌘K]                    ⚙️ 主题  │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 👤 用户        今天 2:30 PM                              │  │
│  │ 重构认证系统以使用 JWT tokens                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🤖 Agent [思考中...]  今天 2:30 PM                      │  │
│  │ ┌─ 思考: 分析当前认证流程                                │  │
│  │ │  ✓ 在 src/auth/service.ts 找到 AuthService            │  │
│  │ │  ✓ 当前实现使用 session cookies                       │  │
│  │ │  → 计划: 迁移到 JWT 并使用 refresh token rotation     │  │
│  │ └─ [折叠]                                                │  │
│  │                                                          │  │
│  │ → 工具: 读取文件 src/auth/service.ts                     │  │
│  │ ┌────────────────────────────────────────────────────┐   │  │
│  │ │ export class AuthService {                         │   │  │
│  │ │   async login(email, password) {                   │   │  │
│  │ │     // Session-based auth                          │   │  │
│  │ │     const session = await createSession(...);      │   │  │
│  │ │   }                                                 │   │  │
│  │ │ }                                                   │   │  │
│  │ └────────────────────────────────────────────────────┘   │  │
│  │                                                          │  │
│  │ → 工具: 写入文件 src/auth/jwt.service.ts                │  │
│  │ [✓ 已创建带 token rotation 的 JWT 服务]                │  │
│  │                                                          │  │
│  │ → 工具: 运行测试                                        │  │
│  │ [✓ 测试通过 (15/15)]                                    │  │
│  │                                                          │  │
│  │ ✓ 已将认证系统重构为 JWT。摘要:                         │  │
│  │   - 创建了带 access/refresh tokens 的 JwtAuthService    │  │
│  │   - 实现了 token rotation（7 天 refresh）              │  │
│  │   - 添加了 JWT 验证中间件                              │  │
│  │   - 所有测试通过                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 👤 用户        今天 2:35 PM                              │  │
│  │ 太好了！现在添加速率限制以防止暴力破解                   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🤖 Agent [运行中...]  今天 2:35 PM                      │  │
│  │ → 工具: 读取文件 src/auth/middleware.ts                  │  │
│  │ [加载中...]                                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [─────────────────────────────────────────────────────────]    │
│  [📎] 描述你需要什么...                          发送 (⌘↵)  │
└───────────────────────────────────────────────────────────────────┘
```

### 侧边面板（从右侧滑出）

**任务面板（Cmd+1）**
- 搜索和筛选任务
- 显示运行中、暂停、已完成的任务
- 任务状态指示器

**规划面板（Cmd+2）**
- 活动规格列表
- 草稿规格
- 规划进度追踪

**监控面板（Cmd+3）**
- 系统健康状态
- 活动循环列表
- 实时指标
- 最近事件

### 持久坞（底部）

```
┌───────────────────────────────────────────────────────────────┐
│ [🔄 JWT 重构] [⏸️ 速率限制] [✓ 修复 Bug]   [+] [⏸️ 全部]        │
└───────────────────────────────────────────────────────────────┘
```

---

## 架构图

### 组件层次结构

```
App
├── AppShell
│   ├── Sidebar（可折叠，移动端可折叠）
│   │   ├── Logo + ProjectSelector
│   │   ├── NavSections（主页、任务、Agents、运行时、设置）
│   │   └── ThemeToggle + LocaleSwitcher
│   │
│   └── MainContent
│       ├── TopBar（面包屑、系统状态）
│       │
│       ├── ChatPage（默认 - 新建）
│       │   ├── MessageThread（虚拟滚动）
│       │   │   ├── UserMessage
│       │   │   ├── AgentMessage
│       │   │   ├── ThinkingBlock（可折叠）
│       │   │   ├── ToolCallCard
│       │   │   └── DiffInline
│       │   │
│       │   └── ChatInput（持久底部）
│       │       ├── Textarea（自动展开）
│       │       ├── FileAttachButton
│       │       ├── ContextMenu（附加规格、预设）
│       │       └── SendButton
│       │
│       ├── SidePanels（从右侧滑出）
│       │   ├── TasksPanel（TasksPage 改编）
│       │   ├── PlanPanel（PlanPage 改编）
│       │   ├── MonitorPanel（Monitoring + Checkpoints + Healing）
│       │   ├── TeamsPanel
│       │   └── ProjectsPanel
│       │
│       ├── ActiveLoopsDock（底部、持久）
│       │   ├── LoopCard（迷你状态）
│       │   ├── QuickActions
│       │   └── BulkControls
│       │
│       └── Other Pages（独立）
│           ├── BuilderPage（flow builder）
│           └── SettingsPage
│
└── GlobalComponents
    ├── CommandPalette（Cmd+K）
    ├── ToastContainer
    └── ErrorBoundary
```

### 数据流

```
用户输入（ChatInput）
    ↓
tRPC Mutation（task.create）
    ↓
Backend（TaskQueueService）
    ↓
Agent Loop（Ralph 编排）
    ↓
WebSocket 事件（Agent 输出、工具调用）
    ↓
MessageThread（实时更新）
    ↓
SidePanels（反映状态）
    ↓
ActiveLoopsDock（显示状态）
```

---

## UI 组件系统

### 新组件（待创建）

#### MessageThread
- 虚拟滚动支持
- 多种消息类型（user, agent, thinking, tool, diff, status, error）
- 流式消息支持

#### ChatInput
- 自动展开 textarea
- 文件拖放附件
- 上下文菜单（附加规格、选择预设）
- 键盘快捷键（⌘↵ 发送）

#### SidePanel
- 滑入动画
- 点击外部关闭
- Esc 关闭
- 可调整宽度
- 多面板标签页

#### LoopCard
- 状态指示器（运行、暂停、完成、失败）
- 迷你状态
- 进度条
- 控制按钮

#### ThinkingBlock
- 可折叠推理显示
- 结构使用等宽字体
- 复制按钮

#### DiffInline
- 消息内联 diff
- 语法高亮
- 展开/折叠

### 增强的现有组件

- TaskInput → ChatInput 迁移
- ThreadList → TasksPanel
- MonitoringPage → MonitorPanel

---

## 导航结构

### 之前（当前）
```
/dashboard（默认）
/tasks
/kanban
/plan
/teams
/monitoring
/checkpoints
/healing
/skills（待删除）
/projects
/builder
/settings
```

### 之后（提议）
```
/chat（新默认）
  - 主聊天界面
  - 始终可访问的输入

面板（滑出，可通过 Cmd+1-5 访问）:
  /tasks-panel
  /plan-panel
  /monitor-panel
  /teams-panel
  /projects-panel

独立页面:
  /builder
  /settings

已删除:
  /skills（底层 Claude Code 支持 skills）
  /dashboard（合并到 /chat）
  /kanban（移动到 TasksPanel）
```

---

## 技术增强

### 新依赖
- @tanstack/react-virtual（虚拟滚动）
- framer-motion（动画）
- react-markdown + remark-gfm + rehype-highlight（Markdown 支持）
- mermaid（图表支持）

### WebSocket 增强
- 扩展 /ws/logs 用于聊天流
- 支持消息、思考、工具、diff、状态类型

### 性能优化
1. 虚拟滚动（长消息线程）
2. 消息分页
3. 代码拆分和延迟加载

---

## 实施路线图

### 阶段 1: 基础（第 1-2 周）

1. 创建 ChatPage 组件
2. 增强 TaskInput → ChatInput
3. 创建消息组件
5. 更新路由

### 阶段 2: 侧边面板（第 2-3 周）

1. 实现 SidePanel 系统
2. 改编现有页面为面板
3. 添加面板键盘快捷键
4. 面板状态管理

### 阶段 3: 多任务 UI（第 3-4 周）

1. 创建 ActiveLoopsDock 组件
2. 实现 LoopCard 组件
3. 创建循环详情视图
4. 集成现有 WebSocket

### 阶段 4: 完善（第 4-5 周）

1. Command Palette v2
2. 快速操作栏
3. 键盘导航
4. 性能优化
5. 动画完善
6. 可访问性审计

---

## 设计规范

### 字体排版
- 字体族: Inter（sans）、JetBrains Mono（mono）
- 8px 网格系统

### 颜色（OKLCH 系统）
- 状态颜色: success、warning、error、info
- Agent 状态: thinking（紫）、running（蓝）、completed（绿）、failed（红）

### 组件规范
- MessageBubble、ChatInput、SidePanel、LoopCard 样式规范
- 动画规范（面板滑入、消息淡入）

---

## Claude Agent Skills 协议

### 概述

Claude Agent Skills 协议是一种基于 Markdown 的技能定义格式，用于扩展 Claude Code 的能力。Ralph 支持通过此协议定义和管理 AI Agent 的技能集合。

### 技能格式

每个技能是一个独立的 Markdown 文件，使用 YAML frontmatter 定义元数据，后跟详细说明。

#### 基本结构

```markdown
---
name: skill-name
description: 技能的简短描述
---

# 技能名称

## 使用场景
描述何时使用此技能...

## 实现细节
详细说明技能如何工作...

## 示例
展示技能使用的示例...
```

#### 元数据字段

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| name | string | 是 | 技能唯一标识符 |
| description | string | 是 | 技能功能的简短描述 |

### Ralph 中的 Skills 实现

#### 技能存储位置

```
.claude/skills/
├── SKILL.md              # Ralph Tools 技能（主技能）
├── commit/SKILL.md       # Git commit 技能
├── code-assist/SKILL.md  # 代码辅助技能
└── ...
```

#### 当前实现的 Skills

1. **ralph-tools** - 在 Ralph 编排运行期间管理运行时任务和记忆
2. **commit** - 创建格式良好的提交和约定式提交消息
3. **code-assist** - 使用测试驱动开发实现代码任务

### 技能加载机制

#### 技能发现

Ralph 在 .claude/skills/ 目录中自动发现技能

#### 技能触发

技能通过关键词或命令触发

### 为什么不需要 Skills 页面

1. **底层已支持**: Claude Code 本身就支持技能系统
2. **Markdown 格式**: 技能定义是简单的 Markdown 文件，易于编辑
3. **命令行接口**: 使用 ralph tools skill list/load 管理技能
4. **上下文感知**: 技能在运行时按需加载，无需 UI 管理

### 技能最佳实践

#### 命名规范
- 使用 kebab-case
- 名称应该简短且描述性强
- 避免使用通用术语

#### 文档结构
1. 清晰的用途说明
2. 真实的使用示例
3. 命令参考
4. 工作流示例

### 未来扩展

#### 技能类型（建议）
1. 域特定技能（frontend、backend、devops）
2. 工具集成技能（docker、k8s、terraform）
3. 语言特定技能（rust、python、typescript）

---

## 参考文献

### 研究来源

1. **2026 年 AI 编程工具横评** - Copilot、Cursor、Claude Code、Windsurf、Trae 的比较
2. **Claude Code vs Cursor体验** - 开发者体验比较
3. **AI编程助手设计增强插件** - UI UX Pro Max
4. **GitHub 霸榜：UI UX Pro Max** - 专业设计能力

### 设计灵感

- Claude Code - 终端原生 Agent 优先界面
- Cursor - IDE 集成 Copilot 及实时反馈
- Linear - 速度、键盘快捷键、极简 UI
- Vercel - 干净、暗主题、OKLCH 颜色
- GitHub Copilot - 内联建议、聊天界面

### 可访问性标准

- WCAG 2.1 AA
- ARIA Authoring Practices
- WebAIM Contrast Checker

---

## 附录

### 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| ⌘K / Ctrl+K | 打开命令面板 |
| ⌘1 / Ctrl+1 | 打开任务面板 |
| ⌘2 / Ctrl+2 | 打开规划面板 |
| ⌘3 / Ctrl+3 | 打开监控面板 |
| ⌘4 / Ctrl+4 | 打开团队面板 |
| ⌘5 / Ctrl+5 | 打开项目面板 |
| Esc | 关闭活动面板 |
| ⌘↵ / Ctrl+Enter | 发送消息 |
| ⌘I / Ctrl+I | 附加文件 |
| ⌘/ | 聚焦搜索 |

### 文件结构（之后）

```
frontend/ralph-web/src/
├── components/
│   ├── chat/                # 新建
│   ├── panels/              # 新建
│   ├── dock/                # 新建
│   └── ...（现有）
├── pages/
│   ├── ChatPage.tsx         # 新建（默认）
│   ├── ...（改编/保持）
├── stores/
│   ├── chatStore.ts         # 新建
│   ├── panelStore.ts        # 新建
│   ├── loopStore.ts         # 新建
│   └── ...（现有）
├── hooks/
│   ├── useChat.ts           # 新建
│   ├── usePanels.ts         # 新建
│   ├── useLoops.ts          # 新建
│   └── ...（现有）
├── App.tsx                  # 更新路由
└── main.tsx
```

---

**文档版本:** 1.0
**最后更新:** 2026-02-26
**作者:** Ralph (AI Agent)
**状态:** 草稿 - 待审核
