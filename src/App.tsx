import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import MaterialsPage from "./pages/MaterialsPage";
import HomeworkPage from "./pages/HomeworkPage";
import ExercisesPage from "./pages/ExercisesPage";
import ProfilePage from "./pages/ProfilePage";
import StudentsPage from "./pages/StudentsPage";
import ChatPage from "./pages/ChatPage";
import LessonRoomPage from "./pages/LessonRoomPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage, { type User } from "./pages/LoginPage";
import TeacherPicker from "@/components/TeacherPicker";
import Sidebar from "./components/Sidebar";
import HelpDialog from "./components/HelpDialog";
import { TimezoneProvider } from "./hooks/useTimezone";
import TopBar from "./components/TopBar";
import ChatToasts from "./components/ChatToasts";
import { ChatAlertsProvider } from "./hooks/useChatAlerts";
import { SettingsProvider } from "./hooks/useSettings";
import { apiMe, apiLogout, apiGetSupport } from "./lib/api";
import { setPlatform } from "./lib/videoPlatform";

export type Page = "dashboard" | "calendar" | "lesson" | "materials" | "homework" | "exercises" | "students" | "chat" | "profile" | "settings";

const PAGES: Page[] = ["dashboard", "calendar", "lesson", "materials", "homework",
  "exercises", "students", "chat", "profile", "settings"];

const LAST_PLACE = "hispania_last_place";

/** Вкладка запоминается в адресе — обновление страницы возвращает туда же */
const pageFromUrl = (): Page => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("room")) return "lesson";
  const p = params.get("tab") as Page | null;
  // "lesson" без кода комнаты открывать нельзя — там нечего показывать
  return p && p !== "lesson" && PAGES.includes(p) ? p : "dashboard";
};

/** Последнее место, где работал этот пользователь */
const readLastPlace = (): { userId: number; page: Page; sub?: string } | null => {
  try {
    const raw = localStorage.getItem(LAST_PLACE);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.userId || !PAGES.includes(v.page) || v.page === "lesson") return null;
    return v;
  } catch {
    return null;
  }
};

/**
 * Куда открыть приложение на старте.
 * Адрес важнее памяти: если в ссылке указан раздел — идём туда.
 * Иначе возвращаем пользователя туда, где он закончил.
 */
