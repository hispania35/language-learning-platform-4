"""
Авторизация: вход, выход, проверка сессии, сброс пароля.
POST /login — вход по email+password, возвращает токен
POST /logout — выход (инвалидация токена)
POST /reset_request — заявка на сброс пароля (студент)
POST /reset_do — сброс пароля преподавателем
GET  /reset_list — список заявок (преподаватель)
GET  / — проверка токена, возвращает данные пользователя
"""
import json
import os
import secrets
import psycopg2
from datetime import datetime, timedelta
from mailer import send_email, _wrap, welcome_access_email, new_password_email, verify_email_letter, new_signup_admin_email

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token",
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    body = json.loads(event.get("body") or "{}")
    action = body.get("action", "")

    if method == "POST" and action == "login":
        return login(event)
    if method == "POST" and action == "verify_code":
        return verify_code(event)
    if method == "POST" and action == "resend_code":
        return resend_code(event)
    if method == "POST" and action == "register":
        return register(event)
    if method == "POST" and action == "logout":
        return logout(event)
    if method == "POST" and action == "reset_request":
        return reset_request(event)
    if method == "POST" and action == "reset_do":
        return reset_do(event)
    if method == "POST" and action == "change_password":
        return change_password(event)
    if method == "POST" and action == "verify_email":
        return verify_email(event)
    if method == "POST" and action == "resend_verify":
        return resend_verify(event)
    if method == "POST" and action == "set_registration":
        return set_registration(event)
    if method == "POST" and action == "change_admin_email":
        return change_admin_email(event)
    if method == "POST" and action == "admin_set_password":
        return admin_set_password(event)
    if method == "POST" and action == "admin_add_user":
        return admin_add_user(event)
    if method == "POST" and action == "admin_delete_user":
        return admin_delete_user(event)
    if method == "POST" and action == "admin_update_user":
        return admin_update_user(event)
    if method == "GET":
        params = event.get("queryStringParameters") or {}
        if params.get("p") == "reset_list":
            return reset_list(event)
        if params.get("p") == "people":
            return admin_people(event)
        if params.get("p") == "public":
            return public_settings(event)
        return me(event)

    return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Not found"})}


