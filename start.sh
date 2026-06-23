#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "============================================"
echo "  🐍 Python 基础考察题库 — 一键启动"
echo "============================================"
echo ""

# 检查 Python
if ! command -v python3 &>/dev/null; then
    echo "❌ 未找到 python3，请先安装 Python 3.8+"
    exit 1
fi

# 检查依赖
echo "📦 检查依赖..."
python3 -c "import flask" 2>/dev/null || {
    echo "⏳ 正在安装依赖（首次运行需要）..."
    pip3 install -r requirements.txt -q
    echo "✅ 依赖安装完成"
}
echo "✅ 依赖已就绪"
echo ""

# 启动服务器（后台运行）
echo "🚀 正在启动服务器..."
python3 app.py &
SERVER_PID=$!

# 等待服务器就绪
sleep 2

# 打开浏览器
if command -v xdg-open &>/dev/null; then
    xdg-open http://localhost:5000
elif command -v open &>/dev/null; then
    open http://localhost:5000
else
    echo "🌐 请手动打开 http://localhost:5000"
fi

echo ""
echo "============================================"
echo "  ✅ 启动成功！"
echo "  🌐 http://localhost:5000"
echo "  ❌ 按 Ctrl+C 关闭服务器"
echo "============================================"

# 等待服务器进程
wait $SERVER_PID
