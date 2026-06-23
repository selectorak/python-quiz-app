#!/usr/bin/env python3
"""
一键启动脚本 — 跨平台兼容，无乱码问题。
自动清理占用端口的旧进程后启动 Flask 服务器。
双击运行或 python start.py
"""
import os
import sys
import subprocess
import time
import webbrowser
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

PORT = 5000


def print_banner():
    print("=" * 50)
    print("  Python 基础考察题库  --  一键启动")
    print("=" * 50)
    print()


def kill_old_processes():
    """杀掉占用目标端口的旧 Python 进程。"""
    if sys.platform == "win32":
        try:
            result = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True, text=True,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            pids = set()
            for line in result.stdout.splitlines():
                if f":{PORT}" in line and "LISTENING" in line:
                    m = re.search(r"(\d+)\s*$", line)
                    if m:
                        pids.add(m.group(1))
            if not pids:
                print("  -> 未发现占用端口的旧进程")
                return
            for pid in sorted(pids):
                subprocess.run(
                    ["taskkill", "/F", "/PID", pid],
                    capture_output=True, text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                print(f"  -> 已清理旧进程 (PID {pid})")
        except Exception as e:
            print(f"  -> 清理旧进程时出错: {e}")
    else:
        try:
            result = subprocess.run(
                ["fuser", f"{PORT}/tcp"], capture_output=True, text=True
            )
            if result.returncode == 0:
                pids = result.stdout.strip().split()
                for pid in pids:
                    subprocess.run(["kill", "-9", pid], capture_output=True)
                    print(f"  -> 已清理旧进程 (PID {pid})")
            else:
                print("  -> 未发现占用端口的旧进程")
        except FileNotFoundError:
            try:
                result = subprocess.run(
                    ["lsof", "-ti", f":{PORT}"],
                    capture_output=True, text=True,
                )
                if result.stdout.strip():
                    for pid in result.stdout.strip().split():
                        subprocess.run(["kill", "-9", pid], capture_output=True)
                        print(f"  -> 已清理旧进程 (PID {pid})")
                else:
                    print("  -> 未发现占用端口的旧进程")
            except FileNotFoundError:
                print("  -> 跳过：未找到 fuser/lsof")


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
            capture_output=True, text=True,
        )
        if ret.returncode != 0:
            print("  [ERROR] 安装失败:", ret.stderr)
            sys.exit(1)
        print("  -> 依赖安装完成")


def start_server():
    """启动 Flask 开发服务器"""
    print("[2/3] 启动服务器...")
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
            with socket.create_connection(("127.0.0.1", PORT), timeout=1):
                return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.5)
    return False


def main():
    print_banner()

    # Step 0: 清理旧进程
    print("[0/3] 检查并清理旧进程...")
    kill_old_processes()
    time.sleep(0.5)

    check_deps()
    proc = start_server()
    ready = wait_for_server()

    url = f"http://localhost:{PORT}"
    if ready:
        print()
        print("=" * 50)
        print(f"  [OK] 启动成功!")
        print(f"  [URL] {url}")
        print("  [EXIT] 按 Ctrl+C 关闭服务器")
        print("=" * 50)
        print()
        webbrowser.open(url)
    else:
        print(f"  [WARN] 服务器启动超时，请手动访问 {url}")
        webbrowser.open(url)

    try:
        proc.wait()
    except KeyboardInterrupt:
        print("\n  正在关闭服务器...")
        proc.terminate()
        proc.wait()
        print("  已关闭")


if __name__ == "__main__":
    main()
