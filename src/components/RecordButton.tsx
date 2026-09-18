import { useState } from "react";
import Icon from "@/components/ui/icon";
import useLessonRecorder, { recorderSupported } from "@/hooks/useLessonRecorder";
import {
  apiUploadMaterial, apiAssignMaterial, apiGetStudents,
  type StudentInfo, type Lesson,
} from "@/lib/api";

interface Props {
  getLocalStream: () => MediaStream | null;
  getRemoteStream: () => MediaStream | null;
  isTeacher: boolean;
  onStateChange?: (recording: boolean) => void;
  lesson?: Lesson;
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function RecordButton({ getLocalStream, getRemoteStream, isTeacher, onStateChange, lesson }: Props) {
  const { state, seconds, error, start, stop, reset, setError } = useLessonRecorder({
    getLocalStream, getRemoteStream,
  });

  const [file, setFile] = useState<File | null>(null);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!isTeacher || !recorderSupported()) return null;

  const begin = () => { start(); onStateChange?.(true); };

  const onStop = async () => {
    onStateChange?.(false);
    const f = await stop();
    if (!f) { reset(); setError("Запись не получилась"); return; }
    setFile(f);
    const attached = lesson?.students || [];
    if (attached.length > 0) setPicked(attached.map(x => x.id));
    apiGetStudents().then(r => { if (r.students) setStudents(r.students); }).catch(() => {});
  };

  const save = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);

    const dateLabel = new Date().toLocaleDateString("ru-RU");
    const title = lesson
      ? `Запись урока: ${lesson.topic || lesson.title} — ${dateLabel}`
      : file.name.replace(/\.[^.]+$/, "");
    const description = lesson
      ? `Занятие «${lesson.topic || lesson.title}» от ${dateLabel}. Длительность ${fmt(seconds)}`
      : `Видеозапись занятия, ${fmt(seconds)}`;

    const res = await apiUploadMaterial(
      file,
      { title, description, category: "Видео", file_type: file.name.endsWith(".mp4") ? "MP4" : "WEBM" },
      p => setProgress(p),
    );

    setUploading(false);

    if (res.error || !res.id) { setError(res.error || "Не удалось сохранить"); return; }

    if (picked.length > 0 || lesson) {
      await apiAssignMaterial({
        material_id: res.id,
        student_ids: picked,
        lesson_ids: lesson ? [lesson.id] : undefined,
      });
    }

    setSaved(true);
    setTimeout(() => { setFile(null); setSaved(false); setPicked([]); reset(); }, 2200);
  };

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const discard = () => { setFile(null); setPicked([]); reset(); };

  return (
    <>
      <button
        onClick={state === "recording" ? onStop : begin}
        disabled={state === "saving"}
        title={state === "recording" ? "Остановить запись" : "Записать урок"}
        className={`h-11 px-3 rounded-full flex items-center gap-1.5 transition-colors disabled:opacity-60 ${
          state === "recording" ? "bg-red-600 text-white" : "bg-muted hover:bg-muted/70 text-foreground"
        }`}
      >
        <Icon name={state === "recording" ? "Square" : "Circle"} size={state === "recording" ? 14 : 18} />
        {state === "recording" && (
          <span className="text-xs font-montserrat font-bold tabular-nums">{fmt(seconds)}</span>
        )}
        {state === "saving" && <span className="text-xs font-montserrat font-bold">...</span>}
      </button>

      {error && !file && (
        <span className="text-[11px] font-ibm text-red-400 self-center px-1">{error}</span>
      )}

      {file && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={uploading ? undefined : discard} />
          <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-sm p-5 animate-scale-in">
            {saved ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600 flex items-center justify-center mx-auto mb-3">
                  <Icon name="Check" size={26} className="text-white" />
                </div>
                <p className="font-montserrat font-bold text-foreground">Запись сохранена</p>
                <p className="text-xs text-muted-foreground font-ibm mt-1">
                  {lesson
                    ? "Запись прикреплена к занятию и доступна ученикам"
                    : picked.length > 0
                      ? "Ученики получили её в материалах"
                      : "Найдёте её в разделе «Материалы»"}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-10 h-10 rounded-xl red-accent flex items-center justify-center flex-shrink-0">
                    <Icon name="Video" size={20} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-montserrat font-bold text-sm text-foreground">Запись готова</p>
                    <p className="text-xs text-muted-foreground font-ibm">
                      {fmt(seconds)} · {(file.size / 1024 / 1024).toFixed(1)} МБ
                    </p>
                    {lesson && (
                      <p className="text-[11px] text-primary font-ibm truncate">
                        Урок: {lesson.topic || lesson.title}
                      </p>
                    )}
                  </div>
                </div>

                {students.length > 0 && (
                  <>
                    <p className="text-xs font-montserrat font-bold text-foreground mb-1.5">Кому открыть доступ</p>
                    <div className="flex flex-wrap gap-1.5 mb-3 max-h-28 overflow-y-auto">
                      {students.map(s => {
                        const on = picked.includes(s.id);
                        return (
                          <button key={s.id} disabled={uploading}
                            onClick={() => setPicked(on ? picked.filter(x => x !== s.id) : [...picked, s.id])}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-ibm transition-colors ${
                              on ? "red-accent text-white border-transparent" : "border-border text-foreground hover:bg-muted"
                            }`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-montserrat font-bold ${
                              on ? "bg-white/20" : "bg-primary/10 text-primary"
                            }`}>{s.avatar}</span>
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {uploading && (
                  <div className="mb-3">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full red-accent transition-all duration-200" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground font-ibm mt-1">Загружаю... {progress}%</p>
                  </div>
                )}

                {error && <p className="text-xs text-red-600 font-ibm mb-2">{error}</p>}

                <div className="flex gap-2">
                  <button onClick={download} disabled={uploading}
                    className="px-3 py-2.5 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    title="Скачать на компьютер">
                    <Icon name="Download" size={16} />
                  </button>
                  <button onClick={discard} disabled={uploading}
                    className="px-3 py-2.5 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50">
                    Удалить
                  </button>
                  <button onClick={save} disabled={uploading}
                    className="flex-1 py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                    {uploading ? "Сохраняю..." : "Сохранить"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
