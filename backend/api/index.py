"""
Основное API: материалы, календарь, чат, уведомления, рейтинг.
GET  /materials             — список материалов
POST /materials             — добавить материал (teacher)
GET  /calendar              — занятия
POST /calendar              — создать занятие (teacher)
GET  /chat/messages         — история сообщений
POST /chat/messages         — отправить сообщение
GET  /notifications         — уведомления
POST /notifications/read    — прочитать все
GET  /students              — список студентов (teacher)
GET  /leaderboard           — рейтинг
"""
import json
import os
from datetime import datetime, timedelta, time
import psycopg2
from mailer import send_email, send_bulk, lesson_started_email, lesson_reminder_email, _wrap

JITSI_HOST = "hispania-35.ru"
MONTHS_RU = ["января", "февраля", "марта", "апреля", "мая", "июня",
             "июля", "августа", "сентября", "октября", "ноября", "декабря"]

def room_url(lesson_id):
    return f"https://{JITSI_HOST}/hispania-lesson-{lesson_id}"

def ru_date(d):
    return f"{d.day} {MONTHS_RU[d.month - 1]}"

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token, Authorization",
    "Access-Control-Max-Age": "86400",
}

def get_conn():
    # Единая зона UTC: время уходит на фронт с меткой зоны, там переводится в пояс пользователя
    conn = psycopg2.connect(os.environ["DATABASE_URL"], options="-c timezone=UTC")
    return conn

def get_user(token, conn):
    if not token:
        return None
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.role, u.name FROM sessions s
           JOIN users u ON u.id=s.user_id
           WHERE s.token=%s AND s.expires_at > NOW()""",
        (token,)
    )
    row = cur.fetchone()
    cur.close()
    return row

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


def resp(status, data):
    return {"statusCode": status, "headers": CORS, "body": json.dumps(data, default=_json_time)}

def notify_many(cur, pairs, ntype):
    """Одним запросом создать уведомления: pairs = [(user_id, text), ...]"""
    pairs = list(pairs)
    if not pairs:
        return
    values = ",".join(cur.mogrify("(%s,%s,%s)", (uid, text, ntype)).decode() for uid, text in pairs)
    cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {values}")

def link_students(cur, lesson_id, student_ids):
    """Одним запросом записать учеников на занятие."""
    ids = list(student_ids)
    if not ids:
        return
    values = ",".join(cur.mogrify("(%s,%s)", (lesson_id, sid)).decode() for sid in ids)
    cur.execute(f"INSERT INTO lesson_students (lesson_id, student_id) VALUES {values}")

def rtc_poll(event, conn, user_id, user_name):
    params = event.get("queryStringParameters") or {}
    room = (params.get("room") or "").strip()[:128]
    if not room:
        conn.close()
        return resp(400, {"error": "room обязателен"})
    since = params.get("since")
    since = int(since) if since and since.isdigit() else 0

    cur = conn.cursor()
    cur.execute("DELETE FROM rtc_signals WHERE created_at < NOW() - INTERVAL '10 minutes'")
    cur.execute("DELETE FROM rtc_peers WHERE last_seen < NOW() - INTERVAL '30 seconds'")
    cur.execute(
        """INSERT INTO rtc_peers (room, user_id, user_name, last_seen)
           VALUES (%s, %s, %s, NOW())
           ON CONFLICT (room, user_id) DO UPDATE SET last_seen=NOW(), user_name=EXCLUDED.user_name""",
        (room, user_id, user_name)
    )
    if since == 0:
        cur.execute("SELECT COALESCE(MAX(id), 0) FROM rtc_signals WHERE room=%s", (room,))
        since = cur.fetchone()[0]

    cur.execute(
        "SELECT id, sender_id, kind, payload FROM rtc_signals WHERE room=%s AND id>%s AND sender_id<>%s ORDER BY id",
        (room, since, user_id)
    )
    signals = [{"id": r[0], "from": r[1], "kind": r[2], "payload": r[3]} for r in cur.fetchall()]
    cur.execute("SELECT user_id, user_name FROM rtc_peers WHERE room=%s ORDER BY user_id", (room,))
    peers = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]
    conn.commit()
    cur.close(); conn.close()
    last_id = signals[-1]["id"] if signals else since
    return resp(200, {"signals": signals, "peers": peers, "last_id": last_id, "me": user_id})

def rtc_send(event, conn, user_id, user_name):
    body = json.loads(event.get("body") or "{}")
    room = (body.get("room") or "").strip()[:128]
    kind = (body.get("kind") or "").strip()[:16]
    payload = body.get("payload")
    if not room or not kind:
        conn.close()
        return resp(400, {"error": "room и kind обязательны"})
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO rtc_signals (room, sender_id, kind, payload) VALUES (%s, %s, %s, %s) RETURNING id",
        (room, user_id, kind, json.dumps(payload))
    )
    sid = cur.fetchone()[0]
    cur.execute(
        """INSERT INTO rtc_peers (room, user_id, user_name, last_seen)
           VALUES (%s, %s, %s, NOW())
           ON CONFLICT (room, user_id) DO UPDATE SET last_seen=NOW()""",
        (room, user_id, user_name)
    )
    conn.commit()
    cur.close(); conn.close()
    return resp(200, {"ok": True, "id": sid})

def rtc_leave(event, conn, user_id):
    params = event.get("queryStringParameters") or {}
    room = (params.get("room") or "").strip()[:128]
    cur = conn.cursor()
    cur.execute("DELETE FROM rtc_peers WHERE room=%s AND user_id=%s", (room, user_id))
    cur.execute("INSERT INTO rtc_signals (room, sender_id, kind, payload) VALUES (%s, %s, 'bye', '{}')", (room, user_id))
    conn.commit()
    cur.close(); conn.close()
    return resp(200, {"ok": True})

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    params_pre = event.get("queryStringParameters") or {}
    if params_pre.get("p") == "reminders":
        return send_reminders(get_conn())

    token = event.get("headers", {}).get("X-Auth-Token", "")
    conn = get_conn()
    user = get_user(token, conn)
    if not user:
        conn.close()
        return resp(401, {"error": "Не авторизован"})

    user_id, role, user_name = user
    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    path = params.get("p", "")

    try:
        # --- Materials ---
        if path == "materials":
            if method == "GET":
                return get_materials(conn, user_id, role)
            if method == "POST":
                return create_material(event, conn, user_id, role)
            if method == "DELETE":
                return delete_material(event, conn, user_id, role)

        if path == "material_upload_url" and method == "POST":
            return material_upload_url(event, conn, role)

        if path == "material_assign" and method == "POST":
            return assign_material(event, conn, user_id, role)

        # --- Calendar ---
        if path == "calendar":
            if method == "GET":
                return get_lessons(conn, user_id, role)
            if method == "POST":
                return create_lesson(event, conn, user_id, role)
            if method == "PUT":
                return move_lesson(event, conn, user_id, role)
            if method == "DELETE":
                return delete_lesson(event, conn, user_id, role)

        # --- Chat ---
        if path == "chat_upload_url" and method == "POST":
            return chat_upload_url(event, conn)

        if path == "chat_ping" and method == "POST":
            return chat_ping(conn, user_id)

        if path == "chat_pin" and method == "POST":
            return pin_message(event, conn, user_id)

        if path == "chat_typing" and method == "POST":
            return set_typing(event, conn, user_id)

        if path == "chat_contacts" and method == "GET":
            return get_chat_contacts(conn, user_id, role)

        if path == "chat":
            if method == "GET":
                return get_messages(event, conn, user_id)
            if method == "POST":
                return send_message(event, conn, user_id, user_name)
            if method == "PUT":
                return edit_message(event, conn, user_id)
            if method == "DELETE":
                return delete_message(event, conn, user_id)

        # --- Notifications ---
        if path == "notifications_read" and method == "POST":
            return mark_notifications_read(conn, user_id)
        if path == "notifications" and method == "GET":
            return get_notifications(conn, user_id)

        # --- Помощь: обращения к администратору ---
        if path == "support":
            if method == "GET":
                return get_support(conn, user_id, role)
            if method == "POST":
                return create_support(event, conn, user_id, user_name, role)
            if method == "PUT":
                return answer_support(event, conn, user_id, role)

        # --- Profile ---
        if path == "profile":
            if method == "GET":
                return get_profile(conn, user_id)
            if method == "PUT":
                return update_profile(event, conn, user_id)

        # --- Student cancels lesson ---
        if path == "lesson_cancel" and method == "POST":
            return cancel_lesson_by_student(event, conn, user_id, user_name)

        # --- Start lesson (video) ---
        if path == "lesson_start" and method == "POST":
            return start_lesson(event, conn, user_id, role)

        # --- Profile stats ---
        if path == "profile_stats" and method == "GET":
            return profile_stats(conn, user_id, role)

        # --- Students list ---
        if path == "students":
            if method == "GET":
                return get_students(conn)
            if method == "PUT":
                return update_student(event, conn, role)

        # --- Groups ---
        if path == "groups":
            if method == "GET":
                return get_groups(conn, user_id, role)
            if method == "POST":
                return create_group(event, conn, user_id, role)
            if method == "PUT":
                return update_group(event, conn, user_id, role)
            if method == "DELETE":
                return remove_group(event, conn, user_id, role)

        # --- WebRTC signaling ---
        if path == "rtc" and method == "GET":
            return rtc_poll(event, conn, user_id, user_name)
        if path == "rtc" and method == "POST":
            return rtc_send(event, conn, user_id, user_name)
        if path == "rtc" and method == "DELETE":
            return rtc_leave(event, conn, user_id)

        # --- Leaderboard ---
        if path == "leaderboard" and method == "GET":
            return get_leaderboard(conn)

        # --- Settings ---
        if path == "settings" and method == "GET":
            return get_settings(conn, user_id, role)
        if path == "settings" and method == "POST":
            return save_settings(event, conn, user_id)

        # --- Slots ---
        if path == "slots" and method == "GET":
            return get_slots(event, conn, user_id, role)
        if path == "slots" and method == "POST":
            return create_slots(event, conn, user_id, role)
        if path == "slots" and method == "DELETE":
            return delete_slot(event, conn, user_id, role)
        if path == "slot_book" and method == "POST":
            return book_slot(event, conn, user_id, role)

        conn.close()
        return resp(404, {"error": "Not found"})
    except Exception as e:
        conn.close()
        return resp(500, {"error": str(e)})


# ── Materials ──────────────────────────────────────────────────────────────────

# Лимиты на размер файла по категориям, МБ
CATEGORY_LIMITS = {
    "Аудио": 20,
    "Видео": 2048,
    "Упражнения": 100,
    "Грамматика": 200,
    "Словари": 200,
}
DEFAULT_LIMIT_MB = 200


def lib_storage_ready():
    return all(os.environ.get(k) for k in
               ("LIB_S3_ENDPOINT", "LIB_S3_BUCKET", "LIB_S3_KEY_ID", "LIB_S3_SECRET_KEY"))


def lib_client():
    import boto3
    from botocore.config import Config
    return boto3.client(
        "s3",
        endpoint_url=os.environ["LIB_S3_ENDPOINT"],
        aws_access_key_id=os.environ["LIB_S3_KEY_ID"],
        aws_secret_access_key=os.environ["LIB_S3_SECRET_KEY"],
        region_name=os.environ.get("LIB_S3_REGION", "ru-central1"),
        config=Config(signature_version="s3v4"),
    )


def lib_signed_get(key, file_name=None):
    params = {"Bucket": os.environ["LIB_S3_BUCKET"], "Key": key}
    if file_name:
        params["ResponseContentDisposition"] = f'attachment; filename="{file_name}"'
    return lib_client().generate_presigned_url("get_object", Params=params, ExpiresIn=86400)


def material_upload_url(event, conn, role):
    """Выдать браузеру одноразовую ссылку, чтобы загрузить файл материала прямо в облако."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    if not lib_storage_ready():
        conn.close()
        return resp(400, {"error": "Облачное хранилище не подключено"})

    import uuid
    body = json.loads(event.get("body") or "{}")
    file_name = (body.get("file_name") or "file").strip()
    mime = body.get("mime") or "application/octet-stream"
    size = int(body.get("size") or 0)
    category = body.get("category") or ""
    limit_mb = CATEGORY_LIMITS.get(category, DEFAULT_LIMIT_MB)
    if size > limit_mb * 1024 * 1024:
        conn.close()
        return resp(400, {"error": f"Для «{category}» максимум {limit_mb} МБ"})

    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    key = f"materials/{uuid.uuid4().hex}.{ext}"
    put_url = lib_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": os.environ["LIB_S3_BUCKET"], "Key": key, "ContentType": mime},
        ExpiresIn=3600,
    )
    conn.close()
    return resp(200, {"upload_url": put_url, "key": key})


