"""
Библиотека: книги и аудиофайлы преподавателя.
GET    /library          — список книг (учитель видит все, ученик — только выданные)
POST   /library          — загрузить книгу или аудио в хранилище
DELETE /library?id=      — удалить книгу вместе с файлом
POST   /library?p=assign — выдать книгу ученику или группе
"""
import json
import os
import base64
import uuid
import urllib.parse
import psycopg2

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Auth-Token, X-User-Id",
    "Access-Control-Max-Age": "86400",
}

MAX_MB = 60           # прямая загрузка через функцию (мелкие файлы)
MAX_DIRECT_MB = 2048  # загрузка браузером напрямую в облако (видео до 2 ГБ)


def resp(code, data):
    return {
        "statusCode": code,
        "headers": {**CORS, "Content-Type": "application/json"},
        "body": json.dumps(data, default=str),
        "isBase64Encoded": False,
    }


def s3_client(fast=False):
    import boto3
    kw = {}
    if fast:
        from botocore.config import Config
        kw["config"] = Config(connect_timeout=2, read_timeout=2, retries={"max_attempts": 1})
    return boto3.client(
        "s3",
        endpoint_url="https://bucket.poehali.dev",
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        **kw,
    )


def ext_storage_ready():
    return all(os.environ.get(k) for k in
               ("LIB_S3_ENDPOINT", "LIB_S3_BUCKET", "LIB_S3_KEY_ID", "LIB_S3_SECRET_KEY"))


def ext_client(fast=False):
    import boto3
    from botocore.config import Config
    cfg = dict(signature_version="s3v4")
    if fast:
        cfg.update(connect_timeout=2, read_timeout=2, retries={"max_attempts": 1})
    return boto3.client(
        "s3",
        endpoint_url=os.environ["LIB_S3_ENDPOINT"],
        aws_access_key_id=os.environ["LIB_S3_KEY_ID"],
        aws_secret_access_key=os.environ["LIB_S3_SECRET_KEY"],
        region_name=os.environ.get("LIB_S3_REGION", "ru-central1"),
        config=Config(**cfg),
    )


def ext_public_url(key):
    endpoint = os.environ["LIB_S3_ENDPOINT"].rstrip("/")
    return f"{endpoint}/{os.environ['LIB_S3_BUCKET']}/{key}"


def ext_signed_url(key, file_name=None, attachment=False):
    params = {"Bucket": os.environ["LIB_S3_BUCKET"], "Key": key}
    if file_name:
        safe = file_name.replace('"', "")
        quoted = urllib.parse.quote(file_name)
        mode = "attachment" if attachment else "inline"
        params["ResponseContentDisposition"] = f"{mode}; filename=\"{safe}\"; filename*=UTF-8''{quoted}"
    return ext_client().generate_presigned_url(
        "get_object", Params=params, ExpiresIn=86400
    )


def kind_of(mime):
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("video/"):
        return "video"
    return "book"


def subject_or_none(conn, user_id, raw):
    if not raw:
        return None
    cur = conn.cursor()
    cur.execute("SELECT id FROM library_subjects WHERE id=%s AND teacher_id=%s", (int(raw), user_id))
    row = cur.fetchone()
    cur.close()
    return row[0] if row else None


def auth(event, conn):
    token = (event.get("headers") or {}).get("X-Auth-Token") or (event.get("headers") or {}).get("x-auth-token")
    if not token:
        return None
    cur = conn.cursor()
    cur.execute(
        """SELECT u.id, u.role, u.name FROM sessions s JOIN users u ON u.id=s.user_id
           WHERE s.token=%s AND s.expires_at > NOW()""",
        (token,)
    )
    row = cur.fetchone()
    cur.close()
    return row