def login(event):
    body = json.loads(event.get("body") or "{}")
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Email и пароль обязательны"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT id, name, role, level, avatar, COALESCE(twofa_email,''), COALESCE(email_verified, TRUE)
           FROM users WHERE email=%s AND password_hash=%s""",
        (email, password)
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Неверный логин или пароль"})}

    user_id, name, role, level, avatar, twofa_email, verified = row

    if not verified:
        cur.close(); conn.close()
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({
            "need_verify": True, "email": email,
            "error": "Подтвердите почту — мы отправили вам письмо со ссылкой"
        })}

    # Администратор входит только с одноразовым кодом из письма
    if role == "admin" and twofa_email:
        code = f"{secrets.randbelow(1000000):06d}"
        cur.execute(
            "INSERT INTO login_codes (user_id, code, purpose, expires_at) VALUES (%s,%s,'login',NOW() + INTERVAL '10 minutes')",
            (user_id, code)
        )
        conn.commit()
        cur.close(); conn.close()
        send_code_email(twofa_email, code, "вход в панель администратора")
        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"twofa": True, "user_id": user_id, "hint": mask_email(twofa_email)})
        }
    token = secrets.token_hex(32)
    expires = datetime.now() + timedelta(days=30)

    cur.execute(
        "INSERT INTO sessions (user_id, token, expires_at) VALUES (%s, %s, %s)",
        (user_id, token, expires)
    )
    conn.commit()
    cur.close(); conn.close()

    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({
            "token": token,
            "user": {"id": user_id, "name": name, "role": role, "level": level, "avatar": avatar}
        })
    }


def register(event):
    body = json.loads(event.get("body") or "{}")
    name = body.get("name", "").strip()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    role = body.get("role", "student")
    level = body.get("level", "A1")

    if not name or not email or not password:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Имя, email и пароль обязательны"})}
    if len(password) < 6:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Пароль должен быть не менее 6 символов"})}
    if role not in ("student", "teacher"):
        role = "student"

    if not _registration_open():
        return {"statusCode": 403, "headers": CORS,
                "body": json.dumps({"error": "Регистрация временно закрыта. Обратитесь к администратору школы."})}

    # Генерируем аватар из первых букв имени
    parts = name.split()
    avatar = (parts[0][0] + (parts[1][0] if len(parts) > 1 else parts[0][1])).upper()

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email=%s", (email,))
    if cur.fetchone():
        cur.close(); conn.close()
        return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "Пользователь с таким email уже существует"})}

    teacher_id = None
    if role == "student":
        cur.execute("SELECT id FROM users WHERE role='teacher' ORDER BY id LIMIT 1")
        trow = cur.fetchone()
        teacher_id = trow[0] if trow else None

    vtoken = secrets.token_hex(24)
    cur.execute(
        """INSERT INTO users (email, password_hash, name, role, level, avatar, teacher_id,
                              email_verified, verify_token, verify_sent_at)
           VALUES (%s,%s,%s,%s,%s,%s,%s, FALSE, %s, NOW()) RETURNING id""",
        (email, password, name, role, level if role == "student" else None, avatar, teacher_id, vtoken)
    )
    user_id = cur.fetchone()[0]
    conn.commit()
    cur.close(); conn.close()

    sent = send_email(
        email, "Подтвердите почту — Hispania 35",
        verify_email_letter(name, _verify_link(event, vtoken)),
        "Подтвердите адрес почты, перейдя по ссылке в письме"
    )
    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({"need_verify": True, "email": email, "mail_sent": sent})
    }


def logout(event):
    token = event.get("headers", {}).get("X-Auth-Token", "")
    if token:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id FROM sessions WHERE token=%s", (token,))
        # просто помечаем как истёкший
        cur.execute("UPDATE sessions SET expires_at=NOW() WHERE token=%s", (token,))
        conn.commit()
        cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}


def get_authed_user(event):
    token = event.get("headers", {}).get("X-Auth-Token", "")
    if not token:
        return None, None
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT u.id, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=%s AND s.expires_at > NOW()",
        (token,)
    )
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return None, None
    return row[0], row[1]


def reset_request(event):
    body = json.loads(event.get("body") or "{}")
    email = body.get("email", "").strip().lower()
    if not email:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите email"})}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email=%s", (email,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Пользователь не найден"})}
    user_id = row[0]
    cur.execute(
        "SELECT id FROM password_resets WHERE user_id=%s AND status='pending'",
        (user_id,)
    )
    if cur.fetchone():
        cur.close(); conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "already": True})}
    cur.execute("INSERT INTO password_resets (user_id) VALUES (%s)", (user_id,))
    cur.execute("SELECT name FROM users WHERE id=%s", (user_id,))
    student_name = cur.fetchone()[0]
    cur.execute("SELECT id FROM users WHERE role IN ('teacher','admin')")
    teachers = [r[0] for r in cur.fetchall()]
    if teachers:
        text = f"{student_name} запросил сброс пароля"
        values = ",".join(cur.mogrify("(%s,%s,'system')", (tid, text)).decode() for tid in teachers)
        cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {values}")
    conn.commit(); cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}


def reset_list(event):
    user_id, role = get_authed_user(event)
    if not user_id or role not in ("teacher", "admin"):
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Нет доступа"})}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT r.id, u.id as user_id, u.name, u.email, r.status, r.created_at
           FROM password_resets r JOIN users u ON u.id=r.user_id
           WHERE r.status='pending' ORDER BY r.created_at DESC"""
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    resets = [{"id": r[0], "user_id": r[1], "name": r[2], "email": r[3], "status": r[4], "created_at": r[5].isoformat()} for r in rows]
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"resets": resets})}


