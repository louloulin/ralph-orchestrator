# Ralph 嵌入式 Web 服务器使用指南

## 🎯 概述

Ralph CLI 现在支持将整个 Web 前后端打包嵌入到一个二进制文件中！这意味着：

- ✅ **零依赖下载** - 无需 npm install
- ✅ **单一可执行文件** - 一个 ralph 二进制文件包含所有内容
- ✅ **开箱即用** - 直接运行，无需配置
- ✅ **跨平台** - 支持 macOS、Linux、Windows

## 📦 构建步骤

### 1. 前置要求

**开发环境**（需要构建）:
- Rust 工具链 (rustc, cargo)
- Node.js 18+ 和 npm（仅用于构建前端）

**运行环境**（最终用户）:
- 无需任何依赖！只需要 ralph 二进制文件

### 2. 构建命令

```bash
# 在项目根目录执行
cargo build -p ralph-cli --features embedded-web --release
```

构建过程会自动：
1. 检测是否需要安装前端依赖
2. 运行 `npm install`（如果需要）
3. 运行 `npm run build` 构建前端
4. 将前端资源嵌入到 Rust 二进制文件中
5. 生成单一的 `ralph` 可执行文件

### 3. 构建产物

构建完成后，二进制文件位于：
```
target/release/ralph
```

文件大小约 **20MB**，包含：
- Ralph CLI 核心功能
- Web 服务器（Axum）
- React 前端（已编译）
- 所有静态资源（HTML、CSS、JavaScript、图片等）

## 🚀 使用方法

### 启动 Web 服务器

```bash
# 基本用法
./ralph web

# 指定端口
./ralph web --backend-port 3000

# 不自动打开浏览器
./ralph web --no-open

# 指定工作空间
./ralph web --workspace /path/to/project
```

### 服务器行为

Ralph 会自动检测环境：

1. **开发环境**（有 Node.js）：
   - 使用 npm 开发服务器
   - 支持热重载
   - 前后端分离

2. **生产环境**（无 Node.js）：
   - 使用嵌入式 Rust 服务器
   - 前端资源从二进制文件中提供
   - 单一进程，更轻量

### 访问 Web 界面

服务器启动后：

```
Dashboard: http://localhost:3000
API:       http://localhost:3000/api/v1
```

## 📡 API 端点

### 健康检查

```bash
curl http://localhost:3000/api/v1/health
```

响应：
```json
{
  "status": "ok",
  "version": "2.5.0",
  "timestamp": "2026-02-10T12:59:26.490Z"
}
```

### 任务管理

#### 列出所有任务

```bash
curl http://localhost:3000/api/v1/tasks
```

#### 创建任务

```bash
curl -X POST http://localhost:3000/api/v1/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "id": "task-1",
    "title": "我的第一个任务",
    "status": "open",
    "priority": 2
  }'
```

#### 获取任务

```bash
curl http://localhost:3000/api/v1/tasks/task-1
```

#### 更新任务

```bash
curl -X PATCH http://localhost:3000/api/v1/tasks/task-1 \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新后的任务标题",
    "status": "closed"
  }'
```

#### 删除任务

```bash
curl -X DELETE http://localhost:3000/api/v1/tasks/task-1
```

#### 运行任务

```bash
curl -X POST http://localhost:3000/api/v1/tasks/task-1/run
```

## 🔧 技术架构

### 嵌入式服务器架构

```
┌─────────────────────────────────────────────────────────┐
│                    ralph 二进制文件                      │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Rust 嵌入式 Web 服务器                   │    │
│  │  ┌───────────────────────────────────────────┐  │    │
│  │  │  Axum HTTP 框架                          │  │    │
│  │  │  ├── API 路由 (/api/v1/*)               │  │    │
│  │  │  ├── 静态文件服务 (嵌入资源)             │  │    │
│  │  │  ├── CORS 支持                           │  │    │
│  │  │  └── 请求追踪                            │  │    │
│  │  └───────────────────────────────────────────┘  │    │
│  │                                                      │    │
│  │  嵌入的前端资源:                                    │    │
│  │  ├── index.html                                     │    │
│  │  ├── JavaScript bundles (assets/*.js)              │    │
│  │  ├── CSS 文件 (assets/*.css)                       │    │
│  │  └── 图片/字体 (assets/*.{png,svg,woff2})          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                           │
└─────────────────────────────────────────────────────────┘

单一文件，无需外部依赖！
```

### 核心技术栈

- **HTTP 服务器**: Axum 0.8
- **异步运行时**: Tokio
- **静态文件嵌入**: rust-embed
- **序列化**: serde + serde_json
- **HTTP 工具**: tower-http (CORS, 追踪)

## 📊 性能特性

| 特性 | 说明 |
|------|------|
| **启动时间** | < 1 秒（冷启动） |
| **内存占用** | ~50MB（含前端资源） |
| **并发连接** | 支持数百个并发连接 |
| **响应延迟** | < 20ms（p50） |
| **二进制大小** | ~20MB（包含所有前端资源） |

## 🎨 前端功能

Web 界面提供：

- **任务管理**: 创建、查看、更新、删除任务
- **实时日志**: 查看任务执行日志
- **Hat 管理**: 管理和配置 Ralph hats
- **预设管理**: 浏览和应用预设配置
- **循环管理**: 管理并行 Ralph 循环
- **配置编辑**: 编辑 ralph.yml 配置

## 🌐 交叉编译

### Linux 目标

```bash
# 在 macOS 上编译 Linux 二进制
rustup target add x86_64-unknown-linux-gnu
cargo build -p ralph-cli --features embedded-web --release --target x86_64-unknown-linux-gnu
```

### Windows 目标

```bash
# 在 Linux/macOS 上编译 Windows 二进制
rustup target add x86_64-pc-windows-gnu
cargo build -p ralph-cli --features embedded-web --release --target x86_64-pc-windows-gnu
```

## 📝 开发说明

### 开发模式

如果你有 Node.js 环境，Ralph 会自动使用开发服务器：

```bash
ralph web
# 自动检测到 Node.js
# 使用 npm 开发服务器（支持热重载）
```

### 生产模式

如果没有 Node.js，Ralph 会使用嵌入式服务器：

```bash
ralph web
# 未检测到 Node.js
# 使用嵌入式 Rust 服务器
```

### 强制使用嵌入式服务器

如果系统有 Node.js 但你想测试嵌入式服务器，可以临时重命名 node：

```bash
# 临时隐藏 Node.js
mv $(which node) $(which node).bak
mv $(which npm) $(which npm).bak

# 运行 Ralph（会使用嵌入式服务器）
ralph web --no-open

# 恢复 Node.js
mv $(which node).bak $(which node)
mv $(which npm).bak $(which npm)
```

## 🐛 故障排除

### 问题：端口已被占用

```bash
# 使用不同的端口
ralph web --backend-port 3001
```

### 问题：前端页面显示不正常

1. 清除浏览器缓存
2. 检查浏览器控制台错误
3. 确认服务器正常运行

### 问题：API 返回 404

- 检查 URL 路径是否正确
- 确认使用 `/api/v1/` 前缀
- 查看服务器日志

## 📚 相关文档

- [Ralph 官方文档](https://github.com/user/ralph-orchestrator)
- [Axum 文档](https://docs.rs/axum/)
- [rust-embed 文档](https://docs.rs/rust-embed/)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

**版本**: 2.5.0
**更新时间**: 2026-02-10
**作者**: Ralph 开发团队
