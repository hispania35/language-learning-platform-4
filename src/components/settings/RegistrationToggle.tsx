import { useEffect, useState } from "react";
import Icon from "@/components/ui/icon";
import { apiPublicSettings, apiSetRegistration } from "@/lib/api";

export default function RegistrationToggle() {
  const [open, setOpen] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiPublicSettings()
      .then(r => setOpen(r.registration_open !== false))
      .catch(() => setOpen(true));
  }, []);

  const toggle = async () => {
    if (open === null || busy) return;
    const next = !open;
    setBusy(true); setErr("");
    const res = await apiSetRegistration(next).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось сохранить"); return; }
    setOpen(res.registration_open !== false);
  };

  if (open === null) {
    return <p className="text-xs text-muted-foreground font-ibm">Загружаю...</p>;
  }

  return (
    <div className="space-y-2">
      <button onClick={toggle} disabled={busy}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left disabled:opacity-60">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-montserrat font-medium text-foreground">
            Кнопка «Регистрация» на странице входа
          </span>
          <span className="block text-xs text-muted-foreground font-ibm mt-0.5">
            {open
              ? "Включена — новые ученики могут зарегистрироваться сами"
              : "Выключена — аккаунты создаёте только вы"}
          </span>
        </span>
        <span className={`w-10 h-6 rounded-full flex-shrink-0 transition-colors relative ${open ? "bg-primary" : "bg-muted-foreground/30"}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${open ? "left-[1.125rem]" : "left-0.5"}`} />
        </span>
      </button>

      <p className="text-xs text-muted-foreground font-ibm flex items-start gap-1.5 px-1">
        <Icon name="Info" size={13} className="text-primary flex-shrink-0 mt-0.5" />
        При самостоятельной регистрации ученик и преподаватель получают письмо со ссылкой — без неё вход закрыт.
      </p>

      {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}
    </div>
  );
}