def delete_material(event, conn, user_id, role):
    """Удалить материал вместе с файлом в облаке."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    params = event.get("queryStringParameters") or {}
    mid = params.get("id") or json.loads(event.get("body") or "{}").get("id")
    if not mid:
        conn.close()
        return resp(400, {"error": "Не указан материал"})
    cur = conn.cursor()
    cur.execute("SELECT file_key, storage FROM materials WHERE id=%s", (int(mid),))
    row = cur.fetchone()
    if row and row[0] and row[1] == "external" and lib_storage_ready():
        try:
            lib_client().delete_object(Bucket=os.environ["LIB_S3_BUCKET"], Key=row[0])
        except Exception:
            pass
    cur.execute("DELETE FROM material_assignments WHERE material_id=%s", (int(mid),))
    cur.execute("DELETE FROM materials WHERE id=%s", (int(mid),))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})


def assign_material(event, conn, user_id, role):
    """Прикрепить материал к ученикам, группе или занятию (полная замена списка)."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    mid = body.get("material_id")
    if not mid:
        conn.close()
        return resp(400, {"error": "Не указан материал"})
    mid = int(mid)

    student_ids = [int(s) for s in (body.get("student_ids") or [])]
    lesson_ids = [int(l) for l in (body.get("lesson_ids") or [])]
    group_id = body.get("group_id")

    cur = conn.cursor()
    cur.execute("SELECT title FROM materials WHERE id=%s", (mid,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Материал не найден"})
    title = row[0]

    if group_id:
        cur.execute("SELECT student_id FROM group_members WHERE group_id=%s", (int(group_id),))
        student_ids = sorted(set(student_ids) | {r[0] for r in cur.fetchall()})

    cur.execute("DELETE FROM material_assignments WHERE material_id=%s", (mid,))
    if student_ids:
        vals = ",".join(cur.mogrify("(%s,%s)", (mid, sid)).decode() for sid in set(student_ids))
        cur.execute(f"INSERT INTO material_assignments (material_id, student_id) VALUES {vals}")
    if lesson_ids:
        vals = ",".join(cur.mogrify("(%s,%s)", (mid, lid)).decode() for lid in set(lesson_ids))
        cur.execute(f"INSERT INTO material_assignments (material_id, lesson_id) VALUES {vals}")

    # ученики занятий тоже получают уведомление
    notify_ids = set(student_ids)
    if lesson_ids:
        ids = ",".join(str(i) for i in set(lesson_ids))
        cur.execute(f"SELECT DISTINCT student_id FROM lesson_students WHERE lesson_id IN ({ids})")
        notify_ids |= {r[0] for r in cur.fetchall()}
    if notify_ids:
        notify_many(cur, [(sid, f"Вам выдан материал: {title}") for sid in notify_ids], "material")

    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "students": len(set(student_ids)), "lessons": len(set(lesson_ids))})


def get_materials(conn, user_id=None, role="teacher"):
    cur = conn.cursor()
    cur.execute(
        """SELECT m.id, m.title, m.description, m.category,
                  m.file_type, m.file_size, m.file_url, m.created_at,
                  u.name as teacher_name, m.file_key, m.file_name, m.storage
           FROM materials m JOIN users u ON u.id=m.teacher_id
           ORDER BY m.created_at DESC"""
    )
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    items = [dict(zip(cols, r)) for r in rows]
    by_id = {it["id"]: it for it in items}
    for it in items:
        it["students"] = []
        it["lessons"] = []

    # кому и к каким занятиям прикреплён материал
    cur.execute(
        """SELECT a.material_id, a.student_id, u.name, u.avatar
           FROM material_assignments a JOIN users u ON u.id=a.student_id
           WHERE a.student_id IS NOT NULL"""
    )
    for m_id, sid, name, avatar in cur.fetchall():
        if m_id in by_id:
            by_id[m_id]["students"].append({"id": sid, "name": name, "avatar": avatar})

    cur.execute(
        """SELECT a.material_id, a.lesson_id, l.topic, l.lesson_date, l.lesson_time
           FROM material_assignments a JOIN lessons l ON l.id=a.lesson_id
           WHERE a.lesson_id IS NOT NULL"""
    )
    for m_id, lid, topic, ldate, ltime in cur.fetchall():
        if m_id in by_id:
            by_id[m_id]["lessons"].append({
                "id": lid, "topic": topic,
                "lesson_date": str(ldate), "lesson_time": str(ltime)[:5],
            })

    # ученик видит только общие материалы и то, что выдано лично или на его занятие
    if role not in ("teacher", "admin") and user_id:
        cur.execute("SELECT lesson_id FROM lesson_students WHERE student_id=%s", (user_id,))
        my_lessons = {r[0] for r in cur.fetchall()}
        items = [
            it for it in items
            if (not it["students"] and not it["lessons"])
            or any(s["id"] == user_id for s in it["students"])
            or any(l["id"] in my_lessons for l in it["lessons"])
        ]

    ready = lib_storage_ready()
    for it in items:
        if it.get("storage") == "external" and it.get("file_key") and ready:
            try:
                it["file_url"] = lib_signed_get(it["file_key"], it.get("file_name"))
            except Exception:
                it["file_url"] = None
        it.pop("file_key", None)
        it.pop("storage", None)
    cur.close(); conn.close()
    return resp(200, {"materials": items, "limits": CATEGORY_LIMITS,
                      "storage_ready": ready})

def create_material(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    title = body.get("title", "").strip()
    if not title:
        conn.close()
        return resp(400, {"error": "Название обязательно"})
    key = body.get("file_key")
    size = int(body.get("size") or 0)
    if size:
        human = (f"{round(size / 1024)} КБ" if size < 1024 * 1024
                 else f"{size / 1024 / 1024:.1f} МБ" if size < 1024 ** 3
                 else f"{size / 1024 ** 3:.2f} ГБ")
    else:
        human = body.get("file_size")

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO materials (teacher_id, title, description, category, file_type, file_size,
                                  file_url, file_key, file_name, mime, size_bytes, storage)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (user_id, title, body.get("description"), body.get("category"),
         body.get("file_type"), human, body.get("file_url"),
         key, body.get("file_name"), body.get("mime"), size,
         "external" if key else None)
    )
    mat_id = cur.fetchone()[0]
    cur.execute("SELECT id FROM users WHERE role='student'")
    notify_many(cur, [(r[0], f"Новый материал: {title}") for r in cur.fetchall()], "material")
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "id": mat_id})


# ── Calendar ───────────────────────────────────────────────────────────────────

def get_lessons(conn, user_id, role):
    cur = conn.cursor()
    if role in ("teacher", "admin"):
        cur.execute(
            """SELECT l.id, l.title, l.topic, l.lesson_date, l.lesson_time,
                      l.duration_min, l.lesson_type
               FROM lessons l WHERE l.teacher_id=%s ORDER BY l.lesson_date, l.lesson_time""",
            (user_id,)
        )
    else:
        cur.execute(
            """SELECT l.id, l.title, l.topic, l.lesson_date, l.lesson_time,
                      l.duration_min, l.lesson_type
               FROM lessons l JOIN lesson_students ls ON ls.lesson_id=l.id
               WHERE ls.student_id=%s ORDER BY l.lesson_date, l.lesson_time""",
            (user_id,)
        )
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    result = []
    for row in rows:
        item = dict(zip(cols, row))
        if item.get("lesson_date"):
            item["lesson_date"] = item["lesson_date"].strftime("%Y-%m-%d")
        if item.get("lesson_time"):
            item["lesson_time"] = str(item["lesson_time"])[:5]
        item["students"] = []
        result.append(item)

    if result:
        by_id = {r["id"]: r for r in result}
        id_list = ",".join(str(i) for i in by_id.keys())
        cur.execute(
            f"""SELECT ls.lesson_id, u.id, u.name, u.avatar
                FROM lesson_students ls JOIN users u ON u.id=ls.student_id
                WHERE ls.lesson_id IN ({id_list}) ORDER BY u.name"""
        )
        for lid, sid, sname, savatar in cur.fetchall():
            if lid in by_id:
                by_id[lid]["students"].append({"id": sid, "name": sname, "avatar": savatar})

    cur.close(); conn.close()
    return resp(200, {"lessons": result})

def create_lesson(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    topic = body.get("topic", "").strip()
    lesson_date = body.get("lesson_date")
    lesson_time = body.get("lesson_time")
    if not topic or not lesson_date or not lesson_time:
        conn.close()
        return resp(400, {"error": "Тема, дата и время обязательны"})
    if is_past(lesson_date, lesson_time):
        conn.close()
        return resp(400, {"error": "Это время уже прошло — выберите будущую дату и время"})
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO lessons (teacher_id, title, topic, lesson_date, lesson_time, duration_min, lesson_type)
           VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (user_id, body.get("title", topic), topic, lesson_date, lesson_time,
         body.get("duration_min", 60), body.get("lesson_type", "Грамматика"))
    )
    lesson_id = cur.fetchone()[0]
    raw_ids = body.get("student_ids") or []
    student_ids = []
    for s in raw_ids:
        try:
            student_ids.append(int(s))
        except (TypeError, ValueError):
            pass
    if student_ids:
        id_list = ",".join(str(i) for i in student_ids)
        cur.execute(f"SELECT id FROM users WHERE role='student' AND id IN ({id_list})")
    else:
        cur.execute("SELECT id FROM users WHERE role='student'")
    sids = [r[0] for r in cur.fetchall()]
    added = len(sids)
    link_students(cur, lesson_id, sids)
    notify_many(cur, [(sid, f"Новое занятие {lesson_date} {lesson_time}: {topic}") for sid in sids], "calendar")

    cur.execute("SELECT COALESCE(notify_new_lesson,TRUE) FROM users WHERE id=%s", (user_id,))
    r = cur.fetchone()
    if r and r[0]:
        from mailer import _wrap
        html = _wrap("Занятие добавлено в расписание", [
            f"Занятие <b>«{topic}»</b> поставлено в расписание.",
            f"Дата и время: <b>{lesson_date}, {str(lesson_time)[:5]}</b>",
            f"Учеников записано: <b>{added}</b>",
        ])
        notify_teacher(cur, user_id, f"Новое занятие «{topic}»",
                       f"Занятие «{topic}» назначено на {lesson_date} {str(lesson_time)[:5]}", html)

    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "id": lesson_id})

