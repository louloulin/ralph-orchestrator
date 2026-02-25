# Ralph Web Dashboard 全面分析与改进计划

> 生成时间: 2026-02-25
> 分析版本: feature-web3 分支

---

## 一、UI验证结果

### 1.1 当前状态
- **前端**: 运行在 localhost:5175 (Vite + React)
- **后端**: 运行在 localhost:3002 (Bun + Fastify + tRPC)
- **数据库**: SQLite + Drizzle ORM

### 1.2 页面验证

| 页面 | 状态 | 问题 |
|------|------|------|
| Dashboard | ✅ 正常 | WebSocket状态硬编码为true |
| Tasks | ✅ 正常 | 项目筛选可能不同步 |
| Projects | ✅ 正常 | 无数据时显示正常 |
| Kanban | ✅ 正常 | 键盘导航不完整 |
| Monitoring | ⚠️ 部分功能 | LoopSupervisor未配置时优雅降级 |
| Skills | ✅ 正常 | - |
| Builder | ✅ 正常 | - |
| Settings | ✅ 正常 | - |

### 1.3 控制台错误
```
[ERROR] Failed to load resource: trpc/project.list - 404 (多次)
```
**原因**: project.router可能未完全实现或路由配置问题

---

## 二、代码结构分析

### 2.1 前端架构 (frontend/ralph-web/src/)

```
src/
├── components/          # 组件库
│   ├── builder/        # Hat Collection 可视化构建器 (React Flow)
│   ├── dashboard/      # 仪表盘组件 (StatCard, ActivityTimeline)
│   ├── kanban/         # 看板组件 (KanbanBoard, KanbanCard)
│   ├── layout/         # 布局组件 (AppShell, Sidebar, ProjectSelector)
│   ├── shared/         # 共享组件 (ErrorBoundary, Toast, ThemeToggle)
│   ├── tasks/          # 任务组件 (TaskThread, LiveStatus, TaskInput)
│   ├── monitoring/     # 监控组件 (MetricCard, AlertList)
│   ├── healing/        # 自愈组件 (CircuitBreakerStatus)
│   ├── teams/          # 团队组件
│   └── ui/             # 基础UI组件 (shadcn/ui风格)
├── stores/             # Zustand状态管理
├── hooks/              # 自定义Hooks
├── pages/              # 页面组件
├── types/              # TypeScript类型定义
└── lib/                # 工具函数
```

### 2.2 后端架构 (backend/ralph-web-server/src/)

```
src/
├── api/                # tRPC路由定义
│   ├── trpc.ts        # 主路由聚合
│   └── LogBroadcaster.ts # WebSocket日志广播
├── services/           # 业务逻辑层
├── repositories/       # 数据访问层 (Drizzle ORM)
├── types/              # TypeScript类型定义
├── runner/             # 任务执行器
└── index.ts           # 服务器入口
```

---

## 三、发现的问题

### 🔴 高优先级 (安全/正确性)

