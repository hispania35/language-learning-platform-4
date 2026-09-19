import { useState } from "react";
import Icon from "@/components/ui/icon";
import { apiMoveLibrarySubject, type LibrarySubject } from "@/lib/api";

interface Props {
  folder: LibrarySubject;
  subjects: LibrarySubject[];
  onClose: () => void;
  onMoved: (msg: string) => void;
}

export default function MoveSubjectDialog({ folder, subjects, onClose, onMoved }: Props) {
  const [target, setTarget] = useState<number | null>(folder.parent_id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Потомки перемещаемого каталога — в них переносить нельзя
  const banned = (() => {
    const out = new Set<number>([folder.id]);
    let added = true;
    while (added) {
      added = false;
      for (const s of subjects) {
        if (s.parent_id && out.has(s.parent_id) && !out.has(s.id)) {
          out.add(s.id);
          added = true;
        }
      }
    }
    return out;
  })();

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

  const depthOf = (id: number | null): number => {
    if (!id) return 0;
    let n = 0;
    let cur = subjects.find(s => s.id === id);
    let guard = 0;
    while (cur && guard++ < 10) {
      n++;
      cur = cur.parent_id ? subjects.find(s => s.id === cur!.parent_id) : undefined;
    }
    return n;
  };

  // Высота ветки — чтобы не уйти глубже пяти уровней
  const heightOf = (id: number): number => {
    const kids = subjects.filter(s => s.parent_id === id);
    return kids.length ? 1 + Math.max(...kids.map(k => heightOf(k.id))) : 1;
  };
  const branchHeight = heightOf(folder.id);

  const options = subjects
    .filter(s => !banned.has(s.id))
    .filter(s => depthOf(s.id) + branchHeight <= 5)
    .sort((a, b) => pathOf(a.id).localeCompare(pathOf(b.id)));

  const submit = async () => {
    if (busy) return;
    if (target === (folder.parent_id ?? null)) { setErr("Каталог уже здесь"); return; }
    setBusy(true); setErr("");
    const res = await apiMoveLibrarySubject(folder.id, target).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setErr(res?.error || "Не удалось перенести"); return; }
    onMoved(target
      ? `«${folder.name}» перенесён в «${pathOf(target)}»`
      : `«${folder.name}» стал отдельным предметом`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-montserrat font-bold text-base text-foreground flex items-center gap-2">
            <Icon name="FolderSymlink" size={18} className="text-primary" />
            Перенести каталог
          </h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground font-ibm mb-3">
          «{folder.name}» переедет со всеми файлами и подкаталогами. Сейчас:{" "}
          <span className="text-foreground font-medium">
            {folder.parent_id ? pathOf(folder.parent_id) : "отдельный предмет"}
          </span>
        </p>

        <div className="flex-1 overflow-y-auto space-y-1.5 -mx-1 px-1">
          <button onClick={() => { setTarget(null); setErr(""); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
              target === null ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
            }`}>
            <Icon name="Library" size={15} className="text-primary flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-montserrat font-medium text-foreground">Сделать предметом</span>
              <span className="block text-[11px] text-muted-foreground font-ibm">Верхний уровень библиотеки</span>
            </span>
            {target === null && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
          </button>

          {options.map(s => (
            <button key={s.id} onClick={() => { setTarget(s.id); setErr(""); }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                target === s.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
              }`}>
              <Icon name={s.parent_id ? "Folder" : "BookMarked"} size={15}
                className="text-primary flex-shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-montserrat font-medium text-foreground truncate">{s.name}</span>
                {s.parent_id && (
                  <span className="block text-[11px] text-muted-foreground font-ibm truncate">{pathOf(s.id)}</span>
                )}
              </span>
              {target === s.id && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
            </button>
          ))}

          {!options.length && (
            <p className="text-xs text-muted-foreground font-ibm px-3 py-2 rounded-lg bg-muted">
              Других подходящих мест нет — можно только сделать каталог отдельным предметом
            </p>
          )}
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
