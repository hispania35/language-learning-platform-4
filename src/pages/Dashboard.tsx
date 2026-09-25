import { useState, useEffect } from "react";
import { type Page } from "@/App";
import { type User } from "@/pages/LoginPage";
import { useSettings } from "@/hooks/useSettings";
import Icon from "@/components/ui/icon";
import {
  apiGetCalendar, apiGetHomework, apiGetMaterials, apiGetLeaderboard, apiGetChatContacts,
  type Lesson, type HomeworkItem, type Material, type LeaderboardEntry, type ChatContact,
} from "@/lib/api";
import { fmtTime, fmtAgo, dayLabel } from "@/lib/datetime";

interface DashboardProps {
  onNavigate: (page: Page) => void;
  onOpenChat?: (peerId?: number) => void;
  user: User;
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const DAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const statusConfig = {
  pending: { label: "Не начато", cls: "bg-red-100 text-red-700" },
  inprogress: { label: "В процессе", cls: "bg-amber-100 text-amber-700" },
  review: { label: "На проверке", cls: "bg-blue-100 text-blue-700" },
  done: { label: "Сдано", cls: "bg-green-100 text-green-700" },
};

const typeIcon = (t: string) =>
  /MP3|WAV|M4A/i.test(t) ? "Music" : /MP4|MOV|AVI|MKV/i.test(t) ? "Video"
    : /PDF/i.test(t) ? "FileText" : /DOCX?|TXT/i.test(t) ? "FileEdit" : "File";

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// created_at и подобные метки приходят с сервера в UTC — форматируем в поясе пользователя
const relDate = (iso: string) => dayLabel(iso) || iso;

const dueLabel = (iso?: string) => {
  if (!iso) return "без срока";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const diff = Math.round((new Date(toKey(d)).getTime() - new Date(toKey(now)).getTime()) / 86400000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff < 0) return `просрочено на ${Math.abs(diff)} дн.`;
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
};

// last_at — полный UTC-таймстемп с сервера
const chatTime = (iso?: string | null) => {
  if (!iso) return "";
  const label = dayLabel(iso);
  if (!label) return "";
  if (label === "Сегодня") return fmtTime(iso);
  if (label === "Вчера") return "вчера";
  return fmtAgo(iso);
};

export default function Dashboard({ onNavigate, onOpenChat, user }: DashboardProps) {
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const { settings } = useSettings();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChat = () =>
    apiGetChatContacts().then(r => { if (r.contacts) setContacts(r.contacts); }).catch(() => {});

  useEffect(() => {
    Promise.allSettled([
      apiGetCalendar().then(r => { if (r.lessons) setLessons(r.lessons); }),
      apiGetHomework().then(r => { if (r.homework) setHomework(r.homework); }),
      apiGetMaterials().then(r => { if (r.materials) setMaterials(r.materials); }),
      apiGetLeaderboard().then(r => { if (r.leaderboard) setBoard(r.leaderboard); }),
      loadChat(),
    ]).finally(() => setLoading(false));

    const t = setInterval(loadChat, 20000);
    return () => clearInterval(t);
  }, []);

  const chats = contacts
    .filter(c => c.last_at || c.last_text)
    .sort((a, b) => {
      if ((b.unread || 0) !== (a.unread || 0)) return (b.unread || 0) - (a.unread || 0);
      return (b.last_at || "").localeCompare(a.last_at || "");
    })
    .slice(0, 5);
  const totalUnread = contacts.reduce((s, c) => s + (c.unread || 0), 0);

  const todayKey = toKey(new Date());
  const nowTime = new Date().toTimeString().slice(0, 5);

  const upcoming = lessons
    .filter(l => l.lesson_date > todayKey || (l.lesson_date === todayKey && l.lesson_time.slice(0, 5) >= nowTime))
    .sort((a, b) => (a.lesson_date + a.lesson_time).localeCompare(b.lesson_date + b.lesson_time))
    .slice(0, 4);

  const activeHw = homework
    .filter(h => h.status !== "done")
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))
    .slice(0, 4);

  const recentMaterials = materials.slice(0, 4);

  const doneHw = homework.filter(h => h.status === "done");
  const grades = homework.filter(h => typeof h.grade === "number" && h.grade > 0).map(h => h.grade as number);
  const avgGrade = grades.length ? (grades.reduce((s, g) => s + g, 0) / grades.length).toFixed(1) : "—";
  const pastLessons = lessons.filter(l => l.lesson_date < todayKey).length;
  const myScore = board.find(b => b.id === Number(user.id))?.score ?? 0;
  const myPlace = board.findIndex(b => b.id === Number(user.id)) + 1;

  const stats = isTeacher
    ? [
        { label: "Занятий всего", value: String(lessons.length), icon: "BookOpen", color: "bg-primary/10 text-primary", page: "calendar" as Page },
        { label: "Д/з на проверку", value: String(homework.filter(h => h.status === "review").length), icon: "ClipboardCheck", color: "bg-amber-100 text-amber-700", page: "homework" as Page },
        { label: "Учеников", value: String(board.length), icon: "Users", color: "bg-green-100 text-green-700", page: "students" as Page },
        { label: "Материалов", value: String(materials.length), icon: "FolderOpen", color: "bg-blue-100 text-blue-700", page: "materials" as Page },
      ]
    : [
        { label: "Уроков пройдено", value: String(pastLessons), icon: "BookOpen", color: "bg-primary/10 text-primary", page: "calendar" as Page },
        { label: "Д/з выполнено", value: String(doneHw.length), icon: "ClipboardCheck", color: "bg-green-100 text-green-700", page: "homework" as Page },
        { label: "Средняя оценка", value: avgGrade, icon: "Star", color: "bg-accent/20 text-yellow-700", page: "homework" as Page },
        { label: "Баллов в рейтинге", value: String(myScore), icon: "Trophy", color: "bg-blue-100 text-blue-700", page: "profile" as Page },
      ];

  const progress = isTeacher
    ? (lessons.length ? Math.round((pastLessons / lessons.length) * 100) : 0)
    : (homework.length ? Math.round((doneHw.length / homework.length) * 100) : 0);

  const monthLabel = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  const blockPrefs = settings.home_blocks;
  const isOn = (id: string) => blockPrefs.find(b => b.id === id)?.on !== false;

  const blockNodes: Record<string, JSX.Element> = {
    welcome: (
      <div className="red-accent rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-1/3 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />
        <div className="relative">
          <p className="text-white/70 text-sm font-ibm mb-1">Добро пожаловать обратно 👋</p>
          <h2 className="font-montserrat font-black text-2xl mb-1">{user.name}</h2>
          <p className="text-white/80 font-ibm text-sm">
            {isTeacher
              ? "Преподаватель · Hispania 35"
              : `Испанский язык${user.level ? ` · Уровень ${user.level}` : ""}${myPlace ? ` · ${myPlace}-е место в рейтинге` : ""}`}
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div>
              <p className="text-white/60 text-xs font-ibm">{isTeacher ? "Занятий проведено" : "Домашние задания"}</p>
              <p className="font-montserrat font-bold text-lg">{progress}%</p>
            </div>
            <div className="flex-1 h-2 bg-white/20 rounded-full">
              <div className="h-2 bg-accent rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
    ),
    stats: (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s, i) => (
          <button key={i} onClick={() => onNavigate(s.page)}
            className="bg-card rounded-xl p-4 border border-border card-hover animate-fade-in text-left hover:border-primary/40 transition-colors"
            style={{ animationDelay: `${i * 0.05}s` }}>
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
              <Icon name={s.icon} size={18} />
            </div>
            <p className="font-montserrat font-black text-2xl text-foreground">
              {loading ? <span className="inline-block w-8 h-6 bg-muted rounded animate-pulse" /> : s.value}
            </p>
            <p className="text-muted-foreground text-xs mt-0.5 font-ibm">{s.label}</p>
          </button>
        ))}
      </div>
    ),
    lessons: (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-montserrat font-bold text-sm text-foreground">Ближайшие занятия</h3>
            <button onClick={() => onNavigate("calendar")} className="text-primary text-xs font-medium hover:underline">Весь календарь →</button>
          </div>
          <div className="divide-y divide-border">
            {loading && [...Array(3)].map((_, i) => (
              <div key={i} className="px-5 py-3.5 animate-pulse flex gap-4">
                <div className="w-10 h-8 bg-muted rounded" />
                <div className="flex-1 space-y-2"><div className="h-3.5 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/3" /></div>
              </div>
            ))}
            {!loading && !upcoming.length && (
              <div className="px-5 py-10 text-center">
                <Icon name="CalendarOff" size={32} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-ibm">Запланированных занятий нет</p>
                {isTeacher && (
                  <button onClick={() => onNavigate("calendar")}
                    className="mt-3 px-4 py-2 red-accent text-white rounded-lg text-xs font-montserrat font-bold hover:opacity-90">
                    Назначить занятие
                  </button>
                )}
              </div>
            )}
            {!loading && upcoming.map(l => {
              const d = new Date(l.lesson_date + "T12:00:00");
              const isToday = l.lesson_date === todayKey;
              const who = (l.students || []).map(s => s.name).join(", ");
              return (
                <button key={l.id} onClick={() => onNavigate("calendar")}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left">
                  <div className={`text-center w-10 flex-shrink-0 ${isToday ? "text-primary" : ""}`}>
                    <p className="text-xs text-muted-foreground font-ibm">{isToday ? "сегодня" : DAYS_SHORT[d.getDay()]}</p>
                    <p className="font-montserrat font-bold text-sm leading-tight">{d.getDate()}</p>
                  </div>
                  <div className="w-px h-8 bg-border flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm truncate font-ibm">{l.topic}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {who || (isTeacher ? "Ученики не назначены" : l.lesson_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-montserrat font-medium">
                      {l.lesson_time.slice(0, 5)}
                    </span>
                    <span className="hidden md:block text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{l.lesson_type}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
    ),
    homework: (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-montserrat font-bold text-sm text-foreground">Домашние задания</h3>
            <button onClick={() => onNavigate("homework")} className="text-primary text-xs font-medium hover:underline">Все →</button>
          </div>
          <div className="p-3 space-y-2">
            {loading && [...Array(3)].map((_, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/40 animate-pulse space-y-2">
                <div className="h-3.5 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-1/2" />
              </div>
            ))}
            {!loading && !activeHw.length && (
              <div className="py-8 text-center">
                <Icon name="CheckCheck" size={30} className="text-green-500/60 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-ibm">
                  {homework.length ? "Все задания выполнены" : "Заданий пока нет"}
                </p>
              </div>
            )}
            {!loading && activeHw.map(hw => {
              const sc = statusConfig[hw.status] || statusConfig.pending;
              const overdue = hw.due_date && hw.due_date < todayKey;
              return (
                <button key={hw.id} onClick={() => onNavigate("homework")}
                  className="w-full p-3 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors text-left">
                  <p className="font-ibm text-sm text-foreground font-medium leading-snug line-clamp-2">{hw.title}</p>
                  {isTeacher && hw.student_name && (
                    <p className="text-xs text-muted-foreground font-ibm mt-0.5">{hw.student_name}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className={`text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      до {dueLabel(hw.due_date)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-montserrat font-medium flex-shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
    ),
    materials: (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-montserrat font-bold text-sm text-foreground">Новые материалы</h3>
            <button onClick={() => onNavigate("materials")} className="text-primary text-xs font-medium hover:underline">Все →</button>
          </div>
          <div className="divide-y divide-border">
            {loading && [...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                <div className="w-9 h-9 bg-muted rounded-lg" />
                <div className="flex-1 space-y-2"><div className="h-3.5 bg-muted rounded w-2/3" /><div className="h-3 bg-muted rounded w-1/3" /></div>
              </div>
            ))}
            {!loading && !recentMaterials.length && (
              <div className="px-5 py-10 text-center">
                <Icon name="FolderOpen" size={30} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-ibm">Материалов пока нет</p>
                {isTeacher && (
                  <button onClick={() => onNavigate("materials")}
                    className="mt-3 px-4 py-2 red-accent text-white rounded-lg text-xs font-montserrat font-bold hover:opacity-90">
                    Загрузить материал
                  </button>
                )}
              </div>
            )}
            {!loading && recentMaterials.map(m => (
              <button key={m.id} onClick={() => onNavigate("materials")}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors text-left">
                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name={typeIcon(m.file_type)} size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate font-ibm">{m.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[m.file_size, relDate(m.created_at), m.category].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {m.file_url && (
                  <span onClick={e => { e.stopPropagation(); window.open(m.file_url, "_blank"); }}
                    title="Скачать" className="p-1 rounded hover:bg-muted flex-shrink-0">
                    <Icon name="Download" size={14} className="text-primary" />
                  </span>
                )}
                <span className="text-xs font-montserrat font-bold text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded flex-shrink-0">{m.file_type}</span>
              </button>
            ))}
          </div>
        </div>
    ),
    leaderboard: (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-montserrat font-bold text-sm text-foreground">Рейтинг группы</h3>
            <span className="text-xs text-muted-foreground font-ibm capitalize">{monthLabel}</span>
          </div>
          <div className="divide-y divide-border">
            {loading && [...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
                <div className="w-5 h-4 bg-muted rounded" />
                <div className="w-8 h-8 bg-muted rounded-full" />
                <div className="flex-1 h-3.5 bg-muted rounded w-1/2" />
              </div>
            ))}
            {!loading && !board.length && (
              <div className="px-5 py-10 text-center">
                <Icon name="Trophy" size={30} className="text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-ibm">Рейтинг появится после первых заданий</p>
              </div>
            )}
            {!loading && board.slice(0, 6).map((s, i) => {
              const isMe = s.id === Number(user.id);
              return (
                <div key={s.id}
                  className={`flex items-center gap-3 px-5 py-3 transition-colors ${isMe ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                  <div className={`w-5 text-center font-montserrat font-black text-sm flex-shrink-0 ${i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"}`}>
                    {i + 1}
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold font-montserrat ${isMe ? "red-accent text-white" : "bg-muted text-muted-foreground"}`}>
                    {s.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium font-ibm truncate ${isMe ? "text-primary" : "text-foreground"}`}>
                      {s.name} {isMe && <span className="text-xs text-muted-foreground">(вы)</span>}
                    </p>
                    {s.level && <p className="text-[11px] text-muted-foreground font-ibm">{s.level}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-montserrat font-bold text-sm text-foreground">{s.score}</p>
                    <p className="text-xs text-muted-foreground">баллов</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
    ),
    chat: (
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="font-montserrat font-bold text-sm text-foreground">Сообщения</h3>
            {totalUnread > 0 && (
              <span className="text-[10px] font-montserrat font-bold text-white red-accent px-1.5 py-0.5 rounded-full">
                {totalUnread}
              </span>
            )}
          </div>
          <button onClick={() => (onOpenChat ? onOpenChat() : onNavigate("chat"))}
            className="text-primary text-xs font-medium hover:underline">
            Открыть чат →
          </button>
        </div>
        <div className="divide-y divide-border">
          {loading && [...Array(2)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3 animate-pulse">
              <div className="w-9 h-9 bg-muted rounded-full" />
              <div className="flex-1 space-y-2"><div className="h-3.5 bg-muted rounded w-1/3" /><div className="h-3 bg-muted rounded w-2/3" /></div>
            </div>
          ))}
          {!loading && !chats.length && (
            <div className="px-5 py-10 text-center">
              <Icon name="MessageSquare" size={30} className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground font-ibm">Переписки пока нет</p>
              <button onClick={() => (onOpenChat ? onOpenChat() : onNavigate("chat"))}
                className="mt-3 px-4 py-2 red-accent text-white rounded-lg text-xs font-montserrat font-bold hover:opacity-90">
                Написать {isTeacher ? "ученику" : "преподавателю"}
              </button>
            </div>
          )}
          {!loading && chats.map(c => (
            <button key={c.id} onClick={() => (onOpenChat ? onOpenChat(c.id) : onNavigate("chat"))}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors text-left">
              <span className="relative flex-shrink-0">
                <span className="w-9 h-9 rounded-full red-accent flex items-center justify-center">
                  <span className="text-white font-bold text-[11px] font-montserrat">{c.avatar}</span>
                </span>
                {c.online && (
                  <span className="absolute -right-0.5 -bottom-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
                )}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className={`text-sm font-ibm truncate ${c.unread ? "font-bold text-foreground" : "font-medium text-foreground"}`}>
                    {c.name}
                  </span>
                  <span className="text-[11px] text-muted-foreground font-ibm flex-shrink-0 ml-auto">
                    {chatTime(c.last_at)}
                  </span>
                </span>
                <span className={`block text-xs truncate font-ibm ${c.unread ? "text-foreground" : "text-muted-foreground"}`}>
                  {c.last_text || "Нет сообщений"}
                </span>
              </span>
              {!!c.unread && (
                <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full red-accent flex items-center justify-center">
                  <span className="text-[10px] font-montserrat font-bold text-white">{c.unread}</span>
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    ),
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {blockPrefs.filter(b => isOn(b.id)).map(b => (
        <div key={b.id}>{blockNodes[b.id]}</div>
      ))}
      {!blockPrefs.some(b => isOn(b.id)) && (
        <div className="bg-card border border-border rounded-xl px-5 py-12 text-center">
          <Icon name="LayoutDashboard" size={32} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground font-ibm">Все блоки главной скрыты в настройках</p>
          <button onClick={() => onNavigate("settings")}
            className="mt-3 px-4 py-2 red-accent text-white rounded-lg text-xs font-montserrat font-bold hover:opacity-90">
            Открыть настройки
          </button>
        </div>
      )}
    </div>
  );
}