def reset_do(event):
    user_id, role = get_authed_user(event)
    if not user_id or role not in ("teacher", "admin"):
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Нет доступа"})}
    body = json.loads(event.get("body") or "{}")
    reset_id = body.get("reset_id")
    target_user_id = body.get("user_id")
    new_password = body.get("new_password", "").strip()
    if not reset_id or not target_user_id or not new_password:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите reset_id, user_id и new_password"})}
    if len(new_password) < 6:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Пароль должен быть не менее 6 символов"})}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET password_hash=%s WHERE id=%s RETURNING name, email",
        (new_password, target_user_id)
    )
    urow = cur.fetchone()
    cur.execute("UPDATE password_resets SET status='done', resolved_at=NOW() WHERE id=%s", (reset_id,))
    cur.execute("DELETE FROM sessions WHERE user_id=%s", (target_user_id,))
    conn.commit(); cur.close(); conn.close()

    sent = False
    if urow:
        sent = send_email(
            urow[1], "Новый пароль для входа",
            new_password_email(urow[0], urow[1], new_password, _site_url(event)),
            f"Логин: {urow[1]}, пароль: {new_password}"
        )
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "mail_sent": sent})}


def change_password(event):
    user_id, _role = get_authed_user(event)
    if not user_id:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"})}
    body = json.loads(event.get("body") or "{}")
    old_password = body.get("old_password", "")
    new_password = body.get("new_password", "").strip()
    if not old_password or not new_password:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите текущий и новый пароль"})}
    if len(new_password) < 6:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Новый пароль должен быть не менее 6 символов"})}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, role, COALESCE(twofa_email,'') FROM users WHERE id=%s AND password_hash=%s", (user_id, old_password))
    urow = cur.fetchone()
    if not urow:
        cur.close(); conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Текущий пароль неверен"})}

    # Администратору смена пароля подтверждается кодом из письма
    if urow[1] == "admin" and urow[2]:
        code = (body.get("code") or "").strip()
        if not code:
            cur.execute("UPDATE login_codes SET used=TRUE WHERE user_id=%s AND used=FALSE AND purpose='change'", (user_id,))
            fresh = f"{secrets.randbelow(1000000):06d}"
            cur.execute(
                "INSERT INTO login_codes (user_id, code, purpose, expires_at) VALUES (%s,%s,'change',NOW() + INTERVAL '10 minutes')",
                (user_id, fresh)
            )
            conn.commit(); cur.close(); conn.close()
            send_code_email(urow[2], fresh, "смену пароля администратора")
            return {"statusCode": 200, "headers": CORS,
                    "body": json.dumps({"need_code": True, "hint": mask_email(urow[2])})}

        cur.execute(
            """SELECT id, code, attempts FROM login_codes
               WHERE user_id=%s AND used=FALSE AND purpose='change' AND expires_at > NOW()
               ORDER BY id DESC LIMIT 1""",
            (user_id,)
        )
        crow = cur.fetchone()
        if not crow:
            cur.close(); conn.close()
            return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Код истёк, начните заново"})}
        if crow[2] >= 5:
            cur.execute("UPDATE login_codes SET used=TRUE WHERE id=%s", (crow[0],))
            conn.commit(); cur.close(); conn.close()
            return {"statusCode": 429, "headers": CORS, "body": json.dumps({"error": "Слишком много попыток"})}
        if code != crow[1]:
            cur.execute("UPDATE login_codes SET attempts=attempts+1 WHERE id=%s", (crow[0],))
            conn.commit(); cur.close(); conn.close()
            return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Неверный код"})}
        cur.execute("UPDATE login_codes SET used=TRUE WHERE id=%s", (crow[0],))

    cur.execute("UPDATE users SET password_hash=%s WHERE id=%s", (new_password, user_id))
    conn.commit(); cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}


