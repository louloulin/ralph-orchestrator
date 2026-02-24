# Ralph 编程平台改进计划 v2.2

> **创建时间**: 2026-02-24
> **更新时间**: 2026-02-25
> **基于**: 前后端真实验证（Playwright 测试）、1code/Vibe Kanban 参考分析、Ralph 核心理念
> **目标**: 打造 Ralph 专属编程平台，融合 AI Agent 编排与现代看板管理

---

## 一、现状分析（2026-02-25 更新）

### 1.1 已完成功能（真实验证通过）

#### 后端服务 (http://localhost:3000) - ✅ 完全正常
- ✅ tRPC API 完整实现：task.list、loops.list、monitoring、checkpoint、teams 等 11 个路由
- ✅ 数据库集成：SQLite + Drizzle ORM
- ✅ WebSocket 实时日志推送：/ws/logs
- ✅ REST API：/api/v1/* 端点
- ✅ 静态文件服务：前端资源托管
- ✅ CORS 配置：跨域支持
- ✅ 健康检查：/health 端点
- ✅ 任务分发器正常：maxConcurrent=3, 轮询间隔 100ms
- ✅ 循环管理器正常：每 30s 处理一次
- ✅ 任务桥接正常：DB 任务 → 执行队列
- ✅ 进程恢复：4 个任务成功重连
- ✅ **AgentTeamsService 完整实现**（P4.5-1 后端）
  - 团队创建/启动/暂停/停止
  - 任务分发策略：parallel/pipeline/expert/voting
  - 上下文共享：selective/full/none
  - Agent 状态跟踪
  - 活动日志记录

#### 前端界面 - ✅ 全部验证通过
- ✅ **仪表盘页面**：系统状态、活动时间线、快捷操作
- ✅ **任务页面**：任务列表、创建任务、搜索过滤
- ✅ **看板页面**：拖拽式任务管理（@dnd-kit）
- ✅ **团队页面**：Agent Teams 基础 UI
  - ✅ TeamsList 组件（列表视图）
  - ✅ TeamCard 组件（卡片视图）
  - ✅ TeamCreateDialog 组件（创建对话框）
  - ✅ TeamDetail 组件（详情页）
  - ❌ **缺少**：实时状态更新、Agent 可视化、Activity Timeline

### 1.2 当前实现状态总结

| 功能模块 | 后端状态 | 前端状态 | 优先级 |
|---------|---------|---------|--------|
| **P4.5-1 Agent Teams** | ✅ 完整 | 🟡 基础 | P1 |
| P5-1 多项目管理 | ❌ 无 | ❌ 无 | P1 |
| P4.5-2 Skills 系统 | ❌ 无 | ❌ 无 | P2 |
| P4-2 检查点 UI | ❌ 无 | ❌ 无 | P2 |
| P4-4 自愈机制 UI | ❌ 无 | ❌ 无 | P2 |

### 1.3 P4.5-1 Agent Teams 待完成项

#### 已实现（后端 + 基础前端）
```typescript
// AgentTeamsService.ts - 全部完成
✅ createTeam() - 团队创建
✅ getTeam() / listTeams() - 团队查询
✅ updateTeam() - 团队更新
✅ startTeam() / pauseTeam() / stopTeam() - 生命周期管理
✅ updateAgentStatus() - Agent 状态更新
✅ updateSharedContext() - 上下文管理
✅ getActivityLogs() - 活动日志
✅ getStats() - 统计信息
✅ 任务分发策略: parallel/pipeline/expert/voting
✅ 上下文共享模式: selective/full/none
```

#### 待实现（前端增强）

| 组件 | 说明 | 预计工作量 |
|------|------|-----------|
| **ActivityTimeline** | 活动时间线组件 | 0.5 天 |
| **TeamVisualizer** | Agent 节点可视化 (@xyflow/react) | 1 天 |
| **AgentStatusBadge** | Agent 状态徽章 | 0.25 天 |
| **WebSocket 集成** | 实时状态推送 | 0.5 天 |
| **teamsStore** | Zustand 状态管理 | 0.25 天 |

### 1.4 发现的问题

#### 问题 1: WebSocket 连接警告（低 🟢）
**现象**：
- 控制台显示多个 "WebSocket connection to 'ws://localhost..." 警告
- 可能是多个任务同时尝试建立连接

#### 问题 2: Settings 表单警告（低 🟢）
**现象**：
- React 19 新特性警告："You provided a `value` prop to a form field"

#### 问题 3: LoopSupervisor 未配置（预期行为）
**说明**：
- 这是预期行为，LoopSupervisor 是 Phase 4 的可选功能

---

## 二、参考分析：1code 和 Vibe Kanban

### 2.1 1code (onner.ai) 核心特性

基于网络搜索和分析，1code 的核心价值：

#### 1. **AI Agent 编排能力**
- 统一接口切换不同 AI 编码助手（Claude Code、Gemini CLI、Codex、Cursor、Copilot 等）
- 为每个任务分配合适的 Agent
- 并行执行多个任务，冲突隔离

#### 2. **智能任务创建**
- 自然语言需求解析
- 自动任务分解
- 实时代码预览

#### 3. **版本历史**
- 完整的修改记录
- 多版本对比
- 一键回滚

### 2.2 Vibe Kanban 核心特性

基于网络搜索和资料分析，Vibe Kanban (BloopAI/vibe-kanban, ~15k stars) 的核心价值：

#### 1. **Git Worktree 隔离**
- 每个任务独立 Git Worktree
- 避免多任务冲突
- 一键 rebase/merge

#### 2. **看板式任务管理**
- Todo → In Progress → Done/Failed 流程
- 实时进度监控
- 拖拽式任务调度

#### 3. **代码审查优先**
- Diff 可视化查看
- 人工审核后才合并
- 反馈循环优化

#### 4. **本地化与安全**
- 本地运行，不发送代码到外部
- 开源免费（仅支付 AI 模型费用）

### 2.3 Ralph 的独特优势（不应丢失）

| 特性 | 1code/Vibe Kanban | Ralph | 说明 |
|------|-------------------|-------|------|
| **Hat 系统** | ❌ | ✅ | 角色化 Agent，可扩展的工作流定义 |
| **事件驱动架构** | 部分 | ✅ | 基于 Event Loop 的编排系统 |
| **记忆系统** | ❌ | ✅ | 跨会话持久化学习 |
| **任务系统** | 基础 | ✅ | 完整的依赖、阻塞、优先级管理 |
| **24/7 平台能力** | ❌ | ✅ | Process Daemon、检查点、自愈 |
| **多后端支持** | 有限 | ✅ | Claude、Kiro、Gemini、Codex |
| **编程语言** | TypeScript/Rust | Rust | 性能优势 |

### 2.4 应该借鉴的功能

| 功能 | 借鉴来源 | Ralph 适配方案 |
|------|----------|---------------|
| **自然语言任务创建** | 1code | Ralph Prompt 输入框增强 |
| **Git Worktree** | Vibe Kanban | Ralph 已支持并行 Loop，可增强 Worktree UI |
| **Agent 选择器** | 1code | Hat Collection 可视化编辑（已有）+ 运行时选择 |
| **代码审查流程** | Vibe Kanban | Thinking Panel + Diff Viewer（已完成） |
| **并行任务执行** | Vibe Kanban | Ralph Parallel Loops（已有）+ 看板可视化 |
| **简化的 UX** | 两者 | Ralph Command Palette（已完成） |

---

## 二、改进计划：P4.5-1 Agent Teams 完善（2026-02-25 新增）

### 2.1 ActivityTimeline 组件

**目标**: 显示团队活动历史，时间戳 + 消息内容

**UI 设计**:
```
┌─────────────────────────────────────────────────────────┐
│ Recent Activity (Last 20)                              │
├─────────────────────────────────────────────────────────┤
│ [15:32:05] ✅ Coordinator: Team started execution     │
│ [15:32:10] 🔄 Backend Dev: Agent started (phase 1)   │
│ [15:32:15] ⏳ Frontend Dev: Waiting for task         │
│ [15:31:58] 🔄 QA Engineer: Waiting for task          │
└─────────────────────────────────────────────────────────┘
```

**实现步骤**:
1. 创建 `frontend/ralph-web/src/components/teams/ActivityTimeline.tsx`
2. 使用 tRPC `teams.activity` 端点获取日志
3. 添加时间格式化、过滤功能

### 2.2 AgentStatusBadge 组件

**目标**: 清晰展示 Agent 状态

**状态定义**:
| 状态 | 颜色 | 说明 |
|------|------|------|
| idle | 灰色 | 等待中 |
| running | 蓝色 | 执行中 |
| waiting | 黄色 | 等待其他 Agent |
| completed | 绿色 | 已完成 |
| failed | 红色 | 失败 |

**实现步骤**:
1. 创建 `frontend/ralph-web/src/components/teams/AgentStatusBadge.tsx`
2. 使用 AGENT_STATUS_COLORS 类型

### 2.3 TeamVisualizer 组件（节点图）

**目标**: 可视化展示 Agent 团队结构

**UI 设计**:
```
         ┌──────────────┐
         │  Coordinator │
         │     (Planner)│
         │      ●Running │
         └──────┬───────┘
                │
        ┌───────┴───────┐
        │               │
   ┌────▼────┐    ┌────▼────┐
   │ Backend │    │Frontend │
   │ Developer│   │ Developer│
   │  ●Running│   │ ○ Idle  │
   └─────────┘    └─────────┘
        │
   ┌────▼────┐
   │   QA    │
   │ Engineer │
   │ ○ Idle  │
   └─────────┘
```

**实现步骤**:
1. 安装 `@xyflow/react` 依赖
2. 创建 `frontend/ralph-web/src/components/teams/TeamVisualizer.tsx`
3. 使用 React Flow 绘制节点图

### 2.4 WebSocket 实时更新

**目标**: 团队状态实时推送

**实现方案**:
1. 扩展现有 WebSocket 消息类型
2. 添加 `teams.update` 消息格式
3. 在 teamsStore 中处理实时更新

**消息格式**:
```typescript
interface TeamUpdateMessage {
  type: 'team.update';
  teamId: string;
  data: {
    status?: TeamStatus;
    agents?: AgentRole[];
    progress?: number;
  };
  timestamp: Date;
}
```

### 2.5 teamsStore 状态管理

**目标**: 统一管理团队状态

**实现步骤**:
1. 创建 `frontend/ralph-web/src/stores/teamsStore.ts`
2. 管理团队列表、选中团队、活动日志
3. 集成 WebSocket 实时更新

---

## 三、改进计划（续）

### 3.1 优先级 P0：验证通过，确认无需修复

**验证结论 (2026-02-24)**:
经过 Playwright 真实验证，确认以下功能全部正常工作：
- ✅ 前后端通信正常（tRPC API 响应正确）
- ✅ 服务器进程管理正常（单一进程监听端口）
- ✅ 所有页面数据加载正常
- ✅ WebSocket 连接正常

**无需修复的问题**（原 P0-1、P0-2）：
- ❌ 删除：API 代理配置失效 - 经验证工作正常
- ❌ 删除：服务器进程管理混乱 - 经验证工作正常

### 3.2 优先级 P1：核心功能增强（1-2 周）

#### P1-1: 多项目管理 (参考 Vibe Kanban)
**目标**: 支持多个独立项目，每个项目独立的任务、循环、配置

**设计方案**:

```typescript
// 数据模型扩展
interface Project {
  id: string;              // proj-{timestamp}
  name: string;            // 项目名称
  description?: string;    // 项目描述
  rootPath: string;        // 项目根目录（绝对路径）
  active: boolean;         // 是否当前激活
  createdAt: Date;
  lastAccessedAt: Date;

  // 项目特定配置
  config: {
    backend: string;       // AI 后端
    hatCollection?: string;// Hat 集合 ID
    memoriesEnabled: boolean;
    tasksEnabled: boolean;
  };

  // 统计信息
  stats: {
    totalTasks: number;
    activeLoops: number;
    completedTasks: number;
  };
}
```

**后端 API**:
```typescript
// projectRouter
export const projectRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.projectService.listProjects();
  }),

  get: publicProcedure.input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.projectService.getProject(input.id);
    }),

  create: publicProcedure.input(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    rootPath: z.string(),
  })).mutation(({ ctx, input }) => {
    return ctx.projectService.createProject(input);
  }),

  switch: publicProcedure.input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.projectService.switchProject(input.id);
    }),

  update: publicProcedure.input(z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    config: z.object({
      backend: z.string().optional(),
      hatCollection: z.string().optional(),
    }).optional(),
  })).mutation(({ ctx, input }) => {
    const { id, ...updates } = input;
    return ctx.projectService.updateProject(id, updates);
  }),

  delete: publicProcedure.input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.projectService.deleteProject(input.id);
    }),
});
```

**前端页面**:
- 新增 `/projects` 路由
- 项目列表卡片：显示名称、路径、统计
- 项目详情页：配置编辑、任务列表、循环历史
- 全局项目切换器：类似语言切换器，常驻顶部栏

**数据库 Schema**:
```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  active BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  config_json TEXT NOT NULL,  -- JSON encoded config
  stats_json TEXT NOT NULL    -- JSON encoded stats
);
```

**实现步骤**:
1. 创建 `backend/ralph-web-server/src/services/ProjectService.ts`
2. 创建 `backend/ralph-web-server/src/repositories/ProjectRepository.ts`
3. 添加 `projectRouter` 到 `trpc.ts`
4. 创建 `frontend/ralph-web/src/pages/ProjectsPage.tsx`
5. 创建 `frontend/ralph-web/src/components/projects/ProjectCard.tsx`
6. 创建 `frontend/ralph-web/src/components/projects/ProjectSwitcher.tsx`
7. 更新路由配置
8. 更新 Sidebar 添加"项目"入口

**UI 参考**: Vibe Kanban 的项目切换器设计

#### P1-2: Agent Teams 完整实现（P4.5-1）⭐ 进行中
**目标**: 多 Agent 协作的可视化管理和监控

**当前状态** (2026-02-25):
- ✅ **后端 API 完整**: `teamsRouter` (12个端点)
- ✅ **数据模型完整**: `types/teams.ts`
- ✅ **服务层完整**: `AgentTeamsService.ts` (466 行)
- ✅ **前端基础组件**: `TeamsList`, `TeamCard`, `TeamCreateDialog`, `TeamDetail`
- ❌ **待实现**: 实时状态更新、Agent 节点可视化、Activity Timeline

**后端已实现**:
```typescript
// AgentTeamsService.ts 全部完成
✅ createTeam(input): AgentTeam
✅ getTeam(id), listTeams(filter): AgentTeam[]
✅ updateTeam(id, updates): AgentTeam
✅ startTeam(id), pauseTeam(id), stopTeam(id, reason?)
✅ updateAgentStatus(teamId, agentId, status, message?)
✅ getActivityLogs(teamId, limit?): AgentActivityLog[]
✅ getStats(): TeamStats
✅ 任务分发策略: parallel | pipeline | expert | voting
✅ 上下文共享模式: selective | full | none
```

**前端待实现** (参考第二章详细设计):

1. **ActivityTimeline 组件** (0.5 天)
   - 显示活动历史
   - 时间戳 + 消息内容
   - 可筛选日志级别

2. **AgentStatusBadge 组件** (0.25 天)
   - 状态指示器: idle/runnig/waiting/completed/failed
   - 颜色编码

3. **TeamVisualizer 组件** (1 天)
   - 节点图展示团队结构
   - 使用 @xyflow/react
   - 实时状态更新

4. **WebSocket 集成** (0.5 天)
   - 实时状态推送
   - teamsStore 状态管理

5. **teamsStore** (0.25 天)
   - Zustand store
   - 团队列表、选中团队、活动日志

**总计**: 约 2.5 天完成 P4.5-1

**依赖**: 无阻塞，可立即开始

**详细设计**: 参见第二章 "二、改进计划：P4.5-1 Agent Teams 完善"

1. **实时状态同步**
   - WebSocket 推送 Team 状态变化
   - 使用 Zustand store 管理 Team 状态
   - 自动刷新机制

2. **Agent 可视化**
   - 节点图展示 Team 结构（使用 @xyflow/react）
   - Agent 状态指示器：idle(灰色) / running(蓝色) / waiting(黄色) / completed(绿色) / failed(红色)
   - 共享上下文进度条（token 使用量）

3. **Activity 时间线**
   - 显示 Agent 活动历史
   - 时间戳 + 消息内容
   - 可筛选日志级别

**UI 设计**:
```
┌─────────────────────────────────────────────────────────┐
│  Teams                    [Create Team] [Start All]    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐   │
│  │ Team: E-Commerce Checkout                        │   │
│  │ Status: Running (2/4 agents active)              │   │
│  │ Context Sharing: Selective (45k/200k tokens)     │   │
│  │ ├─ Coordinator (Planner) ● Running               │   │
│  │ ├─ Backend Developer (Coder) ● Running            │   │
│  │ ├─ Frontend Developer (Coder) ○ Idle             │   │
│  │ └─ QA Engineer (Tester) ○ Idle                   │   │
│  │                                                  │   │
│  │ Recent Activity:                                 │   │
│  │ [15:32:01] Backend: Starting API implementation  │   │
│  │ [15:32:05] Coordinator: Task assigned to Backend │   │
│  │ [15:31:58] Frontend: Waiting for task           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Team: Blog Post Writer                          │   │
│  │ Status: Completed                               │   │
│  │ ...                                              │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**实现步骤**:
1. 创建 `frontend/ralph-web/src/stores/teamsStore.ts`
2. 创建 `frontend/ralph-web/src/components/teams/TeamCard.tsx`
3. 创建 `frontend/ralph-web/src/components/teams/AgentStatusBadge.tsx`
4. 创建 `frontend/ralph-web/src/components/teams/ActivityTimeline.tsx`
5. 创建 `frontend/ralph-web/src/components/teams/TeamVisualizer.tsx` (节点图)
6. 集成 WebSocket 实时更新
7. 添加 Create Team 对话框
8. 添加 Start/Pause/Stop 操作按钮

#### P1-3: Skills 技能系统（P4.5-2）
**目标**: 可插拔的技能模块，动态加载和执行

**设计方案**:

```typescript
// 技能定义
interface Skill {
  id: string;              // skill-{name}
  name: string;            // 显示名称
  description: string;     // 描述
  version: string;         // 版本号
  author?: string;         // 作者

  // 技能类型
  type: 'builtin' | 'user' | 'marketplace';

  // 执行配置
  handler: string;         // 处理函数路径
  timeout?: number;        // 超时时间（毫秒）
  memory?: number;         // 内存限制（MB）

  // 参数定义
  parameters: {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    default?: any;
    description?: string;
  }[];

  // 权限要求
  permissions: ('read' | 'write' | 'execute' | 'network')[];

  // 依赖
  dependencies?: string[]; // 依赖的其他技能 ID

  // 元数据
  tags: string[];
  category: string;        // 分类：git, code, test, deploy, etc.

  // 使用统计
  stats: {
    totalCalls: number;
    successRate: number;
    avgDuration: number;
  };
}
```

**后端 API**:
```typescript
// skillsRouter
export const skillsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.skillsService.listSkills();
  }),

  get: publicProcedure.input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.skillsService.getSkill(input.id);
    }),

  execute: publicProcedure.input(z.object({
    id: z.string(),
    parameters: z.record(z.any()),
  })).mutation(async ({ ctx, input }) => {
    return ctx.skillsService.executeSkill(input.id, input.parameters);
  }),

  install: publicProcedure.input(z.object({
    source: z.string(),     // npm package URL or git repo
  })).mutation(async ({ ctx, input }) => {
    return ctx.skillsService.installSkill(input.source);
  }),

  uninstall: publicProcedure.input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.skillsService.uninstallSkill(input.id);
  }),

  update: publicProcedure.input(z.object({
    id: z.string(),
  })).mutation(async ({ ctx, input }) => {
    return ctx.skillsService.updateSkill(input.id);
  }),
});
```

**技能市场 UI**:
- 技能列表：卡片式布局，显示名称、描述、标签、统计
- 技能详情：参数说明、使用示例、依赖关系
- 一键安装：npm 安装或 git clone
- 本地技能：用户自定义技能管理

**实现步骤**:
1. 创建 `backend/ralph-web-server/src/services/SkillsService.ts`
2. 创建 `backend/ralph-web-server/src/repositories/SkillsRepository.ts`
3. 添加技能加载器：支持 npm 包和本地文件
4. 添加技能执行器：沙箱环境
5. 创建 `frontend/ralph-web/src/pages/SkillsPage.tsx`
6. 创建 `frontend/ralph-web/src/components/skills/SkillCard.tsx`
7. 创建 `frontend/ralph-web/src/components/skills/SkillMarketplace.tsx`
8. 添加技能路由

### 3.3 优先级 P2：用户体验优化（2-3 周）

#### P2-1: 检查点恢复 UI（P4-2）
**目标**: 可视化检查点管理，支持时间旅行

**设计方案**:

1. **检查点时间线**
   - 横向时间轴显示所有检查点
   - 不同类型用颜色标记：interval(蓝) / pre_task(绿) / post_task(橙) / manual(紫)
   - 显示检查点大小和压缩比

2. **恢复操作**
   - 点击检查点查看详情
   - "从此恢复"按钮
   - 恢复预览：显示将恢复的文件和内存状态

3. **自动检查点策略配置**
   - 间隔时间配置
   - 最大保留数量
   - 存储空间限制

**UI 草图**:
```
┌─────────────────────────────────────────────────────────┐
│  Checkpoints: my-loop                                    │
├─────────────────────────────────────────────────────────┤
│  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐  │
│  │ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 │ 9 │10 │11 │12 │  │
│  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘  │
│    ▲                                                 ▲  │
│  Iter 5 (pre_task)                                Iter 12 │
│  2026-02-24 14:32:05                             (manual) │
│  Size: 1.2 MB (compressed: 45%)                   2026-02-24│
│  [Restore] [View Details]                         15:45:12 │
│                                                  Size: 2.1│
│                                                  MB [Rest │
│                                                  ore]    │
├─────────────────────────────────────────────────────────┤
│  Auto-Checkpoint Settings:                               │
│  ├─ Interval: 5 iterations                              │
│  ├─ Max Checkpoints: 20                                 │
│  ├─ Max Storage: 500 MB                                 │
│  └─ [Save Settings]                                     │
└─────────────────────────────────────────────────────────┘
```

**实现步骤**:
1. 扩展 `checkpointRouter` 添加可视化相关 API
2. 创建 `frontend/ralph-web/src/components/checkpoint/CheckpointTimeline.tsx`
3. 创建 `frontend/ralph-web/src/components/checkpoint/CheckpointCard.tsx`
4. 创建 `frontend/ralph-web/src/components/checkpoint/RestoreDialog.tsx`
5. 集成到 Loop 详情页

#### P2-2: 自愈机制 UI（P4-4）
**目标**: 可视化自愈层次，显示修复建议

**设计方案**:

**三层自愈架构可视化**:
```
┌─────────────────────────────────────────────────────────┐
│  Self-Healing Status: my-loop                            │
├─────────────────────────────────────────────────────────┤
│  Layer 1: Agent Self-Correction                          │
│  ├─ Status: ✅ Active                                    │
│  ├─ Corrections: 5 attempts, 3 successful                │
│  └─ Known Patterns: 12 loaded                           │
│                                                          │
│  Layer 2: Platform Intervention                          │
│  ├─ Status: ⚠️ Throttled (3 attempts in last hour)      │
│  ├─ Last Intervention: 2026-02-24 14:32:05              │
│  └─ Next Available: 2026-02-24 15:32:05                 │
│                                                          │
│  Layer 3: Circuit Breaker                                │
│  ├─ State: Closed (allowing requests)                   │
│  ├─ Failure Threshold: 5 failures in 60s                │
│  ├─ Current Failures: 2                                 │
│  └─ [Reset Circuit Breaker]                             │
├─────────────────────────────────────────────────────────┤
│  Recent Healing Attempts:                                │
│  [14:32:05] ✅ Layer 1: Fixed NPM dependency issue      │
│  [14:28:12] ❌ Layer 2: Platform restart failed         │
│  [14:15:33] ✅ Layer 1: Corrected TypeScript error     │
└─────────────────────────────────────────────────────────┘
```

**实现步骤**:
1. 扩展 `processRouter` 添加自愈状态 API
2. 创建 `frontend/ralph-web/src/components/monitoring/SelfHealingPanel.tsx`
3. 创建 `frontend/ralph-web/src/components/monitoring/CircuitBreakerView.tsx`
4. 集成到 Monitoring 页面

#### P2-3: 交互优化
**目标**: 更流畅的用户体验

**优化项**:

1. **加载状态优化**
   - Skeleton screens 替代 Loading 文字
   - 渐进式数据加载
   - Optimistic UI 更新

2. **错误处理优化**
   - 友好的错误提示
   - 重试按钮
   - 错误上报（可选）

3. **键盘快捷键增强**
   - `?` 显示快捷键帮助
   - `Ctrl/Cmd + N` 新建任务
   - `Ctrl/Cmd + Shift + N` 新建团队
   - `Ctrl/Cmd + K` 打开命令面板
   - `Esc` 关闭模态框
   - `/` 聚焦搜索框

4. **动画过渡**
   - 页面切换动画
   - 列表项进入/离开动画
   - 加载状态动画

**实现步骤**:
1. 添加 Framer Motion 依赖
2. 创建动画组件库
3. 更新现有页面添加动画
4. 添加键盘快捷键处理
5. 创建快捷键帮助对话框

### 3.4 优先级 P3：高级功能（3-4 周）

#### P3-1: Web Terminal
**目标**: 浏览器内嵌终端，直接操作 Ralph

**设计方案**:
- 使用 xterm.js 组件
- WebSocket 连接到后端 PTY
- 支持 Tab 补全、历史记录
- 多终端标签页

**实现步骤**:
1. 后端添加 PTY WebSocket 端点
2. 安装 xterm.js 依赖
3. 创建 `TerminalPage.tsx`
4. 创建 `XTermWrapper` 组件
5. 集成到页面路由

#### P3-2: 实时代码协作
**目标**: 多人实时查看和编辑

**设计方案**:
- 使用 Y.js + WebRTC
- OT (Operational Transform) 或 CRDT
- 类似 Google Docs 的实时协作

**实现步骤**:
1. 添加 Y.js 依赖
2. 创建协作编辑器组件
3. WebSocket 广播更改
4. 用户光标位置显示
5. 冲突解决策略

#### P3-3: AI 辅助代码审查
**目标**: AI 自动代码审查建议

**设计方案**:
- 集成 Claude API 进行代码审查
- 显示在 Diff Viewer 侧边栏
- 建议：优化点、潜在 Bug、安全漏洞

**实现步骤**:
1. 后端添加代码审查 API
2. 调用 Claude API
3. 前端显示审查结果
4. 允许应用/忽略建议

---

## 四、技术实施细节

### 4.1 数据库迁移

```sql
-- 项目表
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL UNIQUE,
  active BOOLEAN DEFAULT FALSE,
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  stats_json TEXT NOT NULL
);

CREATE INDEX idx_projects_active ON projects(active);
CREATE INDEX idx_projects_last_accessed ON projects(last_accessed_at DESC);

-- 技能表
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL,
  author TEXT,
  type TEXT NOT NULL, -- 'builtin', 'user', 'marketplace'
  handler TEXT NOT NULL,
  timeout INTEGER,
  memory INTEGER,
  parameters_json TEXT NOT NULL,
  permissions_json NOT NULL,
  dependencies_json TEXT,
  tags_json NOT NULL,
  category TEXT NOT NULL,
  stats_json NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_skills_type ON skills(type);
CREATE INDEX idx_skills_category ON skills(category);

-- 检查点表（已在 P4-2 中定义）
-- 自愈事件表
CREATE TABLE healing_events (
  id TEXT PRIMARY KEY,
  loop_id TEXT NOT NULL,
  layer INTEGER NOT NULL, -- 1, 2, 3
  event_type TEXT NOT NULL, -- 'attempt', 'success', 'failure'
  message TEXT NOT NULL,
  pattern_id TEXT,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (loop_id) REFERENCES loops(id)
);

CREATE INDEX idx_healing_loop ON healing_events(loop_id, timestamp DESC);
```

### 4.2 API 路由扩展

```typescript
// main appRouter 扩展
export const appRouter = router({
  // 现有路由
  task: taskRouter,
  hat: hatRouter,
  loops: loopsRouter,
  collection: collectionRouter,
  presets: presetsRouter,
  config: configRouter,
  process: processRouter,
  checkpoint: checkpointRouter,
  teams: teamsRouter,
  monitoring: monitoringRouter,
  planning: planningRouter,

  // 新增路由
  projects: projectRouter,      // P1-1
  skills: skillsRouter,         // P1-3
  healing: healingRouter,       // P2-2
  terminal: terminalRouter,     // P3-1
  collaboration: collabRouter,  // P3-2
  review: reviewRouter,         // P3-3
});
```

### 4.3 前端路由扩展

```typescript
// routes.tsx 扩展
const routes = [
  // 现有路由
  { path: '/', component: DashboardPage },
  { path: '/tasks', component: TasksPage },
  { path: '/tasks/:id', component: TaskDetailPage },
  { path: '/kanban', component: KanbanPage },
  { path: '/teams', component: TeamsPage },
  { path: '/monitoring', component: MonitoringPage },
  { path: '/builder', component: BuilderPage },
  { path: '/settings', component: SettingsPage },
  { path: '/plan', component: PlanPage },

  // 新增路由
  { path: '/projects', component: ProjectsPage },        // P1-1
  { path: '/projects/:id', component: ProjectDetailPage }, // P1-1
  { path: '/skills', component: SkillsPage },            // P1-3
  { path: '/skills/:id', component: SkillDetailPage },   // P1-3
  { path: '/terminal', component: TerminalPage },        // P3-1
  { path: '/review', component: ReviewPage },            // P3-3
];
```

### 4.4 依赖安装

```bash
# 后端依赖
npm install --save \
  chokidar \        # 文件监控（技能热加载）
  template \        # 模板引擎（技能生成）
  adapter-runtime \ # 适配器运行时
  ws \              # WebSocket for terminal
  node-pty          # PTY for terminal

# 前端依赖
npm install --save \
  framer-motion \   # 动画库
  xterm \           # 终端组件
  xterm-addon-fit \ # 终端自适应
  yjs \             # 实时协作
  y-webrtc          # WebRTC for yjs
```

---

## 五、实施时间表

| 阶段 | 功能 | 预计工作量 | 依赖 |
|------|------|-----------|------|
| **Week 1** | | | |
| | P0-1: 修复 API 连接 | 0.5 天 | - |
| | P0-2: 服务器进程管理 | 0.5 天 | P0-1 |
| | P1-1: 多项目管理（后端） | 2 天 | P0-1 |
| | P1-1: 多项目管理（前端基础） | 2 天 | P1-1 后端 |
| **Week 2** | | | |
| | P1-1: 多项目管理（完善） | 1 天 | Week 1 |
| | P1-2: Agent Teams 可视化 | 3 天 | Week 1 |
| | P1-3: Skills 系统设计 | 1 天 | - |
| **Week 3** | | | |
| | P1-3: Skills 系统实现（后端） | 2 天 | Week 2 |
| | P1-3: Skills 系统实现（前端） | 2 天 | Week 3 |
| | P2-1: 检查点 UI | 1 天 | Week 3 |
| **Week 4** | | | |
| | P2-2: 自愈机制 UI | 1 天 | Week 3 |
| | P2-3: 交互优化 | 2 天 | - |
| | 测试和修复 | 2 天 | 全部 |
| **Week 5+** | | | |
| | P3-1: Web Terminal | 2 天 | Week 4 |
| | P3-2: 实时代码协作 | 3 天 | Week 4 |
| | P3-3: AI 代码审查 | 2 天 | Week 4 |

---

## 六、风险和挑战

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| WebSocket 稳定性 | 高 | 心跳检测、自动重连、降级到轮询 |
| 实时协作性能 | 中 | CRDT 冲突解决、操作压缩 |
| 技能沙箱安全 | 高 | Worker 线程隔离、资源限制 |
| 数据库迁移 | 中 | 备份、回滚脚本、渐进迁移 |

### 6.2 产品风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 功能过度复杂 | 高 | MVP 优先、渐进式增强 |
| 与 Ralph 核心理念冲突 | 高 | 保持 Hat 系统核心、不丢失独特性 |
| 性能瓶颈 | 中 | 懒加载、虚拟滚动、代码分割 |

### 6.3 资源风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 开发时间不足 | 高 | 优先级排序、分阶段交付 |
| 测试覆盖不足 | 中 | 自动化测试、E2E 测试 |
| 文档缺失 | 低 | 同步编写文档、代码注释 |

---

## 七、成功指标

### 7.1 功能完整性

- [ ] P0 级别问题全部解决
- [ ] P1 级别功能完成 80%
- [ ] P2 级别功能完成 50%
- [ ] 所有核心页面可访问且功能正常

### 7.2 性能指标

- 首屏加载 < 2s
- API 响应时间 < 500ms
- WebSocket 连接成功率 > 99%
- 内存占用 < 500MB

### 7.3 稳定性指标

- 后端服务无崩溃运行 24h
- 前端无严重错误（React 错误边界 < 1 次/小时）
- 数据库查询无超时
- 端到端测试通过率 > 95%

### 7.4 用户体验

- 所有操作有明确反馈
- 错误提示清晰可操作
- 键盘快捷键覆盖 > 80% 常用操作
- 移动端可用性 > 70%

---

## 八、参考资源

### 8.1 1code 参考资源

- [1code (onner.ai) 官方网站](https://onner.ai/)
- [AI 驱动的代码生成平台](https://www.1code.com)

### 8.2 Vibe Kanban 参考资源

- [Github上获得18k的开源AI看板项目！用起来让你效率至少翻倍！](https://new.qq.com/rain/a/20260122A0160900)
- [牛，AI 写代码进入"编排时代": Vibe Kanban 让多个 Agent 并行干活～～～](https://developer.aliyun.com/article/1706183)
- [Vibe Kanban完整入门指南：如何高效管理AI编程任务](https://m.blog.csdn.net/gitblog_00796/article/details/157233710)
- [Vibe Kanban与Claude Code完美集成：如何配置和使用详细教程](https://m.blog.csdn.net/gitblog_00079/article/details/136705963)
- [Github Repository: BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)
- [npm package: vibe-kanban](https://www.npmjs.com/package/vibe-kanban)

### 8.2 Ralph 内部资源

- `.ralph/specs/web-dashboard/` - 所有规格文档
- `.ralph/specs/web-dashboard/progress.md` - 当前进度
- `CLAUDE.md` - 项目指南
- `backend/ralph-web-server/src/api/trpc.ts` - 完整 API 定义
- `frontend/ralph-web/src/` - 前端实现

### 8.3 技术文档

- [tRPC Documentation](https://trpc.io/docs/)
- [Fastify Documentation](https://fastify.dev/)
- [React Query](https://tanstack.com/query/latest)
- [Zustand](https://github.com/pmndrs/zustand)
- [TailwindCSS](https://tailwindcss.com/)
- [@dnd-kit](https://docs.dndkit.com/)
- [@xyflow/react](https://reactflow.dev/)

---

## 九、附录

### A. 当前项目结构

```
ralph/
├── backend/
│   └── ralph-web-server/
│       ├── src/
│       │   ├── api/           # tRPC router, REST API
│       │   ├── db/            # Database schema, connection
│       │   ├── queue/         # Task queue, dispatcher
│       │   ├── repositories/  # Data access layer
│       │   ├── runner/        # Ralph runner, event parser
│       │   ├── services/      # Business logic
│       │   └── types/         # TypeScript types
│       └── package.json
├── frontend/
│   └── ralph-web/
│       ├── src/
│       │   ├── components/    # React components
│       │   ├── pages/         # Page components
│       │   ├── stores/        # Zustand stores
│       │   ├── hooks/         # Custom hooks
│       │   ├── lib/           # Utilities
│       │   ├── types/         # TypeScript types
│       │   └── test/          # Test setup
│       └── package.json
├── package.json               # Root package.json
└── CLAUDE.md                  # Project guide
```

### B. API 端点清单

| 路由 | 前缀 | 端点数 | 状态 |
|------|------|--------|------|
| task | /trpc/task | 13 | ✅ |
| hat | /trpc/hat | 6 | ✅ |
| loops | /trpc/loops | 10 | ✅ |
| collection | /trpc/collection | 7 | ✅ |
| presets | /trpc/presets | 1 | ✅ |
| config | /trpc/config | 2 | ✅ |
| process | /trpc/process | 8 | ✅ |
| checkpoint | /trpc/checkpoint | 8 | ✅ |
| teams | /trpc/teams | 12 | ✅ |
| monitoring | /trpc/monitoring | 9 | ✅ |
| planning | /trpc/planning | 6 | ✅ |
| **总计** | - | **82** | **100%** |

### C. 前端页面清单

| 页面 | 路由 | 状态 | 组件数 |
|------|------|------|--------|
| Dashboard | /dashboard | ✅ | 5 |
| Tasks | /tasks | ✅ | 8 |
| Task Detail | /tasks/:id | ✅ | 12 |
| Kanban | /kanban | ✅ | 6 |
| Teams | /teams | 🟡 | 3 |
| Monitoring | /monitoring | ✅ | 7 |
| Builder | /builder | ✅ | 4 |
| Settings | /settings | ✅ | 5 |
| Plan | /plan | ✅ | 2 |
| **总计** | - | - | **52** |

### D. 待实现页面

| 页面 | 路由 | 优先级 | 预计组件数 |
|------|------|--------|-----------|
| Projects | /projects | P1 | 6 |
| Project Detail | /projects/:id | P1 | 8 |
| Skills | /skills | P1 | 5 |
| Skill Detail | /skills/:id | P1 | 4 |
| Terminal | /terminal | P3 | 2 |
| Review | /review | P3 | 3 |
| **总计** | - | - | **28** |

---

## 十、下一步行动

### 已完成（2026-02-24）

1. **前后端功能验证** ✅
   - Playwright 自动化测试全部页面
   - 确认所有核心功能正常工作
   - API 端点响应正常（tRPC + REST）
   - WebSocket 连接正常
   - 数据库读写正常

2. **问题分析** ✅
   - 识别关键缺失功能（多项目管理、Teams、Skills）
   - 确认 LoopSupervisor 未配置是预期行为
   - 记录 WebSocket 警告问题（低优先级）

3. **参考分析** ✅
   - 1code AI 编排特性分析
   - Vibe Kanban 看板功能分析
   - Ralph 独特优势确认

### 本周执行（2026-02-25 更新）

**优先级排序**:

1. **🚀 P4.5-1 Agent Teams 前端完善** (P1 - 2.5 天)
   - Day 1: ActivityTimeline + AgentStatusBadge
   - Day 2: TeamVisualizer (节点图)
   - Day 2.5: WebSocket 集成 + teamsStore

2. **P5-1 多项目管理（后端）** (P1 - 2 天)
   - 数据库迁移（projects 表）
   - ProjectService, ProjectRepository
   - projectRouter API

3. **P5-1 多项目管理（前端基础）** (P1 - 2 天)
   - ProjectsPage, ProjectCard
   - ProjectSwitcher 组件

4. **P1-3 Skills 系统设计** (P1 - 1 天)
   - 技能文件格式定义
   - 技能加载器架构
   - 技能市场 UI 设计

### 长期规划

1. **持续迭代**
   - 每 2 周一个 Sprint
   - 优先级动态调整
   - 用户反馈驱动

2. **质量保证**
   - 自动化测试覆盖 > 80%
   - E2E 测试关键流程
   - 性能基准测试

3. **社区建设**
   - 开源 Ralph Web Dashboard
   - 技能市场
   - 插件生态

---

**文档版本**: v2.1
**最后更新**: 2026-02-24 23:58
**验证时间**: 2026-02-24 23:50
**下次审查**: 2026-03-03
**维护者**: Ralph Development Team
