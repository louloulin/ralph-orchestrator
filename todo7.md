# Ralph 7x24 智能体团队平台 - 第五轮验证与改造计划

> **创建日期**: 2026-03-02
> **版本**: 1.5
> **目标**: 全面分析代码库，验证功能，制定改造计划
> **更新日期**: 2026-03-02

---

## 一、验证状态总览

### 1.1 编译与测试验证

| 检查项 | 状态 | 结果 |
|--------|------|------|
| `cargo build` | ✅ 通过 | 编译成功 |
| `cargo test -p ralph-core` | ✅ 通过 | 单元测试通过 |
| `cargo test -p ralph-cli` | ✅ 通过 | 7个测试通过 |
| `cargo clippy` | ✅ 通过 | 仅有嵌入资源构建警告 |
| `npm run build (frontend)` | ✅ 通过 | 2.09s 构建成功 |

### 1.2 CLI 功能验证

#### Mailbox 系统 (Agent-to-Agent 通信)

| 命令 | 状态 | 验证结果 |
|------|------|----------|
| `ralph tools mailbox send` | ✅ 正常 | 成功发送消息 |
| `ralph tools mailbox list` | ✅ 正常 | 正确显示消息列表 |
| `ralph tools mailbox clear` | ✅ 正常 | 成功清除消息 |
| `ralph tools mailbox read` | ✅ 正常 | 读取特定消息 |

**验证示例**:
```bash
$ ralph tools mailbox send test-loop-verification "验证测试消息"
✅ Message msg-1772429170931-1fe9c6fb sent to loop test-loop-verification

$ ralph tools mailbox list --loop-id test-loop-verification
╭────────────────────────────┬─────────────────┬──────────────┬─────────────────────────╮
│ ID                         │ Topic           │ Payload      │ Timestamp               │
├────────────────────────────┼─────────────────┼──────────────┼─────────────────────────┤
│ msg-1772429170931-1fe9c6fb │ mailbox.message │ 验证测试消息 │ 2026-03-02 05:26:10 UTC │
╰────────────────────────────┴─────────────────┴──────────────┴─────────────────────────╯
```

#### Team 系统 (多智能体协作)

| 命令 | 状态 | 描述 |
|------|------|------|
| `ralph team create` | ✅ 可用 | 创建新团队 |
| `ralph team list` | ✅ 可用 | 列出所有团队 |
| `ralph team add-task` | ✅ 可用 | 添加任务到团队 |
| `ralph team list-tasks` | ✅ 可用 | 列出团队任务 |
| `ralph team claim` | ✅ 可用 | 认领任务 |
| `ralph team release` | ✅ 可用 | 释放任务 |
| `ralph team suggest` | ✅ 可用 | 基于负载均衡建议任务 |
| `ralph team conflicts` | ✅ 可用 | 显示文件冲突 |
| `ralph team check-files` | ✅ 可用 | 检查特定文件冲突 |
| `ralph team velocity` | ✅ 可用 | 显示团队速度指标 |
| `ralph team predict` | ✅ 可用 | 完成时间预测 |
| `ralph team history` | ✅ 可用 | 速度历史记录 |
| `ralph team send` | ✅ 可用 | 发送消息给其他循环 |
| `ralph team messages` | ✅ 可用 | 列出邮箱消息 |

---

## 二、架构分析

### 2.1 Ralph 核心组件

