import { useState } from "react";
import Icon from "@/components/ui/icon";
import {
  apiAddLibrarySubject, apiDeleteLibrarySubject, apiRenameLibrarySubject,
  type LibrarySubject,
} from "@/lib/api";

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
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [addFolderFor, setAddFolderFor] = useState<number | null>(null);
  const [folderName, setFolderName] = useState("");

  const languages = subjects.filter(s => !s.parent_id);
  const foldersOf = (id: number) => subjects.filter(s => s.parent_id === id);

  const addLanguage = async () => {
    if (!name.trim()) { setErr("Введите название предмета"); return; }
    setBusy(true); setErr("");
    const res = await apiAddLibrarySubject(name.trim(), color, null);
    setBusy(false);
    if (res.ok) { setName(""); onChanged(); }
    else setErr(res.error || "Не удалось добавить");
  };

  const addFolder = async (parentId: number) => {
    if (!folderName.trim()) return;
    setBusy(true); setErr("");
    const res = await apiAddLibrarySubject(folderName.trim(), undefined, parentId);
    setBusy(false);
    if (res.ok) { setFolderName(""); setAddFolderFor(null); onChanged(); }
    else setErr(res.error || "Не удалось создать каталог");
  };

  const saveName = async () => {
    if (editId === null || !editName.trim()) { setEditId(null); return; }
    setBusy(true); setErr("");
    const res = await apiRenameLibrarySubject(editId, editName.trim());
    setBusy(false);
    setEditId(null);
    if (res.ok) onChanged();
    else setErr(res.error || "Не удалось переименовать");
  };

  const remove = async (id: number) => {
    setBusy(true); setErr("");
    const res = await apiDeleteLibrarySubject(id);
    setBusy(false);
    setConfirmId(null);
    if (res.ok) onChanged();
    else setErr(res.error || "Не удалось удалить");
  };

  const startEdit = (s: LibrarySubject) => { setEditId(s.id); setEditName(s.name); setConfirmId(null); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <h2 className="font-montserrat font-bold text-base text-foreground">Предметы и каталоги</h2>
        <p className="text-xs text-muted-foreground font-ibm mb-4">
          Каталоги создаются внутри предмета — английский, испанский, немецкий и другие
        </p>

        <div className="space-y-2">
          {languages.map(lang => {
            const folders = foldersOf(lang.id);
            return (
              <div key={lang.id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 px-3 py-2 bg-muted/30">
                  <span className="w-7 h-7 rounded-lg flex-shrink-0" style={{ background: lang.color || "#c0392b" }} />

                  {editId === lang.id ? (
                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditId(null); }}
                      onBlur={saveName} disabled={busy}
                      className="flex-1 min-w-0 px-2 py-1 rounded border border-primary/40 bg-card text-sm font-montserrat font-bold outline-none" />
                  ) : (
                    <span className="flex-1 min-w-0 text-sm font-montserrat font-bold text-foreground truncate">
                      {lang.name}
                      <span className="ml-2 text-[11px] font-ibm font-normal text-muted-foreground">
                        {folders.length ? `${folders.length} катал.` : "без каталогов"}
                      </span>
                    </span>
                  )}

                  {confirmId === lang.id ? (
                    <>
                      <button onClick={() => remove(lang.id)} disabled={busy}
                        className="text-xs font-montserrat font-bold text-red-600 px-2 py-1 rounded hover:bg-red-50">
                        Удалить всё
                      </button>
                      <button onClick={() => setConfirmId(null)}
                        className="text-xs font-ibm text-muted-foreground px-1">Отмена</button>
                    </>
                  ) : editId !== lang.id && (
                    <>
                      <button onClick={() => { setAddFolderFor(lang.id); setFolderName(""); }} title="Добавить каталог"
                        className="w-7 h-7 rounded-lg border border-border text-foreground flex items-center justify-center hover:bg-muted transition-colors">
                        <Icon name="FolderPlus" size={13} />
                      </button>
                      <button onClick={() => startEdit(lang)} title="Переименовать"
                        className="w-7 h-7 rounded-lg border border-border text-foreground flex items-center justify-center hover:bg-muted transition-colors">
                        <Icon name="Pencil" size={13} />
                      </button>
                      <button onClick={() => setConfirmId(lang.id)} title="Удалить предмет"
                        className="w-7 h-7 rounded-lg border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 transition-colors">
                        <Icon name="Trash2" size={13} />
                      </button>
                    </>
                  )}
                </div>

                {confirmId === lang.id && !!folders.length && (
                  <p className="px-3 py-1.5 text-[11px] font-ibm text-red-700 bg-red-50">
                    Вместе с предметом удалятся каталоги: {folders.map(f => f.name).join(", ")}. Файлы останутся в библиотеке.
                  </p>
                )}

                {(!!folders.length || addFolderFor === lang.id) && (
                  <div className="p-2 space-y-1">
                    {folders.map(f => (
                      <div key={f.id} className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg hover:bg-muted/40">
                        <Icon name="Folder" size={14} className="text-muted-foreground flex-shrink-0" />

                        {editId === f.id ? (
                          <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditId(null); }}
                            onBlur={saveName} disabled={busy}
                            className="flex-1 min-w-0 px-2 py-0.5 rounded border border-primary/40 bg-card text-sm font-ibm outline-none" />
                        ) : (
                          <span className="flex-1 min-w-0 text-sm font-ibm text-foreground truncate">{f.name}</span>
                        )}

                        {confirmId === f.id ? (
                          <>
                            <button onClick={() => remove(f.id)} disabled={busy}
                              className="text-xs font-montserrat font-bold text-red-600 px-2 py-0.5 rounded hover:bg-red-50">
                              Удалить
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="text-xs font-ibm text-muted-foreground px-1">Отмена</button>
                          </>
                        ) : editId !== f.id && (
                          <>
                            <button onClick={() => startEdit(f)} title="Переименовать"
                              className="w-7 h-7 rounded-lg text-muted-foreground flex items-center justify-center hover:bg-muted transition-colors">
                              <Icon name="Pencil" size={12} />
                            </button>
                            <button onClick={() => setConfirmId(f.id)} title="Удалить каталог"
                              className="w-7 h-7 rounded-lg text-red-600 flex items-center justify-center hover:bg-red-50 transition-colors">
                              <Icon name="Trash2" size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}

                    {addFolderFor === lang.id && (
                      <div className="flex gap-1.5 pl-3 pr-2 pt-1">
                        <input autoFocus value={folderName} onChange={e => setFolderName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") addFolder(lang.id);
                            if (e.key === "Escape") setAddFolderFor(null);
                          }}
                          placeholder="Название каталога, например «Libro del alumno»"
                          className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-dashed border-border bg-muted/30 text-xs font-ibm outline-none focus:border-primary/40" />
                        <button onClick={() => addFolder(lang.id)} disabled={busy || !folderName.trim()}
                          className="px-3 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
                          ОК
                        </button>
                        <button onClick={() => setAddFolderFor(null)}
                          className="px-2 text-xs font-ibm text-muted-foreground">Отмена</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {!languages.length && (
            <p className="text-sm text-muted-foreground font-ibm">Пока ни одного предмета</p>
          )}
        </div>

        <p className="text-xs font-montserrat font-bold text-muted-foreground mt-4 mb-1.5">Новый предмет</p>
        <div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addLanguage()}
            placeholder="Французский"
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          <button onClick={addLanguage} disabled={busy}
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
