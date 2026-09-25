"""
Интерактивные задания из шаблонов (викторина, пары, пропуски, порядок слов).
GET    /exercises              — задания (учитель — свои, ученик — выданные)
POST   /exercises              — создать задание
PUT    /exercises              — обновить задание
POST   /exercises?p=assign     — выдать ученикам
POST   /exercises?p=result     — сохранить результат прохождения (ученик)
POST   /exercises?p=generate   — сгенерировать задание через ИИ
DELETE /exercises?id=          — удалить задание
"""
import json
import os
import urllib.request
import psycopg2

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token, X-User-Id",
    "Access-Control-Max-Age": "86400",
}

GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
TEMPLATES = ("quiz", "match", "gaps", "order", "truefalse", "cards")


def _json_time(o):
    """Время всегда уходит как UTC с меткой зоны — фронт переведёт в пояс пользователя."""
    import datetime as _dt
    if isinstance(o, _dt.datetime):
        if o.tzinfo is None:
            o = o.replace(tzinfo=_dt.timezone.utc)
        return o.astimezone(_dt.timezone.utc).isoformat()
    if isinstance(o, (_dt.date, _dt.time)):
        return o.isoformat()
    return str(o)


def resp(code, data):
    return {
        "statusCode": code,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=_json_time),
        "isBase64Encoded": False,
    }


def get_conn():
    # Единая зона UTC: время уходит на фронт с меткой зоны, там переводится в пояс пользователя
    conn = psycopg2.connect(os.environ["DATABASE_URL"], options="-c timezone=UTC")
    return conn


def auth(event, conn):
    token = (event.get("headers") or {}).get("X-Auth-Token", "")
    if not token:
        return None, None
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.role FROM sessions s JOIN users u ON u.id=s.user_id
           WHERE s.token=%s AND s.expires_at > NOW()""",
        (token,),
    )
    row = cur.fetchone()
    cur.close()
    return (row[0], row[1]) if row else (None, None)


def gpt_ready():
    return bool(os.environ.get("YANDEX_GPT_API_KEY") and os.environ.get("YANDEX_FOLDER_ID"))


def ask_gpt(system_text, user_text, max_tokens=2000):
    folder = os.environ["YANDEX_FOLDER_ID"]
    payload = {
        "modelUri": f"gpt://{folder}/yandexgpt/latest",
        "completionOptions": {"stream": False, "temperature": 0.3, "maxTokens": str(max_tokens)},
        "messages": [
            {"role": "system", "text": system_text},
            {"role": "user", "text": user_text},
        ],
    }
    req = urllib.request.Request(
        GPT_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {os.environ['YANDEX_GPT_API_KEY']}",
            "x-folder-id": folder,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["result"]["alternatives"][0]["message"]["text"]


def parse_lines(raw):
    text = raw.strip()
    if "```" in text:
        chunks = [c for c in text.split("```") if "|" in c]
        if chunks:
            text = chunks[0]
    rows = []
    for line in text.splitlines():
        line = line.strip().lstrip("-•*0123456789. ").strip()
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|") if c.strip()]
        if len(cells) >= 2:
            rows.append(cells)
    return rows


def build_items(template, rows):
    items = []
    for cells in rows:
        if template == "quiz":
            if len(cells) < 3:
                continue
            items.append({
                "question": cells[0],
                "options": cells[1:5],
                "answer": 0,
            })
        elif template in ("match", "cards"):
            items.append({"left": cells[0], "right": cells[1]})
        elif template == "gaps":
            if len(cells) < 2:
                continue
            items.append({"text": cells[0], "answer": cells[1]})
        elif template == "order":
            items.append({"sentence": cells[0], "hint": cells[1] if len(cells) > 1 else ""})
        elif template == "truefalse":
            val = cells[1].lower()
            items.append({"statement": cells[0], "answer": val.startswith(("вер", "да", "true", "1"))})
    return items


def shuffle_quiz(items):
    """Перемешать варианты, чтобы ответ не всегда был первым."""
    import random
    for it in items:
        opts = it.get("options") or []
        if len(opts) < 2:
            continue
        correct = opts[it.get("answer", 0)]
        random.shuffle(opts)
        it["options"] = opts
        it["answer"] = opts.index(correct)
    return items


def list_exercises(conn, user_id, role):
    cur = conn.cursor()
    if role in ("teacher", "admin"):
        cur.execute(
            """SELECT id, title, template, subject, instruction, items, created_at
               FROM exercises WHERE teacher_id=%s ORDER BY id DESC""",
            (user_id,),
        )
    else:
        cur.execute(
            """SELECT e.id, e.title, e.template, e.subject, e.instruction, e.items, e.created_at
               FROM exercises e JOIN exercise_assignments a ON a.exercise_id=e.id
               WHERE a.student_id=%s ORDER BY e.id DESC""",
            (user_id,),
        )
    rows = cur.fetchall()
    out = []
    for r in rows:
        try:
            items = json.loads(r[5] or "[]")
        except Exception:
            items = []
        out.append({
            "id": r[0], "title": r[1], "template": r[2], "subject": r[3],
            "instruction": r[4], "items": items, "created_at": r[6],
            "students": [], "results": [],
        })

    ids = [e["id"] for e in out]
    if ids and role in ("teacher", "admin"):
        idlist = ",".join(str(i) for i in ids)
        cur.execute(
            f"""SELECT a.exercise_id, u.id, u.name, u.avatar FROM exercise_assignments a
                JOIN users u ON u.id=a.student_id WHERE a.exercise_id IN ({idlist})"""
        )
        by_ex = {}
        for ex_id, sid, name, avatar in cur.fetchall():
            by_ex.setdefault(ex_id, []).append({"id": sid, "name": name, "avatar": avatar})
        cur.execute(
            f"""SELECT r.exercise_id, u.name, r.score, r.total, r.seconds, r.created_at
                FROM exercise_results r JOIN users u ON u.id=r.student_id
                WHERE r.exercise_id IN ({idlist}) ORDER BY r.created_at DESC"""
        )
        res_by_ex = {}
        for ex_id, name, score, total, secs, created in cur.fetchall():
            res_by_ex.setdefault(ex_id, []).append({
                "name": name, "score": score, "total": total,
                "seconds": secs, "created_at": created,
            })
        for e in out:
            e["students"] = by_ex.get(e["id"], [])
            e["results"] = res_by_ex.get(e["id"], [])
    elif ids:
        idlist = ",".join(str(i) for i in ids)
        cur.execute(
            f"""SELECT exercise_id, score, total, seconds, created_at FROM exercise_results
                WHERE student_id=%s AND exercise_id IN ({idlist}) ORDER BY created_at DESC""",
            (user_id,),
        )
        mine = {}
        for ex_id, score, total, secs, created in cur.fetchall():
            mine.setdefault(ex_id, []).append({
                "name": "Вы", "score": score, "total": total,
                "seconds": secs, "created_at": created,
            })
        for e in out:
            e["results"] = mine.get(e["id"], [])

    cur.close()
    conn.close()
    return resp(200, {"exercises": out, "ai_ready": gpt_ready()})


def create_exercise(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    title = (body.get("title") or "").strip()
    template = body.get("template") or "quiz"
    if not title:
        conn.close()
        return resp(400, {"error": "Введите название задания"})
    if template not in TEMPLATES:
        conn.close()
        return resp(400, {"error": "Неизвестный шаблон"})
    items = body.get("items") or []
    if not items:
        conn.close()
        return resp(400, {"error": "Добавьте хотя бы одно задание"})

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO exercises (teacher_id, title, template, subject, instruction, items)
           VALUES (%s, %s, %s, %s, %s, %s) RETURNING id""",
        (user_id, title[:255], template, (body.get("subject") or "")[:100],
         body.get("instruction") or "", json.dumps(items, ensure_ascii=False)),
    )
    ex_id = cur.fetchone()[0]

    student_ids = body.get("student_ids") or []
    assign_students(cur, ex_id, student_ids, title)
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "id": ex_id, "count": len(items)})


