#!/bin/bash

# Ralph 嵌入式 Web 服务器演示脚本
# 此脚本展示如何使用打包好的 Ralph CLI 二进制文件

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="$SCRIPT_DIR/target/release/ralph"

# 检查二进制文件
check_binary() {
    print_header "1. 检查 Ralph 二进制文件"

    if [ ! -f "$BINARY" ]; then
        print_error "二进制文件不存在: $BINARY"
        echo "请先运行: cargo build -p ralph-cli --features embedded-web --release"
        exit 1
    fi

    # 获取文件大小
    SIZE=$(ls -lh "$BINARY" | awk '{print $5}')
    print_success "二进制文件存在: $BINARY"
    print_info "文件大小: $SIZE"

    # 验证嵌入的资源
    echo ""
    print_info "验证嵌入的前端资源..."

    if strings "$BINARY" | grep -q "<!doctype html>"; then
        print_success "index.html 已嵌入"
    else
        print_error "index.html 未找到"
    fi

    if strings "$BINARY" | grep -q "React"; then
        print_success "React 框架已嵌入"
    fi

    JS_COUNT=$(strings "$BINARY" | grep -c '\.js' || echo "0")
    print_info "JavaScript 文件数量: $JS_COUNT"
}

# 测试 API 端点
test_api() {
    print_header "2. 测试 API 端点"

    # 启动服务器
    print_info "启动嵌入式 Web 服务器..."
    print_info "端口: 3458"

    "$BINARY" web --no-open --backend-port 3458 > /tmp/ralph-server.log 2>&1 &
    RALPH_PID=$!

    # 等待服务器启动
    sleep 3

    # 测试健康检查
    echo ""
    print_info "测试健康检查端点..."
    HEALTH_RESPONSE=$(curl -s http://localhost:3458/api/v1/health 2>&1)

    if echo "$HEALTH_RESPONSE" | grep -q "ok"; then
        print_success "健康检查成功"
        echo "   响应: $HEALTH_RESPONSE"
    else
        print_error "健康检查失败: $HEALTH_RESPONSE"
    fi

    # 测试任务列表
    echo ""
    print_info "测试任务列表端点..."
    TASKS_RESPONSE=$(curl -s http://localhost:3458/api/v1/tasks 2>&1)

    if echo "$TASKS_RESPONSE" | grep -q "\["; then
        print_success "任务列表获取成功"
        echo "   当前任务数: $(echo "$TASKS_RESPONSE" | jq '. | length' 2>/dev/null || echo "0")"
    else
        print_error "任务列表获取失败: $TASKS_RESPONSE"
    fi

    # 创建测试任务
    echo ""
    print_info "创建测试任务..."
    CREATE_RESPONSE=$(curl -s -X POST http://localhost:3458/api/v1/tasks \
        -H "Content-Type: application/json" \
        -d '{
            "id": "demo-task-'$(date +%s)'",
            "title": "演示任务",
            "status": "open",
            "priority": 2
        }' 2>&1)

    if echo "$CREATE_RESPONSE" | grep -q "demo-task"; then
        print_success "任务创建成功"
        TASK_ID=$(echo "$CREATE_RESPONSE" | jq -r '.id' 2>/dev/null || echo "unknown")
        echo "   任务 ID: $TASK_ID"
    else
        print_error "任务创建失败: $CREATE_RESPONSE"
    fi

    # 获取任务详情
    if [ -n "$TASK_ID" ] && [ "$TASK_ID" != "unknown" ]; then
        echo ""
        print_info "获取任务详情..."
        GET_RESPONSE=$(curl -s http://localhost:3458/api/v1/tasks/$TASK_ID 2>&1)

        if echo "$GET_RESPONSE" | grep -q "演示任务"; then
            print_success "任务详情获取成功"
            echo "   任务标题: $(echo "$GET_RESPONSE" | jq -r '.title' 2>/dev/null || echo "N/A")"
            echo "   任务状态: $(echo "$GET_RESPONSE" | jq -r '.status' 2>/dev/null || echo "N/A")"
        fi
    fi

    # 清理
    echo ""
    print_info "停止服务器..."
    kill $RALPH_PID 2>/dev/null || true
    wait $RALPH_PID 2>/dev/null || true
    print_success "服务器已停止"
}

# 显示使用说明
show_usage() {
    print_header "3. 使用说明"

    cat << 'EOF'
🚀 Ralph 嵌入式 Web 服务器使用方法:

基本用法:
  ./ralph web

指定端口:
  ./ralph web --backend-port 3000

不打开浏览器:
  ./ralph web --no-open

指定工作空间:
  ./ralph web --workspace /path/to/project

API 端点:
  健康检查:    GET  /api/v1/health
  列出任务:    GET  /api/v1/tasks
  创建任务:    POST /api/v1/tasks
  获取任务:    GET  /api/v1/tasks/{id}
  更新任务:    PATCH /api/v1/tasks/{id}
  删除任务:    DELETE /api/v1/tasks/{id}
  运行任务:    POST /api/v1/tasks/{id}/run

Web 界面:
  在浏览器中打开: http://localhost:3000
EOF
}

# 显示总结
show_summary() {
    print_header "4. 总结"

    cat << 'EOF'
✅ Ralph 嵌入式 Web 服务器已准备就绪！

特性:
  • 零依赖下载 - 无需 npm install
  • 单一可执行文件 - 一个二进制包含所有内容
  • 开箱即用 - 直接运行，无需配置
  • 跨平台支持 - macOS、Linux、Windows

技术栈:
  • HTTP 服务器: Axum 0.8
  • 前端框架: React 19
  • 静态资源嵌入: rust-embed
  • 异步运行时: Tokio

文件信息:
EOF

    SIZE=$(ls -lh "$BINARY" | awk '{print $5}')
    echo "  • 二进制位置: $BINARY"
    echo "  • 文件大小: $SIZE"
    echo "  • 包含内容: Web 服务器 + React 前端 + 所有静态资源"

    cat << 'EOF'

下一步:
  1. 将二进制文件复制到你的 PATH 目录
  2. 运行: ralph web
  3. 在浏览器中访问: http://localhost:3000

文档:
  • 使用指南: 嵌入式Web服务器使用指南.md
  • 实现细节: EMBEDDED_WEB_IMPLEMENTATION.md
  • 项目计划: plan0.md

EOF
}

# 主函数
main() {
    clear
    echo -e "${BLUE}"
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ███╗   ██╗███████╗██╗    ██╗ █████╗ ██████╗ ██╗   ██╗██╗      ║
║   ████╗  ██║██╔════╝██║    ██║██╔══██╗██╔══██╗██║   ██║██║      ║
║   ██╔██╗ ██║█████╗  ██║ █╗ ██║███████║██████╔╝██║   ██║██║      ║
║   ██║╚██╗██║██╔══╝  ██║███╗██║██╔══██║██╔══██╗██║   ██║██║      ║
║   ██║ ╚████║███████╗╚███╔███╔╝██║  ██║██║  ██║╚██████╔╝███████╗ ║
║   ╚═╝  ╚═══╩╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝ ║
║                                                                   ║
║              嵌入式 Web 服务器演示                                ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    check_binary
    test_api
    show_usage
    show_summary

    print_success "演示完成！"
    echo ""
}

# 运行主函数
main "$@"
