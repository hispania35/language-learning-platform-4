import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import {
  apiAssignMaterial, apiGetStudents, apiGetGroups, apiGetCalendar,
  type Material, type StudentInfo, type StudentGroup, type Lesson,
} from "@/lib/api";

const fmtLesson = (l: Lesson) => {
  const d = new Date(l.lesson_date + "T12:00:00");
  const day = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return `${day}, ${l.lesson_time.slice(0, 5)} — ${l.topic}`;
};

export default function MaterialAssignDialog({
  material, onClose, onDone,
}: {
  material: Material;
  onClose: () => void;
  onDone: () => void;
}) {
  const [tab, setTab] = useState<"students" | "lessons">("students");
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [pickedStudents, setPickedStudents] = useState<number[]>(
    (material.students || []).map(s => s.id));
  const [pickedLessons, setPickedLessons] = useState<number[]>(
    (material.lessons || []).map(l => l.id));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGetStudents().then(r => { if (r.students) setStudents(r.students); }).catch(() => {});
    apiGetGroups().then(r => { if (r.groups) setGroups(r.groups); }).catch(() => {});
    apiGetCalendar().then(r => { if (r.lessons) setLessons(r.lessons); }).catch(() => {});
  }, []);

  const todayKey = new Date().toISOString().slice(0, 10);
  const futureLessons = lessons
    .filter(l => l.lesson_date >= todayKey)
    .sort((a, b) => (a.lesson_date + a.lesson_time).localeCompare(b.lesson_date + b.lesson_time))
    .slice(0, 30);

  const toggle = (arr: number[], id: number) =>
    arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];

  const pickGroup = (g: StudentGroup) => {
    const ids = g.students.map(s => s.id);
    const allIn = ids.every(i => pickedStudents.includes(i));
    setPickedStudents(prev => allIn
      ? prev.filter(i => !ids.includes(i))
      : Array.from(new Set([...prev, ...ids])));
  };

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      const res = await apiAssignMaterial({
        material_id: material.id,
        student_ids: pickedStudents,
        lesson_ids: pickedLessons,
      });
      if (res.ok) { onDone(); onClose(); }
      else setErr(res.error || "Не удалось сохранить");
    } catch {
      setErr("Нет связи с сервером");
    } finally {
      setSaving(false);
    }
  };

  const total = pickedStudents.length + pickedLessons.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !saving && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-montserrat font-bold text-base text-foreground">Кому выдать материал</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground font-ibm mb-4 truncate">{material.title}</p>

        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 mb-3">
          <button onClick={() => setTab("students")}
            className={`flex-1 py-1.5 rounded-md text-xs font-montserrat font-bold transition-all
              ${tab === "students" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
            Ученики {pickedStudents.length > 0 && `· ${pickedStudents.length}`}
          </button>
          <button onClick={() => setTab("lessons")}
            className={`flex-1 py-1.5 rounded-md text-xs font-montserrat font-bold transition-all
              ${tab === "lessons" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
            Занятия {pickedLessons.length > 0 && `· ${pickedLessons.length}`}
          </button>
        </div>

        {tab === "students" ? (
          <div className="space-y-3">
            {!!groups.length && (
              <div>
                <p className="text-xs font-montserrat font-bold text-muted-foreground mb-1.5">Группы целиком</p>
                <div className="flex flex-wrap gap-1.5">
                  {groups.map(g => {
                    const ids = g.students.map(s => s.id);
                    const active = ids.length > 0 && ids.every(i => pickedStudents.includes(i));
                    return (
                      <button key={g.id} onClick={() => pickGroup(g)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-montserrat font-bold border transition-colors
                          ${active ? "text-white border-transparent" : "text-foreground border-border hover:bg-muted"}`}
                        style={active ? { background: g.color || "#c0392b" } : undefined}>
                        {g.name} <span className="font-normal opacity-70">{g.students.length}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-montserrat font-bold text-muted-foreground">Ученики</p>
                <button onClick={() => setPickedStudents(
                  pickedStudents.length === students.length ? [] : students.map(s => s.id))}
                  className="text-xs font-montserrat font-medium text-primary hover:underline">
                  {pickedStudents.length === students.length ? "Снять всех" : "Выбрать всех"}
                </button>
              </div>
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {students.map(s => {
                  const on = pickedStudents.includes(s.id);
                  return (
                    <button key={s.id} onClick={() => setPickedStudents(p => toggle(p, s.id))}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors text-left
                        ${on ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted"}`}>
                      <span className="w-7 h-7 rounded-full red-accent flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-[10px]">{s.avatar}</span>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-ibm text-foreground truncate">{s.name}</span>
                        {s.level && <span className="block text-[11px] text-muted-foreground font-ibm">{s.level}</span>}
                      </span>
                      {on && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
                    </button>
                  );
                })}
                {!students.length && (
                  <p className="text-xs text-muted-foreground font-ibm py-2">Учеников пока нет</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs text-muted-foreground font-ibm mb-2">
              Ученики занятия получат материал автоматически
            </p>
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {futureLessons.map(l => {
                const on = pickedLessons.includes(l.id);
                return (
                  <button key={l.id} onClick={() => setPickedLessons(p => toggle(p, l.id))}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors text-left
                      ${on ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted"}`}>
                    <Icon name="CalendarDays" size={15} className="text-primary flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-sm font-ibm text-foreground truncate">{fmtLesson(l)}</span>
                    {on && <Icon name="Check" size={15} className="text-primary flex-shrink-0" />}
                  </button>
                );
              })}
              {!futureLessons.length && (
                <p className="text-xs text-muted-foreground font-ibm py-2">Будущих занятий пока нет</p>
              )}
            </div>
          </div>
        )}

        {total === 0 && (
          <p className="text-[11px] text-muted-foreground font-ibm mt-3">
            Если никого не выбрать, материал будет доступен всем ученикам
          </p>
        )}

        {err && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 mt-3">
            <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 font-ibm">{err}</p>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
            Отмена
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
