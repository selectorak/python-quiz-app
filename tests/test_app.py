"""Quiz App 测试（多题库版）"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pytest
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    # 确保测试用题库加载正常
    with app.test_client() as client:
        yield client


def test_index(client):
    """首页返回 200"""
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"Python" in resp.data


def test_health(client):
    """健康检查"""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["status"] == "ok"
    assert "classic" in data["banks"]
    assert "exam" in data["banks"]
    assert data["total_questions"] > 0


def test_banks(client):
    """题库列表"""
    resp = client.get("/api/banks")
    assert resp.status_code == 200
    data = resp.get_json()
    assert "banks" in data
    keys = [b["key"] for b in data["banks"]]
    assert "classic" in keys
    assert "exam" in keys


def test_topics_classic(client):
    """经典题库主题列表"""
    resp = client.get("/api/topics?bank=classic")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["topics"]) > 0


def test_topics_exam(client):
    """考试题库主题列表"""
    resp = client.get("/api/topics?bank=exam")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["topics"]) > 0


def test_get_questions_classic(client):
    """经典题库默认出题"""
    resp = client.get("/api/questions?bank=classic&count=5")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["questions"]) == 5
    assert data["bank"] == "classic"
    for q in data["questions"]:
        assert "answer" not in q
        assert "explanation" not in q


def test_get_questions_exam(client):
    """考试题库出题"""
    resp = client.get("/api/questions?bank=exam&count=5")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["questions"]) == 5
    assert data["bank"] == "exam"


def test_get_questions_with_difficulty(client):
    """按难度筛选"""
    resp = client.get("/api/questions?bank=classic&difficulty=hard&count=5")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["questions"]) == 5
    for q in data["questions"]:
        assert q.get("difficulty") == "hard"


def test_get_questions_with_keyword(client):
    """按关键字搜索"""
    resp = client.get("/api/questions?bank=classic&keyword=GIL&count=5")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["questions"]) > 0
    # 至少有一题包含 GIL
    found = any("GIL" in q.get("question", "") for q in data["questions"])
    assert found, "搜索 'GIL' 应返回包含 GIL 的题目"


def test_get_questions_all(client):
    """全部练习（count=0 返回全部题目）"""
    resp = client.get("/api/questions?bank=classic&count=0")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["questions"]) == 160  # 经典题库共 160 题


def test_submit_classic(client):
    """经典题库提交"""
    resp = client.get("/api/questions?bank=classic&count=5")
    questions = resp.get_json()["questions"]
    answers = {q["id"]: 0 for q in questions}
    resp = client.post("/api/submit", json={"answers": answers, "bank": "classic"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total"] == 5
    assert data["bank"] == "classic"


def test_submit_exam(client):
    """考试题库提交"""
    resp = client.get("/api/questions?bank=exam&count=5")
    questions = resp.get_json()["questions"]
    answers = {q["id"]: 0 for q in questions}
    resp = client.post("/api/submit", json={"answers": answers, "bank": "exam"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["total"] == 5
    assert data["bank"] == "exam"


def test_submit_empty_body(client):
    """空请求体返回 400"""
    resp = client.post("/api/submit", json={})
    assert resp.status_code == 400


def test_wrong_add_and_list(client):
    """错题本：添加 + 列表"""
    # 初始化：先清空
    client.delete("/api/wrong")

    # 添加错题
    wrong = [{
        "id": "wrong001",
        "question": "测试错题",
        "options": ["A", "B", "C", "D"],
        "selected": 0,
        "correct": False,
        "answer": 1,
        "explanation": "测试解析"
    }]
    resp = client.post("/api/wrong", json={"questions": wrong})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True

    # 列表
    resp = client.get("/api/wrong")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data["questions"]) >= 1
    assert any(q["id"] == "wrong001" for q in data["questions"])


def test_wrong_remove(client):
    """错题本：移除单题"""
    # 添加
    wrong = [{"id": "remove001", "question": "待移除", "options": ["A","B","C","D"], "selected": 0, "correct": False, "answer": 1, "explanation": "x"}]
    client.post("/api/wrong", json={"questions": wrong})

    # 移除
    resp = client.delete("/api/wrong/remove001")
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["success"] is True
    assert data["removed"] == 1

    # 验证已删除
    resp = client.get("/api/wrong")
    assert all(q["id"] != "remove001" for q in resp.get_json()["questions"])


def test_wrong_clear(client):
    """错题本：清空"""
    client.delete("/api/wrong")
    resp = client.get("/api/wrong")
    assert resp.status_code == 200
    assert len(resp.get_json()["questions"]) == 0


def test_wrong_count_increment(client):
    """错题本：重复添加增加计数"""
    # 清空
    client.delete("/api/wrong")

    wrong = [{"id": "cnt001", "question": "计数测试", "options": ["A","B","C","D"], "selected": 0, "correct": False, "answer": 1, "explanation": "x"}]

    # 第一次添加
    client.post("/api/wrong", json={"questions": wrong})
    # 第二次添加（相同id）
    client.post("/api/wrong", json={"questions": wrong})

    resp = client.get("/api/wrong")
    items = resp.get_json()["questions"]
    item = next(q for q in items if q["id"] == "cnt001")
    assert item["wrong_count"] == 2  # 应为 2 次
