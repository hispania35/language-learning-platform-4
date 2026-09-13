import { useState } from "react";
import Icon from "@/components/ui/icon";
import { apiAddLibrarySubject, apiDeleteLibrarySubject, type LibrarySubject } from "@/lib/api";

const COLORS = ["#c0392b", "#2c3e50", "#2980b9", "#27ae60", "#8e44ad", "#d35400"];

export default function SubjectsDialog({
  subjects, onClose, onChanged,
}: {
  subjects: LibrarySubject[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const add = async () => {
    if (!name.trim()) { setErr("Введите название"); return; }
    setBusy(true); setErr("");
    const res = await apiAddLibrarySubject(name.trim(), color);
    setBusy(false);
    if (res.ok) { setName(""); onChanged(); }
    else setErr(res.error || "Не удалось добавить");
  };

  const remove = async (id: number) => {
    setBusy(true);
    const res = await apiDeleteLibrarySubject(id);
    setBusy(false);
    setConfirmId(null);
    if (res.ok) onChanged();
    else setErr(res.error || "Не удалось удалить");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <h2 className="font-montserrat font-bold text-base text-foreground mb-4">Предметы библиотеки</h2>

        <div className="space-y-1.5">
          {subjects.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border">
              <span className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: s.color || "#c0392b" }} />
              <span className="flex-1 text-sm font-montserrat font-bold text-foreground truncate">{s.name}</span>
              {confirmId === s.id ? (
                <>
                  <button onClick={() => remove(s.id)} disabled={busy}
                    className="text-xs font-montserrat font-bold text-red-600 px-2 py-1 rounded hover:bg-red-50">
                    Удалить
                  </button>
                  <button onClick={() => setConfirmId(null)}
                    className="text-xs font-ibm text-muted-foreground px-1">Отмена</button>
                </>
              ) : (
                <button onClick={() => setConfirmId(s.id)} title="Удалить предмет"
                  className="w-8 h-8 rounded-lg border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 transition-colors">
                  <Icon name="Trash2" size={14} />
                </button>
              )}
            </div>
          ))}
          {!subjects.length && (
            <p className="text-sm text-muted-foreground font-ibm">Пока ни одного предмета</p>
          )}
        </div>

        <p className="text-xs font-montserrat font-bold text-muted-foreground mt-4 mb-1.5">Новый предмет</p>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Французский"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          <button onClick={add} disabled={busy}
            className="px-4 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            Добавить
          </button>
        </div>
        <div className="flex gap-1.5 mt-2">
          {COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-transform ${color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : ""}`}
              style={{ background: c }} />
          ))}
        </div>

        {err && <p className="text-xs text-red-600 font-ibm mt-2">{err}</p>}

        <button onClick={onClose}
          className="w-full mt-4 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
          Готово
        </button>
      </div>
    </div>
  );
}
