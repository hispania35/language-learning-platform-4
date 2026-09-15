import { useState, useEffect, useRef } from "react";
import { useChatAlerts } from "@/hooks/useChatAlerts";
import Icon from "@/components/ui/icon";
import { apiGetCalendar, apiStartLesson, type Lesson } from "@/lib/api";
import { type User } from "@/pages/LoginPage";
import ChatPage from "@/pages/ChatPage";

const JITSI_HOST = "hispania-35.ru";

export const buildRoomName = (lesson?: Lesson | null) =>
  lesson ? `hispania-lesson-${lesson.id}` : "hispania-room";

export const buildRoomUrl = (room: string, userName: string) =>
  `https://${JITSI_HOST}/${room}#userInfo.displayName=%22${encodeURIComponent(userName)}%22&config.prejoinPageEnabled=false`;

interface Props {
  user: User;
  initialRoom?: string | null;
  onLeave?: () => void;
}

export default function LessonRoomPage({ user, initialRoom, onLeave }: Props) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<string | null>(initialRoom || null);
  const [customRoom, setCustomRoom] = useState("");
  const [notice, setNotice] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { setInLesson, unread } = useChatAlerts();

  useEffect(() => {
    setInLesson(!!room);
    return () => setInLesson(false);
  }, [room, setInLesson]);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGetCalendar()
      .then(res => { if (res.lessons) setLessons(res.lessons); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (initialRoom) setRoom(initialRoom);
  }, [initialRoom]);

  useEffect(() => {
    if (!room) { setShowHint(false); return; }
    setShowHint(true);
    const t = setTimeout(() => setShowHint(false), 5000);
    return () => clearTimeout(t);
  }, [room]);

  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const todayLessons = lessons
    .filter(l => l.lesson_date === todayKey)
    .sort((a, b) => a.lesson_time.localeCompare(b.lesson_time));

  const upcoming = lessons
    .filter(l => l.lesson_date > todayKey)
    .sort((a, b) => (a.lesson_date + a.lesson_time).localeCompare(b.lesson_date + b.lesson_time))
    .slice(0, 4);

  const startLesson = (lesson?: Lesson) => {
    setRoom(buildRoomName(lesson));
    setTimeout(() => frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    if (lesson && user.role === "teacher") {
      setNotice("Отправляю приглашения ученикам...");
      apiStartLesson(lesson.id)
        .then(res => {
          if (res.ok) {
            const mails = res.emails_sent || 0;
            setNotice(
              `Уведомления отправлены: ${res.notified || 0} в чат` +
              (mails > 0 ? `, ${mails} на почту` : ", почта не настроена")
            );
          } else {
            setNotice(res.error || "Не удалось отправить приглашения");
          }
        })
        .catch(() => setNotice("Не удалось отправить приглашения"))
        .finally(() => setTimeout(() => setNotice(""), 6000));
    }
  };

  const startCustom = () => {
    const name = customRoom.trim().replace(/\s+/g, "-").toLowerCase();
    setRoom(name ? `hispania-${name}` : "hispania-room");
  };

  const activeLesson = room ? lessons.find(l => buildRoomName(l) === room) : undefined;

  const chatPeers = (activeLesson?.students || []).map(s => s.id);

  if (room) {
    const url = buildRoomUrl(room, user.name);
    return (
      <div className="max-w-6xl mx-auto flex flex-col gap-2 h-full lg:min-h-[420px]" ref={frameRef}>
        <div className="flex-shrink-0 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <h2 className="font-montserrat font-bold text-foreground">Урок идёт</h2>
            <span className="hidden sm:inline text-xs text-muted-foreground font-ibm truncate">комната {room}</span>
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <button
              title="Скопировать ссылку"
              onClick={() => {
                navigator.clipboard?.writeText(`https://${JITSI_HOST}/${room}`);
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
              <Icon name="Link" size={15} />
              <span className="hidden lg:inline">Скопировать ссылку</span>
            </button>
            <a href={url} target="_blank" rel="noreferrer" title="Открыть в новом окне"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
              <Icon name="ExternalLink" size={15} />
              <span className="hidden lg:inline">В новом окне</span>
            </a>
            <button onClick={() => setChatOpen(v => !v)} title="Чат урока"
              className={`relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-sm font-montserrat font-medium transition-colors
                ${chatOpen ? "red-accent text-white border-transparent" : "border-border text-foreground hover:bg-muted"}`}>
              <Icon name="MessageSquare" size={15} />
              <span className="hidden sm:inline">Чат</span>
              {!chatOpen && unread > 0 && (
                <>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-montserrat font-bold flex items-center justify-center">
                    {unread > 9 ? "9+" : unread}
                  </span>
                </>
              )}
            </button>
            <button onClick={() => { setRoom(null); onLeave?.(); }} title="Завершить урок"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-montserrat font-medium hover:bg-red-700 transition-colors">
              <Icon name="PhoneOff" size={15} />
              <span className="hidden sm:inline">Завершить</span>
            </button>
          </div>
        </div>

        {notice && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 animate-scale-in">
            <Icon name="BellRing" size={15} className="text-primary flex-shrink-0" />
            <p className="text-xs text-foreground font-ibm">{notice}</p>
          </div>
        )}

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-2">
          <div className="flex-1 min-h-[280px] min-w-0 bg-card rounded-xl border border-border overflow-hidden">
            <iframe
              src={url}
              title="Видеоурок"
              allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
              className="w-full h-full min-h-[280px] border-0"
            />
          </div>

          {chatOpen && (
            <div className="lg:w-80 lg:flex-shrink-0 h-72 lg:h-auto lg:min-h-0 bg-card rounded-xl border border-border overflow-hidden flex flex-col animate-fade-in">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-shrink-0">
                <Icon name="MessageSquare" size={14} className="text-primary" />
                <p className="text-sm font-montserrat font-bold text-foreground flex-1">Чат урока</p>
                <button onClick={() => setChatOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <Icon name="X" size={15} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                <ChatPage user={user} preselect={chatPeers} panel />
              </div>
            </div>
          )}
        </div>

        {showHint && (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 animate-fade-in">
            <div className="pointer-events-auto flex items-start gap-2 max-w-md px-3 py-2 rounded-lg bg-foreground/90 text-background shadow-lg backdrop-blur-sm">
              <Icon name="Info" size={14} className="flex-shrink-0 mt-0.5" />
              <p className="text-[11px] sm:text-xs font-ibm leading-snug">
                Видео не открылось? Нажмите «В новом окне» и разрешите доступ к камере и микрофону.
              </p>
              <button onClick={() => setShowHint(false)} className="flex-shrink-0 opacity-70 hover:opacity-100">
                <Icon name="X" size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <div className="w-14 h-14 rounded-2xl red-accent flex items-center justify-center mx-auto mb-3">
          <Icon name="Video" size={26} className="text-white" />
        </div>
        <h2 className="font-montserrat font-bold text-lg text-foreground mb-1">Видеоурок</h2>
        <p className="text-sm text-muted-foreground font-ibm mb-5">
          Занятие проходит в видеоконференции на {JITSI_HOST}
        </p>
        <button onClick={() => startLesson()}
          className="inline-flex items-center gap-2 px-6 py-3 red-accent text-white rounded-xl text-sm font-montserrat font-bold hover:opacity-90 transition-opacity">
          <Icon name="Video" size={18} />
          Начать урок сейчас
        </button>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="font-montserrat font-bold text-sm text-foreground">Занятия сегодня</p>
        </div>
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground font-ibm">Загрузка...</div>
        ) : todayLessons.length === 0 ? (
          <div className="p-6 text-center">
            <Icon name="CalendarX" size={30} className="text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-ibm">На сегодня занятий нет</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todayLessons.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-montserrat font-bold text-primary text-xs">{l.lesson_time.slice(0, 5)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-montserrat font-bold text-sm text-foreground truncate">{l.topic}</p>
                  <p className="text-xs text-muted-foreground font-ibm">
                    {l.lesson_type} · {l.duration_min} мин
                    {l.students && l.students.length > 0 && ` · ${l.students.length} уч.`}
                  </p>
                </div>
                <button onClick={() => startLesson(l)}
                  className="flex items-center gap-1.5 px-3 py-2 red-accent text-white rounded-lg text-xs font-montserrat font-bold hover:opacity-90 transition-opacity flex-shrink-0">
                  <Icon name="Video" size={14} />
                  Начать урок
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="font-montserrat font-bold text-sm text-foreground">Ближайшие занятия</p>
          </div>
          <div className="divide-y divide-border">
            {upcoming.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon name="CalendarDays" size={16} className="text-muted-foreground flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-ibm text-foreground truncate">{l.topic}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(l.lesson_date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · {l.lesson_time.slice(0, 5)}
                  </p>
                </div>
                <button onClick={() => startLesson(l)}
                  className="px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-montserrat font-medium hover:bg-primary hover:text-white transition-colors flex-shrink-0">
                  Войти
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-4">
        <p className="font-montserrat font-bold text-sm text-foreground mb-2">Своя комната</p>
        <div className="flex gap-2">
          <input type="text" value={customRoom} placeholder="Название комнаты, например «разговорный клуб»"
            onChange={e => setCustomRoom(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") startCustom(); }}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          <button onClick={startCustom}
            className="px-4 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
            Открыть
          </button>
        </div>
      </div>
    </div>
  );
}