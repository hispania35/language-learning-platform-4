import { useState, useEffect } from "react";
import { type User } from "@/pages/LoginPage";
import { apiGetHomework, apiUpdateHomework, apiCreateHomework, apiGetStudents, apiGetDecks, apiDeleteDeck, type HomeworkItem, type StudentInfo, type CardDeck } from "@/lib/api";
import Icon from "@/components/ui/icon";
import CardDeckDialog from "@/components/cards/CardDeckDialog";
import DeckStudyDialog from "@/components/cards/DeckStudyDialog";

const tabs = ["Все", "Новые", "В процессе", "Проверяется", "Выполнено"];

const statusConfig: Record<string, { label: string; cls: string; icon: string }> = {
  pending:    { label: "Новое",       cls: "bg-red-100 text-red-700 border-red-200",     icon: "AlertCircle" },
  inprogress: { label: "В процессе", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: "Clock" },
  review:     { label: "На проверке", cls: "bg-blue-100 text-blue-700 border-blue-200",   icon: "Eye" },
  done:       { label: "Выполнено",  cls: "bg-green-100 text-green-700 border-green-200", icon: "CheckCircle" },
};

const tabMap: Record<string, string | null> = {
  "Все": null, "Новые": "pending", "В процессе": "inprogress", "Проверяется": "review", "Выполнено": "done",
};

