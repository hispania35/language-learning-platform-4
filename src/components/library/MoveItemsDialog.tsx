import { useState } from "react";
import Icon from "@/components/ui/icon";
import { apiMoveLibraryItems, type LibrarySubject } from "@/lib/api";

interface Props {
  count: number;
  ids: number[];
  subjects: LibrarySubject[];
  onClose: () => void;
  onMoved: (msg: string) => void;
}

export default function MoveItemsDialog({ count, ids, subjects, onClose, onMoved }: Props) {
  const [target, setTarget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const pathOf = (id: number): string => {
    const out: string[] = [];
    let cur = subjects.find(s => s.id === id);
    let guard = 0;
    while (cur && guard++ < 10) {
      out.unshift(cur.name);
      cur = cur.parent_id ? subjects.find(s => s.id === cur!.parent_id) : undefined;
    }
    return out.join(" / ");
  };

  const options = [...subjects].sort((a, b) => pathOf(a.id).localeCompare(pathOf(b.id)));

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    const res = await apiMoveLibraryItems(ids, target).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось перенести"); return; }
    onMoved(target
      ? `Перенесено в «${pathOf(target)}»: ${res.moved ?? count}`
      : `Файлы убраны из каталогов: ${res.moved ?? count}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-montserrat font-bold text-base text-foreground flex items-center gap-2">
            <Icon name="FolderInput" size={18} className="text-primary" />
            Перенести файлы
          </h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground font-ibm mb-3">
          Выбрано файлов: <span className="text-foreground font-medium">{count}</span>. Укажите, куда положить.
        </p>

        <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
          <button onClick={() => { setTarget(null); setErr(""); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
              target === null ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
            }`}>
            <Icon name="Library" size={15} className="text-primary flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-montserrat font-medium text-foreground">Без каталога</span>
              <span className="block text-[11px] text-muted-foreground font-ibm">Файлы останутся в общей библиотеке</span>
            </span>
            {target === null && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
          </button>

          {options.map(s => (
            <button key={s.id} onClick={() => { setTarget(s.id); setErr(""); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                target === s.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
              }`}>
              <Icon name={s.parent_id ? "Folder" : "BookMarked"} size={15} className="text-primary flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-montserrat font-medium text-foreground truncate">{s.name}</span>
                {s.parent_id && (
                  <span className="block text-[11px] text-muted-foreground font-ibm truncate">{pathOf(s.id)}</span>
                )}
              </span>
              {target === s.id && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
            </button>
          ))}
        </div>

        {err && <p className="text-xs text-red-600 font-ibm mt-2">{err}</p>}

        <div className="flex gap-2 pt-3">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
            Отмена
          </button>
          <button onClick={submit} disabled={busy}
            className="flex-1 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
            {busy ? "Переношу..." : "Перенести"}
          </button>
        </div>
      </div>
    </div>
  );
}