def assign_students(cur, ex_id, student_ids, title):
    for sid in student_ids:
        cur.execute(
            """INSERT INTO exercise_assignments (exercise_id, student_id) VALUES (%s, %s)
               ON CONFLICT DO NOTHING""",
            (ex_id, sid),
        )
        cur.execute(
            "INSERT INTO notifications (user_id, text, type) VALUES (%s, %s, 'homework')",
            (sid, f"Новое задание: {title}"),
        )


def update_exercise(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    ex_id = body.get("id")
    if not ex_id:
        conn.close()
        return resp(400, {"error": "id обязателен"})
    cur = conn.cursor()
    cur.execute("SELECT teacher_id FROM exercises WHERE id=%s", (ex_id,))
    row = cur.fetchone()
    if not row or row[0] != user_id:
        cur.close(); conn.close()
        return resp(403, {"error": "Нет доступа"})
    cur.execute(
        """UPDATE exercises SET title=%s, subject=%s, instruction=%s, items=%s, updated_at=NOW()
           WHERE id=%s""",
        ((body.get("title") or "")[:255], (body.get("subject") or "")[:100],
         body.get("instruction") or "", json.dumps(body.get("items") or [], ensure_ascii=False), ex_id),
    )
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True})


def assign_exercise(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    ex_id = body.get("exercise_id")
    student_ids = body.get("student_ids") or []
    if not ex_id:
        conn.close()
        return resp(400, {"error": "exercise_id обязателен"})
    cur = conn.cursor()
    cur.execute("SELECT title FROM exercises WHERE id=%s AND teacher_id=%s", (ex_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(403, {"error": "Нет доступа"})
    assign_students(cur, ex_id, student_ids, row[0])
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "students": len(student_ids)})


def save_result(event, conn, user_id, role):
    body = json.loads(event.get("body") or "{}")
    ex_id = body.get("exercise_id")
    if not ex_id:
        conn.close()
        return resp(400, {"error": "exercise_id обязателен"})
    score = int(body.get("score") or 0)
    total = int(body.get("total") or 0)
    seconds = int(body.get("seconds") or 0)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO exercise_results (exercise_id, student_id, score, total, seconds) VALUES (%s, %s, %s, %s, %s)",
        (ex_id, user_id, score, total, seconds),
    )
    cur.execute(
        "SELECT e.teacher_id, e.title, u.name FROM exercises e, users u WHERE e.id=%s AND u.id=%s",
        (ex_id, user_id),
    )
    row = cur.fetchone()
    if row and row[0] != user_id:
        cur.execute(
            "INSERT INTO notifications (user_id, text, type) VALUES (%s, %s, 'homework')",
            (row[0], f"{row[2]} прошёл задание «{row[1]}»: {score} из {total}"),
        )
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True})