def handler(event: dict, context) -> dict:
    """Библиотека книг и аудио: загрузка в хранилище, выдача ученикам и группам."""
    method = event.get("httpMethod", "GET")
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    user = auth(event, conn)
    if not user:
        conn.close()
        return resp(401, {"error": "Требуется вход"})
    user_id, role, _ = user

    params = event.get("queryStringParameters") or {}
    action = params.get("p") or ""

    try:
        if method == "GET":
            return list_items(conn, user_id, role)
        if method == "POST" and action == "assign":
            return assign_item(event, conn, user_id, role)
        if method == "POST" and action == "add_subject":
            return add_subject(event, conn, user_id, role)
        if method == "POST" and action == "rename_subject":
            return rename_subject(event, conn, user_id, role)
        if method == "POST" and action == "del_subject":
            return del_subject(event, conn, user_id, role)
        if method == "POST" and action == "setup_cors":
            conn.close()
            if role not in ("teacher", "admin"):
                return resp(403, {"error": "Только преподаватель"})
            ext_client().put_bucket_cors(
                Bucket=os.environ["LIB_S3_BUCKET"],
                CORSConfiguration={"CORSRules": [{
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "PUT", "HEAD"],
                    "AllowedOrigins": ["*"],
                    "ExposeHeaders": ["ETag"],
                    "MaxAgeSeconds": 3600,
                }]},
            )
            return resp(200, {"ok": True})
        if method == "POST" and action == "upload_url":
            return upload_url(event, conn, user_id, role)
        if method == "POST" and action == "confirm":
            return confirm_upload(event, conn, user_id, role)
        if method == "POST":
            return upload_item(event, conn, user_id, role)
        if method == "DELETE":
            return delete_item(event, conn, user_id, role)
        conn.close()
        return resp(404, {"error": "Неизвестный запрос"})
    except Exception as e:
        conn.close()
        return resp(500, {"error": str(e)})


def list_items(conn, user_id, role):
    cur = conn.cursor()
    if role in ("teacher", "admin"):
        cur.execute(
            """SELECT id, title, author, description, kind, file_url, file_name,
                      mime, size_bytes, duration_sec, created_at, file_key, storage, subject_id
               FROM library_items WHERE teacher_id=%s ORDER BY created_at DESC""",
            (user_id,)
        )
    else:
        cur.execute(
            """SELECT i.id, i.title, i.author, i.description, i.kind, i.file_url, i.file_name,
                      i.mime, i.size_bytes, i.duration_sec, i.created_at, i.file_key, i.storage, i.subject_id
               FROM library_items i JOIN library_assignments a ON a.item_id=i.id
               WHERE a.student_id=%s ORDER BY a.created_at DESC""",
            (user_id,)
        )
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    items = [dict(zip(cols, r)) for r in rows]

    if role in ("teacher", "admin") and items:
        ids = ",".join(str(i["id"]) for i in items)
        by_id = {i["id"]: i for i in items}
        for it in items:
            it["students"] = []
        cur.execute(
            f"""SELECT a.item_id, u.id, u.name, u.avatar FROM library_assignments a
                JOIN users u ON u.id=a.student_id WHERE a.item_id IN ({ids}) ORDER BY u.name"""
        )
        for item_id, sid, sname, savatar in cur.fetchall():
            if item_id in by_id:
                by_id[item_id]["students"].append({"id": sid, "name": sname, "avatar": savatar})

    direct = ext_storage_ready()
    for it in items:
        if direct and it.get("storage") == "external" and it.get("file_key"):
            it["file_url"] = ext_signed_url(it["file_key"], it.get("file_name"))
            it["download_url"] = ext_signed_url(it["file_key"], it.get("file_name"), attachment=True)
        else:
            it["download_url"] = it.get("file_url")
        it.pop("file_key", None)
        it.pop("storage", None)

    if role in ("teacher", "admin"):
        cur.execute("SELECT id, name, color, parent_id FROM library_subjects WHERE teacher_id=%s ORDER BY name",
                    (user_id,))
    else:
        sids = [str(i["subject_id"]) for i in items if i.get("subject_id")]
        if sids:
            cur.execute(
                f"""WITH RECURSIVE tree AS (
                        SELECT id, name, color, parent_id FROM library_subjects WHERE id IN ({','.join(sids)})
                        UNION
                        SELECT s.id, s.name, s.color, s.parent_id
                        FROM library_subjects s JOIN tree t ON s.id = t.parent_id
                    ) SELECT id, name, color, parent_id FROM tree ORDER BY name"""
            )
        else:
            cur.execute("SELECT id, name, color, parent_id FROM library_subjects WHERE 1=0")
    subjects = [{"id": r[0], "name": r[1], "color": r[2], "parent_id": r[3]} for r in cur.fetchall()]

    cur.close()
    conn.close()
    return resp(200, {"items": items, "subjects": subjects, "direct_upload": direct,
                      "max_mb": MAX_DIRECT_MB if direct else MAX_MB})


