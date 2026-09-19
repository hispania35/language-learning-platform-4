import { useState } from "react";
import Icon from "@/components/ui/icon";
import { type PersonCard } from "@/lib/api";

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export interface PersonFormValues {
  name: string;
  email: string;
  password: string;
  level: string;
  phone: string;
  telegram: string;
  note: string;
}

interface Props {
  role: "student" | "teacher";
  person?: PersonCard;
  busy?: boolean;
  onCancel: () => void;
  onSave: (values: PersonFormValues) => void;
}

export default function PersonCardForm({ role, person, busy, onCancel, onSave }: Props) {
  const isNew = !person;
  const [v, setV] = useState<PersonFormValues>({
    name: person?.name || "",
    email: person?.email || "",
    password: "",
    level: person?.level || "A1",
    phone: person?.phone || "",
    telegram: person?.telegram || "",
    note: person?.note || "",
  });
  const [err, setErr] = useState("");

  const set = (k: keyof PersonFormValues, val: string) => {
    setV(p => ({ ...p, [k]: val }));
    setErr("");
  };

  const submit = () => {
    if (!v.name.trim()) { setErr("Укажите имя"); return; }
    if (!v.email.includes("@")) { setErr("Укажите корректную почту"); return; }
    if (isNew && v.password.trim().length < 6) { setErr("Пароль не менее 6 символов"); return; }
    onSave(v);
  };

  const field = "w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40";

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5">
      <p className="text-xs font-montserrat font-bold text-foreground">
        {isNew
          ? role === "teacher" ? "Новый преподаватель" : "Новый ученик"
          : "Карточка: " + person?.name}
      </p>

      <input value={v.name} onChange={e => set("name", e.target.value)}
        placeholder="Имя и фамилия" className={field} />
      <input value={v.email} type="email" inputMode="email" autoComplete="off"
        onChange={e => set("email", e.target.value)} placeholder="Почта" className={field} />

      {isNew && (
        <>
          <input value={v.password} onChange={e => set("password", e.target.value)}
            placeholder="Пароль для входа (минимум 6 символов)" autoComplete="new-password" className={field} />
          <p className="text-xs text-muted-foreground font-ibm flex items-start gap-1.5">
            <Icon name="Mail" size={13} className="text-primary flex-shrink-0 mt-0.5" />
            Логин и пароль автоматически уйдут письмом на указанную почту.
          </p>
        </>
      )}

      {role === "student" && (
        <div>
          <p className="text-xs text-muted-foreground font-ibm mb-1.5">Уровень</p>
          <div className="grid grid-cols-6 gap-1.5">
            {LEVELS.map(l => (
              <button key={l} type="button" onClick={() => set("level", l)}
                className={`py-2 rounded-lg text-xs font-montserrat font-bold border transition-all ${
                  v.level === l ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                }`}>{l}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={v.phone} onChange={e => set("phone", e.target.value)}
          placeholder="Телефон" inputMode="tel" className={field} />
        <input value={v.telegram} onChange={e => set("telegram", e.target.value)}
          placeholder="Telegram" className={field} />
      </div>

      <textarea value={v.note} onChange={e => set("note", e.target.value)} rows={2}
        placeholder="Заметка" className={field + " resize-none"} />

      {err && <p className="text-xs text-red-600 font-ibm">{err}</p>}

      <div className="flex gap-2">
        <button onClick={submit} disabled={busy}
          className="flex-1 py-2 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <Icon name="Check" size={14} />{busy ? "Сохраняю..." : "Сохранить"}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="px-4 py-2 rounded-lg border border-border text-xs font-montserrat font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          Отмена
        </button>
      </div>
    </div>
  );
}