def move_lesson(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    lesson_id = body.get("id")
    lesson_date = body.get("lesson_date")
    lesson_time = body.get("lesson_time")
    if not lesson_id or not lesson_date or not lesson_time:
        conn.close()
        return resp(400, {"error": "id, дата и время обязательны"})
    if is_past(lesson_date, lesson_time):
        conn.close()
        return resp(400, {"error": "Это время уже прошло — выберите будущую дату и время"})
    cur = conn.cursor()
    cur.execute("SELECT topic, lesson_date, lesson_time FROM lessons WHERE id=%s AND teacher_id=%s",
                (lesson_id, user_id))
    old = cur.fetchone()
    if not old:
        cur.close(); conn.close()
        return resp(404, {"error": "Занятие не найдено"})
    old_topic, old_date, old_time = old

    topic = (body.get("topic") or "").strip() or old_topic
    lesson_type = body.get("lesson_type")
    duration = body.get("duration_min")

    fields = ["lesson_date=%s", "lesson_time=%s", "topic=%s", "title=%s"]
    values = [lesson_date, lesson_time, topic, topic]
    if lesson_type:
        fields.append("lesson_type=%s"); values.append(lesson_type)
    if duration:
        fields.append("duration_min=%s"); values.append(int(duration))
    values.extend([lesson_id, user_id])
    cur.execute(f"UPDATE lessons SET {', '.join(fields)} WHERE id=%s AND teacher_id=%s", tuple(values))

    cur.execute("SELECT student_id FROM lesson_students WHERE lesson_id=%s", (lesson_id,))
    old_students = set(r[0] for r in cur.fetchall())

    raw_ids = body.get("student_ids")
    new_students = old_students
    if raw_ids is not None:
        new_students = set()
        for s in raw_ids:
            try:
                new_students.add(int(s))
            except (TypeError, ValueError):
                pass
        added = new_students - old_students
        removed = old_students - new_students
        link_students(cur, lesson_id, added)
        notify_many(cur, [(sid, f"Вас записали на занятие {lesson_date} {lesson_time}: {topic}")
                          for sid in added], "calendar")
        if removed:
            drop_list = ",".join(str(i) for i in removed)
            cur.execute(f"DELETE FROM lesson_students WHERE lesson_id=%s AND student_id IN ({drop_list})",
                        (lesson_id,))
            notify_many(cur, [(sid, f"Вас убрали с занятия {old_date} {str(old_time)[:5]}: {old_topic}")
                              for sid in removed], "calendar")

    changed_time = str(old_date) != str(lesson_date) or str(old_time)[:5] != str(lesson_time)[:5]
    changed_topic = old_topic != topic
    if changed_time or changed_topic:
        stay = new_students & old_students if raw_ids is not None else old_students
        text = (f"Занятие перенесено на {lesson_date} {lesson_time}: {topic}" if changed_time
                else f"Занятие {lesson_date} {lesson_time} изменено: {topic}")
        notify_many(cur, [(sid, text) for sid in stay], "calendar")

    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def delete_lesson(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    lesson_id = body.get("id") or params.get("id")
    if not lesson_id:
        conn.close()
        return resp(400, {"error": "id обязателен"})
    cur = conn.cursor()
    cur.execute("SELECT topic, lesson_date, lesson_time FROM lessons WHERE id=%s AND teacher_id=%s",
                (lesson_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Занятие не найдено"})
    topic, l_date, l_time = row
    cur.execute("SELECT student_id FROM lesson_students WHERE lesson_id=%s", (lesson_id,))
    student_ids = [r[0] for r in cur.fetchall()]
    cur.execute("DELETE FROM lesson_students WHERE lesson_id=%s", (lesson_id,))
    # Окно записи снова становится свободным
    cur.execute("UPDATE lesson_slots SET booked_by=NULL, booked_at=NULL, lesson_id=NULL WHERE lesson_id=%s",
                (lesson_id,))
    cur.execute("DELETE FROM lessons WHERE id=%s AND teacher_id=%s", (lesson_id, user_id))
    notify_many(cur, [(sid, f"Занятие отменено {l_date} {str(l_time)[:5]}: {topic}")
                      for sid in student_ids], "calendar")

    cur.execute("SELECT COALESCE(notify_cancel,TRUE) FROM users WHERE id=%s", (user_id,))
    r = cur.fetchone()
    if r and r[0]:
        from mailer import _wrap
        html = _wrap("Занятие отменено", [
            f"Занятие <b>«{topic}»</b> удалено из расписания.",
            f"Было запланировано на <b>{ru_date(l_date)}, {str(l_time)[:5]}</b>",
            f"Уведомлено учеников: <b>{len(student_ids)}</b>",
        ])
        notify_teacher(cur, user_id, f"Занятие «{topic}» отменено",
                       f"Занятие «{topic}» {ru_date(l_date)} в {str(l_time)[:5]} отменено", html)

    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})


# ── Chat ───────────────────────────────────────────────────────────────────────

MSG_SELECT = """SELECT m.id, m.from_user_id, m.to_user_id, m.text, m.is_read, m.created_at,
                       u.name as from_name, u.avatar as from_avatar,
                       COALESCE(m.file_url,'') as file_url, COALESCE(m.file_name,'') as file_name,
                       COALESCE(m.file_type,'') as file_type, COALESCE(m.audio_sec,0) as audio_sec,
                       m.group_id, m.edited_at, COALESCE(m.removed_for_all,FALSE) as removed_for_all,
                       m.pinned_at, m.file_key
                FROM messages m JOIN users u ON u.id=m.from_user_id"""

def _sign_chat_files(items):
    ready = lib_storage_ready()
    for it in items:
        key = it.pop("file_key", None)
        if key and ready:
            try:
                it["file_url"] = lib_signed_get(key)
            except Exception:
                it["file_url"] = ""


def _visible(user_id):
    return f" AND COALESCE(m.removed_for_all,FALSE)=FALSE AND NOT ({user_id} = ANY(COALESCE(m.hidden_for,'{{}}')))"

def get_messages(event, conn, user_id):
    params = event.get("queryStringParameters") or {}
    other_id = params.get("with")
    cur = conn.cursor()
    if other_id:
        cur.execute(
            MSG_SELECT + """ WHERE ((m.from_user_id=%s AND m.to_user_id=%s)
                                OR (m.from_user_id=%s AND m.to_user_id=%s))"""
            + _visible(user_id) + " ORDER BY m.created_at",
            (user_id, int(other_id), int(other_id), user_id)
        )
    else:
        cur.execute(
            MSG_SELECT + " WHERE (m.from_user_id=%s OR m.to_user_id=%s)"
            + _visible(user_id) + " ORDER BY m.created_at",
            (user_id, user_id)
        )
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    messages = [dict(zip(cols, r)) for r in rows]
    _sign_chat_files(messages)

    typing = False
    if other_id:
        cur.execute("UPDATE messages SET is_read=TRUE WHERE to_user_id=%s AND from_user_id=%s AND is_read=FALSE",
                    (user_id, int(other_id)))
        cur.execute(
            f"""SELECT 1 FROM typing_status
                WHERE user_id=%s AND peer_id=%s AND updated_at > NOW() - INTERVAL '{TYPING_SEC} seconds'""",
            (int(other_id), user_id)
        )
        typing = cur.fetchone() is not None
        conn.commit()
    cur.close(); conn.close()
    return resp(200, {"messages": messages, "typing": typing})

ONLINE_SEC = 120
UNREAD_ALERT_MIN = 15
EDIT_WINDOW_MIN = 60
TYPING_SEC = 6

def pin_message(event, conn, user_id):
    """Закрепить или открепить сообщение в переписке."""
    body = json.loads(event.get("body") or "{}")
    msg_id = body.get("id")
    pin = bool(body.get("pin", True))
    if not msg_id:
        conn.close()
        return resp(400, {"error": "Укажите сообщение"})
    cur = conn.cursor()
    cur.execute("SELECT from_user_id, to_user_id FROM messages WHERE id=%s", (msg_id,))
    row = cur.fetchone()
    if not row or user_id not in (row[0], row[1]):
        cur.close(); conn.close()
        return resp(403, {"error": "Нет доступа к этому сообщению"})
    cur.execute("UPDATE messages SET pinned_at=%s WHERE id=%s",
                (datetime.now() if pin else None, msg_id))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def set_typing(event, conn, user_id):
    """Отметить, что пользователь печатает собеседнику."""
    body = json.loads(event.get("body") or "{}")
    peer_id = body.get("peer_id")
    if not peer_id:
        conn.close()
        return resp(400, {"error": "Укажите собеседника"})
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO typing_status (user_id, peer_id, updated_at) VALUES (%s,%s,NOW())
           ON CONFLICT (user_id, peer_id) DO UPDATE SET updated_at=NOW()""",
        (user_id, int(peer_id))
    )
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def edit_message(event, conn, user_id):
    body = json.loads(event.get("body") or "{}")
    msg_id = body.get("id")
    text = (body.get("text") or "").strip()
    if not msg_id or not text:
        conn.close()
        return resp(400, {"error": "Укажите сообщение и новый текст"})
    cur = conn.cursor()
    cur.execute(
        f"""SELECT from_user_id, created_at < NOW() - INTERVAL '{EDIT_WINDOW_MIN} minutes'
            FROM messages WHERE id=%s""", (msg_id,)
    )
    row = cur.fetchone()
    if not row or row[0] != user_id:
        cur.close(); conn.close()
        return resp(403, {"error": "Можно менять только свои сообщения"})
    if row[1]:
        cur.close(); conn.close()
        return resp(400, {"error": f"Изменить можно в течение {EDIT_WINDOW_MIN} минут"})
    cur.execute("UPDATE messages SET text=%s, edited_at=NOW() WHERE id=%s", (text, msg_id))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def delete_message(event, conn, user_id):
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    msg_id = body.get("id") or params.get("id")
    scope = body.get("scope") or params.get("scope") or "me"
    if not msg_id:
        conn.close()
        return resp(400, {"error": "Укажите сообщение"})
    cur = conn.cursor()
    cur.execute("SELECT from_user_id, to_user_id FROM messages WHERE id=%s", (msg_id,))
    row = cur.fetchone()
    if not row or user_id not in (row[0], row[1]):
        cur.close(); conn.close()
        return resp(403, {"error": "Нет доступа к этому сообщению"})

    if scope == "all":
        if row[0] != user_id:
            cur.close(); conn.close()
            return resp(403, {"error": "У всех можно удалить только своё сообщение"})
        cur.execute("UPDATE messages SET removed_for_all=TRUE, is_read=TRUE WHERE id=%s", (msg_id,))
    else:
        cur.execute(
            "UPDATE messages SET hidden_for = COALESCE(hidden_for,'{}') || %s::int WHERE id=%s",
            (user_id, msg_id)
        )
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def chat_ping(conn, user_id):
    """Отметить пользователя в сети, вернуть непрочитанные и разослать письма о забытых сообщениях."""
    cur = conn.cursor()
    cur.execute("UPDATE users SET last_seen=NOW() WHERE id=%s", (user_id,))

    cur.execute(
        """SELECT m.id, m.from_user_id, u.name, COALESCE(NULLIF(m.text,''), m.file_name, 'Вложение'), m.created_at
           FROM messages m JOIN users u ON u.id=m.from_user_id
           WHERE m.to_user_id=%s AND m.is_read=FALSE
             AND COALESCE(m.removed_for_all,FALSE)=FALSE
             AND NOT (%s = ANY(COALESCE(m.hidden_for,'{}')))
           ORDER BY m.created_at DESC LIMIT 30""",
        (user_id, user_id)
    )
    rows = cur.fetchall()
    unread = [{"id": r[0], "from_user_id": r[1], "from_name": r[2], "preview": r[3], "created_at": r[4]} for r in rows]

    sent = _send_unread_digests(cur)
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "unread": len(unread), "messages": unread, "emails_sent": sent})

def _send_unread_digests(cur):
    """Письмо «у вас есть непрочитанные сообщения» тем, кто не в сети и не читал 15+ минут."""
    cur.execute(
        f"""SELECT u.id, u.name, u.email, COUNT(m.id)
            FROM messages m JOIN users u ON u.id=m.to_user_id
            WHERE m.is_read=FALSE AND COALESCE(m.email_notified,FALSE)=FALSE AND COALESCE(m.removed_for_all,FALSE)=FALSE
              AND m.created_at < NOW() - INTERVAL '{UNREAD_ALERT_MIN} minutes'
              AND COALESCE(u.notify_email,TRUE) AND COALESCE(u.notify_chat,TRUE)
              AND (u.last_seen IS NULL OR u.last_seen < NOW() - INTERVAL '{ONLINE_SEC} seconds')
            GROUP BY u.id, u.name, u.email
            LIMIT 10"""
    )
    targets = cur.fetchall()
    if not targets:
        return 0
    letters = []
    for uid, uname, uemail, cnt in targets:
        word = "сообщение" if cnt == 1 else ("сообщения" if cnt < 5 else "сообщений")
        html = _wrap("У вас есть непрочитанные сообщения", [
            f"Здравствуйте, {uname}!",
            f"В чате платформы вас ждёт <b>{cnt} непрочитанных {word}</b>.",
            "Загляните в раздел «Чат», чтобы ответить.",
        ])
        letters.append((uemail, f"Непрочитанных сообщений: {cnt}", html))
    id_list = ",".join(str(t[0]) for t in targets)
    cur.execute(
        f"""UPDATE messages SET email_notified=TRUE
            WHERE to_user_id IN ({id_list}) AND is_read=FALSE AND COALESCE(email_notified,FALSE)=FALSE"""
    )
    return send_bulk(letters)

def get_chat_contacts(conn, user_id, role):
    """Список собеседников с последним сообщением и счётчиком непрочитанного."""
    cur = conn.cursor()
    if role in ("teacher", "admin"):
        cur.execute(f"""SELECT id, name, avatar, COALESCE(level,''),
                        (last_seen IS NOT NULL AND last_seen > NOW() - INTERVAL '{ONLINE_SEC} seconds')
                        FROM users WHERE role='student' ORDER BY name""")
    else:
        cur.execute(f"""SELECT id, name, avatar, COALESCE(level,''),
                        (last_seen IS NOT NULL AND last_seen > NOW() - INTERVAL '{ONLINE_SEC} seconds')
                        FROM users WHERE role='teacher' ORDER BY name""")
    people = [{"id": r[0], "name": r[1], "avatar": r[2], "level": r[3], "online": bool(r[4]),
               "last_text": "", "last_at": None, "unread": 0} for r in cur.fetchall()]

    if people:
        by_id = {p["id"]: p for p in people}
        ids = ",".join(str(i) for i in by_id.keys())
        cur.execute(
            f"""SELECT DISTINCT ON (partner) partner, text, file_name, created_at FROM (
                    SELECT CASE WHEN from_user_id={user_id} THEN to_user_id ELSE from_user_id END AS partner,
                           text, COALESCE(file_name,'') AS file_name, created_at
                    FROM messages
                    WHERE (from_user_id={user_id} AND to_user_id IN ({ids}))
                       OR (to_user_id={user_id} AND from_user_id IN ({ids}))
                ) t ORDER BY partner, created_at DESC"""
        )
        for pid, text, fname, created in cur.fetchall():
            if pid in by_id:
                by_id[pid]["last_text"] = text or (f"Файл: {fname}" if fname else "")
                by_id[pid]["last_at"] = created

        cur.execute(
            f"""SELECT from_user_id, COUNT(*) FROM messages
                WHERE to_user_id={user_id} AND is_read=FALSE AND from_user_id IN ({ids})
                  AND COALESCE(removed_for_all,FALSE)=FALSE
                GROUP BY from_user_id"""
        )
        for pid, cnt in cur.fetchall():
            if pid in by_id:
                by_id[pid]["unread"] = cnt

    groups = []
    if role in ("teacher", "admin"):
        cur.execute("SELECT id, name, color FROM student_groups WHERE teacher_id=%s ORDER BY name", (user_id,))
        groups = [{"id": r[0], "name": r[1], "color": r[2], "students": []} for r in cur.fetchall()]
        if groups:
            gmap = {g["id"]: g for g in groups}
            gids = ",".join(str(i) for i in gmap.keys())
            cur.execute(
                f"""SELECT gm.group_id, u.id, u.name, u.avatar FROM group_members gm
                    JOIN users u ON u.id=gm.student_id WHERE gm.group_id IN ({gids}) ORDER BY u.name"""
            )
            for gid, sid, sname, savatar in cur.fetchall():
                if gid in gmap:
                    gmap[gid]["students"].append({"id": sid, "name": sname, "avatar": savatar})

    cur.close(); conn.close()
    return resp(200, {"contacts": people, "groups": groups})

def _store_chat_file(body):
    """Сохранить вложение в S3, вернуть (url, name, type)."""
    data_b64 = body.get("file_data")
    if not data_b64:
        return "", "", ""
    import base64, uuid, boto3
    raw = base64.b64decode(data_b64.split(",")[-1])
    if len(raw) > 15 * 1024 * 1024:
        raise ValueError("Файл больше 15 МБ")
    name = (body.get("file_name") or "file").strip()
    ftype = body.get("file_type") or "file"
    ext = name.rsplit(".", 1)[-1] if "." in name else ("webm" if ftype == "audio" else "bin")
    key = f"chat/{uuid.uuid4().hex}.{ext}"
    s3 = boto3.client("s3", endpoint_url="https://bucket.poehali.dev",
                      aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"])
    s3.put_object(Bucket="files", Key=key, Body=raw,
                  ContentType=body.get("mime") or "application/octet-stream")
    url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    return url, name, ftype

CHAT_LIMIT_MB = 200


def chat_upload_url(event, conn):
    """Выдать браузеру ссылку для прямой загрузки вложения чата в облако."""
    if not lib_storage_ready():
        conn.close()
        return resp(400, {"error": "Облачное хранилище не подключено"})

    import uuid
    body = json.loads(event.get("body") or "{}")
    file_name = (body.get("file_name") or "file").strip()
    mime = body.get("mime") or "application/octet-stream"
    size = int(body.get("size") or 0)
    if size > CHAT_LIMIT_MB * 1024 * 1024:
        conn.close()
        return resp(400, {"error": f"Файл больше {CHAT_LIMIT_MB} МБ"})

    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    key = f"chat/{uuid.uuid4().hex}.{ext}"
    put_url = lib_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": os.environ["LIB_S3_BUCKET"], "Key": key, "ContentType": mime},
        ExpiresIn=3600,
    )
    conn.close()
    return resp(200, {"upload_url": put_url, "key": key})


def send_message(event, conn, user_id, user_name):
    body = json.loads(event.get("body") or "{}")
    to_id = body.get("to_user_id")
    group_id = body.get("group_id")
    text = (body.get("text") or "").strip()

    file_key = (body.get("file_key") or "").strip()
    if file_key:
        file_url = ""
        file_name = (body.get("file_name") or "file").strip()
        file_type = body.get("file_type") or "file"
    else:
        try:
            file_url, file_name, file_type = _store_chat_file(body)
        except Exception as e:
            conn.close()
            return resp(400, {"error": str(e) or "Не удалось загрузить файл"})

    if not text and not file_url and not file_key:
        conn.close()
        return resp(400, {"error": "Напишите сообщение или прикрепите файл"})
    if not to_id and not group_id:
        conn.close()
        return resp(400, {"error": "Укажите получателя"})

    audio_sec = int(body.get("audio_sec") or 0)
    cur = conn.cursor()

    if group_id:
        cur.execute("SELECT name FROM student_groups WHERE id=%s AND teacher_id=%s", (group_id, user_id))
        g = cur.fetchone()
        if not g:
            cur.close(); conn.close()
            return resp(404, {"error": "Группа не найдена"})
        cur.execute("SELECT student_id FROM group_members WHERE group_id=%s", (group_id,))
        members = [r[0] for r in cur.fetchall()]
        if members:
            values = ",".join(
                cur.mogrify("(%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                            (user_id, sid, text, file_url, file_name, file_type, audio_sec, group_id, file_key or None)).decode()
                for sid in members
            )
            cur.execute(
                "INSERT INTO messages (from_user_id, to_user_id, text, file_url, file_name, file_type, audio_sec, group_id, file_key)"
                f" VALUES {values}"
            )
            notify_many(cur, [(sid, f"Сообщение группе «{g[0]}» от {user_name}") for sid in members], "chat")
        conn.commit(); cur.close(); conn.close()
        return resp(200, {"ok": True, "sent": len(members)})

    cur.execute(
        """INSERT INTO messages (from_user_id, to_user_id, text, file_url, file_name, file_type, audio_sec, file_key)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (user_id, to_id, text, file_url, file_name, file_type, audio_sec, file_key or None)
    )
    msg_id = cur.fetchone()[0]
    cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'chat')",
                (to_id, f"Новое сообщение от {user_name}"))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "id": msg_id, "file_url": file_url})