def add_subject(event, conn, user_id, role):
    """Добавить предмет (язык) или каталог внутри предмета."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    name = (body.get("name") or "").strip()[:80]
    if not name:
        conn.close()
        return resp(400, {"error": "Укажите название"})
    color = (body.get("color") or "#c0392b")[:20]
    parent_raw = body.get("parent_id")
    cur = conn.cursor()

    parent_id = None
    if parent_raw:
        cur.execute("SELECT id, color, parent_id FROM library_subjects WHERE id=%s AND teacher_id=%s",
                    (int(parent_raw), user_id))
        prow = cur.fetchone()
        if not prow:
            cur.close()
            conn.close()
            return resp(400, {"error": "Предмет не найден"})
        if prow[2]:
            cur.close()
            conn.close()
            return resp(400, {"error": "Каталог нельзя вложить в другой каталог"})
        parent_id = prow[0]
        if not body.get("color"):
            color = prow[1] or color

    if parent_id:
        cur.execute(
            "SELECT id, color FROM library_subjects WHERE teacher_id=%s AND parent_id=%s AND lower(name)=lower(%s)",
            (user_id, parent_id, name))
    else:
        cur.execute(
            "SELECT id, color FROM library_subjects WHERE teacher_id=%s AND parent_id IS NULL AND lower(name)=lower(%s)",
            (user_id, name))
    row = cur.fetchone()
    if row:
        cur.close()
        conn.close()
        return resp(200, {"ok": True, "id": row[0], "name": name,
                          "color": row[1] or color, "parent_id": parent_id})

    cur.execute(
        "INSERT INTO library_subjects (teacher_id, name, color, parent_id) VALUES (%s,%s,%s,%s) RETURNING id",
        (user_id, name, color, parent_id))
    sid = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "id": sid, "name": name, "color": color, "parent_id": parent_id})


def rename_subject(event, conn, user_id, role):
    """Переименовать предмет или каталог, при желании сменить цвет."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    sid = body.get("id")
    name = (body.get("name") or "").strip()[:80]
    if not sid or not name:
        conn.close()
        return resp(400, {"error": "Укажите название"})
    sid = int(sid)
    cur = conn.cursor()
    cur.execute("SELECT parent_id FROM library_subjects WHERE id=%s AND teacher_id=%s", (sid, user_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return resp(404, {"error": "Не найдено"})
    parent_id = row[0]

    if parent_id:
        cur.execute(
            """SELECT id FROM library_subjects
               WHERE teacher_id=%s AND parent_id=%s AND lower(name)=lower(%s) AND id<>%s""",
            (user_id, parent_id, name, sid))
    else:
        cur.execute(
            """SELECT id FROM library_subjects
               WHERE teacher_id=%s AND parent_id IS NULL AND lower(name)=lower(%s) AND id<>%s""",
            (user_id, name, sid))
    if cur.fetchone():
        cur.close()
        conn.close()
        return resp(400, {"error": "Такое название уже есть"})

    color = body.get("color")
    if color:
        cur.execute("UPDATE library_subjects SET name=%s, color=%s WHERE id=%s AND teacher_id=%s",
                    (name, str(color)[:20], sid, user_id))
        if not parent_id:
            cur.execute("UPDATE library_subjects SET color=%s WHERE parent_id=%s AND teacher_id=%s",
                        (str(color)[:20], sid, user_id))
    else:
        cur.execute("UPDATE library_subjects SET name=%s WHERE id=%s AND teacher_id=%s", (name, sid, user_id))
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "id": sid, "name": name})