export default function HomeworkPage({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState("Все");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ student_id: 0, title: "", description: "", subject: "", due_date: "" });
  const [saving, setSaving] = useState(false);
  const [gradeForm, setGradeForm] = useState<Record<number, { grade: string; comment: string }>>({});
  const [decks, setDecks] = useState<CardDeck[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [studyDeck, setStudyDeck] = useState<CardDeck | null>(null);
  const [delDeck, setDelDeck] = useState<CardDeck | null>(null);

  const load = () => {
    apiGetHomework().then(res => {
      if (res.homework) setHomework(res.homework);
      setLoading(false);
    });
  };

  const loadDecks = () => apiGetDecks().then(res => {
    if (res.decks) setDecks(res.decks);
    if (typeof res.ai_ready === "boolean") setAiReady(res.ai_ready);
  }).catch(() => {});

  useEffect(() => {
    load();
    loadDecks();
    if (user.role === "teacher") {
      apiGetStudents().then(res => { if (res.students) setStudents(res.students); });
    }
  }, [user.role]);

  const removeDeck = async () => {
    if (!delDeck) return;
    const res = await apiDeleteDeck(delDeck.id);
    if (res.ok) { setDelDeck(null); loadDecks(); }
  };

  const filtered = homework.filter(hw => {
    const f = tabMap[activeTab];
    return f === null || hw.status === f;
  });

  const counts: Record<string, number> = {};
  tabs.forEach(t => {
    const f = tabMap[t];
    counts[t] = f === null ? homework.length : homework.filter(h => h.status === f).length;
  });

  const handleStatusUpdate = async (id: number, status: string, answer?: string) => {
    setSaving(true);
    await apiUpdateHomework({ id, status, student_answer: answer });
    load();
    setSaving(false);
  };

  const handleGrade = async (id: number) => {
    const g = gradeForm[id];
    if (!g) return;
    setSaving(true);
    await apiUpdateHomework({ id, grade: parseInt(g.grade), teacher_comment: g.comment, status: "done" });
    load();
    setSaving(false);
  };

  const handleCreate = async () => {
    if (!form.title || !form.student_id) return;
    setSaving(true);
    await apiCreateHomework(form);
    load();
    setShowAdd(false);
    setForm({ student_id: 0, title: "", description: "", subject: "", due_date: "" });
    setSaving(false);
  };

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }); }
    catch { return d; }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Teacher: create */}
      {user.role === "teacher" && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 px-4 py-2.5 red-accent text-white rounded-xl text-sm font-montserrat font-medium hover:opacity-90 transition-opacity">
            <Icon name="Plus" size={16} />
            Создать задание
          </button>
          <button onClick={() => setShowCards(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
            <Icon name="Layers" size={16} className="text-primary" />
            Создать карточки
            <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              <Icon name="Sparkles" size={10} /> ИИ
            </span>
          </button>
        </div>
      )}

      {/* Наборы карточек */}
      {!!decks.length && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-2">
              <Icon name="Layers" size={15} className="text-primary" />
              <h3 className="font-montserrat font-bold text-sm text-foreground">Карточки слов</h3>
            </div>
            <span className="text-xs text-muted-foreground font-ibm">{decks.length} наборов</span>
          </div>
          <div className="divide-y divide-border">
            {decks.map(d => {
              const known = d.cards.filter(c => c.progress?.known).length;
              return (
                <div key={d.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group">
                  <button onClick={() => setStudyDeck(d)} className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-montserrat font-bold text-foreground truncate">{d.title}</p>
                    <p className="text-xs text-muted-foreground font-ibm">
                      {d.lang_from} → {d.lang_to} · {d.cards.length} слов
                      {user.role === "teacher"
                        ? (d.students.length ? ` · ${d.students.length} учеников` : " · не выдан")
                        : (known ? ` · выучено ${known}` : "")}
                    </p>
                  </button>
                  <button onClick={() => setStudyDeck(d)}
                    className="px-3 py-1.5 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 flex-shrink-0">
                    {user.role === "teacher" ? "Открыть" : "Учить"}
                  </button>
                  {user.role === "teacher" && (
                    <button onClick={() => setDelDeck(d)} title="Удалить набор"
                      className="p-1.5 rounded-lg hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <Icon name="Trash2" size={14} className="text-red-500" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-3 animate-scale-in">
          <p className="font-montserrat font-bold text-sm text-foreground">Новое задание</p>
          <select value={form.student_id} onChange={e => setForm({ ...form, student_id: parseInt(e.target.value) })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40">
            <option value={0}>Выберите студента</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.level})</option>)}
          </select>
          <input type="text" placeholder="Название задания" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          <textarea placeholder="Описание" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Предмет" value={form.subject}
              onChange={e => setForm({ ...form, subject: e.target.value })}
              className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
            <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })}
              className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          </div>
          <button onClick={handleCreate} disabled={saving}
            className="px-5 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
            {saving ? "Создаю..." : "Создать задание"}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-montserrat font-medium transition-all duration-150 ${
              activeTab === tab ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>
            {tab}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold leading-none ${
              activeTab === tab ? "bg-white/20 text-white" : "bg-muted-foreground/10 text-muted-foreground"
            }`}>{counts[tab]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5 animate-pulse">
            <div className="flex gap-4"><div className="w-8 h-8 bg-muted rounded-lg" />
              <div className="flex-1 space-y-2"><div className="h-4 bg-muted rounded w-1/2" /><div className="h-3 bg-muted rounded w-1/3" /></div>
            </div>
          </div>
        ))}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((hw, i) => {
            const sc = statusConfig[hw.status] || statusConfig.pending;
            const isOpen = expanded === hw.id;
            const gf = gradeForm[hw.id] || { grade: "", comment: "" };
            return (
              <div key={hw.id} className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in"
                style={{ animationDelay: `${i * 0.05}s` }}>
                <button className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(isOpen ? null : hw.id)}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${sc.cls}`}>
                    <Icon name={sc.icon} size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-montserrat font-bold text-sm text-foreground">{hw.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground font-ibm flex-wrap">
                      <span>{hw.subject}</span>
                      {hw.due_date && <><span>·</span><span>до {formatDate(hw.due_date)}</span></>}
                      {user.role === "teacher" && hw.student_name && <><span>·</span><span>{hw.student_name}</span></>}
                      {hw.grade && <span className="text-primary font-bold">· Оценка: {hw.grade}/5</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`hidden sm:block text-xs px-2 py-0.5 rounded-full border font-montserrat font-medium ${sc.cls}`}>{sc.label}</span>
                    <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={16} className="text-muted-foreground" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 pb-5 border-t border-border animate-fade-in">
                    <p className="text-sm text-foreground font-ibm mt-4 leading-relaxed">{hw.description}</p>

                    {hw.student_answer && (
                      <div className="mt-4 p-3 bg-muted/40 rounded-lg">
                        <p className="text-xs font-montserrat font-bold text-muted-foreground mb-1">Ответ студента</p>
                        <p className="text-sm font-ibm text-foreground">{hw.student_answer}</p>
                      </div>
                    )}

                    {hw.teacher_comment && (
                      <div className="mt-3 flex gap-3 bg-muted/40 rounded-lg p-3">
                        <div className="w-7 h-7 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{hw.teacher_avatar || "ЕС"}</span>
                        </div>
                        <div>
                          <p className="text-xs font-montserrat font-bold text-foreground">{hw.teacher_name || "Преподаватель"}</p>
                          <p className="text-sm text-foreground font-ibm mt-0.5">{hw.teacher_comment}</p>
                        </div>
                      </div>
                    )}

                    {hw.grade && (
                      <div className="mt-3 flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <Icon name="Star" size={18} className="text-amber-500" />
                        <p className="text-sm font-montserrat font-bold text-green-800">Оценка: {hw.grade}/5</p>
                      </div>
                    )}

                    {/* Student actions */}
                    {user.role === "student" && (
                      <div className="mt-4 flex gap-3 flex-wrap">
                        {hw.status === "pending" && (
                          <button onClick={() => handleStatusUpdate(hw.id, "inprogress")} disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                            <Icon name="Play" size={15} />Начать выполнение
                          </button>
                        )}
                        {hw.status === "inprogress" && (
                          <button onClick={() => handleStatusUpdate(hw.id, "review")} disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                            <Icon name="Send" size={15} />Отправить на проверку
                          </button>
                        )}
                      </div>
                    )}

                    {/* Teacher grading */}
                    {user.role === "teacher" && hw.status === "review" && !hw.grade && (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-montserrat font-bold text-muted-foreground">Поставить оценку</p>
                        <div className="flex gap-2">
                          {[1,2,3,4,5].map(g => (
                            <button key={g} onClick={() => setGradeForm({ ...gradeForm, [hw.id]: { ...gf, grade: String(g) } })}
                              className={`w-9 h-9 rounded-lg font-montserrat font-bold text-sm transition-all ${
                                gf.grade === String(g) ? "red-accent text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
                              }`}>{g}</button>
                          ))}
                        </div>
                        <textarea placeholder="Комментарий преподавателя..." value={gf.comment}
                          onChange={e => setGradeForm({ ...gradeForm, [hw.id]: { ...gf, comment: e.target.value } })}
                          rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none resize-none" />
                        <button onClick={() => handleGrade(hw.id)} disabled={saving || !gf.grade}
                          className="px-4 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                          {saving ? "Сохраняю..." : "Сохранить оценку"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-12 text-center">
              <Icon name="ClipboardCheck" size={36} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground font-ibm text-sm">Заданий нет</p>
            </div>
          )}
        </div>
      )}

      {showCards && (
        <CardDeckDialog students={students} aiReady={aiReady}
          onClose={() => setShowCards(false)}
          onDone={() => loadDecks()} />
      )}

      {studyDeck && (
        <DeckStudyDialog deck={studyDeck} isTeacher={user.role === "teacher"}
          onClose={() => { setStudyDeck(null); loadDecks(); }} />
      )}

      {delDeck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setDelDeck(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1">Удалить набор?</h2>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              «{delDeck.title}» и все {delDeck.cards.length} карточек будут удалены.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDelDeck(null)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
                Отмена
              </button>
              <button onClick={removeDeck}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-montserrat font-bold hover:bg-red-700 transition-colors">
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}