const initialPage = (): Page => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("room")) return "lesson";
  if (params.get("tab")) return pageFromUrl();

  const last = readLastPlace();
  if (!last) return "dashboard";

  // Память принадлежит конкретному человеку — чужую не применяем
  let cachedId: number | null = null;
  try {
    cachedId = JSON.parse(localStorage.getItem("hispania_user") || "null")?.id ?? null;
  } catch {
    cachedId = null;
  }
  if (!cachedId || cachedId !== last.userId) return "dashboard";
  if (!localStorage.getItem("hispania_token")) return "dashboard";

  // Кладём раздел и внутреннюю вкладку в адрес до того, как страницы отрисуются
  params.set("tab", last.page);
  if (last.sub) params.set("sub", last.sub);
  window.history.replaceState(null, "", window.location.pathname + `?${params.toString()}`);
  return last.page;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<Page>(initialPage);
  const [needTeacher, setNeedTeacher] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpNew, setHelpNew] = useState(0);
  const [checking, setChecking] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lessonRoom, setLessonRoom] = useState<string | null>(() => {
    const r = new URLSearchParams(window.location.search).get("room");
    if (!r) return null;
    setPlatform("webrtc");
    return r.trim();
  });
  const [chatPreselect, setChatPreselect] = useState<number[] | null>(null);
  const kbOpen = useKeyboardOpen();

  const loadHelpCount = () => {
    apiGetSupport()
      .then(r => setHelpNew(r.unread || 0))
      .catch(() => {});
  };

  useEffect(() => {
    if (!user) return;
    loadHelpCount();
    const t = setInterval(loadHelpCount, 60000);
    return () => clearInterval(t);
  }, [user?.id]);

  // Реальная высота видимой области (мобильные браузеры прячут/показывают панели)
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv?.height || window.innerHeight;
      document.documentElement.style.setProperty("--app-h", `${Math.round(h)}px`);
    };
    apply();
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
    };
  }, []);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("room")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Восстановить сессию: сразу из кеша, затем сверить с сервером
  useEffect(() => {
    const token = localStorage.getItem("hispania_token");
    if (!token) { setChecking(false); return; }

    const cached = localStorage.getItem("hispania_user");
    if (cached) {
      try { setUser(JSON.parse(cached) as User); setChecking(false); } catch { /* ignore */ }
    }

    apiMe().then(res => {
      if (res.user) {
        const u: User = { id: res.user.id, name: res.user.name, role: res.user.role, level: res.user.level, avatar: res.user.avatar };
        setUser(u);
        setNeedTeacher(!!res.need_teacher);
        localStorage.setItem("hispania_user", JSON.stringify(u));
      } else if (res.error) {
        localStorage.removeItem("hispania_token");
        localStorage.removeItem("hispania_user");
        localStorage.removeItem(LAST_PLACE);
        setUser(null);
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  // Адрес всегда отражает открытую вкладку — обновление не сбрасывает на главную
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("room")) return;
    if (params.get("tab") === activePage) return;
    if (activePage === "dashboard" || activePage === "lesson") params.delete("tab");
    else params.set("tab", activePage);
    // Внутренняя вкладка принадлежит прежнему разделу — уносить её с собой нельзя
    params.delete("sub");
    const q = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
  }, [activePage, user]);

  // Кнопки «назад» и «вперёд» в браузере переключают вкладки
  useEffect(() => {
    const onPop = () => setActivePage(pageFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Запоминаем последнее место работы — чтобы вернуть сюда при следующем входе
  useEffect(() => {
    if (!user || activePage === "lesson") return;
    const save = () => {
      const sub = new URLSearchParams(window.location.search).get("sub") || undefined;
      localStorage.setItem(LAST_PLACE, JSON.stringify({ userId: user.id, page: activePage, sub }));
    };
    save();
    // Внутреннюю вкладку переключают без смены раздела — подхватываем её отдельно
    const t = setInterval(save, 2000);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", save);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", save);
      save();
    };
  }, [activePage, user]);

  const handleLogin = (u: User, needsTeacher?: boolean) => {
    localStorage.setItem("hispania_user", JSON.stringify(u));
    setUser(u);
    setNeedTeacher(!!needsTeacher);
    if (lessonRoom) { setActivePage("lesson"); return; }

    const params = new URLSearchParams(window.location.search);
    if (params.get("tab")) { setActivePage(pageFromUrl()); return; }

    // Возвращаем человека туда, где он закончил в прошлый раз
    const last = readLastPlace();
    if (last && last.userId === u.id) {
      params.set("tab", last.page);
      if (last.sub) params.set("sub", last.sub);
      window.history.replaceState(null, "", window.location.pathname + `?${params.toString()}`);
      setActivePage(last.page);
    } else {
      setActivePage("dashboard");
    }
  };

  const handleLogout = async () => {
    await apiLogout();
    localStorage.removeItem("hispania_user");
    localStorage.removeItem(LAST_PLACE);
    window.history.replaceState(null, "", window.location.pathname);
    setUser(null);
    setActivePage("dashboard");
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl red-accent flex items-center justify-center">
            <span className="font-montserrat font-black text-white">H</span>
          </div>
          <p className="text-muted-foreground text-sm font-ibm">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <TooltipProvider>
        <LoginPage onLogin={handleLogin} />
      </TooltipProvider>
    );
  }

  // Ученик без преподавателя выбирает его один раз
  if (needTeacher && user.role === "student") {
    return (
      <TooltipProvider>
        <TeacherPicker userName={user.name} onDone={() => setNeedTeacher(false)} />
      </TooltipProvider>
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case "dashboard": return (
        <Dashboard user={user} onNavigate={setActivePage}
          onOpenChat={(peerId) => { setChatPreselect(peerId ? [peerId] : null); setActivePage("chat"); }} />
      );
      case "calendar": return <CalendarPage user={user} onJoinLesson={(room) => { setLessonRoom(room); setActivePage("lesson"); }} />;
      case "lesson": return <LessonRoomPage user={user} initialRoom={lessonRoom} onLeave={() => setLessonRoom(null)} />;
      case "materials": return <MaterialsPage user={user} />;
      case "homework": return <HomeworkPage user={user} />;
      case "exercises": return <ExercisesPage user={user} />;
      case "students": return <StudentsPage user={user} />;
      case "chat": return <ChatPage user={user} preselect={chatPreselect} />;
      case "profile": return <ProfilePage user={user} />;
      case "settings": return <SettingsPage user={user} />;
      default: return (
        <Dashboard user={user} onNavigate={setActivePage}
          onOpenChat={(peerId) => { setChatPreselect(peerId ? [peerId] : null); setActivePage("chat"); }} />
      );
    }
  };

  return (
    <TooltipProvider>
    <SettingsProvider enabled={!!user}>
    <TimezoneProvider enabled={!!user}>
    <ChatAlertsProvider enabled={!!user}>
      <Toaster />
      <ChatToasts onNavigate={setActivePage} />
      <div className="flex bg-background overflow-hidden"
        style={{ height: "var(--app-h, 100dvh)" }}>
        <Sidebar
          activePage={activePage}
          onNavigate={(p) => { setActivePage(p); setSidebarOpen(false); }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={user}
          onOpenSettings={() => { setActivePage("settings"); setSidebarOpen(false); }}
          onOpenHelp={() => setHelpOpen(true)}
          helpBadge={helpNew}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <div className={kbOpen && (activePage === "chat" || activePage === "lesson") ? "hidden md:block" : ""}>
          <TopBar
            activePage={activePage}
            onMenuClick={() => setSidebarOpen(true)}
            user={user}
            onLogout={handleLogout}
            onNavigate={setActivePage}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
          />
          </div>
          <main className={`page-scroll flex-1 min-h-0 p-3 sm:p-4 md:p-6 ${activePage === "chat" || activePage === "lesson" ? "overflow-hidden" : "overflow-y-auto"} ${kbOpen ? "pt-2 pb-2" : ""}`}>
            <div className={`animate-fade-in ${activePage === "lesson" || activePage === "chat" ? "h-full" : ""}`} key={activePage}>
              {renderPage()}
            </div>
          </main>
        </div>
      </div>

      {helpOpen && (
        <HelpDialog
          isAdmin={user.role === "admin"}
          onClose={() => { setHelpOpen(false); loadHelpCount(); }}
        />
      )}
    </ChatAlertsProvider>
    </TimezoneProvider>
    </SettingsProvider>
    </TooltipProvider>
  );
}