import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import { apiSendSupport, apiGetSupport, apiReadSupport, apiCloseSupport, type SupportTicket } from "@/lib/api";

const TOPICS = [
  { id: "tech", label: "Не работает", icon: "TriangleAlert" },
  { id: "lesson", label: "Вопрос по урокам", icon: "GraduationCap" },
  { id: "payment", label: "Оплата и доступ", icon: "CreditCard" },
  { id: "idea", label: "Пожелание", icon: "Lightbulb" },
  { id: "other", label: "Другое", icon: "MessageCircle" },
];

interface Attach { data: string; name: string; mime: string; preview: string }

const fmtDate = (s: string | null) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("ru-RU", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
};

function FileBar({ file, onClear, busy }: { file: Attach; onClear: () => void; busy: boolean }) {
  return (
    <div className="flex items-center gap-2.5 p-2 rounded-lg border border-border bg-muted/30">
      {file.preview ? (
        <img src={file.preview} alt="" className="w-11 h-11 rounded object-cover flex-shrink-0" />
      ) : (
        <span className="w-11 h-11 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <Icon name="FileText" size={16} className="text-muted-foreground" />
        </span>
      )}
      <span className="flex-1 min-w-0 text-xs font-ibm text-foreground truncate">{file.name}</span>
      <button onClick={onClear} disabled={busy} className="p-1.5 rounded-md hover:bg-muted transition-colors flex-shrink-0">
        <Icon name="X" size={13} className="text-muted-foreground" />
      </button>
    </div>
  );
}

function Attachment({ url, name, type }: { url: string; name?: string; type?: string }) {
  if (type === "image") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mt-1.5">
        <img src={url} alt={name} className="max-h-40 rounded-lg border border-border object-contain hover:opacity-90 transition-opacity" />
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer"
      className="mt-1.5 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs font-montserrat font-bold text-foreground hover:bg-muted transition-colors">
      <Icon name="Paperclip" size={12} />
      {name || "Вложение"}
    </a>
  );
}