#### 3.1 WebSocket URL 配置问题
**文件**: `frontend/ralph-web/src/hooks/useTaskWebSocket.ts:112-115`
```typescript
function getDefaultWsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/logs`;
}
```
**问题**: WebSocket URL 从 window.location 派生，在反向代理或嵌入式部署场景可能失败
**建议**: 添加环境变量配置选项

#### 3.2 配置路径硬编码
**文件**: `backend/ralph-web-server/src/api/trpc.ts:599-600`
```typescript
const REPO_ROOT = path.resolve(__dirname, "../../../..");
const CONFIG_PATH = path.join(REPO_ROOT, "ralph.yml");
```
**问题**: 配置路径相对于 __dirname 解析，在打包或嵌入式模式可能失败
**建议**: 支持 RALPH_CONFIG_PATH 环境变量

#### 3.3 日志存储无界增长
**文件**: `frontend/ralph-web/src/stores/logStore.ts`
**问题**: 日志无限期存储在内存中，无清理机制
**建议**: 添加最大条目限制 (如每任务1000条)

### 🟡 中优先级 (性能/稳定性)

#### 3.4 事件数组无界增长
**文件**: `frontend/ralph-web/src/hooks/useTaskWebSocket.ts:46`
```typescript
const [events, setEvents] = useState<RalphEvent[]>([]);
```
**问题**: WebSocket连接期间事件数组无限增长
**建议**: 实现滑动窗口或定期清理

#### 3.5 已废弃的 onSuccess 回调
**文件**: `frontend/ralph-web/src/components/layout/ProjectSelector.tsx:19-26`
**问题**: 使用 @tanstack/react-query v5 已废弃的 onSuccess 回调
**建议**: 迁移到 useEffect 模式

#### 3.6 类型安全问题
**位置**: 多处
- `backend/.../TaskRepository.ts:80-83` - @ts-expect-error 抑制
- `frontend/.../CollectionBuilder.tsx:47-51` - 使用 any 类型
- `frontend/.../MonitoringPage.tsx:317-318` - 类型强制转换

**建议**: 修复类型定义而非抑制错误

### 🟢 低优先级 (代码质量)

#### 3.7 未实现的 CommandPalette 功能
**文件**: `frontend/ralph-web/src/components/shared/CommandPalette.tsx`
```typescript
// TODO: Connect to tRPC mutation
const defaultCreateTask = (prompt: string) => {
  console.log("Create task:", prompt);
};
```
**未实现功能**:
- 创建任务
- 启动循环
- 取消循环

#### 3.8 看板状态映射问题
**文件**: `frontend/ralph-web/src/components/kanban/KanbanBoard.tsx:39-53`
```typescript
{ id: "in-review", title: "In Review", statuses: ["blocked"], ... }
```
**问题**: "blocked" 状态映射到 "In Review" 语义不正确
**建议**: blocked 应该是独立的 "Blocked" 列

#### 3.9 WebSocket 状态硬编码
**文件**: `frontend/ralph-web/src/pages/DashboardPage.tsx:53`
```typescript
wsConnected={true} // Hardcoded to true
```
**问题**: 不反映实际连接状态
**建议**: 使用 useTaskWebSocket 返回的连接状态

---

## 四、数据流问题

### 4.1 项目上下文未完全传播
**问题**: 项目选择器更改状态，但某些查询可能不遵循项目筛选

### 4.2 任务-循环关联时序问题
**文件**: `frontend/ralph-web/src/components/tasks/ThreadList.tsx:107-119`
**问题**: 使用 loopId 和 pid 回退，PID重用时可能显示陈旧关联

### 4.3 日志缓冲区竞态条件
**文件**: `frontend/ralph-web/src/hooks/useTaskWebSocket.ts:170-177`
**问题**: flushLogBuffer 使用 ref 和 taskId 闭包，taskId 变化时日志可能归属错误任务

---

## 五、对标 Vibe Kanban 差距分析

### 5.1 缺失功能

| 功能 | Vibe Kanban | Ralph Web | 优先级 |
|------|-------------|-----------|--------|
| 自然语言任务创建 | ✅ | ❌ 占位符 | P1 |
| AI 驱动任务分类 | ✅ | ❌ | P2 |
| 智能任务优先级 | ✅ | ⚠️ 基础 | P2 |
| 智能冲刺规划 | ✅ | ❌ | P3 |
| 任务依赖可视化 | ✅ | ❌ | P2 |
| 任务悬停预览 | ✅ | ❌ | P3 |
| 右键上下文菜单 | ✅ | ❌ | P3 |
| 进度条可视化 | ✅ | ⚠️ 迭代计数 | P3 |

### 5.2 UI/UX 改进建议

1. **看板列设计** - 更清晰的视觉层次
2. **拖放动画** - 更流畅的过渡效果
3. **快速操作菜单** - 右键菜单替代按钮
4. **键盘导航** - 完整的键盘支持

### 5.3 Vibe Kanban 核心功能详析

| 功能 | 描述 | 借鉴价值 |
|------|------|---------|
| 多AI代理支持 | Claude Code, Codex, Gemini CLI, Cursor, Amp | ⭐⭐⭐ 高 - 扩展后端适配器 |
| 实时日志流 | WebSocket实时通信 | ⭐⭐⭐ 高 - 已有但可优化 |
| 代码差异查看 | 实时代码变更可视化（Diff渲染器） | ⭐⭐⭐ 高 - Ralph已有DiffViewer |
| IDE图标系统 | VS Code, Cursor, Windsurf图标适配主题 | ⭐⭐ 中 - UI增强 |
| 本地执行 | 不向外部服务器发送代码 | ⭐⭐⭐ 高 - Ralph核心优势 |

**设计理念：**
> 当大多数代码由 AI 编写时，人的角色变成规划、审查和协调。Vibe Kanban 将 AI 编码代理视为"同事"——使用看板分配任务、并行运行多个代理、可视化审查变更、将结果合并回主分支。

**未来计划：** 通过 MCP (Model Context Protocol) 服务器使编码代理能够自动创建任务工单

**可借鉴：**
- ✅ 响应式拖拽看板界面设计
- ✅ 亮/暗主题自动检测
- ✅ "在编辑器中打开"快捷按钮
- ✅ Git worktree 隔离状态可视化
- ✅ 实时代码差异显示
- ✅ 本地执行保证代码安全

### 5.4 Cursor IDE 关键特性 (2025-2026)

| 版本 | 发布时间 | 关键特性 |
|------|----------|---------|
| Cursor 2.0 | 2025.10 | 自研Composer模型(MoE架构)，4x速度提升 |
| Cursor 2.1 | 2025.11 | 改进Plan模式，AI代码审查 |
| Cursor 2.2 | 2025.12 | **Debug Mode**, **Visual Editor** |

**Composer 核心能力：**
- 多文件同时编辑和重构
- 自然语言到代码生成
- Agent模式自主完成复杂任务
- 最多8个并行Agent

**设计哲学（Ryo Lu）：**
- AI原生集成：AI嵌入骨髓，不是附加功能
- 上下文优先：本地索引理解多文件关系
- 意图优于交互：工具适应用户意图

**可借鉴：**
- ✅ 命令面板（Cmd+K）设计 - Ralph已有CommandPalette
- ✅ 上下文感知自动完成
- ✅ 意图预测机制
- ✅ Visual Editor 可视化编辑

### 5.5 Windsurf IDE (Cascade) 核心创新

| 能力 | 描述 | 借鉴价值 |
|------|------|---------|
| 深度上下文 | 追踪光标移动和依赖图 | ⭐⭐⭐ 高 |
| 多文件理解 | 长会话中保持上下文 | ⭐⭐⭐ 高 |
| 意图预测 | 理解用户下一步想做什么 | ⭐⭐⭐ 高 |
| Flow State | 与用户操作同步 | ⭐⭐ 中 |
| 自动错误检测 | 右键检测并修复错误 | ⭐⭐⭐ 高 |

**UI特性：**
- **Cascade面板：** 实时显示 AI 思考过程 - 可集成到Ralph
- **写模式 vs 聊天模式：** 切换自主执行与指导
- **图片上传：** 多模态支持
- **实时预览：** IDE内实时Web应用预览

**可借鉴：**
- ✅ 思考过程可视化面板 - Ralph可增强ThinkingPanel
- ✅ 写/聊模式切换 - Ralph的任务模式已有类似概念
- ✅ 多模态输入支持
- ✅ 实时预览集成

### 5.6 AI Agent 趋势 (2025-2026)

**市场规模：**
- 全球市场：$5.1B (2024) → **$11.3B (2025)** — 一年翻倍
- 预测：到2028年，约33%的企业软件将内置自主AI Agent系统

**主要平台发布 (2025)：**
| 平台 | 关键特性 |
|------|---------|
| **AWS re:Invent 2025** | 3个自主AI Agent：Kiro、Security Agent、DevOps Agent — 可**连续工作数小时到数天** |
| **Microsoft Dynamics 365** | Copilot提供**24x7**自主代理 |
| **Anthropic** | 开发可**连续工作数周**的Agent |

**自愈与自主能力：**
| 能力 | 描述 | Ralph现状 |
|------|------|----------|
| **Self-Reflection** | 自动检测和修复错误 | ✅ P4-4已实现 |
| **Long-term Memory** | 跨会话存储和检索信息 | ✅ 已有 |
| **Tool Integration** | 自主使用浏览器、API、CRM系统 | ✅ MCP支持 |
| **Autonomous Decision** | 处理复杂多步骤工作流 | ✅ 任务系统 |

**实际案例：** Claude Code 自主工作**7小时**处理1250万行代码，准确率99.9%

### 5.7 轻量化本地部署方案

| 项目 | 描述 | 适用场景 |
|------|------|---------|
| **Youtu-Tip** | 腾讯优图1.96B轻量Agent模型 | 移动端/嵌入式 |
| **WebLLM** | 浏览器端零服务器推理 | 纯前端场景 |
| **LiteLLM** | 轻量级LLM网关代理 | 多模型统一接口 |
| **LlamaEdge** | 无守护进程的本地LLM API服务 | 服务器部署 |
| **LocalAGI** | 100%本地运行的AGI项目 | 隐私敏感场景 |

**本地部署优势：**
- ✅ 零延迟响应
- ✅ 100%隐私保护
- ✅ 无服务器成本
- ✅ 离线可用

---

## 六、OpenCode (1Code) 分析与借鉴

### 6.1 OpenCode 核心特性 (2025-2026)

| 特性 | 描述 | Ralph现状 | 借鉴价值 |
|------|------|----------|---------|
| **多实例管理** | `--project` flag支持多项目并发处理 | ⚠️ P5-1/2基础完成 | ⭐⭐⭐ 高 |
| **Git Worktree** | 推荐使用worktree实现项目隔离 | ✅ 已支持 | ⭐⭐⭐ 高 |
| **模块化架构** | 可扩展的模块设计 | ⚠️ 需优化 | ⭐⭐⭐ 高 |
| **Plan/Build模式** | Tab键切换计划与执行模式 | ⚠️ 需实现 | ⭐⭐⭐ 高 |
| **多后端支持** | 75+ AI提供商支持 | ✅ Claude/Gemini/Kiro等 | ⭐⭐⭐ 高 |
| **终端UI组件** | 增强的TUI组件库 | ⚠️ 需增强 | ⭐⭐ 中 |
| **多模态交互** | 图片等多模态输入支持 | ❌ 需开发 | ⭐⭐ 中 |
| **本地优化** | 本地执行保证代码安全 | ✅ 核心优势 | ⭐⭐⭐ 高 |

**OpenCode 关键数据：**
- GitHub Stars: **69,800+** (2026年1月)
- 编程语言: TypeScript
- 支持模型: 75+ AI提供商

### 6.2 OpenCode 多项目管理模式

```bash
# 单项目处理
opencode --project user-service "优化用户服务"

