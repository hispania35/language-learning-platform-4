import os
import smtplib
import ssl
from email.message import EmailMessage

SITE_NAME = "Школа испанского Hispania"


def _smtp_ready():
    return all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"))


def send_email(to_email: str, subject: str, html: str, text: str = "") -> bool:
    if not to_email or "@" not in to_email or not _smtp_ready():
        return False
    host = os.environ["SMTP_HOST"]
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    port = int(os.environ.get("SMTP_PORT", "465"))

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{SITE_NAME} <{user}>"
    msg["To"] = to_email
    msg.set_content(text or "Откройте письмо в браузере с поддержкой HTML")
    msg.add_alternative(html, subtype="html")

    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=10) as s:
                s.login(user, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=10) as s:
                s.starttls(context=ctx)
                s.login(user, password)
                s.send_message(msg)
        return True
    except Exception as e:
        print(f"mail error to {to_email}: {e}")
        return False


def send_bulk(letters: list) -> int:
    """Отправить несколько писем в одном SMTP-соединении.
    letters = [(to_email, subject, html), ...]. Возвращает число отправленных."""
    letters = [l for l in letters if l[0] and "@" in l[0]]
    if not letters or not _smtp_ready():
        return 0
    host = os.environ["SMTP_HOST"]
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    port = int(os.environ.get("SMTP_PORT", "465"))
    ctx = ssl.create_default_context()
    sent = 0
    try:
        if port == 465:
            server = smtplib.SMTP_SSL(host, port, context=ctx, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            server.starttls(context=ctx)
        with server as s:
            s.login(user, password)
            for to_email, subject, html in letters:
                msg = EmailMessage()
                msg["Subject"] = subject
                msg["From"] = f"{SITE_NAME} <{user}>"
                msg["To"] = to_email
                msg.set_content("Откройте письмо в браузере с поддержкой HTML")
                msg.add_alternative(html, subtype="html")
                try:
                    s.send_message(msg)
                    sent += 1
                except Exception as e:
                    print(f"mail error to {to_email}: {e}")
    except Exception as e:
        print(f"smtp bulk error: {e}")
    return sent


def _wrap(title: str, lines: list, button_text: str = "", button_url: str = "") -> str:
    body = "".join(f'<p style="margin:0 0 10px;font-size:15px;color:#374151">{l}</p>' for l in lines)
    button = ""
    if button_text and button_url:
        button = (
            f'<a href="{button_url}" style="display:inline-block;margin-top:14px;padding:12px 26px;'
            f'background:#e11d48;color:#ffffff;text-decoration:none;border-radius:10px;'
            f'font-weight:bold;font-size:15px">{button_text}</a>'
        )
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px">
<h2 style="margin:0 0 16px;font-size:19px;color:#111827">{title}</h2>
{body}{button}
<p style="margin:22px 0 0;font-size:12px;color:#9ca3af">{SITE_NAME}</p>
</div></body></html>"""


def lesson_started_email(student_name, topic, room_url, teacher_name=""):
    return _wrap(
        "Урок начался",
        [
            f"{student_name}, здравствуйте!",
            f"Занятие <b>«{topic}»</b> уже началось" + (f", преподаватель {teacher_name}" if teacher_name else "") + ".",
            "Нажмите кнопку, чтобы подключиться к видеоуроку.",
        ],
        "Присоединиться к уроку", room_url,
    )


def lesson_reminder_email(student_name, topic, time_str, date_str, room_url, hours_text):
    return _wrap(
        "Напоминание о занятии",
        [
            f"{student_name}, здравствуйте!",
            f"Напоминаем: {hours_text} у вас занятие <b>«{topic}»</b>.",
            f"Дата: <b>{date_str}</b>, время: <b>{time_str}</b>.",
        ],
        "Открыть урок", room_url,
    )