def me(event):
    token = event.get("headers", {}).get("X-Auth-Token", "")
    if not token:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Не авторизован"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.name, u.role, u.level, u.avatar
           FROM sessions s JOIN users u ON u.id=s.user_id
           WHERE s.token=%s AND s.expires_at > NOW()""",
        (token,)
    )
    row = cur.fetchone()
    cur.close(); conn.close()

    if not row:
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Сессия истекла"})}

    user_id, name, role, level, avatar = row
    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({"user": {"id": user_id, "name": name, "role": role, "level": level, "avatar": avatar}})
    }


def mask_email(mail: str) -> str:
    """Показывает почту частично: ser***@mail.ru"""
    if "@" not in mail:
        return mail
    name, dom = mail.split("@", 1)
    head = name[:3] if len(name) > 3 else name[:1]
    return f"{head}***@{dom}"


def send_code_email(to_mail: str, code: str, reason: str) -> bool:
    html = _wrap(
        "Код подтверждения",
        [
            f"Ваш одноразовый код на {reason}:",
            f'<b style="font-size:30px;letter-spacing:6px;color:#111827">{code}</b>',
            "Код действует 10 минут. Если вы не запрашивали вход — просто удалите письмо.",
        ],
    )
    return send_email(to_mail, f"Код подтверждения: {code}", html, f"Код подтверждения: {code}")


def issue_session(conn, cur, user_id, name, role, level, avatar):
    token = secrets.token_hex(32)
    expires = datetime.now() + timedelta(days=30)
    cur.execute("INSERT INTO sessions (user_id, token, expires_at) VALUES (%s,%s,%s)", (user_id, token, expires))
    conn.commit()
    cur.close(); conn.close()
    return {
        "statusCode": 200,
        "headers": CORS,
        "body": json.dumps({
            "token": token,
            "user": {"id": user_id, "name": name, "role": role, "level": level, "avatar": avatar}
        })
    }


def verify_code(event):
    """Проверяет одноразовый код и выдаёт сессию администратору."""
    body = json.loads(event.get("body") or "{}")
    user_id = body.get("user_id")
    code = (body.get("code") or "").strip()

    if not user_id or not code:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Введите код из письма"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT id, code, attempts FROM login_codes
           WHERE user_id=%s AND used=FALSE AND purpose='login' AND expires_at > NOW()
           ORDER BY id DESC LIMIT 1""",
        (int(user_id),)
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Код истёк, запросите новый"})}

    code_id, real_code, attempts = row
    if attempts >= 5:
        cur.execute("UPDATE login_codes SET used=TRUE WHERE id=%s", (code_id,))
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 429, "headers": CORS, "body": json.dumps({"error": "Слишком много попыток, запросите новый код"})}

    if code != real_code:
        cur.execute("UPDATE login_codes SET attempts=attempts+1 WHERE id=%s", (code_id,))
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Неверный код"})}

    cur.execute("UPDATE login_codes SET used=TRUE WHERE id=%s", (code_id,))
    cur.execute("SELECT id, name, role, level, avatar FROM users WHERE id=%s", (int(user_id),))
    u = cur.fetchone()
    if not u:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Пользователь не найден"})}

    return issue_session(conn, cur, u[0], u[1], u[2], u[3], u[4])


def resend_code(event):
    """Высылает новый одноразовый код на привязанную почту."""
    body = json.loads(event.get("body") or "{}")
    user_id = body.get("user_id")
    if not user_id:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Нет пользователя"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(twofa_email,'') FROM users WHERE id=%s", (int(user_id),))
    row = cur.fetchone()
    if not row or not row[0]:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Почта для кода не настроена"})}

    cur.execute("UPDATE login_codes SET used=TRUE WHERE user_id=%s AND used=FALSE", (int(user_id),))
    code = f"{secrets.randbelow(1000000):06d}"
    cur.execute(
        "INSERT INTO login_codes (user_id, code, purpose, expires_at) VALUES (%s,%s,'login',NOW() + INTERVAL '10 minutes')",
        (int(user_id), code)
    )
    conn.commit()
    cur.close(); conn.close()
    send_code_email(row[0], code, "вход в панель администратора")
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "hint": mask_email(row[0])})}


# ─────────────────────────── Администрирование ────────────────────────────

