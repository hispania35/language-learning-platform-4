import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { type User } from "@/pages/LoginPage";
import { apiGetSlots, apiCreateSlots, apiDeleteSlot, apiBookSlot, type LessonSlot } from "@/lib/api";

const DAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const humanDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  if (isNaN(d.getTime())) return iso;
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];

export default function BookingBoard({ user, onChanged }: { user: User; onChanged?: () => void }) {
  const isTeacher = user.role === "teacher" || user.role === "admin";
  const [slots, setSlots] = useState<LessonSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addDate, setAddDate] = useState(toKey(new Date()));
  const [addTimes, setAddTimes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await apiGetSlots().catch(() => null);
    if (r?.slots) setSlots(r.slots);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const byDate = slots.reduce<Record<string, LessonSlot[]>>((acc, s) => {
    (acc[s.date] ||= []).push(s);
    return acc;
  }, {});
  const dates = Object.keys(byDate).sort();

  const book = async (s: LessonSlot) => {
    setBusy(s.id); setMsg("");
    const r = await apiBookSlot(s.id, s.mine).catch(() => null);
    setBusy(null);
    if (r?.error) { setMsg(r.error); await load(); return; }
    setMsg(s.mine ? "Запись отменена" : "Вы записаны на занятие");
    await load();
    onChanged?.();
  };

  const removeSlot = async (s: LessonSlot) => {
    setBusy(s.id); setMsg("");
    const r = await apiDeleteSlot(s.id).catch(() => null);
    setBusy(null);
    if (!r?.ok) setMsg(r?.error || "Не удалось убрать окно, попробуйте ещё раз");
    await load();
    onChanged?.();
  };

  const saveSlots = async () => {
    if (!addTimes.length) return;
    setSaving(true);
    await apiCreateSlots(addTimes.map(t => ({ date: addDate, time: t }))).catch(() => null);
    setSaving(false);
    setAddOpen(false);
    setAddTimes([]);
    await load();
    onChanged?.();
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-4">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3.5 border-b border-border">
        <Icon name="CalendarPlus" size={16} className="text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="font-montserrat font-bold text-sm text-foreground">
            {isTeacher ? "Свободное время для записи" : "Запись на занятие"}
          </h3>
          <p className="text-xs text-muted-foreground font-ibm">
            {isTeacher ? "Ученики сами выбирают время из открытых окон" : "Выберите удобное время у преподавателя"}
          </p>
        </div>
        {isTeacher && (
          <button onClick={() => setAddOpen(v => !v)}
            className="px-3 py-1.5 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 flex-shrink-0">
            {addOpen ? "Закрыть" : "Открыть запись"}
          </button>
        )}
      </div>

      {addOpen && isTeacher && (
        <div className="px-4 sm:px-5 py-4 border-b border-border bg-muted/30 animate-fade-in">
          <label className="block text-xs font-montserrat font-medium text-muted-foreground mb-1.5">Дата</label>
          <input type="date" value={addDate} min={toKey(new Date())}
            onChange={e => setAddDate(e.target.value)}
            className="w-full sm:w-56 px-3 py-2 rounded-lg border border-border bg-card text-sm font-ibm outline-none focus:border-primary/40" />

          <p className="text-xs font-montserrat font-medium text-muted-foreground mt-3 mb-1.5">Время</p>
          <div className="flex flex-wrap gap-1.5">
            {HOURS.map(t => {
              const on = addTimes.includes(t);
              return (
                <button key={t}
                  onClick={() => setAddTimes(prev => on ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-montserrat font-medium transition-colors ${
                    on ? "border-primary bg-primary text-white" : "border-border text-foreground hover:bg-muted"
                  }`}>
                  {t}
                </button>
              );
            })}
          </div>

          <button onClick={saveSlots} disabled={!addTimes.length || saving}
            className="mt-3 px-4 py-2 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 disabled:opacity-40">
            {saving ? "Сохраняю..." : `Открыть ${addTimes.length || ""} окон`}
          </button>
        </div>
      )}

      {msg && (
        <p className="px-4 sm:px-5 py-2 text-xs font-ibm text-primary bg-primary/5 border-b border-border">{msg}</p>
      )}

      <div className="divide-y divide-border">
        {loading && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground font-ibm">Загрузка...</p>
          </div>
        )}

        {!loading && !dates.length && (
          <div className="px-5 py-10 text-center">
            <Icon name="CalendarOff" size={30} className="text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground font-ibm">
              {isTeacher ? "Свободное время пока не открыто" : "Преподаватель ещё не открыл время для записи"}
            </p>
          </div>
        )}

        {!loading && dates.map(date => (
          <div key={date} className="px-4 sm:px-5 py-3">
            <p className="text-xs font-montserrat font-bold text-muted-foreground mb-2">{humanDate(date)}</p>
            <div className="flex flex-wrap gap-2">
              {byDate[date].sort((a, b) => a.time.localeCompare(b.time)).map(s => {
                const taken = !!s.booked_by;
                if (isTeacher) {
                  return (
                    <div key={s.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${taken ? "border-primary/30 bg-primary/5" : "border-border"}`}>
                      <span className="text-sm font-montserrat font-bold text-foreground">{s.time}</span>
                      <span className="text-xs text-muted-foreground font-ibm">
                        {taken ? s.booked_name : "свободно"}
                      </span>
                      {!taken && (
                        <button onClick={() => removeSlot(s)} disabled={busy === s.id} title="Убрать окно"
                          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50">
                          <Icon name={busy === s.id ? "Loader" : "X"} size={14}
                            className={busy === s.id ? "animate-spin" : ""} />
                        </button>
                      )}
                    </div>
                  );
                }
                return (
                  <button key={s.id}
                    onClick={() => (!taken || s.mine) && book(s)}
                    disabled={busy === s.id || (taken && !s.mine)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-montserrat font-bold transition-colors ${
                      s.mine ? "border-primary bg-primary text-white"
                        : taken ? "border-border bg-muted text-muted-foreground cursor-not-allowed"
                        : "border-border text-foreground hover:border-primary hover:bg-primary/5"
                    }`}>
                    <span>{s.time}</span>
                    {s.mine && <Icon name="Check" size={14} />}
                    {taken && !s.mine && <span className="text-xs font-normal font-ibm">занято</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {!isTeacher && dates.length > 0 && (
        <p className="px-4 sm:px-5 py-2.5 text-xs text-muted-foreground font-ibm border-t border-border">
          Нажмите на своё время ещё раз, чтобы отменить запись.
        </p>
      )}
    </div>
  );
}