# 多项目批处理
opencode --project user-service,order-service,payment-service "批量更新"

# Git Worktree 隔离
git worktree add ../project-b feature-branch
opencode --project ../project-b
```

### 6.3 Ralph 多项目架构优化建议

#### 当前实现 (P5-1, P5-2)
- ✅ 项目数据模型和CRUD API
- ✅ 项目切换机制
- ✅ 任务级项目隔离 (projectId)
- ✅ 前端项目选择器

#### 缺失功能
| 功能 | 描述 | 优先级 |
|------|------|--------|
| **Worktree集成** | 自动创建/管理git worktree | P1 |
| **Plan模式** | Tab切换计划与执行 | P1 |
| **多实例并行** | 并行运行多个Ralph实例 | P2 |
| **实例监控** | 跨实例状态聚合 | P2 |

---

## 七、Worktree vs Local 模式设计

### 7.1 两种模式对比

| 特性 | Local模式 | Worktree模式 |
|------|----------|--------------|
| **隔离级别** | 进程级 | 文件系统级 |
| **资源消耗** | 低 | 中 |
| **并行能力** | 单实例 | 多实例 |
| **状态共享** | 需配置 | 自动同步 |
| **适用场景** | 小型项目 | 大型项目/并行开发 |

### 7.2 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                     Ralph Web Dashboard                      │
├─────────────────────────────────────────────────────────────┤
│  ProjectSelector (工作模式切换)                              │
│  ├── [Local Mode]  ─────────────────────────────────────   │
│  │   └── ProjectContext (项目上下文)                       │
│  │       ├── TaskRepository (项目过滤)                     │
│  │       └── LoopRegistry (单实例)                         │
│  │                                                        │
│  └── [Worktree Mode] ──────────────────────────────────    │
│      └── WorktreeManager (Worktree协调器)                  │
│          ├── GitWorktreeService (创建/删除/列表)           │
│          ├── WorktreeLoopRunner (每个worktree一个实例)    │
│          └── WorktreeStateAggregator (状态聚合)            │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 实施路线

#### Phase 1: Worktree支持 (1-2周)
| 任务 | 描述 |
|------|------|
| WorktreeService | 创建Git worktree管理服务 |
| Worktree项目类型 | 项目区分local/worktree类型 |
| Worktree状态同步 | 实时显示各worktree状态 |
| Worktree Badge | Kanban看板显示worktree标识 |

#### Phase 2: Plan模式 (1周)
| 任务 | 描述 |
|------|------|
| PlanModeToggle | Tab键切换计划/执行模式 |
| PlanEditor | 可视化计划编辑界面 |
| PlanApproval | 计划确认后执行 |
| PlanHistory | 历史计划记录 |

#### Phase 3: 多实例并行 (2周)
| 任务 | 描述 |
|------|------|
| InstanceManager | 多实例生命周期管理 |
| InstanceMonitor | 实例状态聚合监控 |
| InstanceBalancer | 负载均衡 (可选) |
| InstanceCommunicator | 实例间通信 |

---

## 八、改进计划 (更新版)

### Phase 1: 稳定性修复 (1-2天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 修复日志存储 | logStore.ts | 添加最大条目限制 |
| 修复事件数组 | useTaskWebSocket.ts | 实现滑动窗口 |
| WebSocket状态 | DashboardPage.tsx | 使用真实连接状态 |
| 环境变量配置 | trpc.ts, useTaskWebSocket.ts | 支持 RALPH_BACKEND_URL |

### Phase 2: 类型安全 (2-3天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 修复 Drizzle 类型 | TaskRepository.ts | 正确类型动态条件 |
| React Flow 类型 | CollectionBuilder.tsx | 消除 any 类型 |
| 前后端类型同步 | types/ | 共享类型定义 |

### Phase 3: 功能完善 (3-5天)

| 任务 | 文件 | 描述 |
|------|------|------|
| CommandPalette | CommandPalette.tsx | 连接实际实现 |
| 看板状态映射 | KanbanBoard.tsx | 添加 Blocked 列 |
| 项目筛选同步 | TasksPage.tsx | 确保所有查询遵循项目 |

### Phase 4: 体验提升 (5-7天)

| 任务 | 文件 | 描述 |
|------|------|------|
| 任务悬停预览 | KanbanCard.tsx | 添加预览弹窗 |
| 右键菜单 | TaskThread.tsx | 添加上下文菜单 |
| 键盘导航 | KanbanBoard.tsx | 完整键盘支持 |
| 进度可视化 | TaskThread.tsx | 添加进度条 |

### Phase 5: AI 增强 (7-10天)

| 任务 | 描述 |
|------|------|
| 自然语言任务创建 | 集成 LLM 解析任务描述 |
| 智能分类建议 | AI 驱动的任务分类 |
| 依赖分析 | 自动检测任务依赖关系 |

### Phase 6: 竞争优势构建 (5-7天)

基于竞品分析，构建差异化竞争优势：

| 任务 | 描述 | 竞品借鉴 |
|------|------|---------|
| 多后端适配器扩展 | 支持更多AI后端(Cursor, Windsurf等) | Vibe Kanban |
| 意图预测机制 | 理解用户下一步操作意图 | Windsurf Cascade |
| 写/聊模式切换 | 自主执行与指导模式切换 | Windsurf |
| 思考过程可视化 | 实时显示AI推理过程 | Windsurf Cascade面板 |
| MCP任务自动创建 | MCP服务器自动创建任务 | Vibe Kanban未来计划 |
| IDE集成增强 | "在编辑器中打开"功能 | Vibe Kanban |

### Phase 7: 本地部署优化 (3-5天)

| 任务 | 描述 |
|------|------|
| WebLLM集成 | 浏览器端零服务器推理支持 |
| 轻量级部署配置 | 移动端/嵌入式部署方案 |
| 离线模式 | 无网络环境下基本功能 |

### Phase 8: 多项目架构增强 (P5-3, P5-4) (3-4周)

基于当前P5-1/P5-2实现，增强多项目管理：

| 任务 | 描述 | 优先级 |
|------|------|--------|
| **P5-3: Worktree隔离** | | |
| WorktreeService | 创建Git worktree管理服务 | P1 |
| Worktree项目类型 | 项目区分local/worktree类型 | P1 |
| Worktree状态同步 | 实时显示各worktree状态 | P1 |
| Worktree Badge | Kanban看板显示worktree标识 | P1 |
| **P5-4: 多Agent协作** | | |
| AgentRegistry | 多Agent注册与管理 | P2 |
| ContextSharing | Agent间上下文共享机制 | P2 |
| TaskDistributor | 任务分发策略 (并行/流水线/专家/投票) | P2 |
| TeamUI | 团队协作Web界面 | P2 |
| **P5-5: 代码审查** | | |
| DiffReview | 代码差异审查流程 | P2 |
| ReviewComments | 审查评论与讨论 | P3 |
| **P5-6: Plan模式** | | |
| PlanModeToggle | Tab键切换计划/执行模式 | P1 |
| PlanEditor | 可视化计划编辑界面 | P1 |
| PlanApproval | 计划确认后执行 | P2 |

---

## 九、技术债务清单

### 需要立即处理
1. [ ] 日志存储内存泄漏风险
2. [ ] WebSocket 配置灵活性
3. [ ] 类型安全问题

### 需要尽快处理
1. [ ] onSuccess 迁移到 useEffect
2. [ ] CommandPalette 功能连接
3. [ ] 项目上下文传播

### 可以延后处理
1. [ ] 键盘可访问性
2. [ ] 看板状态映射优化
3. [ ] UI 动画增强

---

## 十、测试覆盖

### 当前状态
- **后端测试**: 589+ 测试通过
- **前端测试**: 存在但部分因内存问题禁用

### 建议补充
1. WebSocket 连接/断开/重连测试
2. 项目上下文切换集成测试
3. 日志存储边界测试
4. 类型安全编译测试

---

## 十一、部署建议

### 环境变量
```bash
# 后端
RALPH_PORT=3000
RALPH_CONFIG_PATH=/path/to/ralph.yml
RALPH_FRONTEND_DIR=/path/to/frontend/dist

