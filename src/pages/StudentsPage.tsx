import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import useStickyTab from "@/hooks/useStickyTab";
import {
  apiGetStudents, apiGetGroups, apiCreateGroup, apiUpdateGroup, apiDeleteGroup, apiUpdateStudent,
  type StudentInfo, type StudentGroup,
} from "@/lib/api";
import { type User } from "@/pages/LoginPage";
import { TIMEZONES, LANGUAGES, DEFAULT_TZ } from "@/lib/locales";
import { useTimezone } from "@/hooks/useTimezone";
import { nowIn, tzTitle, tzDiffLabel } from "@/lib/timezone";

const GROUP_COLORS = [
  { key: "primary", dot: "bg-primary", soft: "bg-primary/10 text-primary" },
  { key: "green", dot: "bg-green-500", soft: "bg-green-100 text-green-700" },
  { key: "blue", dot: "bg-blue-500", soft: "bg-blue-100 text-blue-700" },
  { key: "purple", dot: "bg-purple-500", soft: "bg-purple-100 text-purple-700" },
  { key: "orange", dot: "bg-orange-400", soft: "bg-orange-100 text-orange-700" },
];

const colorOf = (key: string) => GROUP_COLORS.find(c => c.key === key) || GROUP_COLORS[0];

export default function StudentsPage({ user }: { user: User }) {
  const isTeacher = (user.role === "teacher" || user.role === "admin");
  const { tz: myTz } = useTimezone();
  const [tab, setTab] = useStickyTab("sub", ["students", "groups"] as const, "students");
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editor, setEditor] = useState<StudentGroup | "new" | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "primary" });
  const [formStudents, setFormStudents] = useState<number[]>([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<StudentGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editStudent, setEditStudent] = useState<StudentInfo | null>(null);
  const [sForm, setSForm] = useState({
    name: "", level: "", email: "", phone: "", social_name: "", social_url: "", note: "",
    timezone: DEFAULT_TZ, languages: ["es"] as string[],
  });
  const [sError, setSError] = useState("");
  const [sSaving, setSSaving] = useState(false);

  const loadAll = () => {
    Promise.all([apiGetStudents(), isTeacher ? apiGetGroups() : Promise.resolve({ groups: [] })])
      .then(([s, g]) => {
        if (s.students) setStudents(s.students);
        if (g.groups) setGroups(g.groups);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, [isTeacher]);

  const q = search.toLowerCase().trim();
  const filtered = students.filter(s =>
    !q || s.name.toLowerCase().includes(q) ||
    (s.email || "").toLowerCase().includes(q) ||
    (s.phone || "").includes(q)
  );

  const groupsOf = (studentId: number) =>
    groups.filter(g => g.students.some(s => s.id === studentId));

  const openStudent = (s: StudentInfo) => {
    setEditStudent(s);
    setSForm({
      name: s.name,
      level: s.level || "",
      email: s.email || "",
      phone: s.phone || "",
      social_name: s.social_name || "",
      social_url: s.social_url || "",
      note: s.note || "",
      timezone: s.timezone || DEFAULT_TZ,
      languages: s.languages && s.languages.length ? s.languages : ["es"],
    });
    setSError("");
  };

  const handleSaveStudent = async () => {
    if (!editStudent) return;
    const email = sForm.email.trim();
    if (!email) { setSError("Электронная почта обязательна для заполнения"); return; }
    if (!email.includes("@") || !email.includes(".")) { setSError("Проверьте формат почты, например ivan@mail.ru"); return; }
    setSError("");
    setSSaving(true);
    try {
      const res = await apiUpdateStudent({
        id: editStudent.id,
        email,
        name: sForm.name.trim(),
        level: sForm.level.trim(),
        phone: sForm.phone.trim(),
        social_name: sForm.social_name.trim(),
        social_url: sForm.social_url.trim(),
        note: sForm.note.trim(),
        timezone: sForm.timezone,
        languages: sForm.languages,
      });
      if (res.ok) {
        const s = await apiGetStudents();
        if (s.students) setStudents(s.students);
        setEditStudent(null);
      } else {
        setSError(res.error || "Не удалось сохранить данные");
      }
    } catch {
      setSError("Нет связи с сервером, попробуйте ещё раз");
    } finally {
      setSSaving(false);
    }
  };

  const openNew = () => {
    setEditor("new");
    setForm({ name: "", description: "", color: "primary" });
    setFormStudents([]);
    setFormError("");
  };

  const openEdit = (g: StudentGroup) => {
    setEditor(g);
    setForm({ name: g.name, description: g.description, color: g.color });
    setFormStudents(g.students.map(s => s.id));
    setFormError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError("Укажите название группы, например «Начинающие»"); return; }
    if (formStudents.length === 0) { setFormError("Добавьте хотя бы одного ученика"); return; }
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        color: form.color,
        student_ids: formStudents,
      };
      const res = editor === "new"
        ? await apiCreateGroup(payload)
        : await apiUpdateGroup({ ...payload, id: (editor as StudentGroup).id });
      if (res.ok) {
        const g = await apiGetGroups();
        if (g.groups) setGroups(g.groups);
        setEditor(null);
      } else {
        setFormError(res.error || "Не удалось сохранить группу");
      }
    } catch {
      setFormError("Нет связи с сервером, попробуйте ещё раз");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      const res = await apiDeleteGroup(confirmDelete.id);
      if (res.ok) {
        setGroups(groups.filter(g => g.id !== confirmDelete.id));
        setConfirmDelete(null);
      }
    } catch {
      // оставим окно открытым
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
          <button onClick={() => setTab("students")}
            className={`px-4 py-1.5 rounded-lg text-sm font-montserrat font-medium transition-colors
              ${tab === "students" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            Ученики {students.length > 0 && <span className="text-xs">· {students.length}</span>}
          </button>
          {isTeacher && (
            <button onClick={() => setTab("groups")}
              className={`px-4 py-1.5 rounded-lg text-sm font-montserrat font-medium transition-colors
                ${tab === "groups" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Группы {groups.length > 0 && <span className="text-xs">· {groups.length}</span>}
            </button>
          )}
        </div>

        {isTeacher && tab === "groups" && (
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 red-accent text-white rounded-xl text-sm font-montserrat font-medium hover:opacity-90 transition-opacity">
            <Icon name="Plus" size={16} />
            Создать группу
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <p className="text-muted-foreground text-sm font-ibm">Загрузка...</p>
        </div>
      ) : tab === "students" ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
              <Icon name="Search" size={15} className="text-muted-foreground flex-shrink-0" />
              <input type="text" placeholder="Поиск по имени, почте, телефону..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full font-ibm" />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-10 text-center">
              <Icon name="Users" size={36} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm font-ibm">Ученики не найдены</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(s => {
                const inGroups = groupsOf(s.id);
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-montserrat font-bold text-xs">{s.avatar}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-montserrat font-bold text-sm text-foreground truncate">{s.name}</p>
                      <div className="flex items-center gap-2 flex-wrap mt-0.5">
                        {s.level && <span className="text-xs text-muted-foreground font-ibm">Уровень {s.level}</span>}
                        {(s.languages || []).map(code => {
                          const l = LANGUAGES.find(x => x.id === code);
                          if (!l) return null;
                          return (
                            <span key={code} title={l.label}
                              className="text-xs px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-ibm">
                              {l.flag} {l.label}
                            </span>
                          );
                        })}
                        {s.timezone && tzDiffLabel(s.timezone, myTz) && (
                          <span title={tzTitle(s.timezone)}
                            className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-ibm">
                            <Icon name="Clock" size={10} />
                            сейчас {nowIn(s.timezone)}
                            <span className="opacity-70">({tzDiffLabel(s.timezone, myTz)})</span>
                          </span>
                        )}
                        {inGroups.map(g => {
                          const c = colorOf(g.color);
                          return (
                            <span key={g.id} className={`text-xs px-2 py-0.5 rounded-full font-montserrat font-medium ${c.soft}`}>
                              {g.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="hidden md:flex flex-col items-end gap-0.5 flex-shrink-0 mr-1">
                      {s.email && (
                        <a href={`mailto:${s.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-ibm">
                          <Icon name="Mail" size={12} />{s.email}
                        </a>
                      )}
                      {s.phone && (
                        <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-ibm">
                          <Icon name="Phone" size={12} />{s.phone}
                        </a>
                      )}
                      {s.social_url && (
                        <a href={s.social_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary font-ibm">
                          <Icon name="Link" size={12} />{s.social_name || "Соцсеть"}
                        </a>
                      )}
                    </div>

                    {s.lessons_count !== undefined && (
                      <div className="text-right flex-shrink-0">
                        <p className="font-montserrat font-bold text-sm text-foreground">{s.lessons_count}</p>
                        <p className="text-xs text-muted-foreground font-ibm">занятий</p>
                      </div>
                    )}

                    {isTeacher && (
                      <button onClick={() => openStudent(s)}
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
                        <Icon name="Pencil" size={15} className="text-muted-foreground" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center">
          <Icon name="UsersRound" size={36} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm font-ibm mb-4">Групп пока нет</p>
          <button onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 red-accent text-white rounded-xl text-sm font-montserrat font-medium hover:opacity-90">
            <Icon name="Plus" size={16} />
            Создать первую группу
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map(g => {
            const c = colorOf(g.color);
            return (
              <div key={g.id} className="bg-card rounded-xl border border-border p-4 card-hover">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${c.dot}`} />
                    <h3 className="font-montserrat font-bold text-foreground text-sm truncate">{g.name}</h3>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(g)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                      <Icon name="Pencil" size={15} className="text-muted-foreground" />
                    </button>
                    <button onClick={() => setConfirmDelete(g)} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                      <Icon name="Trash2" size={15} className="text-red-500" />
                    </button>
                  </div>
                </div>

                {g.description && (
                  <p className="text-xs text-muted-foreground font-ibm mb-3">{g.description}</p>
                )}

                <p className="text-xs text-muted-foreground font-ibm mb-2">{g.students.length} учеников</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.students.map(s => (
                    <span key={s.id} className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-muted">
                      <span className="w-5 h-5 rounded-full red-accent flex items-center justify-center">
                        <span className="text-white font-montserrat font-bold text-[9px]">{s.avatar}</span>
                      </span>
                      <span className="text-xs font-ibm text-foreground">{s.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !sSaving && setEditStudent(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-montserrat font-bold text-xs">{editStudent.avatar}</span>
                </div>
                <h2 className="font-montserrat font-bold text-base text-foreground truncate">Данные ученика</h2>
              </div>
              <button onClick={() => setEditStudent(null)} className="p-1 rounded-md hover:bg-muted transition-colors">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Имя</label>
                  <input type="text" value={sForm.name} onChange={e => setSForm({ ...sForm, name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Уровень</label>
                  <input type="text" value={sForm.level} placeholder="B1"
                    onChange={e => setSForm({ ...sForm, level: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">
                  Электронная почта <span className="text-red-500">*</span>
                </label>
                <input type="email" value={sForm.email} placeholder="ivan@mail.ru"
                  onChange={e => { setSForm({ ...sForm, email: e.target.value }); if (sError) setSError(""); }}
                  className={`mt-1 w-full px-3 py-2 rounded-lg border bg-muted/30 text-sm font-ibm outline-none transition-colors
                    ${sError && !sForm.email.trim() ? "border-red-400" : "border-border focus:border-primary/40"}`} />
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Мобильный телефон</label>
                <input type="tel" value={sForm.phone} placeholder="+7 900 123-45-67"
                  onChange={e => setSForm({ ...sForm, phone: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Часовой пояс</label>
                <select value={sForm.timezone}
                  onChange={e => setSForm({ ...sForm, timezone: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40">
                  {TIMEZONES.map(tz => (
                    <option key={tz.id} value={tz.id}>{tz.offset} — {tz.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground font-ibm mt-1">
                  {tzDiffLabel(sForm.timezone, myTz)
                    ? `У ученика сейчас ${nowIn(sForm.timezone)} — это ${tzDiffLabel(sForm.timezone, myTz)} к вашему времени`
                    : "Время совпадает с вашим"}
                </p>
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Изучаемые языки</label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {LANGUAGES.map(l => {
                    const on = sForm.languages.includes(l.id);
                    return (
                      <button key={l.id} type="button"
                        onClick={() => setSForm({
                          ...sForm,
                          languages: on
                            ? sForm.languages.filter(x => x !== l.id)
                            : [...sForm.languages, l.id],
                        })}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-montserrat font-medium transition-all flex items-center gap-1.5 ${
                          on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                        }`}>
                        <span>{l.flag}</span>{l.label}
                      </button>
                    );
                  })}
                </div>
                {sForm.languages.length === 0 && (
                  <p className="text-[11px] text-muted-foreground font-ibm mt-1">Выберите хотя бы один язык</p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Соцсеть</label>
                  <input type="text" value={sForm.social_name} placeholder="Telegram"
                    onChange={e => setSForm({ ...sForm, social_name: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Ссылка на профиль</label>
                  <input type="url" value={sForm.social_url} placeholder="https://t.me/ivan"
                    onChange={e => setSForm({ ...sForm, social_url: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Заметка (необязательно)</label>
                <textarea value={sForm.note} rows={2} placeholder="Например: занимается по вторникам, готовится к экзамену"
                  onChange={e => setSForm({ ...sForm, note: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />
              </div>

              {sError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 animate-scale-in">
                  <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-ibm">{sError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditStudent(null)} disabled={sSaving}
                  className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                  Отмена
                </button>
                <button onClick={handleSaveStudent} disabled={sSaving}
                  className="flex-1 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                  {sSaving ? "Сохраняю..." : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !saving && setEditor(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-montserrat font-bold text-base text-foreground">
                {editor === "new" ? "Новая группа" : "Редактировать группу"}
              </h2>
              <button onClick={() => setEditor(null)} className="p-1 rounded-md hover:bg-muted transition-colors">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Название группы</label>
                <input type="text" value={form.name} placeholder="Например «Начинающие A1»"
                  onChange={e => { setForm({ ...form, name: e.target.value }); if (formError) setFormError(""); }}
                  className={`mt-1 w-full px-3 py-2 rounded-lg border bg-muted/30 text-sm font-ibm outline-none transition-colors
                    ${formError && !form.name.trim() ? "border-red-400" : "border-border focus:border-primary/40"}`} />
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Описание (необязательно)</label>
                <input type="text" value={form.description} placeholder="Например «Занятия по вторникам»"
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
              </div>

              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Цвет метки</label>
                <div className="mt-1.5 flex gap-2">
                  {GROUP_COLORS.map(c => (
                    <button key={c.key} type="button" onClick={() => setForm({ ...form, color: c.key })}
                      className={`w-8 h-8 rounded-full ${c.dot} flex items-center justify-center transition-transform
                        ${form.color === c.key ? "ring-2 ring-offset-2 ring-foreground/30 scale-105" : ""}`}>
                      {form.color === c.key && <Icon name="Check" size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-lg border ${formError && formStudents.length === 0 ? "border-red-400" : "border-border"}`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <p className="text-xs font-montserrat font-bold text-foreground">
                    Ученики {formStudents.length > 0 && <span className="text-primary">· {formStudents.length}</span>}
                  </p>
                  <button type="button"
                    onClick={() => {
                      setFormStudents(formStudents.length === students.length ? [] : students.map(s => s.id));
                      if (formError) setFormError("");
                    }}
                    className="text-xs font-montserrat font-medium text-primary hover:underline">
                    {formStudents.length === students.length && students.length > 0 ? "Снять всех" : "Выбрать всех"}
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto p-1.5 space-y-1">
                  {students.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground font-ibm text-center">Учеников пока нет</p>
                  ) : students.map(s => {
                    const checked = formStudents.includes(s.id);
                    return (
                      <button type="button" key={s.id}
                        onClick={() => {
                          setFormStudents(checked ? formStudents.filter(id => id !== s.id) : [...formStudents, s.id]);
                          if (formError) setFormError("");
                        }}
                        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors
                          ${checked ? "bg-primary/10" : "hover:bg-muted"}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                          ${checked ? "bg-primary border-primary" : "border-border"}`}>
                          {checked && <Icon name="Check" size={11} className="text-white" />}
                        </div>
                        <div className="w-6 h-6 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-montserrat font-bold text-[10px]">{s.avatar}</span>
                        </div>
                        <span className="text-xs font-ibm text-foreground truncate flex-1">{s.name}</span>
                        {s.level && <span className="text-[10px] text-muted-foreground">{s.level}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 animate-scale-in">
                  <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-ibm">{formError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditor(null)} disabled={saving}
                  className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                  Отмена
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                  {saving ? "Сохраняю..." : editor === "new" ? "Создать" : "Сохранить"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !deleting && setConfirmDelete(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <Icon name="TriangleAlert" size={22} className="text-red-600" />
            </div>
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1.5">Удалить группу?</h2>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              Группа «{confirmDelete.name}» будет удалена. Сами ученики останутся в системе.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Отмена
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-montserrat font-medium hover:bg-red-700 transition-colors disabled:opacity-60">
                {deleting ? "Удаляю..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}