def delete_exercise(event, conn, user_id, role):
    params = event.get("queryStringParameters") or {}
    ex_id = params.get("id")
    if not ex_id:
        conn.close()
        return resp(400, {"error": "id обязателен"})
    cur = conn.cursor()
    cur.execute("DELETE FROM exercises WHERE id=%s AND teacher_id=%s", (ex_id, user_id))
    cur.execute("DELETE FROM exercise_assignments WHERE exercise_id=%s", (ex_id,))
    cur.execute("DELETE FROM exercise_results WHERE exercise_id=%s", (ex_id,))
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True})


PROMPTS = {
    "quiz": (
        "Ты методист по испанскому языку. Составь вопросы с выбором ответа. "
        "Каждая строка строго: вопрос | правильный ответ | неверный | неверный | неверный. "
        "Только строки, без нумерации и пояснений."
    ),
    "match": (
        "Ты методист по испанскому языку. Составь пары для соединения. "
        "Каждая строка строго: слово по-испански | перевод на русский. "
        "Только строки, без нумерации и пояснений."
    ),
    "cards": (
        "Ты методист по испанскому языку. Составь пары слово-перевод. "
        "Каждая строка строго: слово по-испански | перевод на русский. "
        "Только строки, без нумерации и пояснений."
    ),
    "gaps": (
        "Ты методист по испанскому языку. Составь предложения с пропуском. "
        "Пропуск обозначай тремя подчёркиваниями ___. "
        "Каждая строка строго: предложение с ___ | пропущенное слово. "
        "Только строки, без нумерации и пояснений."
    ),
    "order": (
        "Ты методист по испанскому языку. Составь предложения для сборки из слов. "
        "Каждая строка строго: предложение по-испански | перевод на русский. "
        "Предложения от 4 до 8 слов. Только строки, без нумерации."
    ),
    "truefalse": (
        "Ты методист по испанскому языку. Составь утверждения правда/ложь. "
        "Каждая строка строго: утверждение | верно ИЛИ неверно. "
        "Только строки, без нумерации и пояснений."
    ),
}


def generate_exercise(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    conn.close()
    if not gpt_ready():
        return resp(400, {"error": "ИИ не подключён"})
    body = json.loads(event.get("body") or "{}")
    template = body.get("template") or "quiz"
    topic = (body.get("topic") or "").strip()
    count = min(int(body.get("count") or 8), 15)
    level = (body.get("level") or "A1").strip()
    if not topic:
        return resp(400, {"error": "Укажите тему"})
    if template not in PROMPTS:
        return resp(400, {"error": "Неизвестный шаблон"})

    user_text = f"Тема: {topic}. Уровень: {level}. Сделай ровно {count} строк."
    try:
        raw = ask_gpt(PROMPTS[template], user_text, max_tokens=2000)
    except Exception:
        return resp(502, {"error": "ИИ не ответил, попробуйте ещё раз"})

    items = build_items(template, parse_lines(raw))
    if template == "quiz":
        items = shuffle_quiz(items)
    if not items:
        return resp(422, {"error": "Не удалось разобрать ответ ИИ, измените тему"})
    return resp(200, {"items": items[:count]})


def handler(event: dict, context) -> dict:
    """Интерактивные задания из шаблонов: создание, выдача, прохождение."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    conn = get_conn()
    user_id, role = auth(event, conn)
    if not user_id:
        conn.close()
        return resp(401, {"error": "Не авторизован"})

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    path = params.get("p", "")

    if method == "GET":
        return list_exercises(conn, user_id, role)
    if method == "POST" and path == "generate":
        return generate_exercise(event, conn, user_id, role)
    if method == "POST" and path == "assign":
        return assign_exercise(event, conn, user_id, role)
    if method == "POST" and path == "result":
        return save_result(event, conn, user_id, role)
    if method == "POST":
        return create_exercise(event, conn, user_id, role)
    if method == "PUT":
        return update_exercise(event, conn, user_id, role)
    if method == "DELETE":
        return delete_exercise(event, conn, user_id, role)

    conn.close()
    return resp(404, {"error": "Неизвестный запрос"})
