import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { EX_TEMPLATES, getTemplate } from "@/lib/exTemplates";
import ExerciseEditor from "@/components/exercises/ExerciseEditor";
import ExercisePlayer from "@/components/exercises/ExercisePlayer";
import AssignDialog from "@/components/exercises/AssignDialog";
import { apiGetExercises, apiDeleteExercise, type Exercise, type ExTemplate } from "@/lib/api";
import { type User } from "@/pages/LoginPage";

interface Props {
  user: User;
}

type Mode =
  | { kind: "list" }
  | { kind: "pick" }
  | { kind: "edit"; template: ExTemplate; existing?: Exercise }
  | { kind: "play"; exercise: Exercise };

export default function ExercisesPage({ user }: Props) {
  const isTeacher = user.role === "teacher";
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [assignFor, setAssignFor] = useState<Exercise | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGetExercises()
      .then(r => {
        if (r.exercises) setExercises(r.exercises);
        setAiReady(!!r.ai_ready);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const remove = async (ex: Exercise) => {
    if (!confirm(`Удалить задание «${ex.title}»?`)) return;
    await apiDeleteExercise(ex.id);
    load();
  };

  if (mode.kind === "play") {
    return <ExercisePlayer exercise={mode.exercise} onExit={() => { setMode({ kind: "list" }); load(); }} />;
  }

  if (mode.kind === "edit") {
    return (
      <ExerciseEditor
        template={mode.template}
        existing={mode.existing}
        aiReady={aiReady}
        onDone={() => { setMode({ kind: "list" }); load(); }}
        onCancel={() => setMode({ kind: "list" })}
      />
    );
  }

  if (mode.kind === "pick") {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode({ kind: "list" })} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Icon name="ArrowLeft" size={18} className="text-muted-foreground" />
          </button>
          <div>
            <h2 className="font-montserrat font-bold text-lg text-foreground">Выберите шаблон</h2>
            <p className="text-xs text-muted-foreground font-ibm">Материал вставите один раз — потом меняйте шаблон</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EX_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setMode({ kind: "edit", template: t.id })}
              className="group bg-card rounded-xl border border-border p-4 text-left hover:border-primary hover:shadow-md transition-all">
              <div className={`w-11 h-11 rounded-xl ${t.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                <Icon name={t.icon} size={22} className="text-white" />
              </div>
              <p className="font-montserrat font-bold text-sm text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground font-ibm mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-montserrat font-bold text-lg text-foreground">
            {isTeacher ? "Интерактивные задания" : "Мои задания"}
          </h2>
          <p className="text-sm text-muted-foreground font-ibm">
            {isTeacher ? "Создайте игру за минуту и выдайте ученикам" : "Проходите задания и набирайте очки"}
          </p>
        </div>
        {isTeacher && (
          <button onClick={() => setMode({ kind: "pick" })}
            className="flex items-center gap-2 px-4 py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity">
            <Icon name="Plus" size={16} />
            Создать задание
          </button>
        )}
      </div>

      {isTeacher && exercises.length === 0 && !loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EX_TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setMode({ kind: "edit", template: t.id })}
              className="group bg-card rounded-xl border border-border p-4 text-left hover:border-primary hover:shadow-md transition-all">
              <div className={`w-11 h-11 rounded-xl ${t.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                <Icon name={t.icon} size={22} className="text-white" />
              </div>
              <p className="font-montserrat font-bold text-sm text-foreground">{t.name}</p>
              <p className="text-xs text-muted-foreground font-ibm mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground font-ibm">Загрузка...</div>
      ) : exercises.length === 0 && !isTeacher ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <Icon name="Gamepad2" size={32} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground font-ibm">Преподаватель пока не выдал заданий</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exercises.map(ex => {
            const tpl = getTemplate(ex.template);
            const best = ex.results.length
              ? Math.max(...ex.results.map(r => (r.total ? Math.round((r.score / r.total) * 100) : 0)))
              : null;
            return (
              <div key={ex.id} className="bg-card rounded-xl border border-border p-3 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl ${tpl.color} flex items-center justify-center flex-shrink-0`}>
                  <Icon name={tpl.icon} size={20} className="text-white" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-montserrat font-bold text-sm text-foreground truncate">{ex.title}</p>
                  <p className="text-xs text-muted-foreground font-ibm">
                    {tpl.name} · {ex.items.length} заданий
                    {isTeacher && ex.students.length > 0 && ` · ${ex.students.length} уч.`}
                    {!isTeacher && best !== null && ` · лучший ${best}%`}
                  </p>
                  {isTeacher && ex.results.length > 0 && (
                    <p className="text-xs text-emerald-600 font-ibm truncate mt-0.5">
                      {ex.results[0].name}: {ex.results[0].score} из {ex.results[0].total}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setMode({ kind: "play", exercise: ex })}
                    title={isTeacher ? "Посмотреть как ученик" : "Пройти"}
                    className="flex items-center gap-1.5 px-3 py-2 red-accent text-white rounded-lg text-xs font-montserrat font-bold hover:opacity-90 transition-opacity">
                    <Icon name="Play" size={13} />
                    <span className="hidden sm:inline">{isTeacher ? "Проверить" : "Пройти"}</span>
                  </button>
                  {isTeacher && (
                    <>
                      <button onClick={() => setAssignFor(ex)} title="Выдать ученикам"
                        className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                        <Icon name="UserPlus" size={15} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => setMode({ kind: "edit", template: ex.template, existing: ex })}
                        title="Изменить"
                        className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                        <Icon name="Pencil" size={15} className="text-muted-foreground" />
                      </button>
                      <button onClick={() => remove(ex)} title="Удалить"
                        className="p-2 rounded-lg border border-border hover:bg-muted transition-colors">
                        <Icon name="Trash2" size={15} className="text-muted-foreground" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {assignFor && (
        <AssignDialog
          exercise={assignFor}
          onClose={() => setAssignFor(null)}
          onDone={() => { setAssignFor(null); load(); }}
        />
      )}
    </div>
  );
}