# ── Notifications ──────────────────────────────────────────────────────────────

def get_notifications(conn, user_id):
    cur = conn.cursor()
    cur.execute(
        "SELECT id, text, type, is_read, created_at FROM notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT 20",
        (user_id,)
    )
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    unread = sum(1 for r in rows if not r[3])
    cur.close(); conn.close()
    return resp(200, {"notifications": [dict(zip(cols, r)) for r in rows], "unread": unread})

def mark_notifications_read(conn, user_id):
    cur = conn.cursor()
    cur.execute("UPDATE notifications SET is_read=TRUE WHERE user_id=%s AND is_read=FALSE", (user_id,))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})


# ── Students / Leaderboard ─────────────────────────────────────────────────────

PROFILE_COLS = ["id", "name", "email", "role", "level", "avatar", "phone",
                "social_name", "social_url", "telegram", "whatsapp", "about",
                "notify_email", "notify_new_lesson", "notify_cancel", "notify_chat",
                "timezone"]

TOPICS = {
    "tech": "Техническая проблема",
    "lesson": "Вопрос по урокам",
    "payment": "Оплата и доступ",
    "idea": "Пожелание",
    "other": "Другое",
}


def get_support(conn, user_id, role):
    """Обращения с перепиской. Админ видит все, остальные — свои."""
    cur = conn.cursor()
    is_staff = role == "admin"
    if is_staff:
        cur.execute(
            """SELECT t.id, t.topic, t.status, t.created_at, t.last_at,
                      u.name, u.email, u.role, t.unread_staff, t.unread_user,
                      t.closed, t.closed_at
               FROM support_tickets t JOIN users u ON u.id=t.user_id
               WHERE EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id=t.id)
               ORDER BY t.closed, (t.unread_staff > 0) DESC,
                        COALESCE(t.last_at, t.created_at) DESC LIMIT 200"""
        )
    else:
        cur.execute(
            """SELECT t.id, t.topic, t.status, t.created_at, t.last_at,
                      u.name, u.email, u.role, t.unread_staff, t.unread_user,
                      t.closed, t.closed_at
               FROM support_tickets t JOIN users u ON u.id=t.user_id
               WHERE t.user_id=%s
                 AND EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id=t.id)
               ORDER BY COALESCE(t.last_at, t.created_at) DESC LIMIT 50""",
            (user_id,)
        )
    rows = cur.fetchall()
    tickets = [{
        "id": r[0], "topic": r[1], "topic_label": TOPICS.get(r[1], "Другое"),
        "status": r[2],
        "created_at": r[3].isoformat() if r[3] else None,
        "last_at": (r[4] or r[3]).isoformat() if (r[4] or r[3]) else None,
        "user_name": r[5], "user_email": r[6], "user_role": r[7],
        "unread": r[8] if is_staff else r[9],
        "closed": bool(r[10]),
        "closed_at": r[11].isoformat() if r[11] else None,
        "messages": [],
    } for r in rows]

    if tickets:
        by_id = {t["id"]: t for t in tickets}
        ids = ",".join(str(i) for i in by_id)
        cur.execute(
            f"""SELECT m.ticket_id, m.is_staff, m.text, m.file_url, m.file_name,
                       m.file_type, m.created_at, u.name
                FROM support_messages m JOIN users u ON u.id=m.user_id
                WHERE m.ticket_id IN ({ids}) ORDER BY m.created_at"""
        )
        for r in cur.fetchall():
            by_id[r[0]]["messages"].append({
                "is_staff": bool(r[1]), "text": r[2],
                "file_url": r[3], "file_name": r[4], "file_type": r[5],
                "created_at": r[6].isoformat() if r[6] else None,
                "author": "Поддержка" if r[1] else r[7],
            })

    cur.close(); conn.close()
    total_unread = sum(t["unread"] for t in tickets if not t["closed"])
    new_count = len([t for t in tickets if t["unread"] > 0 and not t["closed"]])
    return resp(200, {"tickets": tickets, "new_count": new_count, "unread": total_unread})


