FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# 生产级启动：waitress + wsgi 入口
CMD ["waitress-serve", "--port=5000", "wsgi:app"]
