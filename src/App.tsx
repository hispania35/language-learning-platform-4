import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "./pages/Dashboard";
import CalendarPage from "./pages/CalendarPage";
import MaterialsPage from "./pages/MaterialsPage";
import HomeworkPage from "./pages/HomeworkPage";
import ProfilePage from "./pages/ProfilePage";
import StudentsPage from "./pages/StudentsPage";
import ChatPage from "./pages/ChatPage";
import LessonRoomPage from "./pages/LessonRoomPage";
import LoginPage, { type User } from "./pages/LoginPage";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import ChatToasts from "./components/ChatToasts";
import { ChatAlertsProvider } from "./hooks/useChatAlerts";
import { apiMe, apiLogout } from "./lib/api";

export type Page = "dashboard" | "calendar" | "lesson" | "materials" | "homework" | "students" | "chat" | "profile";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<Page>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lessonRoom, setLessonRoom] = useState<string | null>(null);
  const [chatPreselect, setChatPreselect] = useState<number[] | null>(null);

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
        localStorage.setItem("hispania_user", JSON.stringify(u));
      } else if (res.error) {
        localStorage.removeItem("hispania_token");
        localStorage.removeItem("hispania_user");
        setUser(null);
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const handleLogin = (u: User) => {
    localStorage.setItem("hispania_user", JSON.stringify(u));
    setUser(u);
    setActivePage("dashboard");
  };

  const handleLogout = async () => {
    await apiLogout();
    localStorage.removeItem("hispania_user");
    setUser(null);
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
      case "students": return <StudentsPage user={user} />;
      case "chat": return <ChatPage user={user} preselect={chatPreselect} />;
      case "profile": return <ProfilePage user={user} />;
      default: return (
        <Dashboard user={user} onNavigate={setActivePage}
          onOpenChat={(peerId) => { setChatPreselect(peerId ? [peerId] : null); setActivePage("chat"); }} />
      );
    }
  };

  return (
    <TooltipProvider>
    <ChatAlertsProvider enabled={!!user}>
      <Toaster />
      <ChatToasts onNavigate={setActivePage} />
      <div className="flex h-[100dvh] bg-background overflow-hidden">
        <Sidebar
          activePage={activePage}
          onNavigate={(p) => { setActivePage(p); setSidebarOpen(false); }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          user={user}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            activePage={activePage}
            onMenuClick={() => setSidebarOpen(true)}
            user={user}
            onLogout={handleLogout}
            onNavigate={setActivePage}
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
          />
          <main className={`flex-1 min-h-0 p-3 sm:p-4 md:p-6 ${activePage === "chat" ? "overflow-hidden" : "overflow-y-auto"}`}>
            <div className={`animate-fade-in ${activePage === "lesson" || activePage === "chat" ? "h-full" : ""}`} key={activePage}>
              {renderPage()}
            </div>
          </main>
        </div>
      </div>
    </ChatAlertsProvider>
    </TooltipProvider>
  );
}