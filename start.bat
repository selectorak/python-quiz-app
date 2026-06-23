@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   Python 基础考察题库 -- 一键启动
echo ============================================
echo.

:: 清理占用 5000 端口的旧进程
echo [0/3] 检查并清理旧进程...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1 && echo   ^> 已清理旧进程 (PID %%a)
)
timeout /t 1 /nobreak >nul

python start.py
pause