```
┌─────────────────────────────────────────────────────────────────┐
│                    Ralph Orchestrator                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │   Hats      │  │  Memories   │  │      Tasks              ││
│  │  System     │  │   Store     │  │      Queue              ││
│  │ - Planner   │  │ - Semantic  │  │ - Priority Queue       ││
│  │ - Builder   │  │ - LLM Sort  │  │ - Dependency Graph     ││
│  │ - Reviewer  │  │ - Context   │  │ - Work Distribution     ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │   Event     │  │   Merge     │  │      Worktree           ││
│  │   Loop      │  │   Queue     │  │      Manager            ││
│  │ - Parallel  │  │ - Conflict  │  │ - Agent Isolation       ││
│  │ - Hats      │  │ - Resolve   │  │ - Context Share         ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                    7x24 Platform Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │   Process   │  │  Checkpoint │  │      Self-Healing       ││
│  │   Daemon    │  │   System    │  │      Mechanism          ││
│  │ - Spawn     │  │ - State     │  │ - Agent Layer           ││
│  │ - Monitor   │  │ - Restore   │  │ - Platform Layer        ││
│  │ - Restart   │  │ - Resume    │  │ - Circuit Breaker       ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │  Monitoring │  │  Mailbox    │  │      Team               ││
│  │   System    │  │   Store     │  │      Store              ││
│  │ - Metrics   │  │ - A2A Msg   │  │ - Collaboration         ││
│  │ - Prometheu │  │ - File Based│  │ - Task Assignment       ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                       UI Layer (AI Native)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐│
│  │  ChatPage   │  │  SidePanel  │  │    ActiveLoopsDock      ││
│  │   (Default) │  │   System    │  │                        ││
│  └─────────────┘  └─────────────┘  └─────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 代码库结构

```
ralph-cli/      → CLI 入口点，命令 (run, plan, task, loops, web)
ralph-core/     → 编排逻辑，事件循环，hats，memories，tasks
ralph-adapters/ → 后端集成 (Claude, Kiro, Gemini, Codex 等)
ralph-telegram/ → Telegram 机器人用于人机交互
ralph-tui/      → 终端 UI (ratatui-based)
ralph-e2e/      → 端到端测试框架
ralph-proto/    → 协议定义

