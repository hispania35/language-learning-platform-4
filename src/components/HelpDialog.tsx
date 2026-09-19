import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { apiSendSupport, apiGetSupport, apiAnswerSupport, type SupportTicket } from "@/lib/api";

const TOPICS = [
  { id: "tech", label: "Не работает", icon: "TriangleAlert" },
  { id: "lesson", label: "Вопрос по урокам", icon: "GraduationCap" },
  { id: "payment", label: "Оплата и доступ", icon: "CreditCard" },
  { id: "idea", label: "Пожелание", icon: "Lightbulb" },
  { id: "other", label: "Другое", icon: "MessageCircle" },
];

const fmtDate = (s: string | null) => {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("ru-RU", {
      day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
};

export default function HelpDialog({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [view, setView] = useState<"write" | "history">(isAdmin ? "history" : "write");
  const [topic, setTopic] = useState("tech");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerFor, setAnswerFor] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");

  const load = () => {
    apiGetSupport()
      .then(r => { if (r.tickets) setTickets(r.tickets); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const send = async () => {
    if (text.trim().length < 5) { setErr("Опишите вопрос хотя бы парой слов"); return; }
    setBusy(true); setErr("");
    const res = await apiSendSupport(topic, text.trim()).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось отправить"); return; }
    setDone("Сообщение отправлено администратору. Ответ придёт на вашу почту и в уведомления.");
    setText("");
    load();
  };

  const reply = async (id: number) => {
    if (answerText.trim().length < 2) return;
    setBusy(true);
    const res = await apiAnswerSupport(id, answerText.trim()).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось отправить ответ"); return; }
    setAnswerFor(null);
    setAnswerText("");
    setDone(res.mail_sent ? "Ответ отправлен на почту" : "Ответ сохранён");
    load();
  };

  const newCount = tickets.filter(t => t.status === "new").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg animate-scale-in max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-montserrat font-bold text-base text-foreground flex items-center gap-2">
            <Icon name="LifeBuoy" size={18} className="text-primary" />
            {isAdmin ? "Обращения в поддержку" : "Помощь"}
          </h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-1 px-5 pt-3">
          <button onClick={() => { setView("write"); setDone(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-colors ${
              view === "write" ? "red-accent text-white" : "text-muted-foreground hover:bg-muted"
            }`}>
            {isAdmin ? "Написать" : "Задать вопрос"}
          </button>
          <button onClick={() => { setView("history"); setDone(""); }}
            className={`flex-1 py-2 rounded-lg text-xs font-montserrat font-bold transition-colors flex items-center justify-center gap-1.5 ${
              view === "history" ? "red-accent text-white" : "text-muted-foreground hover:bg-muted"
            }`}>
            {isAdmin ? "Все обращения" : "Мои обращения"}
            {newCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                view === "history" ? "bg-white/25" : "bg-primary text-white"
              }`}>{newCount}</span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === "write" ? (
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
                placeholder="Опишите, что случилось или о чём хотите спросить"
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />

              {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}
              {done && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
                  <Icon name="Check" size={14} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700 font-ibm">{done}</p>
                </div>
              )}

              <button onClick={send} disabled={busy}
                className="w-full py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                {busy ? <><Icon name="Loader" size={15} className="animate-spin" />Отправляю...</> : <><Icon name="Send" size={15} />Отправить</>}
              </button>
            </div>
          ) : loading ? (
            <p className="text-xs text-muted-foreground font-ibm">Загружаю...</p>
          ) : !tickets.length ? (
            <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">
              {isAdmin ? "Обращений пока нет" : "Вы ещё не писали в поддержку"}
            </p>
          ) : (
            <div className="space-y-2.5">
              {tickets.map(t => (
                <div key={t.id} className={`rounded-lg border p-3 ${
                  t.status === "new" ? "border-primary/30 bg-primary/5" : "border-border"
                }`}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-montserrat font-bold">
                      {t.topic_label}
                    </span>
                    {isAdmin && (
                      <span className="text-xs font-montserrat font-bold text-foreground">{t.user_name}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground font-ibm ml-auto">{fmtDate(t.created_at)}</span>
                  </div>

                  <p className="text-sm text-foreground font-ibm whitespace-pre-wrap break-words">{t.message}</p>

                  {t.answer && (
                    <div className="mt-2 pl-3 border-l-2 border-primary/40">
                      <p className="text-[11px] font-montserrat font-bold text-primary mb-0.5">Ответ администратора</p>
                      <p className="text-sm text-foreground font-ibm whitespace-pre-wrap break-words">{t.answer}</p>
                    </div>
                  )}

                  {isAdmin && t.status === "new" && (
                    answerFor === t.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea value={answerText} rows={3} autoFocus disabled={busy}
                          onChange={e => setAnswerText(e.target.value)}
                          placeholder="Ваш ответ — уйдёт на почту и в уведомления"
                          className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => reply(t.id)} disabled={busy}
                            className="px-3 py-1.5 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-50">
                            {busy ? "Отправляю..." : "Ответить"}
                          </button>
                          <button onClick={() => { setAnswerFor(null); setAnswerText(""); }}
                            className="px-3 py-1.5 rounded-lg border border-border text-xs font-montserrat font-bold text-muted-foreground hover:text-foreground">
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setAnswerFor(t.id); setAnswerText(""); }}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-montserrat font-bold text-foreground hover:bg-muted transition-colors">
                        <Icon name="Reply" size={12} />
                        Ответить
                      </button>
                    )
                  )}

                  {t.status === "done" && !isAdmin && !t.answer && (
                    <p className="text-[11px] text-muted-foreground font-ibm mt-1.5">Обращение закрыто</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
