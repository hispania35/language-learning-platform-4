import { useState, useRef } from "react";
import Icon from "@/components/ui/icon";
import {
  apiUploadLibraryItem, apiUploadLibraryLarge,
  type LibrarySubject,
} from "@/lib/api";

const SMALL_MB = 20;

const fmtSize = (b?: number) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
};

const iconFor = (mime: string) =>
  mime.startsWith("audio/") ? "Music" : mime.startsWith("video/") ? "Video" : "FileText";

type Row = {
  file: File;
  title: string;
  progress: number;
  state: "wait" | "run" | "done" | "fail";
  error?: string;
};

const readAsDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(f);
  });

export default function LibraryUploadDialog({
  subjects, maxMb, directUpload, onClose, onDone,
}: {
  subjects: LibrarySubject[];
  maxMb: number;
  directUpload: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [subjectId, setSubjectId] = useState<number | null>(subjects[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList) => {
    const picked = Array.from(list);
    const tooBig = picked.filter(f => f.size > maxMb * 1024 * 1024);
    if (tooBig.length) setErr(`Больше ${maxMb} МБ: ${tooBig.map(f => f.name).join(", ")}`);
    else setErr("");
    const ok = picked.filter(f => f.size <= maxMb * 1024 * 1024);
    setRows(prev => [
      ...prev,
      ...ok.map(f => ({
        file: f,
        title: f.name.replace(/\.[^.]+$/, ""),
        progress: 0,
        state: "wait" as const,
      })),
    ]);
  };

  const patch = (i: number, data: Partial<Row>) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...data } : r)));

  const uploadAll = async () => {
    if (!rows.length) { setErr("Выберите файлы"); return; }
    setBusy(true); setErr("");
    let okCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.state === "done") continue;
      patch(i, { state: "run", progress: 0, error: "" });
      const meta = {
        title: row.title.trim() || row.file.name,
        author: author.trim(),
        description: description.trim(),
        subject_id: subjectId,
      };
      try {
        const big = directUpload && row.file.size > SMALL_MB * 1024 * 1024;
        const res = big
          ? await apiUploadLibraryLarge(row.file, meta, p => patch(i, { progress: p }))
          : await apiUploadLibraryItem({
              ...meta,
              file_data: await readAsDataUrl(row.file),
              file_name: row.file.name,
              mime: row.file.type || "application/octet-stream",
            });
        if (res.ok) { patch(i, { state: "done", progress: 100 }); okCount++; }
        else patch(i, { state: "fail", error: res.error || "Не удалось загрузить" });
      } catch {
        patch(i, { state: "fail", error: "Загрузка прервалась" });
      }
    }

    setBusy(false);
    if (okCount) onDone();
  };

  const allDone = rows.length > 0 && rows.every(r => r.state === "done");
  const field = "mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <h2 className="font-montserrat font-bold text-base text-foreground mb-4">Загрузить в библиотеку</h2>

        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.epub,.fb2,.doc,.docx,.txt,.zip,audio/*,video/*"
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />

        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/40 transition-colors text-left disabled:opacity-60">
          <Icon name="Upload" size={20} className="text-primary flex-shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-montserrat font-bold text-foreground">
              {rows.length ? "Добавить ещё файлы" : "Выбрать файлы"}
            </span>
            <span className="block text-xs text-muted-foreground font-ibm">
              Можно сразу несколько · книги, аудио и видео до {maxMb >= 1024 ? `${Math.round(maxMb / 1024)} ГБ` : `${maxMb} МБ`}
            </span>
          </span>
        </button>

        {!!rows.length && (
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <Icon name={iconFor(r.file.type)} size={16} className="text-primary flex-shrink-0" />
                  <input value={r.title} disabled={busy}
                    onChange={e => patch(i, { title: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-sm font-ibm outline-none border-b border-transparent focus:border-primary/40" />
                  {r.state === "done"
                    ? <Icon name="Check" size={15} className="text-green-600 flex-shrink-0" />
                    : r.state === "fail"
                      ? <Icon name="TriangleAlert" size={15} className="text-red-600 flex-shrink-0" />
                      : !busy && (
                        <button onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))}>
                          <Icon name="X" size={14} className="text-muted-foreground" />
                        </button>
                      )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-muted-foreground font-ibm">{fmtSize(r.file.size)}</span>
                  {r.state === "run" && (
                    <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <span className="block h-full red-accent transition-all duration-200"
                        style={{ width: `${r.progress || 3}%` }} />
                    </span>
                  )}
                  {r.state === "fail" && <span className="text-[11px] text-red-600 font-ibm">{r.error}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-montserrat font-bold text-muted-foreground">Предмет</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {subjects.map(s => (
                <button key={s.id} onClick={() => setSubjectId(subjectId === s.id ? null : s.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors
                    ${subjectId === s.id ? "text-white border-transparent" : "text-foreground border-border hover:bg-muted"}`}
                  style={subjectId === s.id ? { background: s.color || "#c0392b" } : undefined}>
                  {s.name}
                </button>
              ))}
              {!subjects.length && (
                <span className="text-xs text-muted-foreground font-ibm">Предметы пока не созданы</span>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-montserrat font-bold text-muted-foreground">Автор (для всех файлов)</label>
            <input value={author} onChange={e => setAuthor(e.target.value)}
              placeholder="Francisca Castro" className={field} />
          </div>
          <div>
            <label className="text-xs font-montserrat font-bold text-muted-foreground">Описание (для всех файлов)</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Учебник для начинающих" className={field + " resize-none"} />
          </div>
        </div>

        {err && <p className="text-xs text-red-600 font-ibm mt-2">{err}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
            {allDone ? "Закрыть" : "Отмена"}
          </button>
          <button onClick={uploadAll} disabled={busy || allDone}
            className="flex-1 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            {busy ? "Загружаю..." : rows.length > 1 ? `Загрузить ${rows.length}` : "Загрузить"}
          </button>
        </div>
      </div>
    </div>
  );
}
