"""Python 基础考察题库 — Flask 后端（多题库版）"""
import copy
import json
import logging
import random
import os
from flask import Flask, jsonify, request, render_template

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ===== 多题库加载 =====
BANKS = {}  # {bank_key: bank_info}


def load_bank(bank_key: str, filename: str, label: str, description: str):
    """加载一个题库文件，注册到 BANKS。"""
    path = os.path.join(BASE_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            questions = json.load(f)["questions"]
        logger.info("题库 [%s] 加载成功: %s — %d 题", bank_key, label, len(questions))
        BANKS[bank_key] = {
            "label": label,
            "description": description,
            "questions": questions,
            "file": filename,
        }
    except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
        logger.critical("题库 [%s] 加载失败: %s", bank_key, e)
        BANKS[bank_key] = {
            "label": label,
            "description": description,
            "questions": [],
            "file": filename,
        }


load_bank("classic", "questions.json", "经典题库", "Python 中高难度基础题（36 题）")
load_bank("exam", "exam_questions.json", "考试题库", "自建综合考试题（179 题）")

# 默认题库
DEFAULT_BANK = "classic"


def get_bank(bank_key: str) -> dict:
    """获取题库，无效 key 返回默认题库。"""
    return BANKS.get(bank_key, BANKS.get(DEFAULT_BANK))


def get_pool(bank_key: str) -> list[dict]:
    """获取指定题库的题目列表。"""
    return get_bank(bank_key).get("questions", [])


def get_random_questions_from(pool: list[dict], count: int) -> list[dict]:
    """从指定题目池中随机抽取。"""
    sample = random.sample(pool, min(count, len(pool)))
    return copy.deepcopy(sample)


# ===== 错题本（服务端持久化） =====
WRONG_PATH = os.path.join(BASE_DIR, "wrong_questions.json")

def load_wrong_questions() -> dict:
    """加载错题记录。"""
    try:
        with open(WRONG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"questions": []}


def save_wrong_questions(data: dict):
    """保存错题记录。"""
    with open(WRONG_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ===== API 路由 =====

@app.route("/api/health")
def api_health():
    """健康检查。"""
    total = sum(len(b["questions"]) for b in BANKS.values())
    return jsonify({
        "status": "ok",
        "banks": {k: {"label": v["label"], "count": len(v["questions"])}
                  for k, v in BANKS.items()},
        "total_questions": total,
    })


@app.route("/api/banks", methods=["GET"])
def api_banks():
    """返回可用题库列表。"""
    return jsonify({
        "banks": [
            {"key": k, "label": v["label"], "description": v["description"],
             "count": len(v["questions"])}
            for k, v in BANKS.items()
        ]
    })


@app.route("/api/topics", methods=["GET"])
def api_topics():
    """返回指定题库的主题列表。"""
    bank = request.args.get("bank", DEFAULT_BANK)
    pool = get_pool(bank)
    topics = sorted(set(q.get("topic", "未分类") for q in pool))
    return jsonify({"topics": topics})


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/questions", methods=["GET"])
def api_get_questions():
    """返回一轮随机题目。可选 bank / topic / count 参数。"""
    try:
        bank = request.args.get("bank", DEFAULT_BANK)
        pool = get_pool(bank)

        if not pool:
            bank_info = get_bank(bank)
            return jsonify({"error": f"题库「{bank_info['label']}」为空"}), 503

        topic = request.args.get("topic", "").strip()
        difficulty = request.args.get("difficulty", "").strip()
        keyword = request.args.get("keyword", "").strip()
        if keyword:
            kw = keyword.lower()
            pool = [q for q in pool
                    if kw in q.get("question", "").lower()
                    or kw in q.get("topic", "").lower()
                    or any(kw in o.lower() for o in q.get("options", []))]
        if topic:
            pool = [q for q in pool if q.get("topic") == topic]
        if difficulty:
            pool = [q for q in pool if q.get("difficulty") == difficulty]
        if not pool:
            field = topic or difficulty
            return jsonify({"error": f"未找到匹配的题目"}), 404

        count = request.args.get("count", 15, type=int)
        if count <= 0:
            count = len(pool)  # 全部题目
        count = max(1, min(count, len(pool)))
        questions = get_random_questions_from(pool, count)
        # 不把答案发给前端
        for q in questions:
            q.pop("answer", None)
            q.pop("explanation", None)
        logger.info("[%s] 出题 %d 道 (主题: %s, 难度: %s, 搜索: %s)", bank, len(questions), topic or "全部", difficulty or "全部", keyword or "无")
        return jsonify({"questions": questions, "bank": bank})
    except Exception as e:
        logger.error("出题失败: %s", e)
        return jsonify({"error": "服务器内部错误"}), 500


@app.route("/api/submit", methods=["POST"])
def api_submit():
    """批改答卷：返回每道题的正误 + 正确答案 + 解析。"""
    try:
        data = request.get_json()
        if not data or "answers" not in data:
            return jsonify({"error": "请求数据格式错误"}), 400

        bank = data.get("bank", DEFAULT_BANK)
        pool = get_pool(bank)
        user_answers = data.get("answers", {})

        pool_map = {q["id"]: q for q in pool}

        results = []
        correct_count = 0
        for qid, selected in user_answers.items():
            q = pool_map.get(qid)
            if q is None:
                continue
            correct = selected == q["answer"]
            if correct:
                correct_count += 1
            results.append({
                "id": qid,
                "question": q["question"],
                "options": q["options"],
                "selected": selected,
                "correct": correct,
                "answer": q["answer"],
                "explanation": q.get("explanation", ""),
            })

        total = len(results)
        passed = correct_count >= total * 0.6

        logger.info("[%s] 批改完成: %d/%d 正确 (%.1f%%)", bank, correct_count, total,
                     round(correct_count / total * 100, 1) if total else 0)

        return jsonify({
            "results": results,
            "correct_count": correct_count,
            "total": total,
            "passed": passed,
            "score_pct": round(correct_count / total * 100, 1) if total else 0,
            "bank": bank,
        })
    except Exception as e:
        logger.error("批改失败: %s", e)
        return jsonify({"error": "服务器内部错误"}), 500


# ===== 错题本 API =====

@app.route("/api/wrong", methods=["GET"])
def api_get_wrong():
    """获取错题列表。"""
    data = load_wrong_questions()
    return jsonify(data)


@app.route("/api/wrong", methods=["POST"])
def api_add_wrong():
    """添加错题（批量）。"""
    try:
        data = request.get_json()
        if not data or "questions" not in data:
            return jsonify({"error": "请求数据格式错误"}), 400

        wrong_data = load_wrong_questions()
        existing = {q["id"]: q for q in wrong_data["questions"]}

        for q in data["questions"]:
            qid = q.get("id")
            if qid in existing:
                # 已有记录，增加错误次数
                existing[qid]["wrong_count"] = existing[qid].get("wrong_count", 1) + 1
                # 更新最后错误答案
                existing[qid]["selected"] = q.get("selected", existing[qid]["selected"])
            else:
                q["wrong_count"] = 1
                existing[qid] = q

        wrong_data["questions"] = list(existing.values())
        save_wrong_questions(wrong_data)
        logger.info("错题本更新: %d 条记录", len(wrong_data["questions"]))
        return jsonify({"success": True, "count": len(wrong_data["questions"])})
    except Exception as e:
        logger.error("错题本写入失败: %s", e)
        return jsonify({"error": "服务器内部错误"}), 500


@app.route("/api/wrong/<qid>", methods=["DELETE"])
def api_remove_wrong(qid):
    """从错题本中移除单道错题。"""
    try:
        wrong_data = load_wrong_questions()
        before = len(wrong_data["questions"])
        wrong_data["questions"] = [q for q in wrong_data["questions"] if q["id"] != qid]
        after = len(wrong_data["questions"])
        save_wrong_questions(wrong_data)
        logger.info("错题移除: %s (前: %d, 后: %d)", qid, before, after)
        return jsonify({"success": True, "removed": before - after})
    except Exception as e:
        logger.error("错题移除失败: %s", e)
        return jsonify({"error": "服务器内部错误"}), 500


@app.route("/api/wrong", methods=["DELETE"])
def api_clear_wrong():
    """清空错题本。"""
    save_wrong_questions({"questions": []})
    logger.info("错题本已清空")
    return jsonify({"success": True})


if __name__ == "__main__":
    try:
        print("=" * 50)
        print("  [Python] 基础考察题库  —  开发服务器")
        print("  [http] http://localhost:5000")
        for k, v in BANKS.items():
            print(f"  [Bank] {v['label']}: {len(v['questions'])} 题")
        print("  [!] 生产环境请使用:  waitress-serve wsgi:app")
        print("=" * 50)
    except UnicodeEncodeError:
        print("Starting development server at http://localhost:5000")
    app.run(debug=True, host="0.0.0.0", port=5000)
