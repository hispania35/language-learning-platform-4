import { useState, useEffect } from "react";
import { type Page } from "@/App";
import { type User } from "@/pages/LoginPage";
import { apiGetNotifications, apiMarkNotificationsRead, apiChangePassword, apiGetMaterials, apiGetHomework, apiGetCalendar, type Notification, type Material, type HomeworkItem, type Lesson } from "@/lib/api";
import Icon from "@/components/ui/icon";
import PLATFORMS, { getPlatform, setPlatform, getPlatformLink, setPlatformLink, type VideoPlatform } from "@/lib/videoPlatform";

const pageTitles: Record<Page, string> = {
  dashboard: "Главная",
  calendar: "Календарь занятий",
  lesson: "Видеоурок",
  materials: "Учебные материалы",
  homework: "Домашние задания",
  students: "Ученики и группы",
  chat: "Чат",
  profile: "Мой профиль",
};

interface TopBarProps {
  activePage: Page;
  onMenuClick: () => void;
  user: User;
  onLogout: () => void;
  onNavigate: (page: Page) => void;
  settingsOpen?: boolean;
  onSettingsOpenChange?: (open: boolean) => void;
}

const notifyMeta: Record<string, { page: Page; icon: string; cls: string }> = {
  calendar: { page: "calendar", icon: "CalendarDays", cls: "bg-primary/10 text-primary" },
  homework: { page: "homework", icon: "ClipboardList", cls: "bg-amber-100 text-amber-700" },
  material: { page: "materials", icon: "FolderOpen", cls: "bg-blue-100 text-blue-700" },
  chat: { page: "chat", icon: "MessageSquare", cls: "bg-green-100 text-green-700" },
  system: { page: "profile", icon: "Settings", cls: "bg-muted text-muted-foreground" },
};