def _admin_only(event):
    user_id, role = get_authed_user(event)
    if not user_id or role != "admin":
        return None, {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Только администратор"})}
    return user_id, None


def _site_url(event) -> str:
    """Адрес платформы — берём из заголовка браузера, чтобы ссылка была рабочей."""
    h = event.get("headers") or {}
    origin = h.get("origin") or h.get("Origin") or h.get("referer") or h.get("Referer") or ""
    origin = origin.strip().rstrip("/")
    if origin.startswith("http") and "localhost" not in origin:
        parts = origin.split("/")
        return "/".join(parts[:3])
    return ""


def _avatar_from(name: str) -> str:
    parts = name.split()
    if not parts:
        return "??"
    if len(parts) > 1:
        return (parts[0][0] + parts[1][0]).upper()
    return (parts[0][:2] if len(parts[0]) > 1 else parts[0][0] + "?").upper()


def change_admin_email(event):
    """Смена почты администратора: код подтверждения уходит на старую почту."""
    admin_id, deny = _admin_only(event)
    if deny:
        return deny
    body = json.loads(event.get("body") or "{}")
    new_email = (body.get("new_email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    if not new_email or "@" not in new_email:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите корректную почту"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COALESCE(twofa_email,'') FROM users WHERE id=%s", (admin_id,))
    row = cur.fetchone()
    old_mail = row[0] if row else ""
    if not old_mail:
        cur.execute("UPDATE users SET twofa_email=%s WHERE id=%s", (new_email, admin_id))
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}

    if not code:
        cur.execute("UPDATE login_codes SET used=TRUE WHERE user_id=%s AND used=FALSE AND purpose='email'", (admin_id,))
        fresh = f"{secrets.randbelow(1000000):06d}"
        cur.execute(
            "INSERT INTO login_codes (user_id, code, purpose, expires_at) VALUES (%s,%s,'email',NOW() + INTERVAL '10 minutes')",
            (admin_id, fresh)
        )
        conn.commit(); cur.close(); conn.close()
        send_code_email(old_mail, fresh, "смену почты администратора")
        return {"statusCode": 200, "headers": CORS,
                "body": json.dumps({"need_code": True, "hint": mask_email(old_mail)})}

    cur.execute(
        """SELECT id, code, attempts FROM login_codes
           WHERE user_id=%s AND used=FALSE AND purpose='email' AND expires_at > NOW()
           ORDER BY id DESC LIMIT 1""",
        (admin_id,)
    )
    crow = cur.fetchone()
    if not crow:
        cur.close(); conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Код истёк, начните заново"})}
    if crow[2] >= 5:
        cur.execute("UPDATE login_codes SET used=TRUE WHERE id=%s", (crow[0],))
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 429, "headers": CORS, "body": json.dumps({"error": "Слишком много попыток"})}
    if code != crow[1]:
        cur.execute("UPDATE login_codes SET attempts=attempts+1 WHERE id=%s", (crow[0],))
        conn.commit(); cur.close(); conn.close()
        return {"statusCode": 401, "headers": CORS, "body": json.dumps({"error": "Неверный код"})}

    cur.execute("UPDATE login_codes SET used=TRUE WHERE id=%s", (crow[0],))
    cur.execute("UPDATE users SET twofa_email=%s WHERE id=%s", (new_email, admin_id))
    conn.commit(); cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "email": new_email})}