def del_subject(event, conn, user_id, role):
    """Удалить предмет вместе с его каталогами. Файлы остаются, но теряют привязку."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    sid = body.get("id")
    if not sid:
        conn.close()
        return resp(400, {"error": "Укажите предмет"})
    sid = int(sid)
    cur = conn.cursor()
    cur.execute("SELECT id FROM library_subjects WHERE id=%s AND teacher_id=%s", (sid, user_id))
    if not cur.fetchone():
        cur.close()
        conn.close()
        return resp(404, {"error": "Не найдено"})

    cur.execute("SELECT id FROM library_subjects WHERE parent_id=%s AND teacher_id=%s", (sid, user_id))
    ids = [sid] + [r[0] for r in cur.fetchall()]
    in_list = ",".join(str(i) for i in ids)

    cur.execute(f"UPDATE library_items SET subject_id=NULL WHERE subject_id IN ({in_list}) AND teacher_id=%s",
                (user_id,))
    cur.execute(f"DELETE FROM library_subjects WHERE id IN ({in_list}) AND teacher_id=%s", (user_id,))
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "removed": len(ids)})


def upload_url(event, conn, user_id, role):
    """Выдать браузеру одноразовую ссылку для загрузки большого файла прямо в облако."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    if not ext_storage_ready():
        conn.close()
        return resp(400, {"error": "Облачное хранилище не подключено"})

    body = json.loads(event.get("body") or "{}")
    file_name = (body.get("file_name") or "file").strip()
    mime = body.get("mime") or "application/octet-stream"
    size = int(body.get("size") or 0)
    if size > MAX_DIRECT_MB * 1024 * 1024:
        conn.close()
        return resp(400, {"error": f"Файл больше {MAX_DIRECT_MB} МБ"})

    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    key = f"library/{user_id}/{uuid.uuid4().hex}.{ext}"
    put_url = ext_client().generate_presigned_url(
        "put_object",
        Params={"Bucket": os.environ["LIB_S3_BUCKET"], "Key": key, "ContentType": mime},
        ExpiresIn=3600,
    )
    conn.close()
    return resp(200, {"upload_url": put_url, "key": key, "file_url": ext_public_url(key)})


def confirm_upload(event, conn, user_id, role):
    """Создать карточку книги после успешной загрузки файла в облако."""
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    title = (body.get("title") or "").strip()
    key = (body.get("key") or "").strip()
    if not title or not key:
        conn.close()
        return resp(400, {"error": "Укажите название и файл"})
    if not key.startswith(f"library/{user_id}/"):
        conn.close()
        return resp(403, {"error": "Неверный файл"})

    file_name = (body.get("file_name") or "file").strip()
    mime = body.get("mime") or "application/octet-stream"
    kind = kind_of(mime)
    url = ext_public_url(key)
    subject_id = subject_or_none(conn, user_id, body.get("subject_id"))

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO library_items
           (teacher_id, title, author, description, kind, file_url, file_name, file_key,
            mime, size_bytes, duration_sec, storage, subject_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'external',%s) RETURNING id""",
        (user_id, title, (body.get("author") or "").strip(), (body.get("description") or "").strip(),
         kind, url, file_name, key, mime, int(body.get("size") or 0), int(body.get("duration_sec") or 0),
         subject_id)
    )
    item_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "id": item_id, "file_url": ext_signed_url(key, file_name), "kind": kind})


def upload_item(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    title = (body.get("title") or "").strip()
    data_b64 = body.get("file_data")
    if not title:
        conn.close()
        return resp(400, {"error": "Укажите название"})
    if not data_b64:
        conn.close()
        return resp(400, {"error": "Прикрепите файл"})

    raw = base64.b64decode(data_b64.split(",")[-1])
    if len(raw) > MAX_MB * 1024 * 1024:
        conn.close()
        return resp(400, {"error": f"Файл больше {MAX_MB} МБ"})

    file_name = (body.get("file_name") or "file").strip()
    mime = body.get("mime") or "application/octet-stream"
    kind = kind_of(mime)
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else "bin"
    key = f"library/{user_id}/{uuid.uuid4().hex}.{ext}"
    subject_id = subject_or_none(conn, user_id, body.get("subject_id"))

    s3_client().put_object(Bucket="files", Key=key, Body=raw, ContentType=mime)
    url = f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"

    cur = conn.cursor()
    cur.execute(
        """INSERT INTO library_items
           (teacher_id, title, author, description, kind, file_url, file_name, file_key,
            mime, size_bytes, duration_sec, subject_id)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
        (user_id, title, (body.get("author") or "").strip(), (body.get("description") or "").strip(),
         kind, url, file_name, key, mime, len(raw), int(body.get("duration_sec") or 0), subject_id)
    )
    item_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "id": item_id, "file_url": url, "kind": kind})