def _store_support_file(body):
    """Скриншот или файл к обращению — в S3, возвращаем ссылку."""
    import base64, uuid, boto3
    raw = base64.b64decode((body.get("file_data") or "").split(",")[-1])
    if len(raw) > 15 * 1024 * 1024:
        raise ValueError("Файл больше 15 МБ")
    name = (body.get("file_name") or "file").strip()
    mime = body.get("mime") or "application/octet-stream"
    ftype = "image" if mime.startswith("image/") else "file"
    ext = name.rsplit(".", 1)[-1] if "." in name else "bin"
    key = f"support/{uuid.uuid4().hex}.{ext}"
    s3 = boto3.client("s3", endpoint_url="https://bucket.poehali.dev",
                      aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                      aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"])
    s3.put_object(Bucket="files", Key=key, Body=raw, ContentType=mime)
    url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"
    return url, name, ftype


def create_support(event, conn, user_id, user_name, role):
    """Новое обращение или сообщение в уже открытое."""
    body = json.loads(event.get("body") or "{}")
    message = (body.get("message") or "").strip()
    ticket_id = body.get("ticket_id")
    topic = body.get("topic") or "other"
    if topic not in TOPICS:
        topic = "other"

    f_url = f_name = f_type = ""
    if body.get("file_data"):
        try:
            f_url, f_name, f_type = _store_support_file(body)
        except Exception as e:
            conn.close()
            return resp(400, {"error": str(e) or "Не удалось загрузить файл"})

    if len(message) < 2 and not f_url:
        conn.close()
        return resp(400, {"error": "Напишите сообщение или приложите файл"})

    cur = conn.cursor()
    is_staff = role == "admin"

    if ticket_id:
        cur.execute("SELECT user_id, topic FROM support_tickets WHERE id=%s", (int(ticket_id),))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(404, {"error": "Обращение не найдено"})
        if not is_staff and row[0] != user_id:
            cur.close(); conn.close()
            return resp(403, {"error": "Это чужое обращение"})
        tid = int(ticket_id)
        author_id = row[0]
        topic = row[1]
    else:
        cur.execute(
            "INSERT INTO support_tickets (user_id, topic, message, last_at) VALUES (%s,%s,%s,NOW()) RETURNING id",
            (user_id, topic, message[:4000])
        )
        tid = cur.fetchone()[0]
        author_id = user_id

    cur.execute(
        """INSERT INTO support_messages (ticket_id, user_id, is_staff, text, file_url, file_name, file_type)
           VALUES (%s,%s,%s,%s,%s,%s,%s)""",
        (tid, user_id, is_staff, message[:4000], f_url, f_name[:255], f_type)
    )

    if is_staff:
        cur.execute(
            """UPDATE support_tickets SET last_at=NOW(), status='done', closed=FALSE,
                   closed_at=NULL, unread_user=unread_user+1, unread_staff=0 WHERE id=%s""", (tid,))
    else:
        cur.execute(
            """UPDATE support_tickets SET last_at=NOW(), status='new', closed=FALSE,
                   closed_at=NULL, unread_staff=unread_staff+1, unread_user=0 WHERE id=%s""", (tid,))

    short = (message[:80] + ("..." if len(message) > 80 else "")) if message else "файл"
    sent = 0
    if is_staff:
        note = f"Ответ поддержки: {short}" if message else "Поддержка прислала файл по вашему вопросу"
        cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'system')",
                    (author_id, note))
        conn.commit()
        cur2 = conn.cursor()
        cur2.execute("SELECT name, email FROM users WHERE id=%s", (author_id,))
        who = cur2.fetchone()
        cur2.close()
        cur.close(); conn.close()
        if who and who[1]:
            blocks = [f"{who[0]}, здравствуйте!"]
            if message:
                blocks += ["Ответ службы поддержки:",
                           f'<span style="display:block;padding:12px;background:#fef2f2;border-radius:8px">{message[:1500]}</span>']
            if f_url:
                blocks.append(
                    f'<a href="{f_url}"><img src="{f_url}" alt="{f_name}" style="max-width:100%;border-radius:8px;border:1px solid #e5e7eb"></a>'
                    if f_type == "image" else
                    f'<a href="{f_url}" style="color:#b91c1c;font-weight:bold">Файл: {f_name}</a>')
            blocks.append("Ответить можно в платформе — кнопка «Помощь» в меню.")
            if send_email(who[1], "Ответ на ваш вопрос — Hispania 35",
                          _wrap("Ответ службы поддержки", blocks), message[:500] or "Поддержка прислала файл"):
                sent = 1
        return resp(200, {"ok": True, "id": tid, "mail_sent": sent > 0, "file_url": f_url})

    cur.execute("SELECT id, COALESCE(twofa_email,'') FROM users WHERE role='admin'")
    admins = cur.fetchall()
    kind = "Новый вопрос" if not ticket_id else "Уточнение по обращению"
    if admins:
        values = ",".join(
            cur.mogrify("(%s,%s,'system')", (a[0], f"{kind} от {user_name}: {short}")).decode()
            for a in admins)
        cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {values}")
    conn.commit()
    cur.close(); conn.close()

    who_label = "Преподаватель" if role in ("teacher", "admin") else "Ученик"
    blocks = [
        f"{who_label} <b>{user_name}</b>: {kind.lower()}.",
        f"Тема: <b>{TOPICS.get(topic)}</b>",
        f'<span style="display:block;padding:12px;background:#f3f4f6;border-radius:8px">{message[:1500] or "(без текста)"}</span>',
    ]
    if f_url:
        blocks.append(f'<a href="{f_url}" style="color:#b91c1c;font-weight:bold">Вложение: {f_name}</a>')
    html = _wrap(kind, blocks)
    for a in admins:
        if a[1] and send_email(a[1], f"Помощь: {TOPICS.get(topic)} — {user_name}", html, message[:500]):
            sent += 1

    return resp(200, {"ok": True, "id": tid, "mail_sent": sent > 0, "file_url": f_url})


def answer_support(event, conn, user_id, role):
    """Отметить обращение прочитанным или закрыть его."""
    body = json.loads(event.get("body") or "{}")
    ticket_id = body.get("id")
    if not ticket_id:
        conn.close()
        return resp(400, {"error": "Не указано обращение"})

    cur = conn.cursor()
    cur.execute("SELECT user_id FROM support_tickets WHERE id=%s", (int(ticket_id),))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Обращение не найдено"})
    if role != "admin" and row[0] != user_id:
        cur.close(); conn.close()
        return resp(403, {"error": "Это чужое обращение"})

    if body.get("close") is not None:
        if role != "admin":
            cur.close(); conn.close()
            return resp(403, {"error": "Закрыть обращение может администратор"})
        if body.get("close"):
            cur.execute(
                """UPDATE support_tickets SET closed=TRUE, closed_at=NOW(), closed_by=%s,
                       status='done', unread_staff=0 WHERE id=%s""",
                (user_id, int(ticket_id)))
            cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'system')",
                        (row[0], "Ваше обращение в поддержку закрыто"))
        else:
            cur.execute(
                """UPDATE support_tickets SET closed=FALSE, closed_at=NULL, closed_by=NULL,
                       status='new' WHERE id=%s""", (int(ticket_id),))
    elif role == "admin":
        cur.execute("UPDATE support_tickets SET unread_staff=0 WHERE id=%s", (int(ticket_id),))
    else:
        cur.execute("UPDATE support_tickets SET unread_user=0 WHERE id=%s", (int(ticket_id),))

    conn.commit()
    cur.close(); conn.close()
    return resp(200, {"ok": True})


