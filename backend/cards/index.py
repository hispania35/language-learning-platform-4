"""
Карточки слов с автопереводом через YandexGPT.
GET    /cards                 — наборы карточек (учитель — свои, ученик — выданные)
POST   /cards?p=translate     — перевести список слов (ИИ)
POST   /cards                 — создать набор с карточками
POST   /cards?p=assign        — выдать набор ученикам
POST   /cards?p=progress      — отметить прогресс по карточке (ученик)
DELETE /cards?id=             — удалить набор
"""
import json
import os
import urllib.request
import urllib.error
import psycopg2

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token, X-User-Id",
    "Access-Control-Max-Age": "86400",
}

GPT_URL = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion"
MAX_WORDS = 60


def resp(code, data):
    return {
        "statusCode": code,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps(data, ensure_ascii=False, default=str),
        "isBase64Encoded": False,
    }


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])


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
        "completionOptions": {"stream": False, "temperature": 0.1, "maxTokens": str(max_tokens)},
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
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.loads(r.read().decode("utf-8"))
    return data["result"]["alternatives"][0]["message"]["text"]


def parse_rows(raw, words):
    """Достать из ответа модели строки вида слово | перевод | пример | перевод примера."""
    text = raw.strip()
    if "```" in text:
        parts = [p for p in text.split("```") if "|" in p or "{" in p]
        if parts:
            text = parts[0]
    out = []
    for line in text.splitlines():
        line = line.strip().lstrip("-•*0123456789. ").strip()
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 2 or not cells[0] or cells[1].lower() in ("перевод", "translation"):
            continue
        out.append({
            "front": cells[0],
            "back": cells[1],
            "example": cells[2] if len(cells) > 2 else "",
            "example_ru": cells[3] if len(cells) > 3 else "",
        })
    # если модель что-то пропустила — добиваем пустыми, чтобы учитель дозаполнил
    got = {r["front"].lower() for r in out}
    for w in words:
        if w.lower() not in got:
            out.append({"front": w, "back": "", "example": "", "example_ru": ""})
    return out


def translate(event, conn, role):
    """Перевести список слов и придумать примеры употребления."""
    if role != "teacher":
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    if not gpt_ready():
        conn.close()
        return resp(400, {"error": "ИИ не подключён: добавьте ключ YandexGPT в настройках проекта"})

    body = json.loads(event.get("body") or "{}")
    raw_words = body.get("words") or ""
    lang_from = body.get("lang_from") or "Испанский"
    lang_to = body.get("lang_to") or "Русский"
    with_examples = bool(body.get("with_examples", True))

    if isinstance(raw_words, list):
        words = [str(w).strip() for w in raw_words if str(w).strip()]
    else:
        chunks = raw_words.replace(";", "\n").replace(",", "\n").split("\n")
        words = [c.strip() for c in chunks if c.strip()]
    words = words[:MAX_WORDS]
    if not words:
        conn.close()
        return resp(400, {"error": "Список слов пуст"})

    cols = ("слово | перевод | пример с этим словом | перевод примера"
            if with_examples else "слово | перевод")
    system_text = (
        f"Ты помощник преподавателя языков. Переводишь слова и выражения с {lang_from.lower()}ого "
        f"на {lang_to.lower()}. Отвечай СТРОГО таблицей без заголовков и пояснений, "
        f"каждая строка в формате: {cols}. "
        "Для существительных указывай артикль, если он есть в языке. "
        "Если у слова несколько значений, дай 1-2 самых частых через запятую. "
        "Не добавляй нумерацию, markdown и лишний текст."
    )
    user_text = "Слова:\n" + "\n".join(words)

    try:
        raw = ask_gpt(system_text, user_text, max_tokens=2500)
    except urllib.error.HTTPError as e:
        conn.close()
        detail = e.read().decode("utf-8", "ignore")[:200]
        if e.code in (401, 403):
            return resp(400, {"error": "ИИ отклонил ключ — проверьте ключ и права сервисного аккаунта"})
        return resp(400, {"error": f"ИИ вернул ошибку {e.code}: {detail}"})
    except Exception:
        conn.close()
        return resp(400, {"error": "Не удалось связаться с ИИ, попробуйте ещё раз"})

    conn.close()
    return resp(200, {"cards": parse_rows(raw, words)})


