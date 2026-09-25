import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { apiTeachersList, apiPickTeacher, type TeacherChoice } from "@/lib/api";

const LANG_NAMES: Record<string, string> = {
  es: "Испанский", en: "Английский", de: "Немецкий",
  fr: "Французский", it: "Итальянский", pt: "Португальский",
};

/** Выбор преподавателя — показывается ученику один раз после регистрации */
export default function TeacherPicker({ userName, onDone }: { userName: string; onDone: () => void }) {
  const [teachers, setTeachers] = useState<TeacherChoice[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiTeachersList()
      .then(r => {
        const list = r.teachers || [];
        setTeachers(list);
        if (list.length === 1) setPicked(list[0].id);
        setLoading(false);
      })
      .catch(() => { setErr("Не удалось загрузить список"); setLoading(false); });
  }, []);

  const save = async () => {
    if (!picked) { setErr("Выберите преподавателя"); return; }
    setBusy(true);
    const res = await apiPickTeacher(picked).catch(() => null);
    setBusy(false);
    // Если педагог уже назначен администратором — просто идём дальше
    if (res?.ok || res?.error === "Преподаватель уже назначен") { onDone(); return; }
    setErr(res?.error || "Не удалось сохранить выбор");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl red-accent flex items-center justify-center mx-auto mb-3">
            <Icon name="GraduationCap" size={28} className="text-white" />
          </div>
          <h1 className="font-montserrat font-black text-xl text-foreground">
            Добро пожаловать, {userName.split(" ")[0]}!
          </h1>
          <p className="text-sm text-muted-foreground font-ibm mt-1">
            Выберите преподавателя, у которого хотите заниматься
          </p>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground font-ibm text-center py-8">Загружаю преподавателей...</p>
        )}

        {!loading && teachers.length === 0 && (
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-foreground font-ibm mb-3">
              Пока в школе нет преподавателей. Администратор назначит вас позже.
            </p>
            <button onClick={onDone}
              className="px-5 py-2.5 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90">
              Продолжить
            </button>
          </div>
        )}

        {!loading && teachers.length > 0 && (
          <>
            <div className="space-y-2.5 mb-4">
              {teachers.map(t => (
                <button key={t.id} type="button" onClick={() => { setPicked(t.id); setErr(""); }}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
                    picked === t.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card hover:border-primary/40"
                  }`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold font-montserrat ${
                    picked === t.id ? "red-accent text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    {t.avatar || t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-montserrat font-bold text-foreground">{t.name}</p>
                    {t.languages.length > 0 && (
                      <p className="text-xs text-muted-foreground font-ibm mt-0.5">
                        {t.languages.map(l => LANG_NAMES[l] || l).join(", ")}
                      </p>
                    )}
                    {t.about && (
                      <p className="text-xs text-muted-foreground font-ibm mt-1 line-clamp-2">{t.about}</p>
                    )}
                  </div>
                  {picked === t.id && (
                    <Icon name="CircleCheck" size={20} className="text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            {err && <p className="text-xs text-red-600 font-ibm mb-3 text-center">{err}</p>}

            <button onClick={save} disabled={busy || !picked}
              className="w-full py-3 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              <Icon name="Check" size={16} />
              {busy ? "Сохраняю..." : "Продолжить"}
            </button>
            <p className="text-xs text-muted-foreground font-ibm text-center mt-3">
              Выбор делается один раз. Сменить преподавателя позже может администратор школы.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
