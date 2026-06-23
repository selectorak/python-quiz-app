"""
WSGI 入口 — 供生产级 WSGI 服务器（waitress / gunicorn）使用。

使用方式：
  waitress-serve --port=5000 wsgi:app
  gunicorn -w 4 -b 0.0.0.0:5000 wsgi:app
"""
from app import app

if __name__ == "__main__":
    app.run()