def list_decks(conn, user_id, role):
    """Наборы карточек: учитель видит свои, ученик — выданные ему."""
    cur = conn.cursor()
    if role == "teacher":
        cur.execute(
            """SELECT d.id, d.title, d.description, d.lang_from, d.lang_to, d.created_at
               FROM card_decks d WHERE d.teacher_id=%s ORDER BY d.created_at DESC""",
            (user_id,),
        )
    else:
        cur.execute(
            """SELECT DISTINCT d.id, d.title, d.description, d.lang_from, d.lang_to, d.created_at
               FROM card_decks d
               JOIN card_deck_assignments a ON a.deck_id=d.id
               WHERE a.student_id=%s ORDER BY d.created_at DESC""",
            (user_id,),
        )
    decks = [
        {"id": r[0], "title": r[1], "description": r[2],
         "lang_from": r[3], "lang_to": r[4], "created_at": r[5],
         "cards": [], "students": []}
        for r in cur.fetchall()
    ]
    by_id = {d["id"]: d for d in decks}

    if by_id:
        ids = ",".join(str(i) for i in by_id)
        cur.execute(
            f"""SELECT id, deck_id, front, back, example, example_ru
                FROM cards WHERE deck_id IN ({ids}) ORDER BY position, id"""
        )
        for cid, did, front, back, ex, ex_ru in cur.fetchall():
            by_id[did]["cards"].append({
                "id": cid, "front": front, "back": back,
                "example": ex, "example_ru": ex_ru,
            })

        if role == "teacher":
            cur.execute(
                f"""SELECT a.deck_id, u.id, u.name, u.avatar
                    FROM card_deck_assignments a JOIN users u ON u.id=a.student_id
                    WHERE a.deck_id IN ({ids})"""
            )
            for did, sid, name, avatar in cur.fetchall():
                by_id[did]["students"].append({"id": sid, "name": name, "avatar": avatar})
        else:
            cur.execute(
                """SELECT p.card_id, p.known, p.attempts, p.correct
                   FROM card_progress p WHERE p.student_id=%s""",
                (user_id,),
            )
            prog = {r[0]: {"known": r[1], "attempts": r[2], "correct": r[3]} for r in cur.fetchall()}
            for d in decks:
                for c in d["cards"]:
                    c["progress"] = prog.get(c["id"], {"known": False, "attempts": 0, "correct": 0})

    cur.close()
    conn.close()
    return resp(200, {"decks": decks, "ai_ready": gpt_ready()})


