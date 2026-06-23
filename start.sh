#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "============================================"
echo "  Python 基础考察题库 — 一键启动"
echo "============================================"
echo ""

# 清理占用 5000 端口的旧进程
echo "[0/3] 检查并清理旧进程..."
if command -v fuser &>/dev/null; then
    fuser -k 5000/tcp 2>/dev/null && echo "  -> 已清理旧进程" || echo "  -> 未发现占用端口的旧进程"
elif command -v lsof &>/dev/null; then
    lsof -ti:5000 | xargs kill -9 2>/dev/null && echo "  -> 已清理旧进程" || echo "  -> 未发现占用端口的旧进程"
else
    echo "  -> 跳过：未找到 fuser/lsof"
fi
sleep 0.5

# 检查 Python
if ! command -v python3 &>/dev/null; then
    echo "  [ERROR] 未找到 python3，请先安装 Python 3.9+"
    exit 1
fi

# 检查依赖
echo "[1/3] 检查依赖..."
python3 -c "import flask" 2>/dev/null || {
    echo "  -> 正在安装依赖..."
    pip3 install -r requirements.txt -q
    echo "  -> 依赖安装完成"
}
echo "  -> 依赖已就绪"

# 启动服务器
echo "[2/3] 启动服务器..."
python3 app.py &
SERVER_PID=$!

# 等待服务器就绪
echo "[3/3] 等待服务器就绪..."
sleep 2

URL="http://localhost:5000"
if command -v xdg-open &>/dev/null; then
    xdg-open "$URL"
elif command -v open &>/dev/null; then
    open "$URL"
else
    echo "  -> 请手动打开 $URL"
fi

echo ""
echo "============================================"
echo "  [OK] 启动成功！"
echo "  [URL] $URL"
echo "  [EXIT] 按 Ctrl+C 关闭服务器"
echo "============================================"

wait $SERVER_PID