def get_profile(conn, user_id):
    cur = conn.cursor()
    cur.execute(
        """SELECT id, name, email, role, COALESCE(level,''), COALESCE(avatar,''),
                  COALESCE(phone,''), COALESCE(social_name,''), COALESCE(social_url,''),
                  COALESCE(telegram,''), COALESCE(whatsapp,''), COALESCE(about,''),
                  COALESCE(notify_email,TRUE), COALESCE(notify_new_lesson,TRUE),
                  COALESCE(notify_cancel,TRUE), COALESCE(notify_chat,TRUE),
                  COALESCE(timezone,'Europe/Moscow')
           FROM users WHERE id=%s""", (user_id,)
    )
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return resp(404, {"error": "Профиль не найден"})
    return resp(200, {"profile": dict(zip(PROFILE_COLS, row))})

def update_profile(event, conn, user_id):
    body = json.loads(event.get("body") or "{}")

    # Часовой пояс меняется отдельным запросом — остальные поля не трогаем
    tz = (body.get("timezone") or "").strip()
    if tz and len(body) == 1:
        cur = conn.cursor()
        cur.execute("UPDATE users SET timezone=%s WHERE id=%s", (tz[:64], user_id))
        conn.commit(); cur.close()
        return get_profile(conn, user_id)

    email = (body.get("email") or "").strip()
    name = (body.get("name") or "").strip()
    if not name:
        conn.close()
        return resp(400, {"error": "Укажите имя"})
    if not email or "@" not in email or "." not in email:
        conn.close()
        return resp(400, {"error": "Укажите корректную электронную почту"})

    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email=%s AND id<>%s", (email, user_id))
    if cur.fetchone():
        cur.close(); conn.close()
        return resp(400, {"error": "Эта почта уже занята"})

    def flag(key):
        v = body.get(key)
        return True if v is None else bool(v)

    cur.execute(
        """UPDATE users SET name=%s, email=%s, phone=%s, social_name=%s, social_url=%s,
               telegram=%s, whatsapp=%s, about=%s,
               notify_email=%s, notify_new_lesson=%s, notify_cancel=%s, notify_chat=%s,
               timezone=COALESCE(NULLIF(%s,''), timezone)
           WHERE id=%s""",
        (name, email, (body.get("phone") or "").strip(),
         (body.get("social_name") or "").strip(), (body.get("social_url") or "").strip(),
         (body.get("telegram") or "").strip(), (body.get("whatsapp") or "").strip(),
         (body.get("about") or "").strip(),
         flag("notify_email"), flag("notify_new_lesson"), flag("notify_cancel"),
         flag("notify_chat"), tz[:64], user_id)
    )
    conn.commit(); cur.close()
    return get_profile(conn, user_id)

def notify_teacher(conn_cur, teacher_id, subject, text, html):
    """Уведомить преподавателя в колокольчик и на почту (если включено)."""
    conn_cur.execute(
        """SELECT email, COALESCE(notify_email,TRUE) FROM users WHERE id=%s""", (teacher_id,)
    )
    row = conn_cur.fetchone()
    conn_cur.execute(
        "INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'calendar')",
        (teacher_id, text)
    )
    if row and row[1]:
        send_email(row[0], subject, html)

def cancel_lesson_by_student(event, conn, user_id, user_name):
    body = json.loads(event.get("body") or "{}")
    lesson_id = body.get("lesson_id")
    reason = (body.get("reason") or "").strip()
    if not lesson_id:
        conn.close()
        return resp(400, {"error": "Укажите занятие"})

    cur = conn.cursor()
    cur.execute(
        """SELECT l.teacher_id, COALESCE(l.topic, l.title), l.lesson_date, l.lesson_time
           FROM lessons l
           JOIN lesson_students ls ON ls.lesson_id=l.id
           WHERE l.id=%s AND ls.student_id=%s""",
        (lesson_id, user_id)
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Занятие не найдено"})
    teacher_id, topic, l_date, l_time = row
    time_str = str(l_time)[:5]
    date_str = ru_date(l_date)

    cur.execute(
        """INSERT INTO lesson_cancellations (lesson_id, student_id, reason)
           VALUES (%s,%s,%s) ON CONFLICT (lesson_id, student_id) DO UPDATE SET reason=EXCLUDED.reason""",
        (lesson_id, user_id, reason)
    )
    cur.execute(
        "INSERT INTO messages (from_user_id, to_user_id, text) VALUES (%s,%s,%s)",
        (user_id, teacher_id,
         f"Не смогу быть на занятии «{topic}» {date_str} в {time_str}." + (f" Причина: {reason}" if reason else ""))
    )

    cur.execute("SELECT COALESCE(notify_cancel,TRUE) FROM users WHERE id=%s", (teacher_id,))
    r = cur.fetchone()
    if r and r[0]:
        html = _cancel_html(user_name, topic, date_str, time_str, reason)
        notify_teacher(cur, teacher_id,
                       f"{user_name} отменил занятие «{topic}»",
                       f"{user_name} не придёт на занятие «{topic}» {date_str} в {time_str}"
                       + (f". Причина: {reason}" if reason else ""),
                       html)

    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def _cancel_html(student_name, topic, date_str, time_str, reason):
    from mailer import _wrap
    lines = [
        f"Ученик <b>{student_name}</b> сообщил, что не сможет быть на занятии.",
        f"Занятие: <b>«{topic}»</b>",
        f"Дата и время: <b>{date_str}, {time_str}</b>",
    ]
    if reason:
        lines.append(f"Причина: {reason}")
    return _wrap("Ученик отменил занятие", lines)

def start_lesson(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    lesson_id = body.get("lesson_id")
    if not lesson_id:
        conn.close()
        return resp(400, {"error": "lesson_id обязателен"})

    cur = conn.cursor()
    cur.execute("SELECT topic, title, lesson_time FROM lessons WHERE id=%s", (lesson_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Занятие не найдено"})
    topic = row[0] or row[1]

    cur.execute(
        """SELECT u.id, u.name, u.email FROM lesson_students ls
           JOIN users u ON u.id=ls.student_id WHERE ls.lesson_id=%s""",
        (lesson_id,)
    )
    students = cur.fetchall()
    url = (body.get("join_url") or "").strip() or room_url(lesson_id)

    notify_many(cur, [(sid, f"Урок «{topic}» начался — подключайтесь: {url}")
                      for sid, _, _ in students], "calendar")
    if students:
        msg_text = f"Урок «{topic}» начался. Подключайтесь: {url}"
        values = ",".join(cur.mogrify("(%s,%s,%s)", (user_id, sid, msg_text)).decode()
                          for sid, _, _ in students)
        cur.execute(f"INSERT INTO messages (from_user_id, to_user_id, text) VALUES {values}")

    conn.commit(); cur.close(); conn.close()
    sent = send_bulk([(semail, f"Урок «{topic}» начался", lesson_started_email(sname, topic, url))
                      for _, sname, semail in students])
    return resp(200, {"ok": True, "room_url": url, "notified": len(students), "emails_sent": sent})

SCHOOL_TZ = "Europe/Moscow"


def school_now():
    """Текущий момент по времени школы."""
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(SCHOOL_TZ)).replace(tzinfo=None)
    except Exception:
        return datetime.utcnow() + timedelta(hours=3)


def is_past(l_date, l_time):
    """Проверка: дата и время уже в прошлом по времени школы."""
    try:
        if isinstance(l_time, str):
            hh, mm = (l_time.strip()[:5].split(":") + ["0"])[:2]
            l_time = time(int(hh), int(mm))
        if isinstance(l_date, str):
            l_date = datetime.strptime(l_date.strip()[:10], "%Y-%m-%d").date()
        return datetime.combine(l_date, l_time) < school_now()
    except Exception:
        return False

def in_user_tz(l_date, l_time, user_tz):
    """Время урока (хранится по школе) в поясе ученика. Возвращает '' если пояс тот же."""
    if not user_tz or user_tz == SCHOOL_TZ:
        return ""
    try:
        from zoneinfo import ZoneInfo
        base = datetime.combine(l_date, l_time).replace(tzinfo=ZoneInfo(SCHOOL_TZ))
        local = base.astimezone(ZoneInfo(user_tz))
        if local.hour == base.hour and local.date() == base.date():
            return ""
        same_day = local.date() == l_date
        return local.strftime("%H:%M") if same_day else local.strftime("%H:%M, %d.%m")
    except Exception:
        return ""


def send_reminders(conn):
    """Напоминания за 3 часа. Для уроков до 11:00 — вечером накануне в 20:00."""
    cur = conn.cursor()
    now = datetime.utcnow() + timedelta(hours=3)
    today = now.date()
    tomorrow = today + timedelta(days=1)

    cur.execute(
        """SELECT l.id, COALESCE(l.topic, l.title), l.lesson_date, l.lesson_time, l.teacher_id
           FROM lessons l WHERE l.lesson_date IN (%s, %s)""",
        (today, tomorrow)
    )
    due = {}
    for lesson_id, topic, l_date, l_time, teacher_id in cur.fetchall():
        if l_time.hour < 11:
            if not (l_date == tomorrow and now.hour == 20):
                continue
            kind, hours_text = "evening", "завтра утром"
        else:
            delta = (datetime.combine(l_date, l_time) - now).total_seconds() / 3600
            if not (2.5 <= delta <= 3.5):
                continue
            kind, hours_text = "3h", "через 3 часа"
        due[lesson_id] = (topic, l_date, l_time, teacher_id, kind, hours_text)

    if not due:
        cur.close(); conn.close()
        return resp(200, {"ok": True, "sent": 0, "details": []})

    id_list = ",".join(str(i) for i in due.keys())
    cur.execute(
        f"""SELECT ls.lesson_id, u.id, u.name, u.email, COALESCE(u.timezone,'Europe/Moscow')
            FROM lesson_students ls
            JOIN users u ON u.id=ls.student_id WHERE ls.lesson_id IN ({id_list})"""
    )
    students = cur.fetchall()
    cur.execute(f"SELECT lesson_id, student_id, kind FROM lesson_reminders WHERE lesson_id IN ({id_list})")
    already = set(cur.fetchall())

    result, notif_rows, msg_rows, rem_rows, letters = [], [], [], [], []
    for lid, sid, sname, semail, stz in students:
        topic, l_date, l_time, teacher_id, kind, hours_text = due[lid]
        if (lid, sid, kind) in already:
            continue
        url = room_url(lid)
        time_str = l_time.strftime("%H:%M")
        date_str = ru_date(l_date)
        local = in_user_tz(l_date, l_time, stz)
        time_note = f"{time_str} (по Москве){f' · {local} у вас' if local else ''}" if local else time_str
        notif_rows.append((sid, f"Напоминание: {hours_text} занятие «{topic}» в {time_note}"))
        msg_rows.append((teacher_id, sid,
                         f"Напоминание: {hours_text} урок «{topic}» ({date_str}, {time_note}). Ссылка: {url}"))
        rem_rows.append((lid, sid, kind))
        letters.append((semail, f"Напоминание: урок «{topic}» {hours_text}",
                        lesson_reminder_email(sname, topic, time_str, date_str, url, hours_text, local)))
        result.append({"lesson_id": lid, "student_id": sid, "kind": kind})

    if rem_rows:
        notify_many(cur, notif_rows, "calendar")
        values = ",".join(cur.mogrify("(%s,%s,%s)", r).decode() for r in msg_rows)
        cur.execute(f"INSERT INTO messages (from_user_id, to_user_id, text) VALUES {values}")
        values = ",".join(cur.mogrify("(%s,%s,%s)", r).decode() for r in rem_rows)
        cur.execute(f"INSERT INTO lesson_reminders (lesson_id, student_id, kind) VALUES {values}")

    conn.commit(); cur.close(); conn.close()
    send_bulk(letters)
    return resp(200, {"ok": True, "sent": len(result), "details": result})

def get_students(conn):
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.name, u.avatar, u.level, u.email,
                  COALESCE(u.phone,''), COALESCE(u.social_name,''),
                  COALESCE(u.social_url,''), COALESCE(u.note,''),
                  (SELECT COUNT(*) FROM lesson_students ls WHERE ls.student_id=u.id) as lessons_count,
                  COALESCE(u.timezone,'Europe/Moscow'), COALESCE(u.languages,'es')
           FROM users u WHERE u.role='student' ORDER BY u.name"""
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    return resp(200, {"students": [
        {"id": r[0], "name": r[1], "avatar": r[2], "level": r[3], "email": r[4],
         "phone": r[5], "social_name": r[6], "social_url": r[7], "note": r[8],
         "lessons_count": r[9], "timezone": r[10],
         "languages": [x for x in r[11].split(",") if x]} for r in rows
    ]})

def update_student(event, conn, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    student_id = body.get("id")
    email = (body.get("email") or "").strip()
    if not student_id:
        conn.close()
        return resp(400, {"error": "id обязателен"})
    if not email or "@" not in email:
        conn.close()
        return resp(400, {"error": "Укажите корректную электронную почту"})
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email=%s AND id<>%s", (email, student_id))
    if cur.fetchone():
        cur.close(); conn.close()
        return resp(400, {"error": "Эта почта уже занята другим пользователем"})
    fields = ["email=%s", "phone=%s", "social_name=%s", "social_url=%s", "note=%s"]
    values = [email, (body.get("phone") or "").strip(), (body.get("social_name") or "").strip(),
              (body.get("social_url") or "").strip(), (body.get("note") or "").strip()]
    name = (body.get("name") or "").strip()
    if name:
        fields.append("name=%s"); values.append(name)
    level = body.get("level")
    if level is not None:
        fields.append("level=%s"); values.append(str(level).strip())
    tz = body.get("timezone")
    if tz:
        fields.append("timezone=%s"); values.append(str(tz).strip())
    langs = body.get("languages")
    if langs is not None:
        if isinstance(langs, list):
            langs = ",".join(str(x).strip() for x in langs if str(x).strip())
        fields.append("languages=%s"); values.append(str(langs).strip())
    values.append(student_id)
    cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=%s AND role='student' RETURNING id", tuple(values))
    if not cur.fetchone():
        cur.close(); conn.close()
        return resp(404, {"error": "Ученик не найден"})
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def add_members(cur, group_id, student_ids):
    ids = list(student_ids)
    if not ids:
        return
    values = ",".join(cur.mogrify("(%s,%s)", (group_id, sid)).decode() for sid in ids)
    cur.execute(f"INSERT INTO group_members (group_id, student_id) VALUES {values}")

def _group_ids(raw):
    ids = []
    for s in raw or []:
        try:
            ids.append(int(s))
        except (TypeError, ValueError):
            pass
    return ids

def get_groups(conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, description, color FROM student_groups WHERE teacher_id=%s ORDER BY name",
        (user_id,)
    )
    groups = [{"id": r[0], "name": r[1], "description": r[2] or "", "color": r[3], "students": []}
              for r in cur.fetchall()]
    if groups:
        by_id = {g["id"]: g for g in groups}
        id_list = ",".join(str(i) for i in by_id.keys())
        cur.execute(
            f"""SELECT gm.group_id, u.id, u.name, u.avatar, u.level
                FROM group_members gm JOIN users u ON u.id=gm.student_id
                WHERE gm.group_id IN ({id_list}) ORDER BY u.name"""
        )
        for gid, sid, sname, savatar, slevel in cur.fetchall():
            if gid in by_id:
                by_id[gid]["students"].append({"id": sid, "name": sname, "avatar": savatar, "level": slevel})
    cur.close(); conn.close()
    return resp(200, {"groups": groups})

def create_group(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    name = (body.get("name") or "").strip()
    if not name:
        conn.close()
        return resp(400, {"error": "Укажите название группы"})
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO student_groups (teacher_id, name, description, color)
           VALUES (%s,%s,%s,%s) RETURNING id""",
        (user_id, name, (body.get("description") or "").strip(), body.get("color") or "primary")
    )
    group_id = cur.fetchone()[0]
    add_members(cur, group_id, _group_ids(body.get("student_ids")))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True, "id": group_id})

