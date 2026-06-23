#!/usr/bin/env python3
"""
一键启动脚本 — 跨平台兼容，无乱码问题。
双击运行或 python start.py
"""
import os
import sys
import subprocess
import time
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

def print_banner():
    print("=" * 50)
    print("  Python 基础考察题库  --  一键启动")
    print("=" * 50)
    print()

def check_python():
    """Python 环境已就绪"""
    pass

def check_deps():
    """检查并安装依赖"""
    print("[1/3] 检查依赖...")
    try:
        import flask  # noqa
        print("  -> 依赖已就绪")
    except ImportError:
        print("  -> 正在安装依赖...")
        ret = subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "-q"],
            capture_output=True, text=True
        )
        if ret.returncode != 0:
            print("  [ERROR] 安装失败:", ret.stderr)
            sys.exit(1)
        print("  -> 依赖安装完成")

def start_server():
    """启动 Flask 开发服务器"""
    print("[2/3] 启动服务器...")
    # 用 subprocess.Popen 启动子进程
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    proc = subprocess.Popen(
        [sys.executable, "app.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    return proc

def wait_for_server(timeout=8):
    """等待服务器就绪"""
    import socket
    print("[3/3] 等待服务器就绪...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1)
            s.connect(("127.0.0.1", 5000))
            s.close()
            return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.5)
    return False

def main():
    print_banner()
    check_deps()
    
    proc = start_server()
    
    ready = wait_for_server()
    if ready:
        print()
        print("=" * 50)
        print("  [OK] 启动成功!")
        print("  [URL] http://localhost:5000")
        print("  [EXIT] 按 Ctrl+C 关闭服务器")
        print("=" * 50)
        print()
        webbrowser.open("http://localhost:5000")
    else:
        print("  [WARN] 服务器启动超时，请手动访问 http://localhost:5000")
        print("  或在浏览器中打开")
        webbrowser.open("http://localhost:5000")
    
    try:
        # 保持运行，等待用户 Ctrl+C
        proc.wait()
    except KeyboardInterrupt:
        print("\n  正在关闭服务器...")
        proc.terminate()
        proc.wait()
        print("  已关闭")

if __name__ == "__main__":
    main()
