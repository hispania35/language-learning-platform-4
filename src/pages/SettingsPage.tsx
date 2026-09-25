import { useState } from "react";
import { type User } from "@/pages/LoginPage";
import Icon from "@/components/ui/icon";
import { useSettings, HOME_BLOCKS } from "@/hooks/useSettings";
import { PLATFORMS, DEFAULT_JITSI_HOST, type VideoPlatform } from "@/lib/videoPlatform";
import { apiChangePassword, type HomeBlockPref } from "@/lib/api";
import AdminEmailBlock from "@/components/settings/AdminEmailBlock";
import PeopleManager from "@/components/settings/PeopleManager";
import RegistrationToggle from "@/components/settings/RegistrationToggle";
import TimezoneBlock from "@/components/settings/TimezoneBlock";

interface Props {
  user: User;
}

function Section({
  num, title, hint, icon, disabled, children,
}: {
  num: number; title: string; hint: string; icon: string; disabled?: boolean; children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`bg-card border border-border rounded-xl overflow-hidden ${disabled ? "opacity-60" : ""}`}>
      <button
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className={`w-full flex items-center gap-3 px-4 py-4 text-left ${disabled ? "cursor-default" : "hover:bg-muted/50"} transition-colors`}
      >
        <span className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
          <Icon name={icon} size={18} className={disabled ? "text-muted-foreground" : "text-primary"} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="font-montserrat font-bold text-sm text-foreground">{num}. {title}</span>
            {disabled && (
              <span className="px-2 py-0.5 rounded-md bg-muted text-[11px] font-montserrat font-medium text-muted-foreground">
                Скоро
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-foreground font-ibm mt-0.5">{hint}</span>
        </span>
        {!disabled && (
          <Icon name={open ? "ChevronUp" : "ChevronDown"} size={18} className="text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {open && !disabled && (
        <div className="px-4 pb-4 pt-1 border-t border-border animate-fade-in">{children}</div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left"
    >
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-montserrat font-medium text-foreground">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground font-ibm mt-0.5">{hint}</span>}
      </span>
      <span className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${on ? "bg-primary" : "bg-muted-foreground/30"}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.125rem]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function PasswordBlock({ isAdmin }: { isAdmin: boolean }) {
  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [code, setCode] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [hint, setHint] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setDone("");
    if (!oldPass || !newPass) { setErr("Заполните оба поля"); return; }
    if (newPass.length < 6) { setErr("Новый пароль должен быть не менее 6 символов"); return; }
    setBusy(true);
    const res = await apiChangePassword(oldPass, newPass, needCode ? code : undefined).catch(() => null);
    setBusy(false);

    if (!res) { setErr("Нет связи с сервером"); return; }
    if (res.need_code) {
      setNeedCode(true);
      setHint(res.hint || "");
      setDone("");
      return;
    }
    if (res.error) { setErr(res.error); return; }
    setDone("Пароль изменён");
    setOldPass(""); setNewPass(""); setCode(""); setNeedCode(false);
  };

  return (
    <div className="mt-2 space-y-3">
      {isAdmin && (
        <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">
          Вход и смена пароля администратора подтверждаются кодом из письма.
        </p>
      )}

      <input type="password" value={oldPass} onChange={e => { setOldPass(e.target.value); setErr(""); }}
        placeholder="Текущий пароль" autoComplete="current-password"
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />

      <input type="password" value={newPass} onChange={e => { setNewPass(e.target.value); setErr(""); }}
        placeholder="Новый пароль (минимум 6 символов)" autoComplete="new-password"
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />

      {needCode && (
        <div>
          <p className="text-xs text-muted-foreground font-ibm mb-1.5">
            Код из письма{hint ? ` на ${hint}` : ""}
          </p>
          <input value={code} inputMode="numeric"
            onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setErr(""); }}
            placeholder="000000"
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-center text-lg font-montserrat font-black tracking-[0.4em] outline-none focus:border-primary/40" />
        </div>
      )}

      {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}
      {done && <p className="text-xs text-green-700 font-ibm">{done}</p>}

      <button onClick={submit} disabled={busy}
        className="px-4 py-2 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-50">
        {busy ? "Сохраняю..." : needCode ? "Подтвердить код и сменить" : "Сменить пароль"}
      </button>
    </div>
  );
}

