import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { apiGetCalendar, apiCreateLesson, apiMoveLesson, apiDeleteLesson, apiUpdateLesson, apiGetStudents, apiGetGroups, apiStartLesson, apiCancelLesson, type Lesson, type StudentInfo, type StudentGroup } from "@/lib/api";
import { type User } from "@/pages/LoginPage";
import { buildRoomName } from "@/pages/LessonRoomPage";

const DAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

const DEFAULT_SLOTS = ["10:00", "12:00", "14:00", "16:00", "18:00"];

const typeColors: Record<string, string> = {
  "Грамматика": "bg-primary/15 text-primary border-primary/20",
  "Практика": "bg-green-100 text-green-700 border-green-200",
  "Повторение": "bg-blue-100 text-blue-700 border-blue-200",
  "Аудирование": "bg-purple-100 text-purple-700 border-purple-200",
};

const lessonTypes = ["Грамматика", "Практика", "Повторение", "Аудирование", "Разговорный клуб"];

const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function CalendarPage({ user, onJoinLesson }: { user: User; onJoinLesson?: (room: string) => void }) {
  const today = new Date();
  const todayKey = toKey(today);
  const nowTime = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;
  const weekAnchor = (() => { const d = new Date(today); d.setHours(12, 0, 0, 0); return d; })();
  const isTeacher = user.role === "teacher";

  const [weekStart, setWeekStart] = useState<Date>(weekAnchor);
  const [selected, setSelected] = useState<{ date: string; time: string } | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ topic: "", lesson_date: "", lesson_time: "18:00", duration_min: 60, lesson_type: "Грамматика" });
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDelete, setConfirmDelete] = useState<Lesson | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState("");
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [editLesson, setEditLesson] = useState<Lesson | null>(null);
  const [editForm, setEditForm] = useState({ topic: "", lesson_date: "", lesson_time: "", duration_min: 60, lesson_type: "Грамматика" });
  const [editStudents, setEditStudents] = useState<number[]>([]);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [actionLesson, setActionLesson] = useState<Lesson | null>(null);
  const [filterStudent, setFilterStudent] = useState<number | null>(null);
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [cancelLesson, setCancelLesson] = useState<Lesson | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);
  const [cancelDone, setCancelDone] = useState("");

  useEffect(() => {
    apiGetCalendar()
      .then(res => { if (res.lessons) setLessons(res.lessons); })
      .catch(() => {})
      .finally(() => setLoading(false));
    if (isTeacher) {
      apiGetStudents().then(res => { if (res.students) setStudents(res.students); }).catch(() => {});
      apiGetGroups().then(res => { if (res.groups) setGroups(res.groups); }).catch(() => {});
    }
  }, [isTeacher]);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const weekEnd = weekDays[6];
  const isCurrentWeek = toKey(weekStart) === toKey(weekAnchor);

  const visibleLessons = filterStudent
    ? lessons.filter(l => (l.students || []).some(s => s.id === filterStudent))
    : lessons;

  const weekFrom = toKey(weekStart);
  const weekTo = toKey(weekEnd);
  const weekLessonTimes = visibleLessons
    .filter(l => l.lesson_date >= weekFrom && l.lesson_date <= weekTo)
    .map(l => l.lesson_time.slice(0, 5));
  const TIME_SLOTS = Array.from(new Set([...DEFAULT_SLOTS, ...weekLessonTimes])).sort();

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(d);
    setSelected(null);
  };

  const findLesson = (dateKey: string, time: string) =>
    visibleLessons.find(l => l.lesson_date === dateKey && l.lesson_time.slice(0, 5) === time);

  const selectedLesson = selected ? findLesson(selected.date, selected.time) : null;

  const rangeLabel = `${weekStart.getDate()} ${MONTHS_GEN[weekStart.getMonth()]} - ${weekEnd.getDate()} ${MONTHS_GEN[weekEnd.getMonth()]}`;

  const moveLesson = async (lessonId: number, newDate: string, newTime: string) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;
    if (findLesson(newDate, newTime)) return;
    const prev = lessons;
    setLessons(prev.map(l => l.id === lessonId ? { ...l, lesson_date: newDate, lesson_time: newTime } : l));
    setSelected({ date: newDate, time: newTime });
    setMoveStatus("saving");
    try {
      const res = await apiMoveLesson({ id: lessonId, lesson_date: newDate, lesson_time: newTime });
      if (res.ok) {
        setMoveStatus("saved");
        setTimeout(() => setMoveStatus("idle"), 1800);
      } else {
        setLessons(prev);
        setMoveStatus("error");
        setTimeout(() => setMoveStatus("idle"), 2500);
      }
    } catch {
      setLessons(prev);
      setMoveStatus("error");
      setTimeout(() => setMoveStatus("idle"), 2500);
    }
  };

  const shiftLessonSlot = (lesson: Lesson, delta: number) => {
    const idx = TIME_SLOTS.indexOf(lesson.lesson_time.slice(0, 5));
    const next = idx + delta;
    if (idx === -1 || next < 0 || next >= TIME_SLOTS.length) return;
    moveLesson(lesson.id, lesson.lesson_date, TIME_SLOTS[next]);
  };

  const openEdit = (lesson: Lesson) => {
    setEditLesson(lesson);
    setEditForm({
      topic: lesson.topic,
      lesson_date: lesson.lesson_date,
      lesson_time: lesson.lesson_time.slice(0, 5),
      duration_min: lesson.duration_min,
      lesson_type: lesson.lesson_type,
    });
    setEditStudents((lesson.students || []).map(s => s.id));
    setEditError("");
  };

  const handleSaveEdit = async () => {
    if (!editLesson) return;
    if (!editForm.topic.trim()) { setEditError("Заполните тему урока — например «Урок с Дашей»"); return; }
    if (!editForm.lesson_date) { setEditError("Выберите дату занятия"); return; }
    if (!editForm.lesson_time) { setEditError("Укажите время занятия"); return; }
    if (editStudents.length === 0) { setEditError("Выберите хотя бы одного ученика"); return; }
    setEditError("");
    setEditSaving(true);
    try {
      const res = await apiUpdateLesson({
        id: editLesson.id,
        lesson_date: editForm.lesson_date,
        lesson_time: editForm.lesson_time,
        topic: editForm.topic.trim(),
        lesson_type: editForm.lesson_type,
        duration_min: editForm.duration_min,
        student_ids: editStudents,
      });
      if (res.ok) {
        const updated = await apiGetCalendar();
        if (updated.lessons) setLessons(updated.lessons);
        setSelected({ date: editForm.lesson_date, time: editForm.lesson_time });
        setEditLesson(null);
      } else {
        setEditError(res.error || "Не удалось сохранить изменения");
      }
    } catch {
      setEditError("Нет связи с сервером, попробуйте ещё раз");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteLesson = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    const prev = lessons;
    try {
      const res = await apiDeleteLesson(confirmDelete.id);
      if (res.ok) {
        setLessons(prev.filter(l => l.id !== confirmDelete.id));
        setSelected(null);
        setConfirmDelete(null);
      } else {
        setMoveStatus("error");
        setTimeout(() => setMoveStatus("idle"), 2500);
      }
    } catch {
      setMoveStatus("error");
      setTimeout(() => setMoveStatus("idle"), 2500);
    } finally {
      setDeleting(false);
    }
  };

  const handleSlotClick = (dateKey: string, time: string) => {
    const lesson = findLesson(dateKey, time);
    setSelected({ date: dateKey, time });
    if (!lesson && isTeacher) {
      setForm({ ...form, lesson_date: dateKey, lesson_time: time });
      if (filterStudent) setSelectedStudents([filterStudent]);
      setFormError("");
      setShowAdd(true);
    }
  };

  const handleAddLesson = async () => {
    if (!form.topic.trim()) {
      setFormError("Заполните тему урока — например «Урок с Дашей»");
      return;
    }
    if (!form.lesson_date) {
      setFormError("Выберите дату занятия");
      return;
    }
    if (!form.lesson_time) {
      setFormError("Укажите время занятия");
      return;
    }
    if (selectedStudents.length === 0) {
      setFormError("Выберите ученика или группу учеников");
      return;
    }
    setFormError("");
    setSaving(true);
    try {
      const res = await apiCreateLesson({ ...form, student_ids: selectedStudents });
      if (res.ok) {
        const updated = await apiGetCalendar();
        if (updated.lessons) setLessons(updated.lessons);
        setShowAdd(false);
        setForm({ topic: "", lesson_date: "", lesson_time: "18:00", duration_min: 60, lesson_type: "Грамматика" });
        setSelectedStudents([]);
      } else {
        setFormError(res.error || "Не удалось сохранить занятие");
      }
    } catch {
      setFormError("Нет связи с сервером, попробуйте ещё раз");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Week schedule */}
        <div className="lg:col-span-3 bg-card rounded-xl border border-border overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 md:px-5 py-3 border-b border-border flex-wrap">
            <button onClick={() => shiftWeek(-1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs md:text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
              <Icon name="ChevronLeft" size={15} />
              предыдущая
            </button>

            <div className="flex items-center gap-2">
              <h3 className="font-montserrat font-bold text-foreground text-sm md:text-base">{rangeLabel}</h3>
              {isCurrentWeek ? (
                <span className="text-xs px-2 py-0.5 rounded bg-sky-400 text-white font-montserrat font-medium">Текущая неделя</span>
              ) : (
                <button onClick={() => { setWeekStart(weekAnchor); setSelected(null); }}
                  className="text-xs px-2 py-0.5 rounded border border-sky-400 text-sky-500 font-montserrat font-medium hover:bg-sky-50 transition-colors">
                  к текущей
                </button>
              )}
            </div>

            <button onClick={() => shiftWeek(1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs md:text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
              следующая
              <Icon name="ChevronRight" size={15} />
            </button>
          </div>

          {isTeacher && students.length > 0 && (
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 flex-wrap">
              <Icon name="Filter" size={13} className="text-muted-foreground" />
              <button onClick={() => setFilterStudent(null)}
                className={`text-xs px-2.5 py-1 rounded-full font-montserrat font-medium transition-colors
                  ${filterStudent === null ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>
                Все ученики
              </button>
              {students.map(s => (
                <button key={s.id} onClick={() => setFilterStudent(filterStudent === s.id ? null : s.id)}
                  className={`flex items-center gap-1.5 text-xs pl-1 pr-2.5 py-1 rounded-full font-montserrat font-medium transition-colors
                    ${filterStudent === s.id ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>
                  <span className="w-5 h-5 rounded-full red-accent flex items-center justify-center">
                    <span className="text-white font-bold text-[9px]">{s.avatar}</span>
                  </span>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {isTeacher && (
            <div className="px-4 py-2 border-b border-border flex items-center gap-2 text-xs font-ibm">
              {moveStatus === "saving" ? (
                <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="Loader" size={13} className="animate-spin" />Сохраняю перенос...</span>
              ) : moveStatus === "saved" ? (
                <span className="flex items-center gap-1.5 text-green-600"><Icon name="Check" size={13} />Изменения сохранены</span>
              ) : moveStatus === "error" ? (
                <span className="flex items-center gap-1.5 text-red-600"><Icon name="TriangleAlert" size={13} />Не удалось перенести</span>
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground"><Icon name="Move" size={13} />Клик по занятию — изменить или удалить, перетаскивание — перенос</span>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-7 border-b border-border bg-muted/40">
                {weekDays.map((d, i) => {
                  const isToday = toKey(d) === todayKey;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={i} className={`py-2 text-center border-r border-border last:border-r-0 ${isToday ? "bg-accent/20" : ""}`}>
                      <span className={`text-xs font-montserrat font-bold ${isToday ? "text-primary" : isWeekend ? "text-red-400" : "text-foreground"}`}>
                        {isToday ? "сегодня" : DAYS[(d.getDay() + 6) % 7]} {d.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-7">
                {weekDays.map((d, di) => {
                  const dateKey = toKey(d);
                  const isPast = dateKey < todayKey;
                  return (
                    <div key={di} className="border-r border-border last:border-r-0 p-1.5 space-y-1.5">
                      {TIME_SLOTS.map((time, ti) => {
                        const lesson = findLesson(dateKey, time);
                        const isSelected = selected?.date === dateKey && selected?.time === time;
                        const cellKey = `${dateKey}_${time}`;
                        const isDropOver = dropTarget === cellKey;

                        if (isPast && !lesson) {
                          return <div key={time} className="h-12 rounded-md bg-muted/30" />;
                        }

                        return (
                          <div
                            key={time}
                            onDragOver={e => { if (isTeacher && dragId !== null && !lesson) { e.preventDefault(); setDropTarget(cellKey); } }}
                            onDragLeave={() => setDropTarget(prev => prev === cellKey ? null : prev)}
                            onDrop={e => {
                              e.preventDefault();
                              setDropTarget(null);
                              if (dragId !== null && !lesson) moveLesson(dragId, dateKey, time);
                              setDragId(null);
                            }}
                            className={`relative rounded-md ${isDropOver ? "ring-2 ring-primary ring-offset-1" : ""}`}
                          >
                            <button
                              title={lesson
                                ? `${lesson.topic} · ${time}${isTeacher ? " — нажмите, чтобы начать урок или изменить" : ""}`
                                : "Свободное время"}
                              draggable={isTeacher && !!lesson}
                              onDragStart={() => lesson && setDragId(lesson.id)}
                              onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                              onClick={() => {
                                if (isTeacher && lesson) {
                                  setSelected({ date: dateKey, time });
                                  setActionLesson(lesson);
                                } else {
                                  handleSlotClick(dateKey, time);
                                }
                              }}
                              className={`w-full h-12 rounded-md text-xs font-montserrat font-bold transition-all duration-150 flex flex-col items-center justify-center gap-0.5 px-1
                                ${lesson
                                  ? (isPast || (dateKey === todayKey && time < nowTime)
                                      ? "bg-gray-200 text-gray-500 hover:bg-gray-300 cursor-grab active:cursor-grabbing"
                                      : "bg-orange-300 text-orange-900 hover:bg-orange-400 cursor-grab active:cursor-grabbing")
                                  : "bg-green-500 text-white hover:bg-green-600"}
                                ${isSelected ? "ring-2 ring-offset-1 ring-primary" : ""}
                                ${dragId === lesson?.id ? "opacity-40" : ""}`}
                            >
                              <span>{time}</span>
                              {lesson && <span className="text-[10px] font-normal font-ibm truncate w-full">{lesson.topic}</span>}
                            </button>

                            {isTeacher && lesson && (
                              <div className="md:hidden absolute -right-0.5 top-0 flex flex-col gap-0.5">
                                <button onClick={e => { e.stopPropagation(); shiftLessonSlot(lesson, -1); }}
                                  disabled={ti === 0}
                                  className="w-5 h-[22px] rounded bg-white/80 border border-orange-400 text-orange-700 flex items-center justify-center disabled:opacity-30">
                                  <Icon name="ChevronUp" size={12} />
                                </button>
                                <button onClick={e => { e.stopPropagation(); shiftLessonSlot(lesson, 1); }}
                                  disabled={ti === TIME_SLOTS.length - 1}
                                  className="w-5 h-[22px] rounded bg-white/80 border border-orange-400 text-orange-700 flex items-center justify-center disabled:opacity-30">
                                  <Icon name="ChevronDown" size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="px-4 py-3 flex items-center gap-4 text-xs text-muted-foreground font-ibm border-t border-border flex-wrap">
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500" /><span>Свободно</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-orange-300" /><span>Занятие назначено</span></div>
            <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-200" /><span>Прошло</span></div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto text-muted-foreground/80">
              <Icon name="Info" size={13} className="flex-shrink-0" />
              <span>Прошедшее занятие можно открыть и посмотреть{isTeacher ? " или перенести" : ""}</span>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="lg:col-span-2 space-y-3">
          {isTeacher && (
            <button onClick={() => { setShowAdd(!showAdd); setFormError(""); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 red-accent text-white rounded-xl text-sm font-montserrat font-medium hover:opacity-90 transition-opacity">
              <Icon name="Plus" size={16} />
              Добавить занятие
            </button>
          )}

          {showAdd && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40" onClick={() => !saving && setShowAdd(false)} />
            <div className="relative bg-card rounded-xl border border-border p-5 space-y-3 animate-scale-in w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="font-montserrat font-bold text-base text-foreground">Новое занятие</p>
                <button onClick={() => setShowAdd(false)} className="p-1 rounded-md hover:bg-muted transition-colors">
                  <Icon name="X" size={18} className="text-muted-foreground" />
                </button>
              </div>
              <input type="text" placeholder="Тема урока, например «Урок с Дашей»" value={form.topic}
                onChange={e => { setForm({ ...form, topic: e.target.value }); if (formError) setFormError(""); }}
                className={`w-full px-3 py-2 rounded-lg border bg-muted/30 text-sm font-ibm outline-none transition-colors
                  ${formError && !form.topic.trim() ? "border-red-400 focus:border-red-500" : "border-border focus:border-primary/40"}`} />

              {formError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 animate-scale-in">
                  <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-ibm">{formError}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={form.lesson_date} onChange={e => setForm({ ...form, lesson_date: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                <input type="time" value={form.lesson_time} onChange={e => setForm({ ...form, lesson_time: e.target.value })}
                  className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
              </div>
              <select value={form.lesson_type} onChange={e => setForm({ ...form, lesson_type: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40">
                {lessonTypes.map(t => <option key={t}>{t}</option>)}
              </select>

              {groups.length > 0 && (
                <div>
                  <p className="text-xs font-montserrat font-bold text-muted-foreground mb-1.5">Назначить группе</p>
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map(g => {
                      const ids = g.students.map(s => s.id);
                      const active = ids.length > 0 && ids.every(id => selectedStudents.includes(id))
                        && selectedStudents.length === ids.length;
                      return (
                        <button type="button" key={g.id}
                          onClick={() => { setSelectedStudents(active ? [] : ids); if (formError) setFormError(""); }}
                          className={`text-xs px-2.5 py-1.5 rounded-full font-montserrat font-medium transition-colors
                            ${active ? "bg-primary text-white" : "border border-border text-foreground hover:bg-muted"}`}>
                          {g.name} · {g.students.length}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`rounded-lg border ${formError && selectedStudents.length === 0 ? "border-red-400" : "border-border"}`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <p className="text-xs font-montserrat font-bold text-foreground">
                    Или отметить учеников {selectedStudents.length > 0 && <span className="text-primary">· {selectedStudents.length}</span>}
                  </p>
                  <button type="button"
                    onClick={() => {
                      setSelectedStudents(selectedStudents.length === students.length ? [] : students.map(s => s.id));
                      if (formError) setFormError("");
                    }}
                    className="text-xs font-montserrat font-medium text-primary hover:underline">
                    {selectedStudents.length === students.length && students.length > 0 ? "Снять всех" : "Вся группа"}
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto p-1.5 space-y-1">
                  {students.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground font-ibm text-center">Учеников пока нет</p>
                  ) : students.map(s => {
                    const checked = selectedStudents.includes(s.id);
                    return (
                      <button type="button" key={s.id}
                        onClick={() => {
                          setSelectedStudents(checked ? selectedStudents.filter(id => id !== s.id) : [...selectedStudents, s.id]);
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
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} disabled={saving}
                  className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                  Отмена
                </button>
                <button onClick={handleAddLesson} disabled={saving}
                  className="flex-1 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                  {saving ? "Сохраняю..." : "Создать занятие"}
                </button>
              </div>
            </div>
            </div>
          )}

          {selected ? (
            <>
              <div className="flex items-center gap-2 px-1">
                <Icon name="CalendarDays" size={16} className="text-primary" />
                <p className="font-montserrat font-bold text-sm text-foreground">
                  {new Date(selected.date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "long" })} · {selected.time}
                </p>
              </div>
              {selectedLesson ? (
                <div className="bg-card rounded-xl border border-border p-4 card-hover animate-scale-in">
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-montserrat font-medium ${typeColors[selectedLesson.lesson_type] || "bg-muted text-muted-foreground border-border"}`}>{selectedLesson.lesson_type}</span>
                    <span className="font-montserrat font-bold text-primary text-sm">{selectedLesson.lesson_time}</span>
                  </div>
                  <h4 className="font-montserrat font-bold text-foreground text-sm mb-3">{selectedLesson.topic}</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon name="Clock" size={13} /><span className="font-ibm">{selectedLesson.duration_min} минут</span>
                  </div>

                  {selectedLesson.students && selectedLesson.students.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground font-ibm mb-2">
                        {selectedLesson.students.length === 1 ? "Ученик" : `Ученики · ${selectedLesson.students.length}`}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedLesson.students.map(s => (
                          <span key={s.id} className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-muted">
                            <span className="w-5 h-5 rounded-full red-accent flex items-center justify-center">
                              <span className="text-white font-montserrat font-bold text-[9px]">{s.avatar}</span>
                            </span>
                            <span className="text-xs font-ibm text-foreground">{s.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {isTeacher && (
                    <div className="mt-3 flex items-center gap-2">
                      <button onClick={() => shiftLessonSlot(selectedLesson, -1)}
                        disabled={TIME_SLOTS.indexOf(selectedLesson.lesson_time.slice(0, 5)) === 0}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs font-montserrat font-medium hover:bg-muted disabled:opacity-40 transition-colors">
                        <Icon name="ChevronUp" size={14} />Раньше
                      </button>
                      <button onClick={() => shiftLessonSlot(selectedLesson, 1)}
                        disabled={TIME_SLOTS.indexOf(selectedLesson.lesson_time.slice(0, 5)) === TIME_SLOTS.length - 1}
                        className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border border-border text-xs font-montserrat font-medium hover:bg-muted disabled:opacity-40 transition-colors">
                        <Icon name="ChevronDown" size={14} />Позже
                      </button>
                    </div>
                  )}

                  <button onClick={() => {
                      if (isTeacher) apiStartLesson(selectedLesson.id).catch(() => {});
                      onJoinLesson?.(buildRoomName(selectedLesson));
                    }}
                    className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity">
                    <Icon name="Video" size={16} />
                    Начать урок
                  </button>

                  {!isTeacher && (
                    <button onClick={() => { setCancelLesson(selectedLesson); setCancelReason(""); }}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-muted-foreground text-sm font-montserrat font-medium hover:bg-muted hover:text-foreground transition-colors">
                      <Icon name="CalendarX" size={14} />
                      Не смогу прийти
                    </button>
                  )}

                  {isTeacher && (
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => openEdit(selectedLesson)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border text-foreground text-sm font-montserrat font-medium hover:bg-muted transition-colors">
                        <Icon name="Pencil" size={14} />
                        Изменить
                      </button>
                      <button onClick={() => setConfirmDelete(selectedLesson)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-montserrat font-medium hover:bg-red-50 transition-colors">
                        <Icon name="Trash2" size={14} />
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border p-6 text-center">
                  <Icon name="CalendarPlus" size={32} className="text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm font-ibm">Время свободно</p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-card rounded-xl border border-border p-6 text-center">
              <Icon name="MousePointerClick" size={32} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm font-ibm">Выберите время в расписании</p>
            </div>
          )}

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="font-montserrat font-bold text-xs text-foreground">Занятия на этой неделе</p>
            </div>
            {loading ? (
              <div className="p-4 text-center text-xs text-muted-foreground font-ibm">Загрузка...</div>
            ) : (() => {
              const from = toKey(weekStart);
              const to = toKey(weekEnd);
              const weekLessons = visibleLessons
                .filter(l => l.lesson_date >= from && l.lesson_date <= to)
                .sort((a, b) => (a.lesson_date + a.lesson_time).localeCompare(b.lesson_date + b.lesson_time));
              if (weekLessons.length === 0) {
                return <div className="p-4 text-center text-xs text-muted-foreground font-ibm">Нет занятий</div>;
              }
              return (
                <div className="divide-y divide-border">
                  {weekLessons.map(l => (
                    <div key={l.id} className="flex items-center gap-2 px-4 py-2.5">
                      <button onClick={() => setSelected({ date: l.lesson_date, time: l.lesson_time.slice(0, 5) })}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon name="BookOpen" size={14} className="text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate font-ibm">{l.topic}</p>
                          <p className="text-xs text-muted-foreground">{l.lesson_date} · {l.lesson_time}</p>
                        </div>
                      </button>
                      {isTeacher && (
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button onClick={() => shiftLessonSlot(l, -1)}
                            disabled={TIME_SLOTS.indexOf(l.lesson_time.slice(0, 5)) === 0}
                            className="w-6 h-5 rounded border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30">
                            <Icon name="ChevronUp" size={12} className="text-muted-foreground" />
                          </button>
                          <button onClick={() => shiftLessonSlot(l, 1)}
                            disabled={TIME_SLOTS.indexOf(l.lesson_time.slice(0, 5)) === TIME_SLOTS.length - 1}
                            className="w-6 h-5 rounded border border-border flex items-center justify-center hover:bg-muted disabled:opacity-30">
                            <Icon name="ChevronDown" size={12} className="text-muted-foreground" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {cancelLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !cancelSaving && setCancelLesson(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1">Не смогу прийти</h2>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              «{cancelLesson.topic}» · {cancelLesson.lesson_time.slice(0, 5)}
            </p>

            <label className="text-xs font-montserrat font-bold text-muted-foreground">Причина (необязательно)</label>
            <textarea rows={3} value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              placeholder="Например: заболел, буду в отъезде"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 resize-none" />

            {cancelDone && (
              <p className="mt-2 text-xs text-red-600 font-ibm">{cancelDone}</p>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setCancelLesson(null)} disabled={cancelSaving}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Отмена
              </button>
              <button disabled={cancelSaving}
                onClick={async () => {
                  setCancelSaving(true);
                  try {
                    const res = await apiCancelLesson(cancelLesson.id, cancelReason.trim());
                    if (res.ok) { setCancelLesson(null); setCancelDone(""); }
                    else setCancelDone(res.error || "Не удалось отправить");
                  } catch {
                    setCancelDone("Нет связи с сервером");
                  } finally {
                    setCancelSaving(false);
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white text-sm font-montserrat font-bold hover:bg-red-700 transition-colors disabled:opacity-60">
                {cancelSaving ? "Отправляю..." : "Сообщить"}
              </button>
            </div>
          </div>
        </div>
      )}

      {actionLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => setActionLesson(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0">
                <h2 className="font-montserrat font-bold text-base text-foreground truncate">{actionLesson.topic}</h2>
                <p className="text-sm text-muted-foreground font-ibm">
                  {new Date(actionLesson.lesson_date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} в {actionLesson.lesson_time.slice(0, 5)}
                </p>
              </div>
              <button onClick={() => setActionLesson(null)} className="p-1 rounded-md hover:bg-muted transition-colors flex-shrink-0">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground font-ibm mb-4">Что сделать с этим занятием?</p>

            <div className="space-y-2">
              <button onClick={() => {
                  apiStartLesson(actionLesson.id).catch(() => {});
                  onJoinLesson?.(buildRoomName(actionLesson));
                  setActionLesson(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg red-accent text-white hover:opacity-90 transition-opacity text-left">
                <Icon name="Video" size={18} className="text-white" />
                <div>
                  <p className="text-sm font-montserrat font-bold text-white">Начать урок</p>
                  <p className="text-xs text-white/80 font-ibm">Видеосвязь и приглашения ученикам</p>
                </div>
              </button>

              <button onClick={() => { openEdit(actionLesson); setActionLesson(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-left">
                <Icon name="Pencil" size={18} className="text-primary" />
                <div>
                  <p className="text-sm font-montserrat font-bold text-foreground">Редактировать</p>
                  <p className="text-xs text-muted-foreground font-ibm">Тема, время, ученики</p>
                </div>
              </button>

              <button onClick={() => { setConfirmDelete(actionLesson); setActionLesson(null); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-left">
                <Icon name="Trash2" size={18} className="text-red-600" />
                <div>
                  <p className="text-sm font-montserrat font-bold text-red-600">Удалить</p>
                  <p className="text-xs text-muted-foreground font-ibm">Занятие будет отменено</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {editLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/40" onClick={() => !editSaving && setEditLesson(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-montserrat font-bold text-base text-foreground">Редактировать занятие</h2>
              <button onClick={() => setEditLesson(null)} className="p-1 rounded-md hover:bg-muted transition-colors">
                <Icon name="X" size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Тема урока</label>
                <input type="text" value={editForm.topic}
                  onChange={e => { setEditForm({ ...editForm, topic: e.target.value }); if (editError) setEditError(""); }}
                  placeholder="Например «Урок с Дашей»"
                  className={`mt-1 w-full px-3 py-2 rounded-lg border bg-muted/30 text-sm font-ibm outline-none transition-colors
                    ${editError && !editForm.topic.trim() ? "border-red-400" : "border-border focus:border-primary/40"}`} />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Дата</label>
                  <input type="date" value={editForm.lesson_date}
                    onChange={e => { setEditForm({ ...editForm, lesson_date: e.target.value }); if (editError) setEditError(""); }}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Время начала</label>
                  <input type="time" value={editForm.lesson_time}
                    onChange={e => { setEditForm({ ...editForm, lesson_time: e.target.value }); if (editError) setEditError(""); }}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Тип занятия</label>
                  <select value={editForm.lesson_type} onChange={e => setEditForm({ ...editForm, lesson_type: e.target.value })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40">
                    {lessonTypes.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Длительность, мин</label>
                  <input type="number" min={15} step={15} value={editForm.duration_min}
                    onChange={e => setEditForm({ ...editForm, duration_min: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40" />
                </div>
              </div>

              {groups.length > 0 && (
                <div>
                  <p className="text-xs font-montserrat font-bold text-muted-foreground mb-1.5">Назначить группе</p>
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map(g => {
                      const ids = g.students.map(s => s.id);
                      const active = ids.length > 0 && ids.every(id => editStudents.includes(id))
                        && editStudents.length === ids.length;
                      return (
                        <button type="button" key={g.id}
                          onClick={() => { setEditStudents(active ? [] : ids); if (editError) setEditError(""); }}
                          className={`text-xs px-2.5 py-1.5 rounded-full font-montserrat font-medium transition-colors
                            ${active ? "bg-primary text-white" : "border border-border text-foreground hover:bg-muted"}`}>
                          {g.name} · {g.students.length}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className={`rounded-lg border ${editError && editStudents.length === 0 ? "border-red-400" : "border-border"}`}>
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <p className="text-xs font-montserrat font-bold text-foreground">
                    Или отметить учеников {editStudents.length > 0 && <span className="text-primary">· {editStudents.length}</span>}
                  </p>
                  <button type="button"
                    onClick={() => {
                      setEditStudents(editStudents.length === students.length ? [] : students.map(s => s.id));
                      if (editError) setEditError("");
                    }}
                    className="text-xs font-montserrat font-medium text-primary hover:underline">
                    {editStudents.length === students.length && students.length > 0 ? "Снять всех" : "Вся группа"}
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto p-1.5 space-y-1">
                  {students.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-muted-foreground font-ibm text-center">Учеников пока нет</p>
                  ) : students.map(s => {
                    const checked = editStudents.includes(s.id);
                    return (
                      <button type="button" key={s.id}
                        onClick={() => {
                          setEditStudents(checked ? editStudents.filter(id => id !== s.id) : [...editStudents, s.id]);
                          if (editError) setEditError("");
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

              {editError && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 animate-scale-in">
                  <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 font-ibm">{editError}</p>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditLesson(null)} disabled={editSaving}
                  className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                  Отмена
                </button>
                <button onClick={handleSaveEdit} disabled={editSaving}
                  className="flex-1 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-medium hover:opacity-90 disabled:opacity-60">
                  {editSaving ? "Сохраняю..." : "Сохранить"}
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
            <h2 className="font-montserrat font-bold text-base text-foreground mb-1.5">Удалить занятие?</h2>
            <p className="text-sm text-muted-foreground font-ibm mb-1">
              «{confirmDelete.topic}»
            </p>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              {new Date(confirmDelete.lesson_date + "T12:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} в {confirmDelete.lesson_time.slice(0, 5)}. Ученики получат уведомление об отмене. Действие нельзя отменить.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Отмена
              </button>
              <button onClick={handleDeleteLesson} disabled={deleting}
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