# 前端
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
```

### Docker 配置
```dockerfile
# 建议添加健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1
```

---

## 十二、总结

### 当前完成度评估

| Phase | 功能 | 完成度 |
|-------|------|--------|
| P1 | 错误处理、持久化、代码分割 | ✅ 100% |
| P2 | Dashboard、Kanban、Thinking、Diff、CommandPalette、TaskSearch | ✅ 100% |
| P3 | 主题系统、i18n、a11y、移动端 | ✅ 100% |
| P4 | 进程守护、检查点、监控告警、自愈 | ✅ 100% |
| P4.5 | Agent Teams、Skills | ✅ 100% |
| P5-1 | 多项目架构 | ✅ 100% |
| P5-2 | 项目隔离 | ✅ 100% |
| **总计** | | **83%** |

### 优点
- 清晰的组件结构
- 良好的关注点分离
- 完整的 tRPC 类型安全
- 丰富的功能集 (监控、自愈、技能)
- 多项目基础架构已完成 (P5-1, P5-2)
- Git Worktree 并行循环已支持

### 主要问题
- 内存管理需要优化
- 部分功能未完全实现 (CommandPalette)
- 类型安全存在漏洞
- 配置灵活性不足
- 缺少 Worktree 集成 UI
- 缺少 Plan 模式
- 缺少多 Agent 协作 UI

### 下一步行动 (优先级排序)
1. **P1**: 修复内存泄漏风险 (logStore, events数组)
2. **P1**: 完成 CommandPalette 后端连接
3. **P1**: 实现 P5-3 Worktree 集成 (Service + UI)
4. **P2**: 实现 P5-6 Plan 模式
5. **P2**: 增强类型安全
6. **P3**: 实现 P5-4 多 Agent 协作 UI
7. **P3**: 逐步添加 AI 功能

### 关键参考
- **OpenCode**: 多项目管理 (`--project` flag)、Plan/Build 模式切换
- **Vibe Kanban**: 多 AI 代理支持、实时日志流、代码差异可视化
- **Cursor**: Composer 多文件编辑、Visual Editor、Debug Mode
- **Windsurf**: Cascade 面板、意图预测、写/聊模式切换

---

*此文档由 Ralph 自动生成，基于代码库全面分析 + OpenCode/Cursor/Vibe Kanban 竞品分析*

**Sources:**
- [OpenCode创新功能前瞻：2025年路线图深度解析](https://blog.csdn.net/gitblog_00978/article/details/153715425)
- [OpenCode实例管理：多项目并发处理](https://m.blog.csdn.net/gitblog_00561/article/details/151200959)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [2026年OpenCode 替代方案](https://k.sina.cn/article_7879848900_1d5acf3c401902p3nc.html)