export default function SettingsPage({ user }: Props) {
  const { settings, inherited, update } = useSettings();
  const isAdmin = user.role === "admin";
  const isTeacher = user.role === "teacher" || isAdmin;
  const blocks: HomeBlockPref[] = settings.home_blocks;

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const next = [...blocks];
    const to = idx + dir;
    if (to < 0 || to >= next.length) return;
    [next[idx], next[to]] = [next[to], next[idx]];
    update({ home_blocks: next });
  };

  const toggleBlock = (id: string) => {
    update({ home_blocks: blocks.map(b => (b.id === id ? { ...b, on: !b.on } : b)) });
  };

  const platformLocked = !isTeacher && inherited.includes("video_platform");
  const scheduleLocked = !isTeacher && inherited.includes("schedule_mode");
  const activePlatform = settings.video_platform as VideoPlatform;
  const needsLink = PLATFORMS.find(p => p.id === activePlatform)?.needsLink;

  return (
    <div className="max-w-3xl mx-auto space-y-3 pb-6">
      <div className="mb-1">
        <h1 className="font-montserrat font-black text-xl sm:text-2xl text-foreground">Настройки</h1>
        <p className="text-sm text-muted-foreground font-ibm mt-1">
          Разделы платформы под себя. Изменения сохраняются сразу.
        </p>
      </div>

      <Section num={1} title="Главная страница" icon="LayoutDashboard"
        hint="Какие блоки показывать и в каком порядке">
        <p className="text-xs text-muted-foreground font-ibm mb-3 mt-2">
          Выключенные блоки пропадут с главной. Стрелками меняйте порядок.
        </p>
        <div className="space-y-2">
          {blocks.map((b, i) => {
            const meta = HOME_BLOCKS.find(h => h.id === b.id);
            if (!meta) return null;
            return (
              <div key={b.id} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => moveBlock(i, -1)} disabled={i === 0} title="Выше"
                    className="w-6 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 transition-colors">
                    <Icon name="ChevronUp" size={14} />
                  </button>
                  <button onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} title="Ниже"
                    className="w-6 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 transition-colors">
                    <Icon name="ChevronDown" size={14} />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-montserrat font-medium ${b.on ? "text-foreground" : "text-muted-foreground line-through"}`}>
                    {meta.label}
                  </p>
                  <p className="text-xs text-muted-foreground font-ibm mt-0.5">{meta.hint}</p>
                </div>

                <button onClick={() => toggleBlock(b.id)} title={b.on ? "Скрыть" : "Показать"}
                  className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${b.on ? "bg-primary" : "bg-muted-foreground/30"}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${b.on ? "left-[1.125rem]" : "left-0.5"}`} />
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      <Section num={2} title="Расписание" icon="CalendarDays"
        hint={settings.schedule_mode === "booking" ? "Ученик записывается сам" : "Ученик видит назначенные уроки"}>
        {scheduleLocked && (
          <p className="text-xs text-muted-foreground font-ibm mt-2 mb-3 px-3 py-2 rounded-lg bg-muted">
            Режим выбирает преподаватель — у вас он только для просмотра.
          </p>
        )}
        <div className="space-y-2 mt-2">
          {([
            { id: "assigned", label: "Только назначенные уроки", hint: "Ученик видит занятия, которые поставил преподаватель" },
            { id: "booking", label: "Ученик записывается сам", hint: "Преподаватель открывает свободное время, ученик выбирает и записывается" },
          ] as const).map(m => (
            <button key={m.id}
              onClick={() => !scheduleLocked && update({ schedule_mode: m.id })}
              disabled={scheduleLocked}
              className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border text-left transition-colors ${
                settings.schedule_mode === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              } ${scheduleLocked ? "cursor-default" : ""}`}>
              <span className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                settings.schedule_mode === m.id ? "border-primary" : "border-muted-foreground/40"
              }`}>
                {settings.schedule_mode === m.id && <span className="w-2 h-2 rounded-full bg-primary" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-montserrat font-bold text-foreground">{m.label}</span>
                <span className="block text-xs text-muted-foreground font-ibm mt-0.5">{m.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {settings.schedule_mode === "booking" && isTeacher && (
          <p className="text-xs text-muted-foreground font-ibm mt-3 px-3 py-2 rounded-lg bg-muted">
            Свободное время открывается в разделе «Расписание» — кнопка «Открыть запись».
          </p>
        )}
      </Section>

      <Section num={3} title="Начать урок" icon="Video"
        hint={`Платформа для видеосвязи · ${PLATFORMS.find(p => p.id === activePlatform)?.name || "Jitsi"}`}>
        {platformLocked && (
          <p className="text-xs text-muted-foreground font-ibm mt-2 mb-3 px-3 py-2 rounded-lg bg-muted">
            Платформу выбирает преподаватель — у вас включается та же, что и у него.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 mt-2">
          {PLATFORMS.map(p => (
            <button key={p.id}
              onClick={() => !platformLocked && update({ video_platform: p.id })}
              disabled={platformLocked || p.disabled}
              className={`flex flex-col items-start gap-1 px-3 py-3 rounded-lg border text-left transition-colors ${
                activePlatform === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
              } ${platformLocked ? "cursor-default" : ""}`}>
              <span className="flex items-center gap-2">
                <Icon name={p.icon} size={16} className={activePlatform === p.id ? "text-primary" : "text-muted-foreground"} />
                <span className="text-sm font-montserrat font-bold text-foreground">{p.name}</span>
              </span>
              <span className="text-xs text-muted-foreground font-ibm">{p.hint}</span>
            </button>
          ))}
        </div>

        {needsLink && (
          <div className="mt-3">
            <label className="block text-xs font-montserrat font-medium text-muted-foreground mb-1.5">
              Постоянная ссылка на комнату
            </label>
            <input
              value={settings.video_link}
              onChange={e => update({ video_link: e.target.value })}
              disabled={platformLocked}
              placeholder="https://..."
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 disabled:opacity-60"
            />
          </div>
        )}

        {activePlatform === "jitsi" && (
          <div className="mt-3">
            <label className="block text-xs font-montserrat font-medium text-muted-foreground mb-1.5">
              Сервер видеосвязи
            </label>
            <input
              value={settings.jitsi_host || ""}
              onChange={e => update({ jitsi_host: e.target.value })}
              onBlur={e => { if (!e.target.value.trim()) update({ jitsi_host: DEFAULT_JITSI_HOST }); }}
              disabled={platformLocked}
              placeholder={DEFAULT_JITSI_HOST}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 disabled:opacity-60"
            />
            <p className="text-xs text-muted-foreground font-ibm mt-1.5">
              По умолчанию бесплатный {DEFAULT_JITSI_HOST}. Свой адрес указывайте, только если у вас есть собственный сервер.
            </p>
          </div>
        )}

        {isTeacher && (
          <p className="text-xs text-muted-foreground font-ibm mt-3 px-3 py-2 rounded-lg bg-muted">
            Ваш выбор автоматически становится платформой по умолчанию у всех ваших учеников.
          </p>
        )}
      </Section>

      <Section num={4} title="Материалы" icon="BookOpen" hint="Настройки раздела материалов" disabled />
      <Section num={5} title="Домашние задания" icon="ClipboardList" hint="Настройки проверки и сроков" disabled />
      <Section num={6} title="Интерактивные задания" icon="Gamepad2" hint="Настройки тренажёров" disabled />

      <Section num={7} title="Уведомления чата" icon="Bell" hint="Звук и всплывающие сообщения">
        <div className="space-y-2 mt-2">
          <Toggle on={settings.notify_chat_sound} onChange={v => update({ notify_chat_sound: v })}
            label="Звук нового сообщения" hint="Короткий сигнал, во время урока молчит" />
          <Toggle on={settings.notify_chat_toast} onChange={v => update({ notify_chat_toast: v })}
            label="Всплывающие уведомления" hint="Карточка с текстом в углу экрана" />
          <Toggle on={settings.notify_chat_email} onChange={v => update({ notify_chat_email: v })}
            label="Дублировать на почту" hint="Письмо, если сообщение осталось непрочитанным" />
        </div>
      </Section>

      <Section num={8} title="Ученики и группы" icon="Users"
        hint="Каждый ученик закреплён за своим преподавателем" disabled />

      <Section num={9} title="Параметры входа" icon="KeyRound"
        hint={isAdmin
          ? "Пароль и почта администратора, сбросы паролей, карточки людей"
          : "Смена пароля"}>
        <div className="space-y-5">
          <div>
            <p className="text-xs font-montserrat font-bold text-foreground mt-3 flex items-center gap-2">
              <Icon name="Lock" size={14} className="text-primary" />
              {isAdmin ? "Пароль администратора" : "Смена пароля"}
            </p>
            <PasswordBlock isAdmin={isAdmin} />
          </div>

          {isAdmin && (
            <div>
              <p className="text-xs font-montserrat font-bold text-foreground mb-2 flex items-center gap-2">
                <Icon name="Mail" size={14} className="text-primary" />
                Почта администратора
              </p>
              <AdminEmailBlock />
            </div>
          )}

          {isAdmin && (
            <div>
              <p className="text-xs font-montserrat font-bold text-foreground mb-2 flex items-center gap-2">
                <Icon name="UserPlus" size={14} className="text-primary" />
                Самостоятельная регистрация
              </p>
              <RegistrationToggle />
            </div>
          )}

          {isAdmin && (
            <div>
              <p className="text-xs font-montserrat font-bold text-foreground mb-2 flex items-center gap-2">
                <Icon name="Users" size={14} className="text-primary" />
                Ученики и преподаватели
              </p>
              <PeopleManager />
            </div>
          )}
        </div>
      </Section>

      <Section num={10} title="Часовой пояс" icon="Globe"
        hint="Время уроков и уведомлений в вашем поясе">
        <TimezoneBlock />
      </Section>
    </div>
  );
}
