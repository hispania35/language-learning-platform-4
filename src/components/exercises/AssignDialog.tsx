import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { apiGetStudents, apiAssignExercise, type Exercise, type StudentInfo } from "@/lib/api";

interface Props {
  exercise: Exercise;
  onClose: () => void;
  onDone: () => void;
}

export default function AssignDialog({ exercise, onClose, onDone }: Props) {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [picked, setPicked] = useState<number[]>(exercise.students.map(s => s.id));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGetStudents().then(r => { if (r.students) setStudents(r.students); }).catch(() => {});
  }, []);

  const save = async () => {
    const fresh = picked.filter(id => !exercise.students.some(s => s.id === id));
    setSaving(true);
    await apiAssignExercise(exercise.id, fresh);
    setSaving(false);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-montserrat font-bold text-base text-foreground">Выдать задание</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground font-ibm mb-4 truncate">{exercise.title}</p>

        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground font-ibm py-4 text-center">Учеников пока нет</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto mb-4">
            {students.map(s => {
              const on = picked.includes(s.id);
              const already = exercise.students.some(x => x.id === s.id);
              return (
                <button key={s.id}
                  disabled={already}
                  onClick={() => setPicked(on ? picked.filter(x => x !== s.id) : [...picked, s.id])}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                    already ? "border-border bg-muted/40 opacity-60"
                    : on ? "red-accent text-white border-transparent"
                    : "border-border hover:bg-muted text-foreground"
                  }`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-montserrat font-bold ${
                    on && !already ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                  }`}>
                    {s.avatar}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-ibm truncate">{s.name}</span>
                    <span className={`block text-[11px] ${on && !already ? "text-white/70" : "text-muted-foreground"}`}>
                      {already ? "уже выдано" : `уровень ${s.level || "—"}`}
                    </span>
                  </span>
                  {on && !already && <Icon name="Check" size={15} />}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={save} disabled={saving}
          className="w-full py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? "Выдаю..." : "Выдать"}
        </button>
      </div>
    </div>
  );
}
