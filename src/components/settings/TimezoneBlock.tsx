import { useState } from "react";
import Icon from "@/components/ui/icon";
import { useTimezone } from "@/hooks/useTimezone";
import { TIMEZONES, detectTz, tzTitle, nowIn } from "@/lib/timezone";

export default function TimezoneBlock() {
  const { tz, setTz } = useTimezone();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const apply = async (next: string) => {
    if (next === tz) return;
    setSaving(true);
    await setTz(next);
    setSaving(false);
    setMsg("Часовой пояс сохранён");
    setTimeout(() => setMsg(""), 2500);
  };

  const guess = detectTz();
  const mismatch = guess !== tz;

  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/30">
        <Icon name="Clock" size={16} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-montserrat font-bold text-foreground">Сейчас у вас {nowIn(tz)}</p>
          <p className="text-[11px] text-muted-foreground font-ibm truncate">{tzTitle(tz)}</p>
        </div>
      </div>

      <div>
        <label className="text-xs font-montserrat font-bold text-foreground">Ваш часовой пояс</label>
        <select value={tz} disabled={saving}
          onChange={e => apply(e.target.value)}
          className="w-full mt-1.5 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40">
          {TIMEZONES.map(t => (
            <option key={t.id} value={t.id}>{t.city} · {t.label}</option>
          ))}
          {!TIMEZONES.some(t => t.id === tz) && <option value={tz}>{tz}</option>}
        </select>
        <p className="text-[11px] text-muted-foreground font-ibm mt-1.5">
          Время уроков, сообщений и уведомлений будет показываться в этом поясе.
          Каждый видит расписание в своём времени.
        </p>
      </div>

      {mismatch && (
        <button onClick={() => apply(guess)} disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-border text-xs font-montserrat font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
          <Icon name="MapPin" size={13} />
          Определить автоматически: {tzTitle(guess)}
        </button>
      )}

      {msg && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
          <Icon name="Check" size={14} className="text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700 font-ibm">{msg}</p>
        </div>
      )}
    </div>
  );
}