def admin_people(event):
    """Списки преподавателей и учеников для панели администратора."""
    user_id, role = get_authed_user(event)
    if not user_id or role not in ("admin", "teacher"):
        return {"statusCode": 403, "headers": CORS, "body": json.dumps({"error": "Нет доступа"})}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.name, u.email, u.role, COALESCE(u.level,''), COALESCE(u.avatar,''),
                  COALESCE(u.phone,''), COALESCE(u.telegram,''), COALESCE(u.note,''),
                  u.teacher_id,
                  (SELECT COUNT(*) FROM lesson_students ls WHERE ls.student_id=u.id)
           FROM users u WHERE u.role IN ('student','teacher') ORDER BY u.role, u.name"""
    )
    rows = cur.fetchall()
    cur.close(); conn.close()
    people = [{"id": r[0], "name": r[1], "email": r[2], "role": r[3], "level": r[4],
               "avatar": r[5], "phone": r[6], "telegram": r[7], "note": r[8],
               "teacher_id": r[9], "lessons_count": r[10]} for r in rows]
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({
        "teachers": [p for p in people if p["role"] == "teacher"],
        "students": [p for p in people if p["role"] == "student"],
    })}


def admin_set_password(event):
    """Администратор задаёт новый пароль любому пользователю."""
    admin_id, deny = _admin_only(event)
    if deny:
        return deny
    body = json.loads(event.get("body") or "{}")
    target = body.get("user_id")
    new_password = (body.get("new_password") or "").strip()
    if not target or len(new_password) < 6:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Пароль не менее 6 символов"})}
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET password_hash=%s WHERE id=%s AND role IN ('student','teacher') RETURNING name, email",
        (new_password, int(target))
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Пользователь не найден"})}
    cur.execute("UPDATE password_resets SET status='done', resolved_at=NOW() WHERE user_id=%s AND status='pending'", (int(target),))
    cur.execute("INSERT INTO notifications (user_id, text, type) VALUES (%s,%s,'system')",
                (int(target), "Администратор изменил ваш пароль"))
    cur.execute("DELETE FROM sessions WHERE user_id=%s", (int(target),))
    conn.commit(); cur.close(); conn.close()

    sent = False
    if body.get("send_email", True):
        sent = send_email(
            row[1], "Новый пароль для входа",
            new_password_email(row[0], row[1], new_password, _site_url(event)),
            f"Логин: {row[1]}, пароль: {new_password}"
        )
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "mail_sent": sent})}


def admin_add_user(event):
    """Создание карточки ученика или преподавателя."""
    admin_id, deny = _admin_only(event)
    if deny:
        return deny
    body = json.loads(event.get("body") or "{}")
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip().lower()
    password = (body.get("password") or "").strip()
    role = body.get("role", "student")
    level = (body.get("level") or "A1").strip()
    if role not in ("student", "teacher"):
        role = "student"
    if not name or not email or "@" not in email:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите имя и корректную почту"})}
    if len(password) < 6:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Пароль не менее 6 символов"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email=%s", (email,))
    if cur.fetchone():
        cur.close(); conn.close()
        return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "Эта почта уже занята"})}

    teacher_id = body.get("teacher_id")
    if role == "student" and not teacher_id:
        cur.execute("SELECT id FROM users WHERE role='teacher' ORDER BY id LIMIT 1")
        trow = cur.fetchone()
        teacher_id = trow[0] if trow else None

    cur.execute(
        """INSERT INTO users (email, password_hash, name, role, level, avatar, teacher_id, phone, telegram, note, email_verified)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, TRUE) RETURNING id""",
        (email, password, name, role, level if role == "student" else None,
         _avatar_from(name), teacher_id if role == "student" else None,
         (body.get("phone") or "").strip(), (body.get("telegram") or "").strip(),
         (body.get("note") or "").strip())
    )
    new_id = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()

    sent = False
    if body.get("send_email", True):
        sent = send_email(
            email, "Доступ к платформе Hispania 35",
            welcome_access_email(name, email, password, _site_url(event), role),
            f"Логин: {email}, пароль: {password}"
        )
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "id": new_id, "mail_sent": sent})}


def admin_update_user(event):
    """Редактирование карточки ученика или преподавателя."""
    admin_id, deny = _admin_only(event)
    if deny:
        return deny
    body = json.loads(event.get("body") or "{}")
    target = body.get("user_id")
    if not target:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Не указан пользователь"})}
    email = (body.get("email") or "").strip().lower()
    if email and "@" not in email:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Некорректная почта"})}

    conn = get_conn()
    cur = conn.cursor()
    if email:
        cur.execute("SELECT id FROM users WHERE email=%s AND id<>%s", (email, int(target)))
        if cur.fetchone():
            cur.close(); conn.close()
            return {"statusCode": 409, "headers": CORS, "body": json.dumps({"error": "Эта почта уже занята"})}

    fields, values = [], []
    name = (body.get("name") or "").strip()
    if name:
        fields += ["name=%s", "avatar=%s"]; values += [name, _avatar_from(name)]
    if email:
        fields.append("email=%s"); values.append(email)
    for key in ("phone", "telegram", "note", "level"):
        if body.get(key) is not None:
            fields.append(f"{key}=%s"); values.append(str(body.get(key)).strip())
    if body.get("teacher_id") is not None:
        fields.append("teacher_id=%s"); values.append(body.get("teacher_id") or None)
    if not fields:
        cur.close(); conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Нечего сохранять"})}

    values.append(int(target))
    cur.execute(
        f"UPDATE users SET {', '.join(fields)} WHERE id=%s AND role IN ('student','teacher') RETURNING id",
        tuple(values)
    )
    if not cur.fetchone():
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Пользователь не найден"})}
    conn.commit(); cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True})}


def admin_delete_user(event):
    """Удаление ученика или преподавателя вместе со связанными записями."""
    admin_id, deny = _admin_only(event)
    if deny:
        return deny
    body = json.loads(event.get("body") or "{}")
    target = body.get("user_id")
    if not target:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Не указан пользователь"})}
    target = int(target)
    if target == admin_id:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Нельзя удалить себя"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT role, name FROM users WHERE id=%s", (target,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Пользователь не найден"})}
    if row[0] == "admin":
        cur.close(); conn.close()
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Администратора удалить нельзя"})}

    if row[0] == "teacher":
        cur.execute("SELECT COUNT(*) FROM users WHERE role='teacher'")
        if cur.fetchone()[0] <= 1:
            cur.close(); conn.close()
            return {"statusCode": 400, "headers": CORS,
                    "body": json.dumps({"error": "Это единственный преподаватель — сначала добавьте другого"})}
        cur.execute("SELECT id FROM users WHERE role='teacher' AND id<>%s ORDER BY id LIMIT 1", (target,))
        spare = cur.fetchone()[0]
        cur.execute("UPDATE users SET teacher_id=%s WHERE teacher_id=%s", (spare, target))
        cur.execute("UPDATE lessons SET teacher_id=%s WHERE teacher_id=%s", (spare, target))
        cur.execute("UPDATE materials SET teacher_id=%s WHERE teacher_id=%s", (spare, target))
        cur.execute("UPDATE homework SET teacher_id=%s WHERE teacher_id=%s", (spare, target))
        cur.execute("UPDATE lesson_slots SET teacher_id=%s WHERE teacher_id=%s", (spare, target))
        for tbl in ("card_decks", "exercises", "library_items", "library_subjects", "student_groups"):
            cur.execute(f"UPDATE {tbl} SET teacher_id=%s WHERE teacher_id=%s", (spare, target))
    else:
        cur.execute("DELETE FROM homework WHERE student_id=%s", (target,))
        cur.execute("UPDATE lesson_slots SET booked_by=NULL WHERE booked_by=%s", (target,))
        for tbl in ("card_deck_assignments", "card_progress", "exercise_assignments",
                    "exercise_results", "group_members", "lesson_cancellations",
                    "lesson_reminders", "library_assignments", "material_assignments"):
            cur.execute(f"DELETE FROM {tbl} WHERE student_id=%s", (target,))

    cur.execute("DELETE FROM typing_status WHERE user_id=%s OR peer_id=%s", (target, target))
    cur.execute("DELETE FROM rtc_peers WHERE user_id=%s", (target,))
    cur.execute("DELETE FROM lesson_students WHERE student_id=%s", (target,))
    cur.execute("DELETE FROM messages WHERE from_user_id=%s OR to_user_id=%s", (target, target))
    cur.execute("DELETE FROM notifications WHERE user_id=%s", (target,))
    cur.execute("DELETE FROM sessions WHERE user_id=%s", (target,))
    cur.execute("DELETE FROM login_codes WHERE user_id=%s", (target,))
    cur.execute("DELETE FROM password_resets WHERE user_id=%s", (target,))
    cur.execute("DELETE FROM app_settings WHERE user_id=%s", (target,))
    cur.execute("DELETE FROM users WHERE id=%s", (target,))
    conn.commit(); cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "name": row[1]})}


# ──────────────────── Подтверждение почты и доступ к регистрации ────────────

def _registration_open() -> bool:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT value FROM platform_settings WHERE key='registration_open'")
    row = cur.fetchone()
    cur.close(); conn.close()
    return (row[0] if row else "1") == "1"


def _verify_link(event, token: str) -> str:
    base = _site_url(event)
    return f"{base}/?verify={token}" if base else f"/?verify={token}"


def public_settings(event):
    """Публичные настройки страницы входа: открыта ли регистрация."""
    return {"statusCode": 200, "headers": CORS,
            "body": json.dumps({"registration_open": _registration_open()})}


def set_registration(event):
    """Администратор включает или выключает кнопку регистрации."""
    admin_id, deny = _admin_only(event)
    if deny:
        return deny
    body = json.loads(event.get("body") or "{}")
    value = "1" if body.get("open") else "0"
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO platform_settings (key, value, updated_at) VALUES ('registration_open', %s, NOW())
           ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()""",
        (value,)
    )
    conn.commit(); cur.close(); conn.close()
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "registration_open": value == "1"})}