def create_deck(event, conn, user_id, role):
    """Создать набор карточек вместе со словами."""
    if role != "teacher":
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    title = (body.get("title") or "").strip()
    cards = body.get("cards") or []
    if not title:
        conn.close()
        return resp(400, {"error": "Введите название набора"})
    cards = [c for c in cards if (c.get("front") or "").strip()]
    if not cards:
        conn.close()
        return resp(400, {"error": "Добавьте хотя бы одно слово"})

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO card_decks (teacher_id, title, description, lang_from, lang_to)
           VALUES (%s,%s,%s,%s,%s) RETURNING id""",
        (user_id, title, body.get("description"),
         body.get("lang_from") or "Испанский", body.get("lang_to") or "Русский"),
    )
    deck_id = cur.fetchone()[0]

    vals = ",".join(
        cur.mogrify("(%s,%s,%s,%s,%s,%s)", (
            deck_id, (c.get("front") or "").strip(), (c.get("back") or "").strip(),
            (c.get("example") or "").strip(), (c.get("example_ru") or "").strip(), i,
        )).decode()
        for i, c in enumerate(cards)
    )
    cur.execute(
        f"INSERT INTO cards (deck_id, front, back, example, example_ru, position) VALUES {vals}"
    )

    student_ids = [int(s) for s in (body.get("student_ids") or [])]
    if student_ids:
        av = ",".join(cur.mogrify("(%s,%s)", (deck_id, sid)).decode() for sid in set(student_ids))
        cur.execute(f"INSERT INTO card_deck_assignments (deck_id, student_id) VALUES {av}")
        nv = ",".join(
            cur.mogrify("(%s,%s,'material')", (sid, f"Новый набор карточек: {title}")).decode()
            for sid in set(student_ids)
        )
        cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {nv}")

    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "id": deck_id, "count": len(cards)})


def assign_deck(event, conn, user_id, role):
    """Выдать набор карточек ученикам (полная замена списка)."""
    if role != "teacher":
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    deck_id = body.get("deck_id")
    if not deck_id:
        conn.close()
        return resp(400, {"error": "Не указан набор"})
    deck_id = int(deck_id)
    student_ids = [int(s) for s in (body.get("student_ids") or [])]

    cur = conn.cursor()
    cur.execute("SELECT title FROM card_decks WHERE id=%s AND teacher_id=%s", (deck_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Набор не найден"})

    if body.get("group_id"):
        cur.execute("SELECT student_id FROM group_members WHERE group_id=%s", (int(body["group_id"]),))
        student_ids = sorted(set(student_ids) | {r[0] for r in cur.fetchall()})

    cur.execute("DELETE FROM card_deck_assignments WHERE deck_id=%s", (deck_id,))
    if student_ids:
        av = ",".join(cur.mogrify("(%s,%s)", (deck_id, sid)).decode() for sid in set(student_ids))
        cur.execute(f"INSERT INTO card_deck_assignments (deck_id, student_id) VALUES {av}")
        nv = ",".join(
            cur.mogrify("(%s,%s,'material')", (sid, f"Вам выдан набор карточек: {row[0]}")).decode()
            for sid in set(student_ids)
        )
        cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {nv}")

    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "students": len(set(student_ids))})


def save_progress(event, conn, user_id):
    """Запомнить результат ученика по карточке."""
    body = json.loads(event.get("body") or "{}")
    card_id = body.get("card_id")
    if not card_id:
        conn.close()
        return resp(400, {"error": "Не указана карточка"})
    known = bool(body.get("known"))
    correct = 1 if body.get("correct") else 0

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO card_progress (card_id, student_id, known, attempts, correct, updated_at)
           VALUES (%s,%s,%s,1,%s,now())
           ON CONFLICT (card_id, student_id) DO UPDATE SET
             known = EXCLUDED.known,
             attempts = card_progress.attempts + 1,
             correct = card_progress.correct + EXCLUDED.correct,
             updated_at = now()""",
        (int(card_id), user_id, known, correct),
    )
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})


def delete_deck(event, conn, user_id, role):
    """Удалить набор карточек."""
    if role != "teacher":
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    params = event.get("queryStringParameters") or {}
    did = params.get("id") or json.loads(event.get("body") or "{}").get("id")
    if not did:
        conn.close()
        return resp(400, {"error": "Не указан набор"})
    did = int(did)

    cur = conn.cursor()
    cur.execute("SELECT id FROM card_decks WHERE id=%s AND teacher_id=%s", (did, user_id))
    if not cur.fetchone():
        cur.close(); conn.close()
        return resp(404, {"error": "Набор не найден"})
    cur.execute("DELETE FROM card_progress WHERE card_id IN (SELECT id FROM cards WHERE deck_id=%s)", (did,))
    cur.execute("DELETE FROM card_deck_assignments WHERE deck_id=%s", (did,))
    cur.execute("DELETE FROM cards WHERE deck_id=%s", (did,))
    cur.execute("DELETE FROM card_decks WHERE id=%s", (did,))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})


def handler(event: dict, context) -> dict:
    """Карточки слов: список, автоперевод через ИИ, создание, выдача и прогресс."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    conn = get_conn()
    user_id, role = auth(event, conn)
    if not user_id:
        conn.close()
        return resp(401, {"error": "Не авторизован"})

    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    action = params.get("p", "")

    try:
        if method == "GET":
            return list_decks(conn, user_id, role)
        if method == "POST" and action == "translate":
            return translate(event, conn, role)
        if method == "POST" and action == "assign":
            return assign_deck(event, conn, user_id, role)
        if method == "POST" and action == "progress":
            return save_progress(event, conn, user_id)
        if method == "POST":
            return create_deck(event, conn, user_id, role)
        if method == "DELETE":
            return delete_deck(event, conn, user_id, role)

        conn.close()
        return resp(404, {"error": "Not found"})
    except Exception as e:
        conn.close()
        return resp(500, {"error": str(e)})