export default function TopBar({ activePage, onMenuClick, user, onLogout, onNavigate, settingsOpen, onSettingsOpenChange }: TopBarProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [localSettings, setLocalSettings] = useState(false);
  const showSettings = settingsOpen ?? localSettings;
  const [platform, setPlatformState] = useState<VideoPlatform>(getPlatform());
  const [platformLink, setPlatformLinkState] = useState(getPlatformLink(getPlatform()));

  useEffect(() => {
    setPlatformLinkState(getPlatformLink(platform));
  }, [platform]);
  const setShowSettings = (v: boolean) => { onSettingsOpenChange ? onSettingsOpenChange(v) : setLocalSettings(v); };
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [settingsSuccess, setSettingsSuccess] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchData, setSearchData] = useState<{ materials: Material[]; homework: HomeworkItem[]; lessons: Lesson[] } | null>(null);

  useEffect(() => {
    apiGetNotifications().then(res => {
      if (res.notifications) setNotifications(res.notifications);
      if (res.unread !== undefined) setUnread(res.unread);
    });
    Promise.all([apiGetMaterials(), apiGetHomework(), apiGetCalendar()]).then(([m, h, c]) => {
      setSearchData({
        materials: m.materials || [],
        homework: h.homework || [],
        lessons: c.lessons || [],
      });
    });
  }, []);

  const searchResults = searchData && search.trim() ? {
    materials: searchData.materials.filter(m => m.title.toLowerCase().includes(search.toLowerCase())).slice(0, 4),
    homework: searchData.homework.filter(h => h.title.toLowerCase().includes(search.toLowerCase())).slice(0, 4),
    lessons: searchData.lessons.filter(l => l.title.toLowerCase().includes(search.toLowerCase()) || l.topic.toLowerCase().includes(search.toLowerCase())).slice(0, 4),
  } : null;

  const hasResults = searchResults && (searchResults.materials.length > 0 || searchResults.homework.length > 0 || searchResults.lessons.length > 0);

  const handleOpenNotifications = () => {
    setShowNotifications(!showNotifications);
    setShowUserMenu(false);
    if (!showNotifications && unread > 0) {
      apiMarkNotificationsRead().then(() => setUnread(0));
    }
  };

  const openNotification = (n: Notification) => {
    const meta = notifyMeta[n.type] || notifyMeta.system;
    setShowNotifications(false);
    onNavigate(meta.page);
    if (!n.is_read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
      if (diff < 60) return `${diff} мин назад`;
      if (diff < 1440) return `${Math.floor(diff/60)} ч назад`;
      return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    } catch { return ""; }
  };

  const handleChangePassword = async () => {
    setSettingsError("");
    setSettingsSuccess("");
    if (!oldPassword || !newPassword) {
      setSettingsError("Заполните оба поля");
      return;
    }
    if (newPassword.length < 6) {
      setSettingsError("Новый пароль должен быть не менее 6 символов");
      return;
    }
    setSettingsLoading(true);
    try {
      const res = await apiChangePassword(oldPassword, newPassword);
      if (res.error) {
        setSettingsError(res.error);
      } else {
        setSettingsSuccess("Пароль успешно изменён");
        setOldPassword("");
        setNewPassword("");
      }
    } catch {
      setSettingsError("Ошибка соединения");
    }
    setSettingsLoading(false);
  };

  return (
    <header className="h-14 bg-card border-b border-border flex items-center px-4 md:px-6 gap-4 flex-shrink-0 relative">
      <button onClick={onMenuClick} className="md:hidden p-1.5 rounded-md hover:bg-muted transition-colors">
        <Icon name="Menu" size={20} className="text-foreground" />
      </button>

      <div className="flex-1">
        <h1 className="font-montserrat font-bold text-foreground text-base md:text-lg">
          {pageTitles[activePage]}
        </h1>
      </div>

      <div className="relative hidden md:block z-50">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 w-48">
          <Icon name="Search" size={15} className="text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={e => { setSearch(e.target.value); setShowSearchResults(true); }}
            onFocus={() => setShowSearchResults(true)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full font-ibm"
          />
          {search && (
            <button onClick={() => { setSearch(""); setShowSearchResults(false); }}>
              <Icon name="X" size={13} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {showSearchResults && search.trim() && (
          <div className="absolute left-0 top-10 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-scale-in max-h-96 overflow-y-auto">
            {!hasResults ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground font-ibm">Ничего не найдено</div>
            ) : (
              <div className="py-1">
                {searchResults!.materials.length > 0 && (
                  <div className="px-2 py-1.5">
                    <p className="px-2 text-xs text-muted-foreground font-montserrat font-bold uppercase mb-1">Материалы</p>
                    {searchResults!.materials.map(m => (
                      <button key={m.id} onClick={() => { onNavigate("materials"); setShowSearchResults(false); setSearch(""); }}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted text-left transition-colors">
                        <Icon name="FileText" size={14} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground font-ibm truncate">{m.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults!.homework.length > 0 && (
                  <div className="px-2 py-1.5 border-t border-border">
                    <p className="px-2 text-xs text-muted-foreground font-montserrat font-bold uppercase mb-1">Домашние задания</p>
                    {searchResults!.homework.map(h => (
                      <button key={h.id} onClick={() => { onNavigate("homework"); setShowSearchResults(false); setSearch(""); }}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted text-left transition-colors">
                        <Icon name="ClipboardList" size={14} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground font-ibm truncate">{h.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults!.lessons.length > 0 && (
                  <div className="px-2 py-1.5 border-t border-border">
                    <p className="px-2 text-xs text-muted-foreground font-montserrat font-bold uppercase mb-1">Занятия</p>
                    {searchResults!.lessons.map(l => (
                      <button key={l.id} onClick={() => { onNavigate("calendar"); setShowSearchResults(false); setSearch(""); }}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted text-left transition-colors">
                        <Icon name="CalendarDays" size={14} className="text-muted-foreground flex-shrink-0" />
                        <span className="text-sm text-foreground font-ibm truncate">{l.title || l.topic}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={handleOpenNotifications}
          className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        >
          <Icon name="Bell" size={20} className="text-muted-foreground" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-accent text-accent-foreground text-xs font-bold rounded-full flex items-center justify-center font-montserrat leading-none">
              {unread}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute right-0 top-12 w-80 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-scale-in">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="font-montserrat font-bold text-sm text-foreground">Уведомления</span>
              <span
                className="text-xs text-primary font-medium cursor-pointer hover:underline"
                onClick={() => {
                  apiMarkNotificationsRead().then(() => {
                    setUnread(0);
                    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                  });
                }}
              >Прочитать все</span>
            </div>
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground font-ibm">Нет уведомлений</div>
              ) : notifications.map((n) => {
                const meta = notifyMeta[n.type] || notifyMeta.system;
                return (
                  <button key={n.id} onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors group ${!n.is_read ? "bg-primary/5" : ""}`}>
                    <div className="flex gap-2.5 items-start">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.cls}`}>
                        <Icon name={meta.icon} size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground font-ibm leading-snug">{n.text}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          {formatTime(n.created_at)}
                          <span className="text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            · открыть {pageTitles[meta.page].toLowerCase()}
                          </span>
                        </p>
                      </div>
                      {!n.is_read && <div className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
          className="flex items-center gap-2 p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <div className="w-8 h-8 rounded-full red-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white font-montserrat font-bold text-xs">{user.avatar}</span>
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-montserrat font-bold text-foreground leading-none">{user.name.split(" ")[0]}</p>
            <p className="text-xs text-muted-foreground font-ibm">{user.role === "teacher" ? "Преподаватель" : "Студент"}</p>
          </div>
          <Icon name="ChevronDown" size={14} className="text-muted-foreground hidden md:block" />
        </button>

        {showUserMenu && (
          <div className="absolute right-0 top-12 w-52 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-scale-in">
            <div className="px-4 py-3 border-b border-border">
              <p className="font-montserrat font-bold text-sm text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground font-ibm">{user.role === "teacher" ? "Преподаватель" : `Студент · ${user.level}`}</p>
            </div>
            <div className="py-1">
              <button
                onClick={() => { onNavigate("profile"); setShowUserMenu(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors font-ibm"
              >
                <Icon name="UserCircle" size={16} className="text-muted-foreground" />
                Мой профиль
              </button>
              <button
                onClick={() => { setShowSettings(true); setShowUserMenu(false); setSettingsError(""); setSettingsSuccess(""); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors font-ibm"
              >
                <Icon name="Settings" size={16} className="text-muted-foreground" />
                Настройки
              </button>
              <div className="border-t border-border mt-1 pt-1">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors font-ibm"
                >
                  <Icon name="LogOut" size={16} />
                  Выйти
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {(showNotifications || showUserMenu || showSearchResults) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowNotifications(false); setShowUserMenu(false); setShowSearchResults(false); }} />
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowSettings(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-montserrat font-bold text-base text-foreground">Настройки</h2>
              <button onClick={() => setShowSettings(false)} className="p-1 rounded-md hover:bg-muted transition-colors">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            </div>

            <p className="text-xs font-montserrat font-bold text-foreground mb-2">Видеоконференция по умолчанию</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {PLATFORMS.map(p => (
                <button
                  key={p.id}
                  disabled={p.disabled}
                  onClick={() => { if (!p.disabled) { setPlatformState(p.id); setPlatform(p.id); } }}
                  className={`flex items-start gap-2 px-2.5 py-2 rounded-lg border text-left transition-colors
                    ${p.disabled
                      ? "border-border bg-muted/40 opacity-50 cursor-not-allowed"
                      : platform === p.id
                        ? "red-accent text-white border-transparent"
                        : "border-border hover:bg-muted text-foreground"}`}>
                  <Icon name={p.icon} size={15} className="flex-shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-xs font-montserrat font-bold truncate">{p.name}</span>
                    <span className={`block text-[10px] font-ibm leading-tight ${platform === p.id && !p.disabled ? "text-white/80" : "text-muted-foreground"}`}>
                      {p.hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {PLATFORMS.find(p => p.id === platform)?.needsLink && (
              <input
                value={platformLink}
                onChange={e => { setPlatformLinkState(e.target.value); setPlatformLink(platform, e.target.value); }}
                placeholder="Ссылка на постоянную комнату"
                className="w-full px-3 py-2 mb-4 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
              />
            )}

            <div className="h-px bg-border mb-4" />

            <p className="text-xs font-montserrat font-bold text-foreground mb-3">Сменить пароль</p>
            <div className="space-y-3">
              <input
                type="password"
                placeholder="Текущий пароль"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
              />
              <input
                type="password"
                placeholder="Новый пароль (мин. 6 символов)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
              />
              {settingsError && <p className="text-xs text-red-600 font-ibm">{settingsError}</p>}
              {settingsSuccess && <p className="text-xs text-green-600 font-ibm">{settingsSuccess}</p>}
              <button
                onClick={handleChangePassword}
                disabled={settingsLoading}
                className="w-full py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {settingsLoading ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}