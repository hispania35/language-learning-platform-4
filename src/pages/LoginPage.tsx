import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import Footer from "@/components/Footer";
import { apiLogin, apiRegister, apiResetRequest, apiVerifyCode, apiResendCode,
  apiVerifyEmail, apiResendVerify, apiPublicSettings } from "@/lib/api";

export type UserRole = "student" | "teacher" | "admin";

export interface User {
  id: number;
  name: string;
  role: UserRole;
  level?: string;
  avatar: string;
}

interface LoginPageProps {
  onLogin: (user: User) => void;
}

const DEMO = {
  student: { email: "anna@hispania35.ru", password: "student123" },
  teacher: { email: "elena@hispania35.ru", password: "teacher123" },
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "code" | "verify">("login");

  // Подтверждение почты по ссылке из письма
  const [regOpen, setRegOpen] = useState(true);
  const [verifyEmailAddr, setVerifyEmailAddr] = useState("");
  const [verifyMsg, setVerifyMsg] = useState("");
  const [checkingLink, setCheckingLink] = useState(
    () => !!new URLSearchParams(window.location.search).get("verify")
  );

  // Двухфакторный вход администратора
  const [codeUserId, setCodeUserId] = useState<number | null>(null);
  const [codeHint, setCodeHint] = useState("");
  const [code, setCode] = useState("");
  const [resent, setResent] = useState("");

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [regRole, setRegRole] = useState<UserRole>("student");
  const [regLevel, setRegLevel] = useState("A1");
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotDone, setForgotDone] = useState(false);

  const switchMode = (m: "login" | "register" | "forgot" | "code" | "verify") => {
    setMode(m);
    setError("");
    setForgotDone(false);
  };

  useEffect(() => {
    apiPublicSettings()
      .then(r => setRegOpen(r.registration_open !== false))
      .catch(() => setRegOpen(true));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vt = params.get("verify");
    if (!vt) return;
    window.history.replaceState({}, "", window.location.pathname);
    apiVerifyEmail(vt)
      .then(res => {
        if (res.token && res.user) {
          localStorage.setItem("hispania_token", res.token);
          onLogin({ id: res.user.id, name: res.user.name, role: res.user.role, level: res.user.level, avatar: res.user.avatar });
          return;
        }
        setCheckingLink(false);
        setMode("verify");
        setVerifyMsg(res.error || "Ссылка недействительна");
      })
      .catch(() => {
        setCheckingLink(false);
        setMode("verify");
        setVerifyMsg("Нет связи с сервером");
      });
  }, [onLogin]);

  const resendVerify = async () => {
    if (!verifyEmailAddr) return;
    setLoading(true);
    const res = await apiResendVerify(verifyEmailAddr).catch(() => null);
    setLoading(false);
    setVerifyMsg(
      !res ? "Нет связи с сервером"
        : res.already ? "Эта почта уже подтверждена — можно входить"
        : res.mail_sent ? "Письмо отправлено ещё раз"
        : res.error || "Письмо отправить не удалось"
    );
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codeUserId === null) return;
    setError("");
    setLoading(true);
    try {
      const res = await apiVerifyCode(codeUserId, code.trim());
      if (res.error || !res.token || !res.user) {
        setError(res.error || "Неверный код");
        setLoading(false);
        return;
      }
      localStorage.setItem("hispania_token", res.token);
      onLogin({ id: res.user.id, name: res.user.name, role: res.user.role, level: res.user.level, avatar: res.user.avatar });
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (codeUserId === null) return;
    setError(""); setResent("");
    const res = await apiResendCode(codeUserId).catch(() => null);
    if (res?.error) { setError(res.error); return; }
    setResent("Новый код отправлен на почту");
    setCode("");
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiResetRequest(forgotEmail.trim().toLowerCase());
      if (res.error) { setError(res.error); setLoading(false); return; }
      setForgotDone(true);
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiLogin(email.trim().toLowerCase(), password);
      if (res.twofa && res.user_id) {
        setCodeUserId(res.user_id);
        setCodeHint(res.hint || "");
        setCode("");
        setResent("");
        setMode("code");
        setLoading(false);
        return;
      }
      if (res.error || !res.token || !res.user) {
        if (res.need_verify) {
          setLoading(false);
          setVerifyEmailAddr(res.email || email.trim().toLowerCase());
          setVerifyMsg("Почта ещё не подтверждена. Откройте ссылку из письма или запросите новое.");
          setMode("verify");
          return;
        }
        setError(res.error || "Неверный логин или пароль");
        setLoading(false);
        return;
      }
      localStorage.setItem("hispania_token", res.token);
      onLogin({ id: res.user.id, name: res.user.name, role: res.user.role, level: res.user.level, avatar: res.user.avatar });
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (regPassword !== regPassword2) {
      setError("Пароли не совпадают");
      return;
    }
    if (regPassword.length < 6) {
      setError("Пароль должен быть не менее 6 символов");
      return;
    }
    setLoading(true);
    try {
      const mail = regEmail.trim().toLowerCase();
      const res = await apiRegister(regName.trim(), mail, regPassword, regRole, regLevel);
      setLoading(false);
      if (!res.need_verify) {
        setError(res.error || "Ошибка регистрации");
        return;
      }
      setVerifyEmailAddr(mail);
      setVerifyMsg(res.mail_sent
        ? `Мы отправили письмо на ${mail}. Перейдите по ссылке из письма, чтобы подтвердить адрес.`
        : `Аккаунт создан, но письмо на ${mail} отправить не удалось. Нажмите «Отправить ещё раз».`);
      setMode("verify");
    } catch {
      setError("Ошибка соединения. Попробуйте ещё раз.");
      setLoading(false);
    }
  };

  const fillDemo = (role: "student" | "teacher") => {
    setEmail(DEMO[role].email);
    setPassword(DEMO[role].password);
    setError("");
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col lg:flex-row overflow-hidden">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] red-accent flex-col justify-between p-8 xl:p-12 relative overflow-hidden h-full flex-shrink-0">
        {/* Decorative */}
        <div className="absolute inset-0 opacity-10">
          {["¡Hola!", "Gracias", "Buenos días", "¿Cómo estás?", "Hasta luego"].map((w, i) => (
            <div
              key={i}
              className="absolute font-montserrat font-black text-white whitespace-nowrap"
              style={{
                fontSize: `${2 + (i % 3)}rem`,
                top: `${10 + i * 18}%`,
                left: `${-5 + (i % 2) * 20}%`,
                transform: "rotate(-8deg)",
                opacity: 0.6,
              }}
            >
              {w}
            </div>
          ))}
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <img src="/logo.png" alt="Hispania 35"
            className="w-10 h-10 rounded-xl object-cover bg-white" />
          <div>
            <p className="font-montserrat font-black text-white text-lg leading-none">Hispania 35</p>
            <p className="text-white/60 text-xs font-ibm">Языковая студия</p>
          </div>
        </div>

        {/* Center text */}
        <div className="relative">
          <h1 className="font-montserrat font-black text-white text-3xl xl:text-4xl 2xl:text-5xl leading-tight mb-3 xl:mb-4">
            Платформа<br />онлайн-обучения
          </h1>
          <p className="text-white/70 font-ibm text-base xl:text-lg leading-relaxed max-w-md">
            Испанский, немецкий, английский — всё в одном месте.
            Уроки, материалы, домашние задания и чат с преподавателем.
          </p>
        </div>

        {/* Stats */}
        <div className="relative flex gap-6 xl:gap-8 flex-wrap">
          {[
            { value: "6", label: "чел. в группе" },
            { value: "3", label: "языка" },
            { value: "112+", label: "учеников" },
          ].map((s, i) => (
            <div key={i}>
              <p className="font-montserrat font-black text-white text-xl xl:text-2xl">{s.value}</p>
              <p className="text-white/60 text-xs font-ibm">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="page-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain flex items-start sm:items-center justify-center px-4 sm:px-6 py-6 sm:py-10">
        <div className="w-full max-w-sm sm:max-w-md lg:max-w-sm animate-fade-in my-auto">

          {checkingLink && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Icon name="Loader" size={26} className="animate-spin text-primary" />
              <p className="text-sm text-muted-foreground font-ibm">Подтверждаем почту...</p>
            </div>
          )}

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-5 sm:mb-6 lg:hidden">
            <img src="/logo.png" alt="Hispania 35"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover bg-white border border-border" />
            <div>
              <p className="font-montserrat font-black text-foreground text-base sm:text-lg leading-none">Hispania 35</p>
              <p className="text-muted-foreground text-xs font-ibm mt-0.5">Языковая студия</p>
            </div>
          </div>

          {/* Tabs */}
          <div className={`flex bg-muted/50 rounded-xl p-1 mb-6 ${
            mode === "forgot" || mode === "verify" || checkingLink || !regOpen ? "hidden" : ""
          }`}>
            <button
              onClick={() => switchMode("login")}
              className={`flex-1 py-2.5 sm:py-2 rounded-lg text-sm font-montserrat font-bold transition-all duration-150 ${
                mode === "login" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Вход
            </button>
            <button
              onClick={() => switchMode("register")}
              className={`flex-1 py-2.5 sm:py-2 rounded-lg text-sm font-montserrat font-bold transition-all duration-150 ${
                mode === "register" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Регистрация
            </button>
          </div>

          {/* ── ПОДТВЕРЖДЕНИЕ ПОЧТЫ ── */}
          {mode === "verify" && !checkingLink && (
            <div className="animate-fade-in text-center">
              <span className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Icon name="MailCheck" size={26} className="text-primary" />
              </span>
              <h2 className="font-montserrat font-black text-lg text-foreground mb-2">Подтвердите почту</h2>
              <p className="text-sm text-muted-foreground font-ibm mb-5">{verifyMsg}</p>

              <div className="space-y-2">
                {verifyEmailAddr && (
                  <button onClick={resendVerify} disabled={loading}
                    className="w-full py-3 red-accent text-white rounded-xl font-montserrat font-bold text-sm hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                    {loading ? <><Icon name="Loader" size={16} className="animate-spin" />Отправляю...</> : <><Icon name="Send" size={15} />Отправить ещё раз</>}
                  </button>
                )}
                <button onClick={() => switchMode("login")}
                  className="w-full py-3 rounded-xl border border-border text-sm font-montserrat font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                  Вернуться ко входу
                </button>
              </div>
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === "login" && !checkingLink && (
            <div className="animate-fade-in">
              <p className="text-muted-foreground font-ibm text-sm mb-5">Введите данные для входа в личный кабинет</p>

              {/* Demo buttons */}
              <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 mb-5">
                <button type="button" onClick={() => fillDemo("student")}
                  className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-montserrat font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <Icon name="GraduationCap" size={13} />Войти как студент
                </button>
                <button type="button" onClick={() => fillDemo("teacher")}
                  className="flex items-center justify-center gap-1.5 py-2.5 sm:py-2 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs font-montserrat font-medium text-muted-foreground hover:text-foreground transition-colors">
                  <Icon name="BookUser" size={13} />Войти как препод.
                </button>
              </div>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-ibm">или введите вручную</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Email или логин</label>
                  <div className="relative">
                    <Icon name="Mail" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" autoComplete="username" value={email}
                      onChange={e => { setEmail(e.target.value); setError(""); }}
                      placeholder="your@email.ru" required
                      className="w-full pl-9 pr-4 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Пароль</label>
                  <div className="relative">
                    <Icon name="Lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type={showPassword ? "text" : "password"} value={password}
                      onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="••••••••" required
                      className="w-full pl-9 pr-10 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                      <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <Icon name="AlertCircle" size={15} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 font-ibm">{error}</p>
                  </div>
                )}
                <button type="submit" disabled={loading}
                  className="w-full py-3.5 sm:py-3 red-accent text-white rounded-xl font-montserrat font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <><Icon name="Loader" size={16} className="animate-spin" />Вхожу...</> : <>Войти <Icon name="ArrowRight" size={16} /></>}
                </button>
                <button type="button" onClick={() => switchMode("forgot")}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground font-ibm transition-colors pt-1">
                  Забыл пароль?
                </button>
              </form>
            </div>
          )}

          {/* ── КОД ПОДТВЕРЖДЕНИЯ ── */}
          {mode === "code" && !checkingLink && (
            <div className="animate-fade-in">
              <button onClick={() => { switchMode("login"); setCode(""); }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-ibm mb-5 transition-colors">
                <Icon name="ArrowLeft" size={14} />Вернуться ко входу
              </button>

              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Icon name="ShieldCheck" size={24} className="text-primary" />
              </div>
              <h2 className="font-montserrat font-black text-lg text-foreground mb-1">Подтверждение входа</h2>
              <p className="text-sm text-muted-foreground font-ibm mb-5">
                Мы отправили код из 6 цифр на почту{codeHint ? ` ${codeHint}` : ""}. Код действует 10 минут.
              </p>

              <form onSubmit={handleVerify} className="space-y-4">
                <input
                  value={code}
                  onChange={e => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  inputMode="numeric" autoFocus placeholder="000000" required
                  className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-center text-2xl font-montserrat font-black tracking-[0.5em] outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <Icon name="AlertCircle" size={15} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 font-ibm">{error}</p>
                  </div>
                )}
                {resent && !error && (
                  <p className="text-sm text-green-700 font-ibm bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">{resent}</p>
                )}

                <button type="submit" disabled={loading || code.length !== 6}
                  className="w-full py-3.5 sm:py-3 red-accent text-white rounded-xl font-montserrat font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <><Icon name="Loader" size={16} className="animate-spin" />Проверяю...</> : <>Подтвердить <Icon name="ArrowRight" size={16} /></>}
                </button>

                <button type="button" onClick={handleResend}
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground font-ibm transition-colors pt-1">
                  Не пришёл код? Отправить ещё раз
                </button>
              </form>
            </div>
          )}

          {/* ── FORGOT ── */}
          {mode === "forgot" && !checkingLink && (
            <div className="animate-fade-in">
              <button onClick={() => switchMode("login")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-ibm mb-5 transition-colors">
                <Icon name="ArrowLeft" size={14} />Вернуться ко входу
              </button>
              {forgotDone ? (
                <div className="text-center space-y-4 py-4">
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                    <Icon name="CheckCircle" size={28} className="text-green-600" />
                  </div>
                  <p className="font-montserrat font-bold text-foreground">Заявка отправлена</p>
                  <p className="text-sm text-muted-foreground font-ibm">Преподаватель получит уведомление и свяжется с вами для смены пароля.</p>
                  <button onClick={() => switchMode("login")} className="w-full py-2.5 red-accent text-white rounded-xl font-montserrat font-bold text-sm hover:opacity-90 transition-opacity">
                    Понятно
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-muted-foreground font-ibm text-sm mb-5">Укажите email — преподаватель получит заявку и сбросит пароль вручную.</p>
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div>
                      <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Ваш email</label>
                      <div className="relative">
                        <Icon name="Mail" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input type="email" value={forgotEmail} onChange={e => { setForgotEmail(e.target.value); setError(""); }}
                          placeholder="your@email.ru" required
                          className="w-full pl-9 pr-4 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                      </div>
                    </div>
                    {error && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                        <Icon name="AlertCircle" size={15} className="text-red-500 flex-shrink-0" />
                        <p className="text-sm text-red-700 font-ibm">{error}</p>
                      </div>
                    )}
                    <button type="submit" disabled={loading}
                      className="w-full py-3.5 sm:py-3 red-accent text-white rounded-xl font-montserrat font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                      {loading ? <><Icon name="Loader" size={16} className="animate-spin" />Отправляю...</> : <>Отправить заявку</>}
                    </button>
                  </form>
                </>
              )}
            </div>
          )}

          {/* ── REGISTER ── */}
          {mode === "register" && !checkingLink && regOpen && (
            <div className="animate-fade-in">
              <p className="text-muted-foreground font-ibm text-sm mb-5">Создайте аккаунт для доступа к платформе</p>

              <form onSubmit={handleRegister} className="space-y-3">
                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Полное имя</label>
                  <div className="relative">
                    <Icon name="User" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" value={regName} onChange={e => { setRegName(e.target.value); setError(""); }}
                      placeholder="Иван Иванов" required
                      className="w-full pl-9 pr-4 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Email</label>
                  <div className="relative">
                    <Icon name="Mail" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="email" value={regEmail} onChange={e => { setRegEmail(e.target.value); setError(""); }}
                      placeholder="your@email.ru" required
                      className="w-full pl-9 pr-4 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Пароль</label>
                  <div className="relative">
                    <Icon name="Lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type={showRegPassword ? "text" : "password"} value={regPassword}
                      onChange={e => { setRegPassword(e.target.value); setError(""); }} placeholder="Не менее 6 символов" required
                      className="w-full pl-9 pr-10 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                    <button type="button" onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <Icon name={showRegPassword ? "EyeOff" : "Eye"} size={16} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Повторите пароль</label>
                  <div className="relative">
                    <Icon name="Lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type={showRegPassword ? "text" : "password"} value={regPassword2}
                      onChange={e => { setRegPassword2(e.target.value); setError(""); }} placeholder="Повторите пароль" required
                      className="w-full pl-9 pr-4 py-3 sm:py-2.5 rounded-xl border border-border bg-card text-foreground text-base sm:text-sm font-ibm placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all" />
                  </div>
                </div>

                {/* Role selector */}
                <div>
                  <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Роль</label>
                  <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                    <button type="button" onClick={() => setRegRole("student")}
                      className={`flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl border text-sm font-montserrat font-medium transition-all ${
                        regRole === "student" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                      }`}>
                      <Icon name="GraduationCap" size={16} />Студент
                    </button>
                    <button type="button" onClick={() => setRegRole("teacher")}
                      className={`flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl border text-sm font-montserrat font-medium transition-all ${
                        regRole === "teacher" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                      }`}>
                      <Icon name="BookUser" size={16} />Преподаватель
                    </button>
                  </div>
                </div>

                {/* Level (only for student) */}
                {regRole === "student" && (
                  <div>
                    <label className="block text-xs sm:text-xs font-montserrat font-bold text-foreground mb-1.5">Уровень языка</label>
                    <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
                      {LEVELS.map(l => (
                        <button key={l} type="button" onClick={() => setRegLevel(l)}
                          className={`py-2 rounded-lg text-sm font-montserrat font-bold border transition-all ${
                            regLevel === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                          }`}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                    <Icon name="AlertCircle" size={15} className="text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700 font-ibm">{error}</p>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 sm:py-3 red-accent text-white rounded-xl font-montserrat font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <><Icon name="Loader" size={16} className="animate-spin" />Регистрирую...</> : <>Зарегистрироваться <Icon name="ArrowRight" size={16} /></>}
                </button>
              </form>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground font-ibm mt-5">
            Вопросы? Напишите нам на{" "}
            <a href="mailto:hispania35@yandex.ru" className="text-primary hover:underline">hispania35@yandex.ru</a>
          </p>

          <Footer />
        </div>
      </div>
    </div>
  );
}