export default function HelpDialog({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [view, setView] = useState<"write" | "list" | "closed">(isAdmin ? "list" : "write");
  const [openId, setOpenId] = useState<number | null>(null);
  const [topic, setTopic] = useState("tech");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<Attach | null>(null);
  const [reply, setReply] = useState("");
  const [replyFile, setReplyFile] = useState<Attach | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const replyInput = useRef<HTMLInputElement>(null);
  const feedEnd = useRef<HTMLDivElement>(null);

  const read = (f: File | null | undefined, set: (a: Attach) => void) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setErr("Файл больше 15 МБ"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result || "");
      set({
        data, name: f.name || "screenshot.png", mime: f.type || "application/octet-stream",
        preview: f.type.startsWith("image/") ? data : "",
      });
      setErr("");
    };
    reader.readAsDataURL(f);
  };

  const load = () => {
    apiGetSupport()
      .then(r => { if (r.tickets) setTickets(r.tickets); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (openId) feedEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [openId, tickets]);

  const openTicket = (t: SupportTicket) => {
    setOpenId(t.id);
    setReply(""); setReplyFile(null); setErr("");
    if (t.unread > 0) apiReadSupport(t.id).then(load).catch(() => {});
  };

  const sendNew = async () => {
    if (text.trim().length < 2 && !file) { setErr("Опишите вопрос хотя бы парой слов"); return; }
    setBusy(true); setErr("");
    const res = await apiSendSupport({
      topic, message: text.trim(),
      file: file ? { file_data: file.data, file_name: file.name, mime: file.mime } : null,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось отправить"); return; }
    setText(""); setFile(null);
    setDone("Отправлено администратору. Ответ придёт на почту и сюда.");
    setTimeout(() => setDone(""), 4000);
    setView("list");
    apiGetSupport().then(r => { if (r.tickets) { setTickets(r.tickets); setOpenId(res.id || null); } });
  };

  const sendReply = async (ticketId: number) => {
    if (reply.trim().length < 2 && !replyFile) return;
    setBusy(true); setErr("");
    const res = await apiSendSupport({
      ticket_id: ticketId, message: reply.trim(),
      file: replyFile ? { file_data: replyFile.data, file_name: replyFile.name, mime: replyFile.mime } : null,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось отправить"); return; }
    setReply(""); setReplyFile(null);
    setView("list");
    load();
  };

  const toggleClosed = async (ticketId: number, close: boolean) => {
    setBusy(true);
    const res = await apiCloseSupport(ticketId, close).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не получилось"); return; }
    setDone(close ? "Обращение закрыто" : "Обращение снова активно");
    setTimeout(() => setDone(""), 3000);
    if (close) { setOpenId(null); setView("list"); }
    load();
  };

  const active = tickets.filter(t => !t.closed);
  const closed = tickets.filter(t => t.closed);
  const shown = view === "closed" ? closed : active;
  const totalUnread = active.reduce((a, t) => a + (t.unread || 0), 0);
  const open = tickets.find(t => t.id === openId) || null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg animate-scale-in max-h-[88vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
          {open && (
            <button onClick={() => setOpenId(null)} className="p-1 -ml-1 rounded-md hover:bg-muted transition-colors">
              <Icon name="ChevronLeft" size={18} className="text-muted-foreground" />
            </button>
          )}
          <h2 className="font-montserrat font-bold text-base text-foreground flex items-center gap-2 flex-1 min-w-0">
            <Icon name="LifeBuoy" size={18} className="text-primary flex-shrink-0" />
            <span className="truncate">
              {open ? open.topic_label : isAdmin ? "Обращения в поддержку" : "Помощь"}
            </span>
          </h2>
          {open && isAdmin && (
            <button onClick={() => toggleClosed(open.id, !open.closed)} disabled={busy}
              title={open.closed ? "Вернуть в активные" : "Закрыть обращение"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-montserrat font-bold transition-colors flex-shrink-0 ${
                open.closed
                  ? "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  : "border-green-200 text-green-700 hover:bg-green-50"
              }`}>
              <Icon name={open.closed ? "RotateCcw" : "CheckCheck"} size={13} />
              <span className="hidden sm:inline">{open.closed ? "Вернуть" : "Закрыть"}</span>
            </button>
          )}
          <button onClick={onClose} disabled={busy} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>

        {!open && (
          <div className="flex gap-1 px-5 pt-3">
            <button onClick={() => { setView("write"); setDone(""); }}
              className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-colors ${
                view === "write" ? "red-accent text-white" : "text-muted-foreground hover:bg-muted"
              }`}>
              Новый вопрос
            </button>
            <button onClick={() => { setView("list"); setDone(""); }}
              className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-colors flex items-center justify-center gap-1.5 ${
                view === "list" ? "red-accent text-white" : "text-muted-foreground hover:bg-muted"
              }`}>
              Активные
              {totalUnread > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  view === "list" ? "bg-white/25" : "bg-primary text-white"
                }`}>{totalUnread}</span>
              )}
            </button>
            <button onClick={() => { setView("closed"); setDone(""); }}
              className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-colors flex items-center justify-center gap-1.5 ${
                view === "closed" ? "red-accent text-white" : "text-muted-foreground hover:bg-muted"
              }`}>
              Закрытые
              {closed.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  view === "closed" ? "bg-white/25" : "bg-muted-foreground/15 text-muted-foreground"
                }`}>{closed.length}</span>
              )}
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {open ? (
            <div className="space-y-3">
              {isAdmin && (
                <p className="text-xs text-muted-foreground font-ibm pb-1 border-b border-border">
                  {open.user_name} · {open.user_role === "student" ? "ученик" : "преподаватель"}
                </p>
              )}

              {open.messages.map((m, i) => (
                <div key={i} className={`flex ${m.is_staff ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                    m.is_staff ? "bg-primary/10 border border-primary/20" : "bg-muted"
                  }`}>
                    <p className="text-[10px] font-montserrat font-bold text-muted-foreground mb-0.5">
                      {m.author} · {fmtDate(m.created_at)}
                    </p>
                    {m.text && (
                      <p className="text-sm text-foreground font-ibm whitespace-pre-wrap break-words">{m.text}</p>
                    )}
                    {m.file_url && <Attachment url={m.file_url} name={m.file_name} type={m.file_type} />}
                  </div>
                </div>
              ))}

              {open.closed && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border">
                  <Icon name="CheckCheck" size={14} className="text-green-600 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground font-ibm">
                    Обращение закрыто {fmtDate(open.closed_at)}.
                    {isAdmin ? " Новое сообщение вернёт его в активные." : " Напишите, если вопрос остался."}
                  </p>
                </div>
              )}
              <div ref={feedEnd} />
            </div>
          ) : view === "write" ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-ibm">
                Сообщение придёт напрямую администратору школы — на почту и в уведомления.
              </p>

              <div className="flex flex-wrap gap-1.5">
                {TOPICS.map(t => (
                  <button key={t.id} onClick={() => setTopic(t.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-montserrat font-medium transition-all ${
                      topic === t.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}>
                    <Icon name={t.icon} size={12} />
                    {t.label}
                  </button>
                ))}
              </div>

              <textarea value={text} rows={5} disabled={busy}
                onChange={e => { setText(e.target.value); setErr(""); setDone(""); }}
                onPaste={e => {
                  const img = Array.from(e.clipboardData.files).find(f => f.type.startsWith("image/"));
                  if (img) { e.preventDefault(); read(img, setFile); }
                }}
                placeholder="Опишите, что случилось. Скриншот можно вставить сюда через Ctrl+V"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />

              <input ref={fileInput} type="file" className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
                onChange={e => { read(e.target.files?.[0], setFile); e.target.value = ""; }} />

              {file ? (
                <FileBar file={file} busy={busy} onClear={() => setFile(null)} />
              ) : (
                <button onClick={() => fileInput.current?.click()} disabled={busy}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border text-xs font-montserrat font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                  <Icon name="Paperclip" size={14} />
                  Прикрепить скриншот или файл
                </button>
              )}

              {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}
              {done && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                  <Icon name="Check" size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700 font-ibm">{done}</p>
                </div>
              )}

              <button onClick={sendNew} disabled={busy}
                className="w-full py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <><Icon name="Loader" size={15} className="animate-spin" />Отправляю...</> : <><Icon name="Send" size={15} />Отправить</>}
              </button>
            </div>
          ) : loading ? (
            <p className="text-xs text-muted-foreground font-ibm">Загружаю...</p>
          ) : !shown.length ? (
            <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">
              {view === "closed"
                ? "Закрытых обращений нет"
                : isAdmin ? "Активных обращений нет" : "Вы ещё не писали в поддержку"}
            </p>
          ) : (
            <div className="space-y-2">
              {done && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200 mb-1">
                  <Icon name="Check" size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700 font-ibm">{done}</p>
                </div>
              )}
              {shown.map(t => {
                const last = t.messages[t.messages.length - 1];
                return (
                  <button key={t.id} onClick={() => openTicket(t)}
                    className={`w-full text-left rounded-lg border p-3 transition-colors hover:bg-muted/40 ${
                      t.closed ? "border-border opacity-70"
                        : t.unread > 0 ? "border-primary/40 bg-primary/5" : "border-border"
                    }`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-montserrat font-bold">
                        {t.topic_label}
                      </span>
                      {isAdmin && <span className="text-xs font-montserrat font-bold text-foreground">{t.user_name}</span>}
                      {t.unread > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-white font-bold">
                          {t.unread}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground font-ibm ml-auto">{fmtDate(t.last_at)}</span>
                    </div>
                    <p className="text-sm text-foreground font-ibm truncate">
                      {last?.is_staff ? "Поддержка: " : ""}{last?.text || (last?.file_url ? "Вложение" : "")}
                    </p>
                    <p className="text-[11px] text-muted-foreground font-ibm mt-0.5">
                      {t.messages.length} {t.messages.length === 1 ? "сообщение" : "сообщений"}
                      {t.closed
                        ? ` · закрыто ${fmtDate(t.closed_at)}`
                        : t.status === "done" ? " · отвечено" : " · ждёт ответа"}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {open && (
          <div className="border-t border-border px-5 py-3 space-y-2">
            {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}
            {replyFile && <FileBar file={replyFile} busy={busy} onClear={() => setReplyFile(null)} />}
            <input ref={replyInput} type="file" className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.txt,.zip"
              onChange={e => { read(e.target.files?.[0], setReplyFile); e.target.value = ""; }} />
            <div className="flex items-end gap-2">
              <button onClick={() => replyInput.current?.click()} disabled={busy}
                title="Прикрепить скриншот или файл"
                className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0">
                <Icon name="Paperclip" size={15} />
              </button>
              <textarea value={reply} rows={1} disabled={busy}
                onChange={e => setReply(e.target.value)}
                onPaste={e => {
                  const img = Array.from(e.clipboardData.files).find(f => f.type.startsWith("image/"));
                  if (img) { e.preventDefault(); read(img, setReplyFile); }
                }}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(open.id); }
                }}
                placeholder={open.closed ? "Написать — обращение снова откроется" : isAdmin ? "Ответить ученику" : "Уточнить вопрос"}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none max-h-24" />
              <button onClick={() => sendReply(open.id)} disabled={busy || (reply.trim().length < 2 && !replyFile)}
                className="w-9 h-9 rounded-lg red-accent text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 flex-shrink-0">
                <Icon name={busy ? "Loader" : "Send"} size={15} className={busy ? "animate-spin" : ""} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}