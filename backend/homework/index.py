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
from datetime import date

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

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
        return get_students(conn)

    if method == "GET":
        return get_homework(conn, user_id, role)

    if method == "POST" and action == "update":
        return update_homework(event, conn, user_id, role)

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
                      h.student_answer, h.created_at,
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
            item["created_at"] = item["created_at"].isoformat()
        result.append(item)

    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"homework": result})}


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


def get_students(conn):
    cur = conn.cursor()
    cur.execute("SELECT id, name, avatar, level FROM users WHERE role='student' ORDER BY name")
    rows = cur.fetchall()
    cur.close(); conn.close()
    students = [{"id": r[0], "name": r[1], "avatar": r[2], "level": r[3]} for r in rows]
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"students": students})}