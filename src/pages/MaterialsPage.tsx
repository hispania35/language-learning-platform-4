import { useState, useEffect, useRef } from "react";
import { type User } from "@/pages/LoginPage";
import { apiGetMaterials, apiCreateMaterial, apiUploadMaterial, apiDeleteMaterial, type Material } from "@/lib/api";
import Icon from "@/components/ui/icon";
import LibraryPanel from "@/components/LibraryPanel";
import MaterialAssignDialog from "@/components/materials/MaterialAssignDialog";

const categories = ["Все", "Грамматика", "Аудио", "Видео", "Упражнения", "Словари"];

const DEFAULT_LIMITS: Record<string, number> = {
  "Аудио": 20, "Видео": 2048, "Упражнения": 100, "Грамматика": 200, "Словари": 200,
};

const ACCEPT: Record<string, string> = {
  "Аудио": "audio/*",
  "Видео": "video/*",
  "Упражнения": ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,image/*",
  "Грамматика": ".pdf,.doc,.docx,.epub,.fb2,.txt",
  "Словари": ".pdf,.doc,.docx,.epub,.fb2,.txt,.zip",
};

const fmtMb = (mb: number) => (mb >= 1024 ? `${Math.round(mb / 1024)} ГБ` : `${mb} МБ`);

const fmtSize = (b: number) => {
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  return `${(b / 1024 ** 3).toFixed(2)} ГБ`;
};

const typeOf = (file: File) => {
  const ext = (file.name.split(".").pop() || "").toUpperCase();
  if (["PDF", "MP3", "MP4", "DOCX", "DOC", "EPUB", "ZIP", "XLSX", "PPTX", "TXT", "WAV", "M4A", "MOV", "AVI", "MKV"].includes(ext)) return ext;
  if (file.type.startsWith("audio/")) return "MP3";
  if (file.type.startsWith("video/")) return "MP4";
  return ext || "FILE";
};

const typeIcons: Record<string, string> = {
  PDF: "FileText", MP3: "Music", WAV: "Music", M4A: "Music",
  MP4: "Video", MOV: "Video", AVI: "Video", MKV: "Video",
  DOCX: "FileEdit", DOC: "FileEdit", TXT: "FileText",
  ZIP: "FileArchive", XLSX: "Sheet", PPTX: "Presentation", EPUB: "BookOpen",
};
const typeColors: Record<string, string> = {
  PDF: "bg-red-100 text-red-700", MP3: "bg-purple-100 text-purple-700",
  WAV: "bg-purple-100 text-purple-700", M4A: "bg-purple-100 text-purple-700",
  MP4: "bg-blue-100 text-blue-700", MOV: "bg-blue-100 text-blue-700",
  AVI: "bg-blue-100 text-blue-700", MKV: "bg-blue-100 text-blue-700",
  DOCX: "bg-green-100 text-green-700", DOC: "bg-green-100 text-green-700",
  ZIP: "bg-amber-100 text-amber-700", XLSX: "bg-emerald-100 text-emerald-700",
  PPTX: "bg-orange-100 text-orange-700", EPUB: "bg-indigo-100 text-indigo-700",
};

export default function MaterialsPage({ user }: { user: User }) {
  const [section, setSection] = useState<"materials" | "library">("materials");
  const [activeCategory, setActiveCategory] = useState("Все");
  const [search, setSearch] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "Грамматика", file_type: "PDF", file_size: "" });
  const [saving, setSaving] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>(DEFAULT_LIMITS);
  const [storageReady, setStorageReady] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [confirmDel, setConfirmDel] = useState<Material | null>(null);
  const [assignFor, setAssignFor] = useState<Material | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const limitMb = limits[form.category] ?? 200;

  const reload = () => apiGetMaterials().then(res => {
    if (res.materials) setMaterials(res.materials);
    if (res.limits) setLimits(res.limits);
    if (typeof res.storage_ready === "boolean") setStorageReady(res.storage_ready);
  });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const pickFile = (f: File) => {
    const max = (limits[form.category] ?? 200) * 1024 * 1024;
    if (f.size > max) {
      setError(`Файл ${fmtSize(f.size)} — для «${form.category}» максимум ${fmtMb(limits[form.category] ?? 200)}`);
      return;
    }
    setError("");
    setFile(f);
    setForm(prev => ({
      ...prev,
      title: prev.title || f.name.replace(/\.[^.]+$/, ""),
      file_type: typeOf(f),
      file_size: fmtSize(f.size),
    }));
  };

  const filtered = materials.filter(m => {
    const matchCat = activeCategory === "Все" || m.category === activeCategory;
    const matchSearch = m.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const resetForm = () => {
    setForm({ title: "", description: "", category: "Грамматика", file_type: "PDF", file_size: "" });
    setFile(null);
    setProgress(0);
    setError("");
  };

  const handleAdd = async () => {
    if (!form.title.trim()) { setError("Введите название материала"); return; }
    setSaving(true);
    setError("");
    setProgress(0);
    try {
      const res = file
        ? await apiUploadMaterial(file, form, p => setProgress(p))
        : await apiCreateMaterial(form);
      if (res.ok) {
        await reload();
        setShowAdd(false);
        resetForm();
      } else setError(res.error || "Не удалось сохранить материал");
    } catch {
      setError("Загрузка прервалась, попробуйте ещё раз");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    const res = await apiDeleteMaterial(confirmDel.id);
    if (res.ok) { setConfirmDel(null); reload(); }
    else setError(res.error || "Не удалось удалить");
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
    } catch { return dateStr; }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex gap-2 bg-muted/40 rounded-xl p-1 w-fit">
        <button onClick={() => setSection("materials")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-medium transition-all
            ${section === "materials" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Icon name="FolderOpen" size={15} />
          Материалы
        </button>
        <button onClick={() => setSection("library")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-montserrat font-medium transition-all
            ${section === "library" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          <Icon name="Library" size={15} />
          Библиотека
        </button>
      </div>

      {section === "library" ? (
        <LibraryPanel isTeacher={user.role === "teacher"} />
      ) : (
      <>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-card rounded-xl border border-border px-4 py-2.5 flex-1">
          <Icon name="Search" size={16} className="text-muted-foreground flex-shrink-0" />
          <input type="text" placeholder="Поиск материалов..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full font-ibm" />
        </div>
        {user.role === "teacher" && (
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-montserrat font-medium hover:bg-primary/90 transition-colors flex-shrink-0">
            <Icon name="Plus" size={16} />
            Добавить материал
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-3 animate-scale-in">
          <p className="font-montserrat font-bold text-sm text-foreground">Новый материал</p>

          <div>
            <label className="text-xs font-montserrat font-bold text-muted-foreground">Раздел</label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {categories.filter(c => c !== "Все").map(c => (
                <button key={c} onClick={() => { setForm({ ...form, category: c }); setError(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors
                    ${form.category === c ? "bg-primary text-white border-transparent" : "text-foreground border-border hover:bg-muted"}`}>
                  {c} <span className="font-normal opacity-70">до {fmtMb(limits[c] ?? 200)}</span>
                </button>
              ))}
            </div>
          </div>

          <input ref={fileRef} type="file" className="hidden" accept={ACCEPT[form.category] || "*"}
            onChange={e => { if (e.target.files?.[0]) pickFile(e.target.files[0]); e.target.value = ""; }} />

          {!file ? (
            <button onClick={() => fileRef.current?.click()} disabled={saving || !storageReady}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (e.dataTransfer.files?.[0]) pickFile(e.dataTransfer.files[0]); }}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/40 transition-colors text-left disabled:opacity-60">
              <Icon name="Upload" size={20} className="text-primary flex-shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-montserrat font-bold text-foreground">Выбрать файл или перетащить</span>
                <span className="block text-xs text-muted-foreground font-ibm">
                  Раздел «{form.category}» — файлы до {fmtMb(limitMb)}
                </span>
              </span>
            </button>
          ) : (
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[form.file_type] || "bg-muted"}`}>
                  <Icon name={typeIcons[form.file_type] || "File"} size={17} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-ibm text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground font-ibm">{fmtSize(file.size)}</p>
                </div>
                {!saving && (
                  <button onClick={() => { setFile(null); setProgress(0); }} className="p-1 rounded hover:bg-muted">
                    <Icon name="X" size={15} className="text-muted-foreground" />
                  </button>
                )}
              </div>
              {saving && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <span className="block h-full red-accent transition-all duration-200" style={{ width: `${progress || 3}%` }} />
                  </span>
                  <span className="text-[11px] text-muted-foreground font-ibm w-9 text-right">{progress}%</span>
                </div>
              )}
            </div>
          )}

          {!storageReady && (
            <p className="text-xs text-amber-700 font-ibm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Облачное хранилище не подключено — материал сохранится без файла
            </p>
          )}

          <input type="text" placeholder="Название материала" value={form.title}
            onChange={e => { setForm({ ...form, title: e.target.value }); setError(""); }}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
          <textarea placeholder="Описание" value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
              <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 font-ibm">{error}</p>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving}
              className="px-5 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
              {saving ? (file ? `Загружаю... ${progress}%` : "Сохраняю...") : "Добавить"}
            </button>
            <button onClick={() => { setShowAdd(false); resetForm(); }} disabled={saving}
              className="px-4 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-muted-foreground hover:bg-muted disabled:opacity-60">
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium font-montserrat transition-all duration-150 ${
              activeCategory === cat ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>{cat}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
              <div className="flex gap-3"><div className="w-10 h-10 bg-muted rounded-lg" />
                <div className="flex-1 space-y-2"><div className="h-4 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-1/2" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((m, i) => (
            <div key={m.id} className="bg-card rounded-xl border border-border p-4 card-hover animate-fade-in cursor-pointer group"
              style={{ animationDelay: `${i * 0.04}s` }}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${typeColors[m.file_type] || "bg-muted"}`}>
                  <Icon name={typeIcons[m.file_type] || "File"} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-montserrat font-bold text-sm text-foreground leading-snug">{m.title}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5 font-ibm line-clamp-2">{m.description}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-ibm">
                  {m.file_size && <span>{m.file_size}</span>}
                  <span>·</span>
                  <span>{formatDate(m.created_at)}</span>
                </div>
                <div className="flex gap-1.5 items-center">
                  {m.file_url ? (
                    <a href={m.file_url} target="_blank" rel="noreferrer" download
                      title="Скачать файл"
                      className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                      <Icon name="Download" size={15} className="text-primary" />
                    </a>
                  ) : (
                    <span title="Файл не прикреплён" className="p-1.5">
                      <Icon name="FileX" size={15} className="text-muted-foreground/50" />
                    </span>
                  )}
                  {user.role === "teacher" && (
                    <>
                      <button onClick={() => setAssignFor(m)} title="Кому выдать материал"
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                        <Icon name="UserPlus" size={15} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => setConfirmDel(m)} title="Удалить материал"
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100">
                        <Icon name="Trash2" size={15} className="text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded font-montserrat font-bold ${typeColors[m.file_type] || "bg-muted text-muted-foreground"}`}>{m.file_type}</span>
                <span className="text-xs text-muted-foreground font-ibm">{m.category}</span>
                {!m.students?.length && !m.lessons?.length ? (
                  <span className="text-xs text-muted-foreground/70 font-ibm flex items-center gap-1">
                    <Icon name="Globe" size={12} /> всем
                  </span>
                ) : (
                  <>
                    {!!m.students?.length && (
                      <span className="text-xs font-ibm flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700"
                        title={m.students.map(s => s.name).join(", ")}>
                        <Icon name="Users" size={12} /> {m.students.length}
                      </span>
                    )}
                    {!!m.lessons?.length && (
                      <span className="text-xs font-ibm flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700"
                        title={m.lessons.map(l => `${l.lesson_date} ${l.lesson_time} — ${l.topic}`).join("\n")}>
                        <Icon name="CalendarDays" size={12} /> {m.lessons.length}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-16 text-center">
          <Icon name="SearchX" size={40} className="text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-ibm">Материалов не найдено</p>
        </div>
      )}
      </>
      )}

      {assignFor && (
        <MaterialAssignDialog material={assignFor}
          onClose={() => setAssignFor(null)}
          onDone={() => reload()} />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1">Удалить материал?</h2>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              «{confirmDel.title}» будет удалён вместе с файлом. Отменить не получится.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
                Отмена
              </button>
              <button onClick={handleDelete}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-montserrat font-bold hover:bg-red-700 transition-colors">
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}