def verify_email(event):
    """Подтверждение почты по ссылке из письма — сразу пускаем в кабинет."""
    body = json.loads(event.get("body") or "{}")
    token = (body.get("token") or "").strip()
    if not token:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Ссылка неполная"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """SELECT id, name, role, level, avatar, COALESCE(email_verified, TRUE),
                  verify_sent_at > NOW() - INTERVAL '24 hours'
           FROM users WHERE verify_token=%s""",
        (token,)
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS,
                "body": json.dumps({"error": "Ссылка недействительна или уже использована"})}
    if not row[6]:
        cur.close(); conn.close()
        return {"statusCode": 410, "headers": CORS,
                "body": json.dumps({"error": "Срок действия ссылки истёк, запросите новое письмо", "expired": True})}

    user_id = row[0]
    cur.execute("UPDATE users SET email_verified=TRUE, verify_token=NULL WHERE id=%s", (user_id,))

    cur.execute("SELECT id FROM users WHERE role IN ('teacher','admin')")
    staff = [r[0] for r in cur.fetchall()]
    if staff:
        text = f"{row[1]} зарегистрировался и подтвердил почту"
        values = ",".join(cur.mogrify("(%s,%s,'system')", (sid, text)).decode() for sid in staff)
        cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {values}")

    # Письмо администратору о новом пользователе
    cur.execute("SELECT email FROM users WHERE id=%s", (user_id,))
    erow = cur.fetchone()
    user_email = erow[0] if erow else ""
    cur.execute("SELECT COALESCE(twofa_email,'') FROM users WHERE role='admin' AND COALESCE(twofa_email,'') <> ''")
    admin_mails = [r[0] for r in cur.fetchall()]

    if admin_mails:
        now = datetime.now()
        date_str = f"{now.day:02d}.{now.month:02d}.{now.year} в {now.hour:02d}:{now.minute:02d}"
        who = "преподаватель" if row[2] == "teacher" else "ученик"
        html = new_signup_admin_email(row[1], user_email, row[2], row[3], date_str)
        for mail in admin_mails:
            send_email(mail, f"Новый {who}: {row[1]}", html,
                       f"{row[1]}, {user_email}, уровень {row[3] or '—'}, {date_str}")

    return issue_session(conn, cur, user_id, row[1], row[2], row[3], row[4])


def resend_verify(event):
    """Повторная отправка письма с подтверждением почты."""
    body = json.loads(event.get("body") or "{}")
    email = (body.get("email") or "").strip().lower()
    if not email:
        return {"statusCode": 400, "headers": CORS, "body": json.dumps({"error": "Укажите почту"})}

    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, COALESCE(email_verified, TRUE) FROM users WHERE email=%s", (email,)
    )
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        return {"statusCode": 404, "headers": CORS, "body": json.dumps({"error": "Пользователь не найден"})}
    if row[2]:
        cur.close(); conn.close()
        return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "already": True})}

    vtoken = secrets.token_hex(24)
    cur.execute("UPDATE users SET verify_token=%s, verify_sent_at=NOW() WHERE id=%s", (vtoken, row[0]))
    conn.commit(); cur.close(); conn.close()

    sent = send_email(
        email, "Подтвердите почту — Hispania 35",
        verify_email_letter(row[1], _verify_link(event, vtoken)),
        "Подтвердите адрес почты, перейдя по ссылке в письме"
    )
    return {"statusCode": 200, "headers": CORS, "body": json.dumps({"ok": True, "mail_sent": sent})}