backend/        → Web 服务器 (@ralph-web/server) - Fastify + tRPC + SQLite
frontend/       → Web 仪表盘 (@ralph-web/dashboard) - React + Vite + TailwindCSS
```

---

## 三、与 Claude Code Agent Teams 架构对齐

### 3.1 架构映射

| Claude Code 功能 | Ralph 实现 | 状态 |
|------------------|------------|------|
| Team Lead (Opus) | Hat System | ✅ 已实现 |
| Teammates (Sonnet) | Worktree Loops | ✅ 已实现 |
| Shared Task List | TaskStore + TeamStore | ✅ 已实现 |
| Mailbox System | Event Bus + File Mailboxes | ✅ 已实现 |
| 2-5 团队成员 | Parallel Worktrees | ✅ 已实现 |
| 5-6 任务/成员 | Task Queue | ✅ 已实现 |
| 200K Token 上下文 | Worktree Isolation | ✅ 已实现 |
| 直接通信 | Mailbox Messages | ✅ 已实现 |
| 接口契约 | Hat + Event Types | ✅ 已实现 |

---

## 四、改造计划 (基于 todo1.0.md)

### 4.1 导航简化 (优先级 P1)

**目标**: 从13页面简化到5个核心视图

**新导航结构**:

| 视图 | 描述 | 合并的原页面 |
|------|------|--------------|
| **Home (主页)** | 统一仪表盘 | Dashboard + 系统状态 |
| **Tasks (任务)** | 任务看板 + 执行视图 | Tasks + Kanban + Plan |
| **Agents (代理)** | Agent团队 + Skills | Teams + Skills |
| **Runtime (运行)** | 实时执行 + 监控 | Monitoring + Checkpoints + Healing |
| **Settings (设置)** | 配置 + 项目 | Settings + Projects + Builder |

**实施步骤**:
1. 修改 `Sidebar.tsx` 的 `NAV_SECTIONS` 配置
2. 合并相关页面组件
3. 调整路由配置
4. 更新 i18n 翻译

---

### 4.2 Agent 协作可视化 (优先级 P1)

**目标**: 创建实时 Agent 协作视图

**新增组件**:
1. `AgentCanvas` - Agent 关系图可视化
2. `AgentTimeline` - Agent 执行时间线
3. `ParallelTasks` - 并行任务视图

**技术方案**:
- 使用 React Flow 绘制 Agent 关系图
- WebSocket 实时更新 Agent 状态
- 动画展示 Agent 间协作流程

---

### 4.3 任务执行可视化 (优先级 P1)

**目标**: 直观展示任务执行进度

**改进点**:
1. 进度条可视化 - 细粒度进度(步骤/百分比)
2. 执行阶段展示 - Planning/Executing/Reviewing/Complete
3. 实时日志流优化 - 结构化日志 + 高亮
4. 任务队列可视化 - 等待/执行中/完成状态

---

### 4.4 视觉升级 (优先级 P2)

**目标**: 打造 "Vibe" 感，增强情感连接

**改进项**:
1. **动画系统**
   - 页面过渡动画
   - 卡片悬停效果
   - 状态变化动画
   - 加载骨架屏优化

2. **视觉层次**
   - 增加留白
   - 优化信息密度
   - 改进色彩系统
   - 统一阴影和圆角

3. **微交互**
   - 按钮反馈动画
   - 状态提示 Toast
   - 拖拽手感优化
   - 滚动惯性效果

---

## 五、实施路线图

### Sprint 1 (本周): 导航简化

**任务列表**:
- [ ] 设计新导航结构原型
- [ ] 修改 Sidebar 组件
- [ ] 合并 Dashboard 相关页面
- [ ] 合并 Tasks/Kanban/Plan 页面
- [ ] 调整路由和 i18n

**交付物**: 简化的5视图导航

---

### Sprint 2 (下周): Agent 协作可视化

**任务列表**:
- [ ] 设计 Agent 关系图
- [ ] 实现 AgentCanvas 组件
- [ ] 实现 AgentTimeline 组件
- [ ] WebSocket 实时更新集成
- [ ] Agent 状态动画

**交付物**: 实时 Agent 协作视图

---

### Sprint 3 (第三周): 任务执行可视化

**任务列表**:
- [ ] 细粒度进度条设计
- [ ] 执行阶段展示
- [ ] 实时日志流优化
- [ ] 任务队列可视化

**交付物**: 可视化任务执行

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **用户习惯改变** | 中 | 渐进式发布、保留旧版导航 |
| **性能下降** | 高 | 性能监控、懒加载优化 |
| **功能遗漏** | 中 | 完整的功能映射表 |
| **开发周期长** | 高 | 分阶段交付、MVP 优先 |

---

## 七、验证命令参考

### 7.1 编译验证

```bash
cargo build                          # 编译整个项目
cargo test -p ralph-core            # 运行核心测试
cargo test -p ralph-cli             # 运行 CLI 测试
cargo clippy --all-targets --all-features -- -D warnings  # 代码质量检查
cargo fmt --all -- --check          # 格式检查
```

### 7.2 前端验证

```bash
cd frontend/ralph-web
npm run build                        # 构建前端
npm run dev                          # 开发模式
```

### 7.3 CLI 功能验证

```bash
# Mailbox 系统
ralph tools mailbox send <loop-id> <message>
ralph tools mailbox list --loop-id <loop-id>
ralph tools mailbox read --loop-id <loop-id> <msg-id>
ralph tools mailbox clear --loop-id <loop-id> --force

# Team 系统
ralph team create <team-name>
ralph team list
ralph team add-task <team-id> <task-title> -p <priority>
ralph team list-tasks <team-id>
ralph team velocity <team-id>
ralph team suggest --teammate <loop-id>
ralph team conflicts <team-id>
```

---

## 八、下一步行动

1. ✅ **完成代码分析** - 全面分析完成
2. ✅ **验证 CLI 功能** - Mailbox 和 Team 系统验证通过
3. ✅ **验证编译状态** - 构建和测试通过
4. ⏳ **开始 Sprint 1** - 导航简化实施
5. ⏳ **创建设计稿** - UI 原型设计

---

**文档版本**: v1.5
**最后更新**: 2026-03-02
**负责人**: Ralph AI Orchestrator

---

## 九、附录: Git 状态

当前分支: `ralph/tidy-aspen`

未提交的更改:
- `frontend/ralph-web/package.json`
- `frontend/ralph-web/vite.config.js`
- `package-lock.json`

这些更改是前端配置相关的，需要在完成当前任务后决定是否提交。
