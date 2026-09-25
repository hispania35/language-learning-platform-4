"""
Домашние задания.
GET  /          — список заданий текущего пользователя
POST /          — создать задание (только teacher)
POST /update    — обновить статус/ответ/оценку
GET  /students  — список студентов (только teacher)
"""
import json
import os
import psycopg2
from datetime import date, timezone

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

def get_conn():
    # Единая зона UTC: время уходит на фронт с меткой зоны, там переводится в пояс пользователя
    conn = psycopg2.connect(os.environ["DATABASE_URL"], options="-c timezone=UTC")
    return conn

def get_user(token, conn):
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.name, u.role FROM sessions s
           JOIN users u ON u.id=s.user_id
           WHERE s.token=%s AND s.expires_at > NOW()""",
        (token,)
    )
    row = cur.fetchone()
    cur.close()
    return row

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    token = event.get("headers", {}).get("X-Auth-Token", "")
    conn = get_conn()
    user = get_user(token, conn)
    if not user:
        conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"}, ensure_ascii=False)}

    user_id, user_name, role = user
    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    action = params.get("p", "")

    if method == "GET" and action == "students":
        return get_students(conn, user_id, role)

    if method == "GET":
        return get_homework(conn, user_id, role)

    if method == "POST" and action == "update":
        return update_homework(event, conn, user_id, role)

    if method == "POST" and action == "edit":
        return edit_homework(event, conn, user_id, role)

    if method == "POST" and action == "delete":
        return delete_homework(event, conn, user_id, role)

    if method == "POST":
        return create_homework(event, conn, user_id, role)

    conn.close()
    return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Not found"})}


def get_homework(conn, user_id, role):
    cur = conn.cursor()
    if role in ("teacher", "admin"):
        cur.execute(
            """SELECT h.id, h.title, h.description, h.subject,
                      h.due_date, h.status, h.grade, h.teacher_comment,
                      h.student_answer, h.created_at, h.student_id,
                      s.name as student_name, s.avatar as student_avatar
               FROM homework h JOIN users s ON s.id=h.student_id
               WHERE h.teacher_id=%s ORDER BY h.created_at DESC""",
            (user_id,)
        )
    else:
        cur.execute(
            """SELECT h.id, h.title, h.description, h.subject,
                      h.due_date, h.status, h.grade, h.teacher_comment,
                      h.student_answer, h.created_at,
                      t.name as teacher_name, t.avatar as teacher_avatar
               FROM homework h JOIN users t ON t.id=h.teacher_id
               WHERE h.student_id=%s ORDER BY h.created_at DESC""",
            (user_id,)
        )
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    cur.close(); conn.close()

    result = []
    for row in rows:
        item = dict(zip(cols, row))
        if item.get("due_date"):
            item["due_date"] = item["due_date"].strftime("%Y-%m-%d")
        if item.get("created_at"):
            item["created_at"] = item["created_at"].replace(tzinfo=timezone.utc).isoformat()
        result.append(item)

    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"homework": result})}


def is_my_student(cur, student_id, user_id, role):
    """Можно ли этому преподавателю работать с данным учеником."""
    if role == "admin":
        return True
    cur.execute("SELECT 1 FROM users WHERE id=%s AND role='student' AND teacher_id=%s",
                (int(student_id), user_id))
    return cur.fetchone() is not None


def create_homework(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Только преподаватель может создавать задания"})}

    body = json.loads(event.get("body") or "{}")
    student_id = body.get("student_id")
    title = body.get("title", "").strip()
    description = body.get("description", "")
    subject = body.get("subject", "")
    due_date = body.get("due_date")

    if not title or not student_id:
        conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите название и студента"})}

    cur = conn.cursor()
    if not is_my_student(cur, student_id, user_id, role):
        cur.close(); conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Это не ваш ученик"})}
    cur.execute(
        """INSERT INTO homework (teacher_id, student_id, title, description, subject, due_date, status)
           VALUES (%s, %s, %s, %s, %s, %s, 'pending') RETURNING id""",
        (user_id, student_id, title, description, subject, due_date)
    )
    hw_id = cur.fetchone()[0]

    # уведомление студенту
    cur.execute(
        "INSERT INTO notifications (user_id, text, type) VALUES (%s, %s, 'homework')",
        (student_id, f"Новое задание: {title}")
    )
    conn.commit()
    cur.close(); conn.close()

    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "id": hw_id})}


def update_homework(event, conn, user_id, role):
    body = json.loads(event.get("body") or "{}")
    hw_id = body.get("id")

    cur = conn.cursor()
    cur.execute("SELECT teacher_id, student_id, title FROM homework WHERE id=%s", (hw_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Задание не найдено"})}

    teacher_id, student_id, hw_title = row

    if role == "student" and student_id == user_id:
        status = body.get("status")
        answer = body.get("student_answer")
        cur.execute(
            "UPDATE homework SET status=%s, student_answer=%s, updated_at=NOW() WHERE id=%s",
            (status, answer, hw_id)
        )
        # уведомление учителю
        if status == "review":
            cur.execute(
                "INSERT INTO notifications (user_id, text, type) VALUES (%s, %s, 'homework')",
                (teacher_id, f"Студент сдал задание на проверку: {hw_title}")
            )
    elif role in ("teacher", "admin") and teacher_id == user_id:
        grade = body.get("grade")
        comment = body.get("teacher_comment")
        status = body.get("status", "done")
        cur.execute(
            "UPDATE homework SET grade=%s, teacher_comment=%s, status=%s, updated_at=NOW() WHERE id=%s",
            (grade, comment, status, hw_id)
        )
        # уведомление студенту
        cur.execute(
            "INSERT INTO notifications (user_id, text, type) VALUES (%s, %s, 'homework')",
            (student_id, f"Задание проверено: {hw_title}. Оценка: {grade}/5")
        )
    else:
        cur.close(); conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Нет доступа"})}

    conn.commit()
    cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}


def edit_homework(event, conn, user_id, role):
    """Преподаватель правит название, описание, тему, срок или ученика."""
    if role not in ("teacher", "admin"):
        conn.close()
        return {"statusCode": 403, "headers": CORS,
                "body": json.dumps({"error": "Только преподаватель может менять задание"}, ensure_ascii=False)}

    body = json.loads(event.get("body") or "{}")
    hw_id = body.get("id")
    if not hw_id:
        conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Не указано задание"}, ensure_ascii=False)}

    cur = conn.cursor()
    cur.execute("SELECT teacher_id, student_id, title FROM homework WHERE id=%s", (int(hw_id),))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Задание не найдено"}, ensure_ascii=False)}
    if role != "admin" and row[0] != user_id:
        cur.close(); conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Это задание другого преподавателя"}, ensure_ascii=False)}

    fields, values = [], []
    title = (body.get("title") or "").strip()
    if title:
        fields.append("title=%s"); values.append(title)
    for key in ("description", "subject"):
        if body.get(key) is not None:
            fields.append(f"{key}=%s"); values.append(str(body.get(key)).strip())
    if body.get("due_date"):
        fields.append("due_date=%s"); values.append(body.get("due_date"))

    new_student = body.get("student_id")
    moved_to = None
    if new_student and int(new_student) != row[1]:
        if not is_my_student(cur, new_student, user_id, role):
            cur.close(); conn.close()
            return {"statusCode": 403, "headers": CORS,
                    "body": json.dumps({"error": "Это не ваш ученик"}, ensure_ascii=False)}
        fields.append("student_id=%s"); values.append(int(new_student))
        moved_to = int(new_student)

    if not fields:
        cur.close(); conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Нечего сохранять"}, ensure_ascii=False)}

    fields.append("updated_at=NOW()")
    values.append(int(hw_id))
    cur.execute(f"UPDATE homework SET {', '.join(fields)} WHERE id=%s", tuple(values))

    text = f"Задание изменено: {title or row[2]}"
    cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'homework')",
                (moved_to or row[1], text))
    if moved_to:
        cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'homework')",
                    (row[1], f"Задание больше не закреплено за вами: {title or row[2]}"))

    conn.commit()
    cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "id": int(hw_id)}, ensure_ascii=False)}


def delete_homework(event, conn, user_id, role):
    """Удалить задание вместе с уведомлениями о нём."""
    if role not in ("teacher", "admin"):
        conn.close()
        return {"statusCode": 403, "headers": CORS,
                "body": json.dumps({"error": "Только преподаватель может удалять задания"}, ensure_ascii=False)}

    body = json.loads(event.get("body") or "{}")
    hw_id = body.get("id")
    if not hw_id:
        conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Не указано задание"}, ensure_ascii=False)}

    cur = conn.cursor()
    cur.execute("SELECT teacher_id, student_id, title FROM homework WHERE id=%s", (int(hw_id),))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Задание не найдено"}, ensure_ascii=False)}
    if role != "admin" and row[0] != user_id:
        cur.close(); conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Это задание другого преподавателя"}, ensure_ascii=False)}

    cur.execute("DELETE FROM homework WHERE id=%s", (int(hw_id),))
    cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'homework')",
                (row[1], f"Задание отменено: {row[2]}"))
    conn.commit()
    cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS,
            "body": json.dumps({"ok": True, "title": row[2]}, ensure_ascii=False)}


def get_students(conn, user_id=None, role=None):
    """Преподавателю — только его ученики, администратору — все."""
    cur = conn.cursor()
    if role == "teacher":
        cur.execute("""SELECT id, name, avatar, level FROM users
                       WHERE role='student' AND teacher_id=%s ORDER BY name""", (user_id,))
    else:
        cur.execute("SELECT id, name, avatar, level FROM users WHERE role='student' ORDER BY name")
    rows = cur.fetchall()
    cur.close(); conn.close()
    students = [{"id": r[0], "name": r[1], "avatar": r[2], "level": r[3]} for r in rows]
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"students": students})}