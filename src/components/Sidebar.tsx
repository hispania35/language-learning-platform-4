import { type Page } from "@/App";
import { type User } from "@/pages/LoginPage";
import Icon from "@/components/ui/icon";
import { useChatAlerts } from "@/hooks/useChatAlerts";

const studentNav = [
  { id: "dashboard" as Page, label: "Главная", icon: "LayoutDashboard" },
  { id: "calendar" as Page, label: "Календарь", icon: "CalendarDays" },
  { id: "lesson" as Page, label: "Начать урок", icon: "Video" },
  { id: "materials" as Page, label: "Материалы", icon: "BookOpen" },
  { id: "homework" as Page, label: "Домашние задания", icon: "ClipboardList", badge: 3 },
  { id: "exercises" as Page, label: "Интерактивные задания", icon: "Gamepad2" },
  { id: "chat" as Page, label: "Чат", icon: "MessageSquare" },
  { id: "profile" as Page, label: "Профиль", icon: "UserCircle" },
];

const teacherNav = [
  { id: "dashboard" as Page, label: "Главная", icon: "LayoutDashboard" },
  { id: "calendar" as Page, label: "Расписание", icon: "CalendarDays" },
  { id: "lesson" as Page, label: "Начать урок", icon: "Video" },
  { id: "materials" as Page, label: "Материалы", icon: "BookOpen" },
  { id: "homework" as Page, label: "Проверка заданий", icon: "ClipboardCheck", badge: 2 },
  { id: "exercises" as Page, label: "Интерактивные задания", icon: "Gamepad2" },
  { id: "chat" as Page, label: "Чат", icon: "MessageSquare" },
  { id: "students" as Page, label: "Ученики и группы", icon: "Users" },
  { id: "profile" as Page, label: "Профиль", icon: "UserCircle" },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onOpenSettings: () => void;
}

export default function Sidebar({ activePage, onNavigate, isOpen, onClose, user, onOpenSettings }: SidebarProps) {
  const navItems = user.role === "teacher" || user.role === "admin" ? teacherNav : studentNav;
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const { unread, soundOn, setSoundOn, inLesson } = useChatAlerts();

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      )}

      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          flex flex-col w-64 h-full sidebar-gradient
          transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className="px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Hispania 35"
              className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-white" />
            <div>
              <p className="font-montserrat font-bold text-sidebar-foreground text-sm leading-tight">Hispania 35</p>
              <p className="text-xs text-sidebar-foreground/50">Платформа обучения</p>
            </div>
          </div>
        </div>

        {/* User badge */}
        <div className="px-4 py-3 mx-3 mt-4 rounded-lg bg-sidebar-accent/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full red-accent flex items-center justify-center flex-shrink-0">
              <span className="text-white font-montserrat font-bold text-xs">{user.avatar}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sidebar-foreground font-medium text-xs truncate">{user.name}</p>
              <p className="text-sidebar-foreground/50 text-xs">
                {isTeacher ? "Преподаватель" : `Студент · Уровень ${user.level}`}
              </p>
            </div>
          </div>
        </div>

        {/* Role badge */}
        <div className="mx-4 mt-2">
          <span className={`inline-flex items-center gap-1.5 text-xs font-montserrat font-bold px-2 py-1 rounded-full ${
            isTeacher ? "bg-accent/20 text-accent" : "bg-sidebar-primary/30 text-sidebar-foreground/80"
          }`}>
            <Icon name={isTeacher ? "BookUser" : "GraduationCap"} size={11} />
            {isTeacher ? "Режим преподавателя" : "Режим студента"}
          </span>
        </div>

        {/* Nav */}
        <nav className="sidebar-scroll flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150
                  ${isActive
                    ? "bg-sidebar-primary text-white shadow-sm"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                  }
                `}
              >
                <Icon name={item.icon} size={18} className="flex-shrink-0" />
                <span className="font-ibm">{item.label}</span>
                {item.id === "chat" && unread > 0 ? (
                  <span className="ml-auto bg-accent text-accent-foreground text-xs font-bold px-1.5 py-0.5 rounded-full font-montserrat">
                    {unread > 99 ? "99+" : unread}
                  </span>
                ) : "badge" in item && item.badge ? (
                  <span className="ml-auto bg-accent text-accent-foreground text-xs font-bold px-1.5 py-0.5 rounded-full font-montserrat">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="flex-shrink-0 px-3 pb-4 border-t border-sidebar-border pt-3 space-y-1">
          <button onClick={() => setSoundOn(!soundOn)}
            title={inLesson ? "Во время урока звук приглушён" : soundOn ? "Выключить звук уведомлений" : "Включить звук уведомлений"}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-150">
            <Icon name={soundOn && !inLesson ? "Volume2" : "VolumeX"} size={18} />
            <span className="font-ibm">Звук сообщений</span>
            <span className={`ml-auto text-xs font-montserrat font-bold ${soundOn && !inLesson ? "text-accent" : "text-sidebar-foreground/40"}`}>
              {inLesson ? "урок" : soundOn ? "вкл" : "выкл"}
            </span>
          </button>

          <button onClick={() => { onOpenSettings(); onClose(); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-150">
            <Icon name="Settings" size={18} />
            <span className="font-ibm">Настройки</span>
          </button>
        </div>
      </aside>
    </>
  );
}