import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import LibraryUploadDialog from "@/components/library/LibraryUploadDialog";
import SubjectsDialog from "@/components/library/SubjectsDialog";
import {
  apiGetLibrary, apiDeleteLibraryItem, apiAssignLibraryItem,
  apiGetStudents, apiGetGroups,
  type LibraryItem, type LibrarySubject, type StudentInfo, type StudentGroup,
} from "@/lib/api";

const fmtSize = (b?: number) => {
  if (!b) return "";
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
};

const kindIcon = (k: string) => (k === "audio" ? "Music" : k === "video" ? "Video" : "BookOpen");
const kindLabel = (k: string) => (k === "audio" ? "Аудио" : k === "video" ? "Видео" : "Книга");
const kindStyle = (k: string) =>
  k === "audio" ? "bg-purple-100 text-purple-700"
    : k === "video" ? "bg-blue-100 text-blue-700"
      : "bg-red-100 text-red-700";

export default function LibraryPanel({ isTeacher }: { isTeacher: boolean }) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [subjects, setSubjects] = useState<LibrarySubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "book" | "audio" | "video">("all");
  const [subjectTab, setSubjectTab] = useState<number | "all">("all");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [showSubjects, setShowSubjects] = useState(false);
  const [maxMb, setMaxMb] = useState(60);
  const [directUpload, setDirectUpload] = useState(false);

  const [assignItem, setAssignItem] = useState<LibraryItem | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [pickedStudents, setPickedStudents] = useState<number[]>([]);
  const [pickedGroup, setPickedGroup] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);

  const [delItem, setDelItem] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkDel, setBulkDel] = useState(false);
  const [bulkAssign, setBulkAssign] = useState(false);
  const [bulkDone, setBulkDone] = useState(0);
  const [playing, setPlaying] = useState<number | null>(null);

  const load = useCallback(() => {
    apiGetLibrary()
      .then(res => {
        if (res.items) setItems(res.items);
        if (res.subjects) setSubjects(res.subjects);
        if (res.max_mb) setMaxMb(res.max_mb);
        setDirectUpload(!!res.direct_upload);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isTeacher) return;
    apiGetStudents().then(r => { if (r.students) setStudents(r.students); }).catch(() => {});
    apiGetGroups().then(r => { if (r.groups) setGroups(r.groups); }).catch(() => {});
  }, [isTeacher]);

  const doAssign = async () => {
    const ids = bulkAssign ? selected : assignItem ? [assignItem.id] : [];
    if (!ids.length) return;
    if (!pickedGroup && !pickedStudents.length) { setErr("Выберите ученика или группу"); return; }
    setAssigning(true);
    setBulkDone(0);
    const target = pickedGroup ? { group_id: pickedGroup } : { student_ids: pickedStudents };
    let ok = 0;
    let people = 0;
    const failed: string[] = [];
    try {
      for (const id of ids) {
        const res = await apiAssignLibraryItem({ item_id: id, ...target });
        if (res.ok) { ok++; people = res.assigned || people; }
        else failed.push(items.find(i => i.id === id)?.title || `#${id}`);
        setBulkDone(d => d + 1);
      }
      setAssignItem(null); setBulkAssign(false);
      setPickedStudents([]); setPickedGroup(null);
      if (ok) {
        setMsg(ids.length > 1
          ? `Выдано материалов: ${ok} · получателей: ${people}`
          : `Книга выдана: ${people} чел.`);
        setTimeout(() => setMsg(""), 4000);
        if (bulkAssign) exitSelect();
      }
      if (failed.length) setErr(`Не удалось выдать: ${failed.join(", ")}`);
      load();
    } catch {
      setErr("Нет связи с сервером");
    } finally {
      setAssigning(false);
    }
  };

  const doDelete = async () => {
    if (!delItem || deleting) return;
    setDeleting(true);
    setErr("");
    try {
      const res = await apiDeleteLibraryItem(delItem.id);
      if (res.ok) {
        const gone = delItem.id;
        setItems(prev => prev.filter(i => i.id !== gone));
        setDelItem(null);
        setMsg("Файл удалён из библиотеки");
        setTimeout(() => setMsg(""), 4000);
        load();
      } else {
        setDelItem(null);
        setErr(res.error || "Не удалось удалить файл");
      }
    } catch {
      setDelItem(null);
      setErr("Нет связи с сервером, попробуйте ещё раз");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSel = (id: number) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const exitSelect = () => { setSelectMode(false); setSelected([]); };

  const doBulkDelete = async () => {
    if (!selected.length || deleting) return;
    setDeleting(true);
    setErr("");
    setBulkDone(0);
    let ok = 0;
    const failed: string[] = [];
    for (const id of selected) {
      try {
        const res = await apiDeleteLibraryItem(id);
        if (res.ok) {
          ok++;
          setItems(prev => prev.filter(i => i.id !== id));
        } else {
          failed.push(items.find(i => i.id === id)?.title || `#${id}`);
        }
      } catch {
        failed.push(items.find(i => i.id === id)?.title || `#${id}`);
      }
      setBulkDone(d => d + 1);
    }
    setDeleting(false);
    setBulkDel(false);
    exitSelect();
    if (ok) {
      setMsg(`Удалено файлов: ${ok}`);
      setTimeout(() => setMsg(""), 4000);
    }
    if (failed.length) setErr(`Не удалось удалить: ${failed.join(", ")}`);
    load();
  };

  const shown = items.filter(i => {
    const okTab = tab === "all" || i.kind === tab;
    const okSubject = subjectTab === "all" || i.subject_id === subjectTab;
    const okSearch = !search ||
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      (i.author || "").toLowerCase().includes(search.toLowerCase());
    return okTab && okSubject && okSearch;
  });

  const subjectById = (id?: number | null) => subjects.find(s => s.id === id);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-card rounded-xl border border-border px-4 py-2.5 flex-1">
          <Icon name="Search" size={16} className="text-muted-foreground flex-shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию или автору"
            className="flex-1 bg-transparent text-sm font-ibm outline-none" />
        </div>

        <div className="flex gap-1 bg-muted/40 rounded-xl p-1">
          {([["all", "Все"], ["book", "Книги"], ["audio", "Аудио"], ["video", "Видео"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-montserrat font-medium transition-all
                ${tab === v ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {isTeacher && (
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 red-accent text-white rounded-xl text-sm font-montserrat font-bold hover:opacity-90 transition-opacity">
              <Icon name="Upload" size={16} />
              Загрузить
            </button>
            {!!items.length && (
              <button onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-montserrat font-bold transition-colors
                  ${selectMode ? "border-primary text-primary bg-primary/5" : "border-border text-foreground hover:bg-muted"}`}>
                <Icon name={selectMode ? "X" : "ListChecks"} size={16} />
                {selectMode ? "Отменить" : "Выбрать"}
              </button>
            )}
          </div>
        )}
      </div>

      {isTeacher && selectMode && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/5 sticky top-2 z-10">
          <span className="text-sm font-montserrat font-bold text-foreground">
            Выбрано: {selected.length}
          </span>
          <button onClick={() => setSelected(selected.length === shown.length ? [] : shown.map(i => i.id))}
            className="text-xs font-montserrat font-bold text-primary hover:underline">
            {selected.length === shown.length && shown.length > 0 ? "Снять все" : "Выбрать все"}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => { setBulkAssign(true); setPickedStudents([]); setPickedGroup(null); }}
              disabled={!selected.length}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg red-accent text-white text-xs font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
              <Icon name="Send" size={13} />
              Выдать выбранные
            </button>
            <button onClick={() => setBulkDel(true)} disabled={!selected.length}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-montserrat font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
              <Icon name="Trash2" size={13} />
              Удалить
            </button>
          </div>
        </div>
      )}

      {(subjects.length > 0 || isTeacher) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setSubjectTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors
              ${subjectTab === "all" ? "bg-foreground text-background border-transparent" : "text-foreground border-border hover:bg-muted"}`}>
            Все предметы
          </button>
          {subjects.map(s => (
            <button key={s.id} onClick={() => setSubjectTab(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors
                ${subjectTab === s.id ? "text-white border-transparent" : "text-foreground border-border hover:bg-muted"}`}
              style={subjectTab === s.id ? { background: s.color || "#c0392b" } : undefined}>
              {s.name}
            </button>
          ))}
          {isTeacher && (
            <button onClick={() => setShowSubjects(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border border-dashed border-border text-muted-foreground hover:bg-muted transition-colors">
              <Icon name="Settings2" size={13} />
              Предметы
            </button>
          )}
        </div>
      )}

      {err && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 font-ibm flex-1">{err}</p>
          <button onClick={() => setErr("")}><Icon name="X" size={13} className="text-red-500" /></button>
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
          <Icon name="Check" size={14} className="text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700 font-ibm">{msg}</p>
        </div>
      )}

      {loading ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-muted-foreground font-ibm">
          Загрузка библиотеки...
        </div>
      ) : !shown.length ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <Icon name="BookOpen" size={36} className="text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground font-ibm">
            {isTeacher ? "Библиотека пуста — загрузите первую книгу или аудио" : "Вам пока не выдали книги"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shown.map(item => (
            <div key={item.id}
              onClick={() => selectMode && toggleSel(item.id)}
              className={`bg-card rounded-xl border p-4 transition-colors
                ${selectMode ? "cursor-pointer" : ""}
                ${selectMode && selected.includes(item.id) ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border"}`}>
              <div className="flex items-start gap-3">
                {selectMode ? (
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-colors
                    ${selected.includes(item.id) ? "red-accent border-transparent" : "border-border bg-muted/30"}`}>
                    <Icon name={selected.includes(item.id) ? "Check" : kindIcon(item.kind)} size={20}
                      className={selected.includes(item.id) ? "text-white" : "text-muted-foreground"} />
                  </span>
                ) : (
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${kindStyle(item.kind)}`}>
                    <Icon name={kindIcon(item.kind)} size={20} />
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-montserrat font-bold text-sm text-foreground truncate">{item.title}</p>
                  {item.author && <p className="text-xs text-muted-foreground font-ibm truncate">{item.author}</p>}
                  {item.description && (
                    <p className="text-xs text-muted-foreground font-ibm mt-1 line-clamp-2">{item.description}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground font-ibm mt-1 flex items-center gap-1.5 flex-wrap">
                    {subjectById(item.subject_id) && (
                      <span className="px-1.5 py-0.5 rounded text-white font-montserrat font-bold text-[10px]"
                        style={{ background: subjectById(item.subject_id)?.color || "#c0392b" }}>
                        {subjectById(item.subject_id)?.name}
                      </span>
                    )}
                    <span>
                      {kindLabel(item.kind)}
                      {item.size_bytes ? ` · ${fmtSize(item.size_bytes)}` : ""}
                      {item.students?.length ? ` · выдана ${item.students.length}` : ""}
                    </span>
                  </p>
                </div>
              </div>

              {!selectMode && (item.kind === "audio" || item.kind === "video") && (
                <div className="mt-3">
                  {playing === item.id ? (
                    item.kind === "video"
                      ? <video controls autoPlay src={item.file_url} className="w-full rounded-lg bg-black max-h-64" />
                      : <audio controls autoPlay src={item.file_url} className="w-full h-9" />
                  ) : (
                    <button onClick={() => setPlaying(item.id)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
                      <Icon name="Play" size={15} />
                      {item.kind === "video" ? "Смотреть" : "Слушать"}
                    </button>
                  )}
                </div>
              )}

              <div className={`mt-3 flex gap-2 ${selectMode ? "hidden" : ""}`}>
                <a href={item.file_url} target="_blank" rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
                  <Icon name="Download" size={14} />
                  {item.kind === "book" ? "Открыть" : "Скачать"}
                </a>

                {isTeacher && (
                  <>
                    <button onClick={() => { setAssignItem(item); setPickedStudents([]); setPickedGroup(null); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity">
                      <Icon name="Send" size={14} />
                      Выдать
                    </button>
                    <button onClick={() => setDelItem(item)} title="Удалить"
                      className="w-10 rounded-lg border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-50 transition-colors">
                      <Icon name="Trash2" size={15} />
                    </button>
                  </>
                )}
              </div>

              {isTeacher && !!item.students?.length && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.students.map(s => (
                    <span key={s.id} className="text-[11px] font-ibm px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <LibraryUploadDialog
          subjects={subjects}
          maxMb={maxMb}
          directUpload={directUpload}
          onClose={() => setShowAdd(false)}
          onDone={() => { load(); setMsg("Файлы загружены в библиотеку"); setTimeout(() => setMsg(""), 4000); }}
        />
      )}

      {showSubjects && (
        <SubjectsDialog
          subjects={subjects}
          onClose={() => setShowSubjects(false)}
          onChanged={load}
        />
      )}

      {/* Выдача */}
      {(assignItem || bulkAssign) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40"
            onClick={() => { if (!assigning) { setAssignItem(null); setBulkAssign(false); } }} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            <h2 className="font-montserrat font-bold text-base text-foreground">
              {bulkAssign ? `Выдать ${selected.length} материалов` : "Выдать книгу"}
            </h2>
            {bulkAssign ? (
              <div className="mt-2 mb-4 max-h-24 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {selected.map(id => (
                  <p key={id} className="px-3 py-1.5 text-xs font-ibm text-foreground truncate">
                    {items.find(i => i.id === id)?.title || `#${id}`}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground font-ibm mb-4 truncate">{assignItem?.title}</p>
            )}

            {groups.length > 0 && (
              <>
                <p className="text-xs font-montserrat font-bold text-muted-foreground mb-1.5">Выдать группе</p>
                <div className="space-y-1.5 mb-4">
                  {groups.map(g => (
                    <button key={g.id}
                      onClick={() => { setPickedGroup(pickedGroup === g.id ? null : g.id); setPickedStudents([]); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left
                        ${pickedGroup === g.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: g.color || "#c0392b" }}>
                        <Icon name="Users" size={14} className="text-white" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-montserrat font-bold text-foreground truncate">{g.name}</span>
                        <span className="block text-xs text-muted-foreground font-ibm">{g.students.length} учеников</span>
                      </span>
                      {pickedGroup === g.id && <Icon name="Check" size={16} className="text-primary flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs font-montserrat font-bold text-muted-foreground mb-1.5">Или выбрать учеников</p>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {students.map(s => {
                const on = pickedStudents.includes(s.id);
                return (
                  <button key={s.id}
                    onClick={() => {
                      setPickedGroup(null);
                      setPickedStudents(prev => on ? prev.filter(x => x !== s.id) : [...prev, s.id]);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors text-left
                      ${on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}>
                    <span className="w-7 h-7 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-montserrat font-bold text-[10px]">{s.avatar}</span>
                    </span>
                    <span className="text-sm font-ibm text-foreground flex-1 truncate">{s.name}</span>
                    {on && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>

            {assigning && bulkAssign && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground font-ibm mb-1">
                  Выдано {bulkDone} из {selected.length}
                </p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full red-accent transition-all duration-200"
                    style={{ width: `${(bulkDone / selected.length) * 100}%` }} />
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => { setAssignItem(null); setBulkAssign(false); }} disabled={assigning}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Отмена
              </button>
              <button onClick={doAssign} disabled={assigning}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                {assigning ? <><Icon name="Loader" size={14} className="animate-spin" />Выдаю...</> : "Выдать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Массовое удаление */}
      {bulkDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !deleting && setBulkDel(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1">
              Удалить {selected.length} файлов?
            </h2>
            <p className="text-sm text-muted-foreground font-ibm mb-3">
              Файлы удалятся безвозвратно, ученики потеряют к ним доступ.
            </p>

            <div className="max-h-32 overflow-y-auto rounded-lg border border-border divide-y divide-border mb-4">
              {selected.map(id => {
                const it = items.find(i => i.id === id);
                return (
                  <p key={id} className="px-3 py-1.5 text-xs font-ibm text-foreground truncate">
                    {it?.title || `#${id}`}
                  </p>
                );
              })}
            </div>

            {deleting && (
              <div className="mb-3">
                <p className="text-xs text-muted-foreground font-ibm mb-1">
                  Удалено {bulkDone} из {selected.length}
                </p>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full red-accent transition-all duration-200"
                    style={{ width: `${(bulkDone / selected.length) * 100}%` }} />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setBulkDel(false)} disabled={deleting}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Отмена
              </button>
              <button onClick={doBulkDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-600 text-white text-sm font-montserrat font-bold hover:bg-red-700 transition-colors disabled:opacity-70">
                {deleting ? <><Icon name="Loader" size={14} className="animate-spin" />Удаляю...</> : "Удалить всё"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Удаление */}
      {delItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !deleting && setDelItem(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1">Удалить из библиотеки?</h2>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              «{delItem.title}» — файл удалится безвозвратно, ученики потеряют доступ.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDelItem(null)} disabled={deleting}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Отмена
              </button>
              <button onClick={doDelete} disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-red-600 text-white text-sm font-montserrat font-bold hover:bg-red-700 transition-colors disabled:opacity-70">
                {deleting ? <><Icon name="Loader" size={14} className="animate-spin" />Удаляю...</> : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}