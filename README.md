<div align="center">

# 🐍 Python 基础考察题库

**中高难度 Python 选择题在线答题系统 · Flask + 原生 JS**

[![Python](https://img.shields.io/badge/Python-3.9%2B-3776AB?logo=python)](https://python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-000?logo=flask)](https://flask.palletsprojects.com)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)]()

</div>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📗 **经典题库** | 60 道 Python 中高难度选择题，涵盖核心知识点 |
| 📘 **考试题库** | 179 道自建综合题，来自 7 套完整试卷 |
| 📕 **错题本** | 自动记录错题，支持移除/清空/重做，含错误次数统计 |
| 🏷️ **难度筛选** | 按中等/困难筛选题目 |
| 🔍 **题目搜索** | 按关键字搜索题目文本/主题/选项 |
| 🔀 **选项随机排序** | Fisher-Yates 洗牌，防止记位置 |
| 📈 **成绩历史** | 柱状图 + 统计 + 最近记录 |
| ⏱ **限时模式** | 倒计时 + ≤60s 闪烁警示 + 超时自动提交 |
| 📋 **全部练习** | 一次加载全部题目，不限数量 |
| 🔢 **题号导航** | 右侧面板点击跳转，已答/未答状态一目了然 |
| ⌨️ **快捷键** | ← → 切换 · 1-6 选选项 · Enter 提交 |
| 🌙 **暗色模式** | 跟随系统自动切换 |
| 💾 **会话保活** | 刷新页面可恢复答题进度 |
| 🖨️ **打印样式** | 打印结果页自动隐藏按钮和界面元素 |
| 🧪 **自动化测试** | 17 个 pytest 测试覆盖全部 API |

## 🚀 快速开始

### 方式一：一键启动（推荐）

```bash
git clone https://github.com/your-username/python-quiz-app.git
cd python-quiz-app

# Windows
双击 start.bat

# Linux / macOS
./start.sh

# 跨平台（无乱码）
python start.py
```

### 方式二：手动启动

```bash
cd quiz_app
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

### 方式三：Docker

```bash
docker compose up --build
```

### 方式四：生产部署

```bash
pip install waitress
waitress-serve --port=5000 wsgi:app
```

## 📦 项目结构

```
python-quiz-app/
├── app.py                  # Flask 后端（多题库架构）
├── wsgi.py                 # WSGI 生产入口
├── questions.json          # 经典题库（60 题）
├── exam_questions.json     # 考试题库（179 题）
├── start.py                # 跨平台一键启动脚本
├── start.bat               # Windows 双击启动
├── start.sh                # Linux/macOS 启动
├── pyproject.toml          # 现代化打包配置
├── requirements.txt        # 依赖声明
├── Dockerfile              # 容器化部署
├── docker-compose.yml      # 一键 Docker 启动
├── LICENSE                 # MIT 开源许可
├── MANIFEST.in             # 打包清单
├── .gitignore              # Git 忽略规则
├── templates/
│   └── index.html          # 前端页面
├── static/
│   ├── script.js           # 前端逻辑
│   └── style.css           # 样式（暗色模式/打印/骨架屏/题号导航）
└── tests/
    └── test_app.py         # 17 个 pytest 测试
```

## 📡 API 文档

| 端点 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/` | GET | 首页 | — |
| `/api/health` | GET | 健康检查 | — |
| `/api/banks` | GET | 题库列表 | — |
| `/api/topics` | GET | 主题列表 | `bank` |
| `/api/questions` | GET | 出题 | `bank`, `count`, `topic`, `difficulty`, `keyword` |
| `/api/submit` | POST | 批改 | `answers`, `bank` |
| `/api/wrong` | GET | 错题列表 | — |
| `/api/wrong` | POST | 添加错题 | `questions` |
| `/api/wrong` | DELETE | 清空错题 | — |
| `/api/wrong/<id>` | DELETE | 移除单题 | — |

## 🧪 测试

```bash
cd quiz_app
pip install pytest
pytest tests/ -v
```

## 🏗️ 技术栈

- **后端**: Python 3.9+ · Flask 3.0
- **前端**: 原生 JavaScript (ES6) · CSS3 (Flexbox, Animation, Media Query)
- **存储**: JSON 文件（题库） · localStorage（会话/成绩） · 服务端 JSON（错题本）
- **部署**: Waitress · Docker · Gunicorn

## 📜 许可

[MIT](LICENSE)
