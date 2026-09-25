import { useState, useEffect } from "react";
import { type User } from "@/pages/LoginPage";
import Icon from "@/components/ui/icon";
import useStickyTab from "@/hooks/useStickyTab";
import { apiResetList, apiResetDo, apiGetProfileStats, type PasswordReset, type ProfileStats } from "@/lib/api";
import { fmtDateTime } from "@/lib/datetime";
import ProfileEditor from "@/components/ProfileEditor";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

const profileTabs = ["Профиль", "Статистика", "Рейтинг"];
const allTabs = [...profileTabs, "Сброс паролей"];
const tabCodes = ["profile", "stats", "rating", "passwords"] as const;

export default function ProfilePage({ user }: { user: User }) {
  const tabs = (user.role === "teacher" || user.role === "admin") ? [...profileTabs, "Сброс паролей"] : profileTabs;
  const [tabCode, setTabCode] = useStickyTab("sub", tabCodes, "profile");
  const fromUrl = allTabs[Math.max(0, tabCodes.indexOf(tabCode))];
  // Ученик мог прийти по ссылке на учительскую вкладку — показываем профиль
  const activeTab = tabs.includes(fromUrl) ? fromUrl : "Профиль";
  const setActiveTab = (t: string) => setTabCode(tabCodes[Math.max(0, allTabs.indexOf(t))]);

  const [stats, setStats] = useState<ProfileStats | null>(null);
  const isStudent = user.role !== "teacher" && user.role !== "admin";

  useEffect(() => {
    if (!isStudent) return;
    apiGetProfileStats().then(r => { if (!r.error) setStats(r); }).catch(() => {});
  }, [isStudent]);

  const [resets, setResets] = useState<PasswordReset[]>([]);
  const [resetsLoading, setResetsLoading] = useState(false);
  const [newPasswords, setNewPasswords] = useState<Record<number, string>>({});
  const [resetMsg, setResetMsg] = useState<Record<number, string>>({});

  useEffect(() => {
    if (activeTab === "Сброс паролей" && (user.role === "teacher" || user.role === "admin")) {
      setResetsLoading(true);
      apiResetList().then(res => {
        if (res.resets) setResets(res.resets);
        setResetsLoading(false);
      }).catch(() => setResetsLoading(false));
    }
  }, [activeTab, user.role]);

  const handleResetDo = async (r: PasswordReset) => {
    const pwd = newPasswords[r.id] || "";
    if (pwd.length < 6) { setResetMsg({ ...resetMsg, [r.id]: "Минимум 6 символов" }); return; }
    const res = await apiResetDo(r.id, r.user_id, pwd);
    if (res.ok) {
      setResets(prev => prev.filter(x => x.id !== r.id));
      setResetMsg({ ...resetMsg, [r.id]: "Пароль изменён!" });
    } else {
      setResetMsg({ ...resetMsg, [r.id]: res.error || "Ошибка" });
    }
  };

  // Ступени уровней: сколько занятий нужно пройти до следующего
  const LEVELS = [
    { code: "A1", need: 10 }, { code: "A2", need: 25 }, { code: "B1", need: 50 },
    { code: "B2", need: 80 }, { code: "C1", need: 120 }, { code: "C2", need: 160 },
  ];
  const doneLessons = stats?.lessons_done ?? 0;
  const step = LEVELS.find(l => doneLessons < l.need);
  const nextLevel = step ? LEVELS[LEVELS.indexOf(step)]?.code : null;
  const levelGoal = step?.need ?? LEVELS[LEVELS.length - 1].need;
  const levelPercent = Math.min(100, Math.round((doneLessons / levelGoal) * 100));

  const activityData = stats?.activity || [];
  const maxActivity = Math.max(1, ...activityData.map(a => a.count));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Profile header */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="h-24 red-accent" />
        <div className="px-6 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-8">
            <div className="w-16 h-16 rounded-2xl red-accent border-4 border-card flex items-center justify-center flex-shrink-0">
              <span className="text-white font-montserrat font-black text-xl">{user.avatar}</span>
            </div>
            <div className="flex-1">
              <h2 className="font-montserrat font-black text-xl text-foreground">{user.name}</h2>
              <p className="text-muted-foreground text-sm font-ibm">
                {(user.role === "teacher" || user.role === "admin") ? "Преподаватель" : "Студент"} · Испанский язык
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-center">
                <p className="font-montserrat font-black text-lg text-foreground">87</p>
                <p className="text-xs text-muted-foreground font-ibm">баллов</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="font-montserrat font-black text-lg text-foreground">B1</p>
                <p className="text-xs text-muted-foreground font-ibm">уровень</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center flex items-center gap-1">
                <span className="text-base">🔥</span>
                <div>
                  <p className="font-montserrat font-black text-lg text-foreground">15</p>
                  <p className="text-xs text-muted-foreground font-ibm">дней подряд</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-muted/40 rounded-xl p-1 w-fit flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-montserrat font-medium transition-all duration-150 ${
              activeTab === tab ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "Профиль" && (
        <div className="space-y-5">
          <ProfileEditor isTeacher={(user.role === "teacher" || user.role === "admin")} />

          {user.role !== "teacher" && (
            <div className="bg-card rounded-xl border border-border p-5 animate-fade-in">
              <h3 className="font-montserrat font-bold text-sm text-foreground mb-4">Достижения</h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {!stats && (
                  <p className="col-span-3 sm:col-span-6 text-xs text-muted-foreground font-ibm">
                    Загружаю достижения...
                  </p>
                )}
                {(stats?.achievements || []).map((a, i) => (
                  <div key={i} title={a.hint}
                    className={`rounded-xl p-3 text-center border transition-all ${a.earned ? "border-accent/30 bg-accent/5" : "border-border bg-muted/30 opacity-50"}`}>
                    <div className="text-2xl mb-1">{a.icon}</div>
                    <p className="text-xs font-montserrat font-medium text-foreground leading-tight">{a.title}</p>
                    <p className="text-[10px] text-muted-foreground font-ibm mt-0.5 leading-tight">{a.hint}</p>
                  </div>
                ))}
              </div>

              {stats && (
                <div className="mt-5 p-4 bg-muted/40 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-montserrat font-bold text-foreground">
                      {nextLevel ? `До уровня ${nextLevel}` : "Максимальный уровень"}
                    </span>
                    <span className="text-xs text-muted-foreground font-ibm">
                      {stats.lessons_done} / {levelGoal} {plural(levelGoal, "занятие", "занятия", "занятий")}
                    </span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div className="progress-bar h-2.5" style={{ width: `${levelPercent}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground font-ibm mt-1.5">
                    {nextLevel
                      ? `Осталось ${Math.max(levelGoal - stats.lessons_done, 0)} ${plural(Math.max(levelGoal - stats.lessons_done, 0), "занятие", "занятия", "занятий")}`
                      : "Вы прошли всю программу"}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "Статистика" && (
        <div className="space-y-5 animate-fade-in">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Всего занятий", value: String(stats?.lessons_done ?? 0), icon: "BookOpen",
                sub: stats?.streak ? `Серия: ${stats.streak} дн.` : "Начните заниматься" },
              { label: "Часов обучения", value: String(stats?.hours ?? 0), icon: "Clock",
                sub: "По расписанию занятий" },
              { label: "Средний балл", value: stats?.avg_grade ? String(stats.avg_grade) : "—", icon: "Star",
                sub: "Из 5 возможных" },
              { label: "Д/з сдано", value: `${stats?.hw_done ?? 0}/${stats?.hw_total ?? 0}`, icon: "ClipboardCheck",
                sub: stats?.hw_total ? `${Math.round((stats.hw_done / stats.hw_total) * 100)}% выполнено` : "Заданий пока нет" },
            ].map((s, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4">
                <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center mb-3">
                  <Icon name={s.icon} size={18} className="text-primary" />
                </div>
                <p className="font-montserrat font-black text-2xl text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground font-ibm">{s.label}</p>
                <p className="text-xs text-primary font-ibm mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Activity chart */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-montserrat font-bold text-sm text-foreground mb-4">Активность за последние 28 дней</h3>
            {!activityData.length && (
              <p className="text-xs text-muted-foreground font-ibm">Данных об активности пока нет</p>
            )}
            <div className="flex items-end gap-1 h-20">
              {activityData.map((a, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5"
                  title={`${a.date}: ${a.count || "нет"} ${a.count ? "событий" : "активности"}`}>
                  <div
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: `${Math.max((a.count / maxActivity) * 100, a.count ? 8 : 3)}%`,
                      background: a.count === 0 ? "hsl(0 0% 88%)"
                        : a.count >= maxActivity * 0.7 ? "hsl(0 72% 35%)"
                        : a.count >= maxActivity * 0.4 ? "hsl(0 72% 35% / 0.6)"
                        : "hsl(0 72% 35% / 0.3)",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground font-ibm mt-2">
              <span>28 дней назад</span>
              <span>Сегодня</span>
            </div>
          </div>

          {/* Grades by subject */}
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-montserrat font-bold text-sm text-foreground mb-4">Успеваемость по темам</h3>
            <div className="space-y-3">
              {!stats?.by_topic?.length && (
                <p className="text-xs text-muted-foreground font-ibm">
                  Пока нет оценённых работ — здесь появится успеваемость по темам
                </p>
              )}
              {(stats?.by_topic || []).map((t, i) => (
                <div key={i}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-ibm text-foreground">{t.topic}</span>
                    <span className="font-montserrat font-bold text-primary">{t.score}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full">
                    <div className="progress-bar h-2" style={{ width: `${t.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "Рейтинг" && (
        <div className="bg-card rounded-xl border border-border overflow-hidden animate-fade-in">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-montserrat font-bold text-sm text-foreground">Рейтинг учеников</h3>
            <span className="text-xs text-muted-foreground font-ibm">По занятиям и оценкам</span>
          </div>
          <div className="divide-y divide-border">
            {!stats?.leaderboard?.length && (
              <p className="px-5 py-6 text-xs text-muted-foreground font-ibm text-center">
                Рейтинг появится, когда пройдут первые занятия
              </p>
            )}
            {(stats?.leaderboard || []).map((s, i) => (
              <div key={s.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${s.is_me ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                <div className={`w-8 text-center font-montserrat font-black text-lg flex-shrink-0 ${
                  i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-700" : "text-muted-foreground"
                }`}>
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}
                </div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold font-montserrat ${s.is_me ? "red-accent text-white" : "bg-muted text-muted-foreground"}`}>
                  {s.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium font-ibm ${s.is_me ? "text-primary font-bold" : "text-foreground"}`}>{s.name}</p>
                    {s.is_me && <span className="text-xs text-muted-foreground">(вы)</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-montserrat font-bold">{s.level}</span>
                    <span className="text-xs text-muted-foreground font-ibm">
                      {s.lessons} {plural(s.lessons, "занятие", "занятия", "занятий")}
                      {s.grade > 0 && ` · балл ${s.grade}`}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-montserrat font-black text-lg text-foreground">{s.score}</p>
                  <p className="text-xs text-muted-foreground font-ibm">баллов</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


      {activeTab === "Сброс паролей" && (user.role === "teacher" || user.role === "admin") && (
        <div className="animate-fade-in space-y-4">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2">
              <Icon name="KeyRound" size={16} className="text-primary" />
              <p className="font-montserrat font-bold text-sm text-foreground">Заявки на сброс пароля</p>
            </div>
            {resetsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground font-ibm">Загрузка...</div>
            ) : resets.length === 0 ? (
              <div className="p-8 text-center">
                <Icon name="CheckCircle" size={32} className="text-green-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground font-ibm">Нет активных заявок</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {resets.map(r => (
                  <div key={r.id} className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl red-accent flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{r.name.slice(0,2).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-montserrat font-bold text-sm text-foreground">{r.name}</p>
                        <p className="text-xs text-muted-foreground font-ibm">{r.email}</p>
                      </div>
                      <p className="ml-auto text-xs text-muted-foreground font-ibm">
                        {fmtDateTime(r.created_at)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Новый пароль (мин. 6 символов)"
                        value={newPasswords[r.id] || ""}
                        onChange={e => setNewPasswords({ ...newPasswords, [r.id]: e.target.value })}
                        className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
                      />
                      <button
                        onClick={() => handleResetDo(r)}
                        className="px-4 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 transition-opacity">
                        Сбросить
                      </button>
                    </div>
                    {resetMsg[r.id] && (
                      <p className="text-xs font-ibm text-green-600">{resetMsg[r.id]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}