import { useState, useRef } from "react";
import Icon from "@/components/ui/icon";
import {
  apiUploadLibraryItem, apiUploadLibraryLarge, apiAddLibrarySubject,
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

const kindWord = (mime: string) =>
  mime.startsWith("audio/") ? "аудио" : mime.startsWith("video/") ? "видео" : "учебник";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

type Row = {
  file: File;
  title: string;
  progress: number;
  state: "wait" | "run" | "done" | "fail";
  error?: string;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  const [allSubjects, setAllSubjects] = useState<LibrarySubject[]>(subjects);
  const [rows, setRows] = useState<Row[]>([]);
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [langId, setLangId] = useState<number | null>(subjects.find(s => !s.parent_id)?.id ?? null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [newSubject, setNewSubject] = useState("");
  const [addingSubject, setAddingSubject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [folderName, setFolderName] = useState("");
  const [retried, setRetried] = useState(false);
  const [summary, setSummary] = useState<null | { ok: number; failed: Row[]; final: boolean }>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  const languages = allSubjects.filter(s => !s.parent_id);
  const folders = allSubjects.filter(s => s.parent_id === langId);
  const langName = allSubjects.find(s => s.id === langId)?.name;
  const folderLabel = allSubjects.find(s => s.id === subjectId)?.name;
  const subjectName = folderLabel ? `${langName} / ${folderLabel}` : langName;
  const targetId = subjectId ?? langId;

  const addFiles = (list: FileList, fromFolder = false) => {
    const picked = Array.from(list).filter(f => f.size > 0 && !f.name.startsWith("."));
    if (fromFolder) {
      const rel = (picked[0] as File & { webkitRelativePath?: string })?.webkitRelativePath || "";
      const dir = rel.split("/")[0];
      if (dir) {
        setFolderName(dir);
        // Подставляем имя папки как название каталога, если он ещё не выбран
        if (!subjectId && !newSubject.trim()) {
          const exists = allSubjects.find(
            x => x.parent_id === langId && x.name.toLowerCase() === dir.toLowerCase()
          );
          if (exists) setSubjectId(exists.id);
          else setNewSubject(dir);
        }
      }
    }
    const limit = maxMb * 1024 * 1024;
    const tooBig = picked.filter(f => f.size > limit);
    const ok = picked.filter(f => f.size <= limit);
    setErr(tooBig.length
      ? `Пропущено — больше ${maxMb} МБ: ${tooBig.map(f => f.name).join(", ")}`
      : "");
    setSummary(null);
    setRetried(false);
    setRows(prev => {
      const have = new Set(prev.map(r => r.file.name + r.file.size));
      const fresh = ok.filter(f => !have.has(f.name + f.size));
      return [
        ...prev,
        ...fresh.map(f => ({
          file: f,
          title: f.name.replace(/\.[^.]+$/, ""),
          progress: 0,
          state: "wait" as const,
        })),
      ];
    });
  };

  const patch = (i: number, data: Partial<Row>) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, ...data } : r)));

  const createSubject = async () => {
    const name = newSubject.trim();
    if (!name || addingSubject) return;
    if (!langId) { setErr("Сначала выберите предмет — каталог создаётся внутри него"); return; }
    setAddingSubject(true);
    setErr("");
    try {
      const res = await apiAddLibrarySubject(name, undefined, langId);
      if (res.ok && res.id) {
        const s = { id: res.id, name: res.name || name, color: res.color, parent_id: langId } as LibrarySubject;
        setAllSubjects(prev => prev.some(x => x.id === s.id) ? prev : [...prev, s]);
        setSubjectId(res.id);
        setNewSubject("");
        onDone();
      } else setErr(res.error || "Не удалось создать каталог");
    } catch {
      setErr("Нет связи с сервером");
    } finally {
      setAddingSubject(false);
    }
  };

  const runUpload = async (indexes: number[], isRetry: boolean) => {
    setBusy(true);
    setErr("");
    setSummary(null);
    let okCount = rows.filter(r => r.state === "done").length;
    const failedRows: Row[] = [];

    for (const i of indexes) {
      const row = rows[i];
      patch(i, { state: "run", progress: 0, error: "" });
      const meta = {
        title: row.title.trim() || row.file.name,
        author: author.trim(),
        description: description.trim(),
        subject_id: targetId,
      };
      const big = directUpload && row.file.size > SMALL_MB * 1024 * 1024;
      let lastError = "";
      let done = false;

      // До трёх попыток: сервер иногда отбрасывает файлы при плотном потоке
      for (let attempt = 1; attempt <= 3 && !done; attempt++) {
        if (attempt > 1) {
          patch(i, { state: "run", progress: 0, error: `Повтор ${attempt} из 3...` });
          await sleep(900 * attempt);
        }
        try {
          const res = big
            ? await apiUploadLibraryLarge(row.file, meta, p => patch(i, { progress: p }))
            : await apiUploadLibraryItem({
                ...meta,
                file_data: await readAsDataUrl(row.file),
                file_name: row.file.name,
                mime: row.file.type || "application/octet-stream",
              });
          if (res.ok) {
            patch(i, { state: "done", progress: 100, error: "" });
            okCount++;
            done = true;
          } else {
            lastError = res.error || "Сервер отклонил файл";
          }
        } catch {
          lastError = "Загрузка прервалась";
        }
      }

      if (!done) {
        patch(i, { state: "fail", error: lastError });
        failedRows.push({ ...row, error: lastError });
      }

      // Небольшая пауза между файлами — иначе сервер захлёбывается
      await sleep(250);
    }

    setBusy(false);
    if (isRetry) setRetried(true);
    setSummary({
      ok: okCount,
      failed: failedRows,
      final: isRetry || !failedRows.length,
    });

    if (okCount) onDone();
  };

  const uploadAll = () => {
    if (!rows.length) { setErr("Сначала выберите файлы или папку"); return; }
    const todo = rows.map((r, i) => (r.state === "done" ? -1 : i)).filter(i => i >= 0);
    runUpload(todo, false);
  };

  const retryFailed = () => {
    const idx = rows.map((r, i) => (r.state === "fail" ? i : -1)).filter(i => i >= 0);
    if (idx.length) runUpload(idx, true);
  };

  const counts = rows.reduce((acc, r) => {
    const k = kindWord(r.file.type);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const allDone = rows.length > 0 && rows.every(r => r.state === "done");
  const field = "mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <h2 className="font-montserrat font-bold text-base text-foreground mb-4">Загрузить в библиотеку</h2>

        {/* Каталог */}
        <div className="rounded-lg border border-border p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="FolderOpen" size={15} className="text-primary" />
            <span className="text-xs font-montserrat font-bold text-foreground">Куда загрузить</span>
            {subjectName && (
              <span className="text-[11px] text-muted-foreground font-ibm truncate">· {subjectName}</span>
            )}
          </div>

          <p className="text-[11px] font-montserrat font-bold text-muted-foreground mb-1">Предмет</p>
          <div className="flex flex-wrap gap-1.5">
            {languages.map(s => (
              <button key={s.id} onClick={() => { setLangId(s.id); setSubjectId(null); }}
                disabled={busy}
                className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors disabled:opacity-60
                  ${langId === s.id ? "text-white border-transparent" : "text-foreground border-border hover:bg-muted"}`}
                style={langId === s.id ? { background: s.color || "#c0392b" } : undefined}>
                {s.name}
              </button>
            ))}
            {!languages.length && (
              <span className="text-xs text-muted-foreground font-ibm">
                Предметы не созданы — добавьте их в разделе «Предметы»
              </span>
            )}
          </div>

          {!!langId && (
            <>
              <p className="text-[11px] font-montserrat font-bold text-muted-foreground mt-3 mb-1">
                Каталог внутри «{langName}»
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setSubjectId(null)} disabled={busy}
                  className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors disabled:opacity-60
                    ${subjectId === null ? "bg-foreground text-background border-transparent" : "text-foreground border-border hover:bg-muted"}`}>
                  Без каталога
                </button>
                {folders.map(s => (
                  <button key={s.id} onClick={() => setSubjectId(s.id)} disabled={busy}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors disabled:opacity-60
                      ${subjectId === s.id ? "text-white border-transparent" : "text-foreground border-border hover:bg-muted"}`}
                    style={subjectId === s.id ? { background: s.color || "#c0392b" } : undefined}>
                    <Icon name="Folder" size={11} />
                    {s.name}
                  </button>
                ))}
              </div>

              <div className="flex gap-1.5 mt-2">
                <input value={newSubject} onChange={e => setNewSubject(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createSubject(); }}
                  disabled={busy} placeholder={`Новый каталог в «${langName}»`}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-dashed border-border bg-muted/30 text-xs font-ibm outline-none focus:border-primary/40" />
                <button onClick={createSubject} disabled={busy || addingSubject || !newSubject.trim()}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-montserrat font-bold transition-colors disabled:opacity-50 ${
                    folderName && newSubject.trim() === folderName
                      ? "red-accent text-white border-transparent hover:opacity-90"
                      : "border-border text-foreground hover:bg-muted"
                  }`}>
                  {addingSubject ? "..." : "Создать"}
                </button>
              </div>
              {folderName && newSubject.trim() === folderName && (
                <p className="text-[11px] text-primary font-ibm mt-1 flex items-start gap-1.5">
                  <Icon name="Sparkles" size={12} className="flex-shrink-0 mt-0.5" />
                  Название взято из выбранной папки — нажмите «Создать» или исправьте
                </p>
              )}
            </>
          )}

          <p className="text-[11px] text-muted-foreground font-ibm mt-2">
            В один каталог можно складывать учебники, аудио и видео вместе
          </p>
        </div>

        <input ref={fileRef} type="file" multiple className="hidden"
          accept=".pdf,.epub,.fb2,.doc,.docx,.txt,.zip,audio/*,video/*"
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
        <input ref={dirRef} type="file" multiple className="hidden"
          {...{ webkitdirectory: "", directory: "" } as Record<string, string>}
          onChange={e => { if (e.target.files?.length) addFiles(e.target.files, true); e.target.value = ""; }} />

        <p className="text-[11px] text-muted-foreground font-ibm flex items-start gap-1.5">
          <Icon name="Info" size={12} className="text-primary flex-shrink-0 mt-0.5" />
          При выборе папки Windows показывает только вложенные папки — это нормально.
          Откройте нужную папку и нажмите «Выгрузить», файлы внутри подхватятся сами.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => fileRef.current?.click()} disabled={busy}
            className="flex items-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/40 transition-colors text-left disabled:opacity-60">
            <Icon name="Upload" size={18} className="text-primary flex-shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-montserrat font-bold text-foreground">Файлы</span>
              <span className="block text-[11px] text-muted-foreground font-ibm">можно несколько</span>
            </span>
          </button>
          <button onClick={() => dirRef.current?.click()} disabled={busy}
            className="flex items-center gap-2 px-3 py-3 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/40 transition-colors text-left disabled:opacity-60">
            <Icon name="FolderUp" size={18} className="text-primary flex-shrink-0" />
            <span className="min-w-0">
              <span className="block text-sm font-montserrat font-bold text-foreground">Папку целиком</span>
              <span className="block text-[11px] text-muted-foreground font-ibm truncate">
                {folderName || "со всем содержимым"}
              </span>
            </span>
          </button>
        </div>

        {!!rows.length && (
          <p className="text-[11px] text-muted-foreground font-ibm mt-2">
            Готово к загрузке: {rows.length} {plural(rows.length, "файл", "файла", "файлов")}
            {Object.keys(counts).length > 1 && ` · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(", ")}`}
          </p>
        )}

        {!!rows.length && (
          <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className={`rounded-lg border p-2.5 transition-colors
                ${r.state === "fail" ? "border-red-200 bg-red-50/50" : r.state === "done" ? "border-green-200 bg-green-50/40" : "border-border"}`}>
                <div className="flex items-center gap-2">
                  <Icon name={iconFor(r.file.type)} size={16} className="text-primary flex-shrink-0" />
                  <input value={r.title} disabled={busy}
                    onChange={e => patch(i, { title: e.target.value })}
                    className="flex-1 min-w-0 bg-transparent text-sm font-ibm outline-none border-b border-transparent focus:border-primary/40" />
                  {r.state === "done"
                    ? <Icon name="CircleCheck" size={15} className="text-green-600 flex-shrink-0" />
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
            <label className="text-xs font-montserrat font-bold text-muted-foreground">Автор (для всех файлов)</label>
            <input value={author} onChange={e => setAuthor(e.target.value)} disabled={busy}
              placeholder="Francisca Castro" className={field} />
          </div>
          <div>
            <label className="text-xs font-montserrat font-bold text-muted-foreground">Описание (для всех файлов)</label>
            <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} disabled={busy}
              placeholder="Учебник для начинающих" className={field + " resize-none"} />
          </div>
        </div>

        {err && <p className="text-xs text-red-600 font-ibm mt-2">{err}</p>}

        {/* Итог загрузки */}
        {summary && (
          <div className={`mt-3 rounded-lg border p-3
            ${summary.failed.length ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
            <div className="flex items-start gap-2">
              <Icon name={summary.failed.length ? "TriangleAlert" : "CircleCheck"} size={16}
                className={`flex-shrink-0 mt-0.5 ${summary.failed.length ? "text-amber-600" : "text-green-600"}`} />
              <div className="min-w-0">
                {!summary.failed.length ? (
                  <p className="text-sm font-montserrat font-bold text-green-800">
                    Загрузка завершена успешно
                  </p>
                ) : !summary.final ? (
                  <p className="text-sm font-montserrat font-bold text-amber-800">
                    Часть файлов не загрузилась
                  </p>
                ) : (
                  <p className="text-sm font-montserrat font-bold text-amber-800">
                    Загрузка завершена с ошибками
                  </p>
                )}

                <p className={`text-xs font-ibm mt-0.5 ${summary.failed.length ? "text-amber-700" : "text-green-700"}`}>
                  {summary.ok > 0 && <>Загружено {summary.ok} {plural(summary.ok, "файл", "файла", "файлов")}{subjectName ? ` в каталог «${subjectName}»` : ""}. </>}
                  {!!summary.failed.length && (
                    summary.final
                      ? `Не удалось загрузить ${summary.failed.length} ${plural(summary.failed.length, "файл", "файла", "файлов")} — попробуйте позже или проверьте формат и размер.`
                      : `${summary.failed.length} ${plural(summary.failed.length, "файл", "файла", "файлов")} не загрузилось. Можно повторить попытку.`
                  )}
                </p>

                {!!summary.failed.length && (
                  <ul className="mt-1.5 space-y-0.5">
                    {summary.failed.map((f, i) => (
                      <li key={i} className="text-[11px] text-amber-800 font-ibm truncate">
                        • {f.title || f.file.name} — {f.error}
                      </li>
                    ))}
                  </ul>
                )}

                {!!summary.failed.length && !summary.final && !retried && (
                  <button onClick={retryFailed} disabled={busy}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                    <Icon name="RotateCcw" size={13} />
                    Повторить загрузку ({summary.failed.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={busy}
            className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
            {allDone || (summary?.final) ? "Закрыть" : "Отмена"}
          </button>
          <button onClick={uploadAll} disabled={busy || allDone}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            {busy
              ? <><Icon name="Loader" size={14} className="animate-spin" />Загружаю...</>
              : rows.length > 1 ? `Загрузить ${rows.length}` : "Загрузить"}
          </button>
        </div>
      </div>
    </div>
  );
}