def update_group(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    group_id = body.get("id")
    name = (body.get("name") or "").strip()
    if not group_id or not name:
        conn.close()
        return resp(400, {"error": "Укажите группу и название"})
    cur = conn.cursor()
    cur.execute(
        """UPDATE student_groups SET name=%s, description=%s, color=%s
           WHERE id=%s AND teacher_id=%s RETURNING id""",
        (name, (body.get("description") or "").strip(), body.get("color") or "primary", group_id, user_id)
    )
    if not cur.fetchone():
        cur.close(); conn.close()
        return resp(404, {"error": "Группа не найдена"})
    if body.get("student_ids") is not None:
        new_ids = set(_group_ids(body.get("student_ids")))
        cur.execute("SELECT student_id FROM group_members WHERE group_id=%s", (group_id,))
        old_ids = set(r[0] for r in cur.fetchall())
        add_members(cur, group_id, new_ids - old_ids)
        drop = old_ids - new_ids
        if drop:
            drop_list = ",".join(str(i) for i in drop)
            cur.execute(f"DELETE FROM group_members WHERE group_id=%s AND student_id IN ({drop_list})", (group_id,))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def remove_group(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    group_id = body.get("id") or params.get("id")
    if not group_id:
        conn.close()
        return resp(400, {"error": "id обязателен"})
    cur = conn.cursor()
    cur.execute("SELECT id FROM student_groups WHERE id=%s AND teacher_id=%s", (group_id, user_id))
    if not cur.fetchone():
        cur.close(); conn.close()
        return resp(404, {"error": "Группа не найдена"})
    cur.execute("DELETE FROM group_members WHERE group_id=%s", (group_id,))
    cur.execute("DELETE FROM student_groups WHERE id=%s AND teacher_id=%s", (group_id, user_id))
    conn.commit(); cur.close(); conn.close()
    return resp(200, {"ok": True})

def get_leaderboard(conn):
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.name, u.avatar, u.level,
                  COUNT(CASE WHEN h.status='done' THEN 1 END) * 10 +
                  COALESCE(SUM(CASE WHEN h.grade IS NOT NULL THEN h.grade * 2 ELSE 0 END), 0) as score
           FROM users u
           LEFT JOIN homework h ON h.student_id=u.id
           WHERE u.role='student'
           GROUP BY u.id, u.name, u.avatar, u.level
           ORDER BY score DESC"""
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    return resp(200, {"leaderboard": [
        {"id": r[0], "name": r[1], "avatar": r[2], "level": r[3], "score": int(r[4] or 0)}
        for r in rows
    ]})

# ── Settings ───────────────────────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    "home_blocks": [
        {"id": "welcome", "on": True},
        {"id": "stats", "on": True},
        {"id": "lessons", "on": True},
        {"id": "homework", "on": True},
        {"id": "leaderboard", "on": True},
        {"id": "materials", "on": True},
        {"id": "chat", "on": True},
    ],
    "schedule_mode": "assigned",
    "video_platform": "jitsi",
    "video_link": "",
    "jitsi_host": "hispania-35.ru",
    "notify_chat_sound": True,
    "notify_chat_toast": True,
    "notify_chat_email": False,
}

def _teacher_of(conn, user_id):
    cur = conn.cursor()
    cur.execute("SELECT teacher_id FROM users WHERE id=%s", (user_id,))
    row = cur.fetchone()
    cur.close()
    return row[0] if row and row[0] else None

def _raw_settings(conn, uid):
    cur = conn.cursor()
    cur.execute("SELECT data FROM app_settings WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    cur.close()
    return dict(row[0]) if row and row[0] else {}

DEAD_JITSI_HOSTS = ("hispania-35.ru",)

def get_settings(conn, user_id, role):
    """Настройки пользователя. Ученик наследует платформу урока и режим расписания от преподавателя."""
    data = dict(DEFAULT_SETTINGS)
    data.update(_raw_settings(conn, user_id))

    inherited = []
    if role == "student":
        tid = _teacher_of(conn, user_id)
        if tid:
            tdata = _raw_settings(conn, tid)
            for key in ("video_platform", "video_link", "jitsi_host", "schedule_mode"):
                if key in tdata:
                    data[key] = tdata[key]
                    inherited.append(key)

    host = (data.get("jitsi_host") or "").strip().replace("https://", "").replace("http://", "").rstrip("/")
    if not host or host in DEAD_JITSI_HOSTS:
        data["jitsi_host"] = DEFAULT_SETTINGS["jitsi_host"]

    conn.close()
    return resp(200, {"settings": data, "inherited": inherited})

def save_settings(event, conn, user_id):
    """Сохраняет настройки текущего пользователя."""
    body = json.loads(event.get("body") or "{}")
    incoming = body.get("settings")
    if not isinstance(incoming, dict):
        conn.close()
        return resp(400, {"error": "Нет настроек"})

    current = _raw_settings(conn, user_id)
    current.update(incoming)

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO app_settings (user_id, data, updated_at) VALUES (%s, %s, NOW())
           ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()""",
        (user_id, json.dumps(current))
    )
    conn.commit()
    cur.close(); conn.close()
    return resp(200, {"ok": True, "settings": current})


# ── Lesson slots ───────────────────────────────────────────────────────────────

def get_slots(event, conn, user_id, role):
    """Свободные и занятые окна записи. Ученик видит окна своего преподавателя."""
    cur = conn.cursor()
    if role in ("teacher", "admin"):
        tid = user_id
    else:
        tid = _teacher_of(conn, user_id)
        if not tid:
            cur.close(); conn.close()
            return resp(200, {"slots": []})

    cur.execute(
        """SELECT s.id, s.slot_date, s.slot_time, s.duration_min, s.booked_by,
                  COALESCE(u.name, '')
           FROM lesson_slots s LEFT JOIN users u ON u.id=s.booked_by
           WHERE s.teacher_id=%s AND s.slot_date >= CURRENT_DATE
           ORDER BY s.slot_date, s.slot_time""",
        (tid,)
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    return resp(200, {"slots": [
        {"id": r[0], "date": r[1].isoformat(), "time": str(r[2])[:5],
         "duration_min": r[3], "booked_by": r[4], "booked_name": r[5],
         "mine": r[4] == user_id}
        for r in rows
    ]})

def create_slots(event, conn, user_id, role):
    """Преподаватель открывает окна для записи."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    items = body.get("slots") or []
    duration = int(body.get("duration_min") or 60)
    if not items:
        conn.close()
        return resp(400, {"error": "Не выбрано время"})

    cur = conn.cursor()
    added = 0
    skipped_past = 0
    for it in items:
        d = (it.get("date") or "").strip()
        t = (it.get("time") or "").strip()
        if not d or not t:
            continue
        if is_past(d, t):
            skipped_past += 1
            continue
        cur.execute(
            """INSERT INTO lesson_slots (teacher_id, slot_date, slot_time, duration_min)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (teacher_id, slot_date, slot_time) DO NOTHING""",
            (user_id, d, t, duration)
        )
        added += cur.rowcount
    conn.commit()
    cur.close(); conn.close()
    if not added and skipped_past:
        return resp(400, {"error": "Это время уже прошло — выберите будущее"})
    return resp(200, {"ok": True, "added": added, "skipped_past": skipped_past})

def delete_slot(event, conn, user_id, role):
    """Преподаватель убирает окно записи. Занятое — вместе с уроком."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    params = event.get("queryStringParameters") or {}
    slot_id = params.get("id")
    if not slot_id:
        conn.close()
        return resp(400, {"error": "Нет окна"})

    cur = conn.cursor()
    cur.execute(
        "SELECT booked_by, lesson_id, slot_date, slot_time FROM lesson_slots WHERE id=%s AND teacher_id=%s",
        (int(slot_id), user_id)
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return resp(404, {"error": "Окно не найдено"})
    booked_by, lesson_id, s_date, s_time = row

    # Занятое окно закрывается вместе с уроком — ученик получит уведомление
    if lesson_id:
        cur.execute("DELETE FROM lesson_students WHERE lesson_id=%s", (lesson_id,))
        cur.execute("DELETE FROM lessons WHERE id=%s", (lesson_id,))
    if booked_by:
        cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'calendar')",
                    (booked_by, f"Занятие отменено: {s_date} {str(s_time)[:5]}"))

    cur.execute("DELETE FROM lesson_slots WHERE id=%s AND teacher_id=%s", (int(slot_id), user_id))
    # Подчищаем окна, спрятанные старым способом (перенос на 1900-01-01)
    cur.execute(
        "DELETE FROM lesson_slots WHERE teacher_id=%s AND slot_date='1900-01-01' AND booked_by IS NULL",
        (user_id,)
    )
    conn.commit()
    cur.close(); conn.close()
    return resp(200, {"ok": True, "was_booked": bool(booked_by)})

def book_slot(event, conn, user_id, role):
    """Ученик записывается на свободное время преподавателя."""
    if role != "student":
        conn.close()
        return resp(403, {"error": "Только ученик"})
    body = json.loads(event.get("body") or "{}")
    slot_id = body.get("slot_id")
    cancel = bool(body.get("cancel"))
    if not slot_id:
        conn.close()
        return resp(400, {"error": "Нет окна"})

    cur = conn.cursor()
    if not cancel:
        cur.execute("SELECT slot_date, slot_time FROM lesson_slots WHERE id=%s", (int(slot_id),))
        w = cur.fetchone()
        if w and is_past(w[0], w[1]):
            cur.close(); conn.close()
            return resp(400, {"error": "Это время уже прошло — выберите другое"})

    if cancel:
        cur.execute("SELECT lesson_id FROM lesson_slots WHERE id=%s AND booked_by=%s",
                    (int(slot_id), user_id))
        row = cur.fetchone()
        if not row:
            cur.close(); conn.close()
            return resp(404, {"error": "Запись не найдена"})
        lesson_id = row[0]
        cur.execute(
            "UPDATE lesson_slots SET booked_by=NULL, booked_at=NULL, lesson_id=NULL WHERE id=%s AND booked_by=%s",
            (int(slot_id), user_id)
        )
        # Урок, созданный этой записью, тоже убираем
        if lesson_id:
            cur.execute("DELETE FROM lesson_students WHERE lesson_id=%s", (lesson_id,))
            cur.execute("DELETE FROM lessons WHERE id=%s", (lesson_id,))
        conn.commit()
        cur.close(); conn.close()
        return resp(200, {"ok": True})

    cur.execute(
        "UPDATE lesson_slots SET booked_by=%s, booked_at=NOW() WHERE id=%s AND booked_by IS NULL",
        (user_id, int(slot_id))
    )
    if not cur.rowcount:
        conn.commit()
        cur.close(); conn.close()
        return resp(409, {"error": "Это время уже заняли"})

    cur.execute(
        "SELECT teacher_id, slot_date, slot_time, duration_min FROM lesson_slots WHERE id=%s",
        (int(slot_id),)
    )
    srow = cur.fetchone()
    lesson_id = None
    if srow:
        cur.execute(
            """INSERT INTO lessons (teacher_id, title, topic, lesson_date, lesson_time, duration_min, lesson_type)
               VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (srow[0], "Занятие по записи", "Занятие по записи", srow[1], srow[2], srow[3], "Практика")
        )
        lesson_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO lesson_students (lesson_id, student_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (lesson_id, user_id)
        )
        cur.execute("UPDATE lesson_slots SET lesson_id=%s WHERE id=%s", (lesson_id, int(slot_id)))
    conn.commit()
    cur.close(); conn.close()
    return resp(200, {"ok": True, "lesson_id": lesson_id})


def profile_stats(conn, user_id, role):
    """Статистика профиля ученика: достижения, успеваемость, активность."""
    cur = conn.cursor()

    cur.execute(
        """SELECT COUNT(*), COALESCE(SUM(l.duration_min), 0)
           FROM lesson_students ls JOIN lessons l ON l.id = ls.lesson_id
           WHERE ls.student_id = %s
             AND (l.lesson_date + l.lesson_time) <= NOW()""",
        (user_id,)
    )
    lessons_done, minutes = cur.fetchone()

    cur.execute(
        """SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'done'),
                  COALESCE(AVG(grade) FILTER (WHERE grade IS NOT NULL), 0)
           FROM homework WHERE student_id = %s""",
        (user_id,)
    )
    hw_total, hw_done, avg_grade = cur.fetchone()

    cur.execute(
        """SELECT COALESCE(SUM(score), 0), COALESCE(SUM(total), 0), COUNT(*)
           FROM exercise_results WHERE student_id = %s""",
        (user_id,)
    )
    ex_score, ex_total, ex_count = cur.fetchone()

    # Активность за 28 дней: занятия, сданные работы и упражнения по дням
    cur.execute(
        """SELECT d::date, (
             SELECT COUNT(*) FROM lesson_students ls JOIN lessons l ON l.id = ls.lesson_id
             WHERE ls.student_id = %s AND l.lesson_date = d::date
           ) + (
             SELECT COUNT(*) FROM homework h
             WHERE h.student_id = %s AND h.updated_at::date = d::date AND h.status IN ('review','done')
           ) + (
             SELECT COUNT(*) FROM exercise_results er
             WHERE er.student_id = %s AND er.created_at::date = d::date
           )
           FROM generate_series(CURRENT_DATE - 27, CURRENT_DATE, '1 day') d
           ORDER BY d""",
        (user_id, user_id, user_id)
    )
    activity = [{"date": str(r[0]), "count": int(r[1])} for r in cur.fetchall()]

    # Серия: сколько дней подряд с активностью, считая от сегодня
    streak = 0
    for item in reversed(activity):
        if item["count"] > 0:
            streak += 1
        elif item["date"] != str(datetime.now().date()):
            break

    cur.execute(
        """SELECT INITCAP(LOWER(COALESCE(NULLIF(TRIM(subject), ''), 'Без темы'))) AS s,
                  ROUND(AVG(grade) * 20), COUNT(*)
           FROM homework
           WHERE student_id = %s AND grade IS NOT NULL
           GROUP BY s ORDER BY COUNT(*) DESC, s LIMIT 6""",
        (user_id,)
    )
    by_topic = [{"topic": r[0], "score": int(r[1] or 0), "count": int(r[2])} for r in cur.fetchall()]

    cur.execute("SELECT COALESCE(level, 'A1'), teacher_id FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    level = row[0] if row else "A1"
    my_teacher = row[1] if row else None

    # Рейтинг соучеников того же преподавателя — по числу занятий и среднему баллу
    cur.execute(
        """SELECT u.id, u.name, COALESCE(u.level, 'A1'), COALESCE(u.avatar, ''),
                  (SELECT COUNT(*) FROM lesson_students ls JOIN lessons l ON l.id = ls.lesson_id
                   WHERE ls.student_id = u.id AND (l.lesson_date + l.lesson_time) <= NOW()),
                  COALESCE((SELECT AVG(grade) FROM homework WHERE student_id = u.id AND grade IS NOT NULL), 0)
           FROM users u
           WHERE u.role = 'student' AND COALESCE(u.is_blocked, FALSE) = FALSE
             AND (%s IS NULL OR u.teacher_id = %s OR u.id = %s)""",
        (my_teacher, my_teacher, user_id)
    )
    board = []
    for r in cur.fetchall():
        lessons_n, grade = int(r[4] or 0), float(r[5] or 0)
        board.append({
            "id": r[0], "name": r[1], "level": r[2], "avatar": r[3],
            "lessons": lessons_n, "grade": round(grade, 1),
            "score": lessons_n * 5 + round(grade * 10),
            "is_me": r[0] == user_id,
        })
    board.sort(key=lambda x: -x["score"])
    board = board[:10]

    cur.close()
    conn.close()

    avg_grade = round(float(avg_grade or 0), 1)
    hours = round((minutes or 0) / 60)
    ex_percent = round(ex_score * 100 / ex_total) if ex_total else 0

    def step(done, goal, unit):
        """Подсказка: выполнено — сколько всего, нет — сколько осталось."""
        if done >= goal:
            return f"Получено · {done} {unit}"
        return f"Ещё {goal - done} {unit} из {goal}"

    achievements = [
        {"title": "Первый урок", "icon": "\U0001F393", "earned": lessons_done >= 1,
         "hint": "Получено" if lessons_done >= 1 else "Побывайте на первом занятии"},
        {"title": "10 уроков", "icon": "\U0001F4DA", "earned": lessons_done >= 10,
         "hint": step(lessons_done, 10, "зан.")},
        {"title": "Серия 7 дней", "icon": "\U0001F525", "earned": streak >= 7,
         "hint": f"Получено · {streak} дн. подряд" if streak >= 7 else f"Сейчас подряд: {streak} из 7"},
        {"title": "Отличник", "icon": "\u2B50", "earned": avg_grade >= 4.5 and hw_done >= 3,
         "hint": f"Средний балл {avg_grade}" if hw_done else "Сдайте работы на оценку"},
        {"title": "50 уроков", "icon": "\U0001F3C6", "earned": lessons_done >= 50,
         "hint": step(lessons_done, 50, "зан.")},
        {"title": "Разговорник", "icon": "\U0001F4AC", "earned": ex_count >= 10,
         "hint": step(ex_count, 10, "упр.")},
    ]

    return resp(200, {
        "lessons_done": int(lessons_done or 0),
        "hours": hours,
        "avg_grade": avg_grade,
        "hw_total": int(hw_total or 0),
        "hw_done": int(hw_done or 0),
        "exercises": int(ex_count or 0),
        "ex_percent": ex_percent,
        "streak": streak,
        "level": level,
        "activity": activity,
        "by_topic": by_topic,
        "leaderboard": board,
        "achievements": achievements,
    })