def delete_item(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    params = event.get("queryStringParameters") or {}
    body = json.loads(event.get("body") or "{}")
    item_id = body.get("id") or params.get("id")
    if not item_id:
        conn.close()
        return resp(400, {"error": "Укажите книгу"})
    item_id = int(item_id)

    cur = conn.cursor()
    cur.execute("SELECT file_key, COALESCE(storage,'internal') FROM library_items WHERE id=%s AND teacher_id=%s",
                (item_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return resp(404, {"error": "Книга не найдена"})

    # Сначала чистим базу и фиксируем — иначе висящая транзакция блокирует таблицу
    cur.execute("DELETE FROM library_assignments WHERE item_id=%s", (item_id,))
    cur.execute("DELETE FROM library_items WHERE id=%s AND teacher_id=%s", (item_id, user_id))
    conn.commit()
    cur.close()
    conn.close()

    # Файл удаляем после — с коротким таймаутом, чтобы не подвесить запрос
    if row[0]:
        try:
            if row[1] == "external" and ext_storage_ready():
                ext_client(fast=True).delete_object(Bucket=os.environ["LIB_S3_BUCKET"], Key=row[0])
            else:
                s3_client(fast=True).delete_object(Bucket="files", Key=row[0])
        except Exception:
            pass

    return resp(200, {"ok": True})


def assign_item(event, conn, user_id, role):
    if role not in ("teacher", "admin"):
        conn.close()
        return resp(403, {"error": "Только преподаватель"})
    body = json.loads(event.get("body") or "{}")
    item_id = body.get("item_id")
    group_id = body.get("group_id")
    raw_ids = body.get("student_ids") or []
    if not item_id:
        conn.close()
        return resp(400, {"error": "Укажите книгу"})

    cur = conn.cursor()
    cur.execute("SELECT title FROM library_items WHERE id=%s AND teacher_id=%s", (item_id, user_id))
    row = cur.fetchone()
    if not row:
        cur.close()
        conn.close()
        return resp(404, {"error": "Книга не найдена"})
    title = row[0]

    student_ids = []
    if group_id:
        cur.execute("SELECT student_id FROM group_members WHERE group_id=%s", (int(group_id),))
        student_ids = [r[0] for r in cur.fetchall()]
    else:
        for s in raw_ids:
            try:
                student_ids.append(int(s))
            except (TypeError, ValueError):
                pass

    if not student_ids:
        cur.close()
        conn.close()
        return resp(400, {"error": "Выберите ученика или группу"})

    added = len(student_ids)
    values = ",".join(cur.mogrify("(%s,%s,%s,%s)", (item_id, sid, group_id, user_id)).decode()
                      for sid in student_ids)
    cur.execute(
        f"""INSERT INTO library_assignments (item_id, student_id, group_id, assigned_by)
            VALUES {values} ON CONFLICT (item_id, student_id) DO NOTHING"""
    )
    values = ",".join(cur.mogrify("(%s,%s,'material')", (sid, f"Вам выдана книга: {title}")).decode()
                      for sid in student_ids)
    cur.execute(f"INSERT INTO notifications (user_id, text, type) VALUES {values}")

    conn.commit()
    cur.close()
    conn.close()
    return resp(200, {"ok": True, "assigned": added})