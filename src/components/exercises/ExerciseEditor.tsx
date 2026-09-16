import { useState, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { getTemplate, emptyItem, isItemFilled } from "@/lib/exTemplates";
import {
  apiGenerateExercise, apiCreateExercise, apiUpdateExercise, apiGetStudents,
  type ExTemplate, type ExItem, type Exercise, type StudentInfo,
} from "@/lib/api";

interface Props {
  template: ExTemplate;
  existing?: Exercise | null;
  aiReady: boolean;
  onDone: () => void;
  onCancel: () => void;
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

export default function ExerciseEditor({ template, existing, aiReady, onDone, onCancel }: Props) {
  const tpl = getTemplate(template);
  const [title, setTitle] = useState(existing?.title || "");
  const [instruction, setInstruction] = useState(existing?.instruction || "");
  const [items, setItems] = useState<ExItem[]>(existing?.items?.length ? existing.items : [emptyItem(template)]);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("A1");
  const [count, setCount] = useState(8);
  const [genLoading, setGenLoading] = useState(false);

  useEffect(() => {
    apiGetStudents().then(r => { if (r.students) setStudents(r.students); }).catch(() => {});
  }, []);

  const setItem = (i: number, patch: Partial<ExItem>) =>
    setItems(prev => prev.map((it, n) => (n === i ? { ...it, ...patch } : it)));

  const generate = async () => {
    if (!topic.trim()) { setError("Укажите тему для ИИ"); return; }
    setGenLoading(true);
    setError("");
    const r = await apiGenerateExercise({ template, topic, count, level });
    setGenLoading(false);
    if (r.error) { setError(r.error); return; }
    if (r.items?.length) {
      setItems(r.items);
      if (!title.trim()) setTitle(topic.trim());
    }
  };

  const save = async () => {
    const filled = items.filter(it => isItemFilled(template, it));
    if (!title.trim()) { setError("Введите название задания"); return; }
    if (filled.length === 0) { setError("Заполните хотя бы одно задание"); return; }
    setSaving(true);
    setError("");
    const res = existing
      ? await apiUpdateExercise({ id: existing.id, title, instruction, items: filled })
      : await apiCreateExercise({ title, template, instruction, items: filled, student_ids: picked });
    setSaving(false);
    if (res.error) { setError(res.error); return; }
    onDone();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <Icon name="ArrowLeft" size={18} className="text-muted-foreground" />
        </button>
        <div className={`w-9 h-9 rounded-lg ${tpl.color} flex items-center justify-center flex-shrink-0`}>
          <Icon name={tpl.icon} size={18} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-montserrat font-bold text-foreground">{existing ? "Изменить задание" : tpl.name}</p>
          <p className="text-xs text-muted-foreground font-ibm truncate">{tpl.fields}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border p-4 space-y-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название задания, например «Глаголы движения»"
          className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
        />
        <input
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          placeholder="Подсказка ученику (необязательно)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
        />
      </div>

      {aiReady && !existing && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="Sparkles" size={15} className="text-primary" />
            <p className="font-montserrat font-bold text-sm text-foreground">Сгенерировать с ИИ</p>
          </div>
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") generate(); }}
            placeholder="Тема: еда в ресторане, прошедшее время, числа..."
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40"
          />
          <div className="flex gap-2 flex-wrap">
            <select value={level} onChange={e => setLevel(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none">
              {LEVELS.map(l => <option key={l} value={l}>Уровень {l}</option>)}
            </select>
            <select value={count} onChange={e => setCount(Number(e.target.value))}
              className="px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none">
              {[5, 8, 10, 12, 15].map(c => <option key={c} value={c}>{c} заданий</option>)}
            </select>
            <button onClick={generate} disabled={genLoading}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
              <Icon name={genLoading ? "Loader" : "Wand2"} size={15} className={genLoading ? "animate-spin" : ""} />
              {genLoading ? "Придумываю..." : "Создать"}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item, i) => (
          <ItemEditor
            key={i}
            index={i}
            template={template}
            item={item}
            onChange={patch => setItem(i, patch)}
            onRemove={items.length > 1 ? () => setItems(items.filter((_, n) => n !== i)) : undefined}
          />
        ))}
        <button onClick={() => setItems([...items, emptyItem(template)])}
          className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm font-montserrat font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors">
          <Icon name="Plus" size={15} className="inline mr-1.5" />
          Добавить задание
        </button>
      </div>

      {!existing && students.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="font-montserrat font-bold text-sm text-foreground mb-2.5">Кому выдать</p>
          <div className="flex flex-wrap gap-1.5">
            {students.map(s => {
              const on = picked.includes(s.id);
              return (
                <button key={s.id}
                  onClick={() => setPicked(on ? picked.filter(x => x !== s.id) : [...picked, s.id])}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-ibm transition-colors ${
                    on ? "red-accent text-white border-transparent" : "border-border text-foreground hover:bg-muted"
                  }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-montserrat font-bold ${on ? "bg-white/20" : "bg-primary/10 text-primary"}`}>
                    {s.avatar}
                  </span>
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 font-ibm px-1">{error}</p>}

      <div className="flex gap-2 pb-4">
        <button onClick={onCancel}
          className="px-5 py-2.5 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
          Отмена
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
          {saving ? "Сохраняю..." : existing ? "Сохранить изменения" : "Сохранить и выдать"}
        </button>
      </div>
    </div>
  );
}

function ItemEditor({ index, template, item, onChange, onRemove }: {
  index: number;
  template: ExTemplate;
  item: ExItem;
  onChange: (patch: Partial<ExItem>) => void;
  onRemove?: () => void;
}) {
  const input = "w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40";

  return (
    <div className="bg-card rounded-xl border border-border p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-montserrat font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <span className="text-xs text-muted-foreground font-ibm flex-1">{getTemplate(template).fields}</span>
        {onRemove && (
          <button onClick={onRemove} className="p-1 rounded hover:bg-muted transition-colors">
            <Icon name="Trash2" size={14} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {template === "quiz" && (
        <>
          <input className={input} value={item.question || ""} placeholder="Вопрос"
            onChange={e => onChange({ question: e.target.value })} />
          <div className="grid gap-1.5">
            {(item.options || ["", "", "", ""]).map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button onClick={() => onChange({ answer: i })}
                  title="Отметить правильный ответ"
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    Number(item.answer) === i ? "border-emerald-600 bg-emerald-600" : "border-border hover:border-primary"
                  }`}>
                  {Number(item.answer) === i && <Icon name="Check" size={12} className="text-white" />}
                </button>
                <input className={input} value={o} placeholder={i === 0 ? "Вариант ответа" : `Вариант ${i + 1}`}
                  onChange={e => {
                    const opts = [...(item.options || ["", "", "", ""])];
                    opts[i] = e.target.value;
                    onChange({ options: opts });
                  }} />
              </div>
            ))}
          </div>
        </>
      )}

      {(template === "match" || template === "cards") && (
        <div className="grid sm:grid-cols-2 gap-2">
          <input className={input} value={item.left || ""} placeholder="Слово по-испански"
            onChange={e => onChange({ left: e.target.value })} />
          <input className={input} value={item.right || ""} placeholder="Перевод"
            onChange={e => onChange({ right: e.target.value })} />
        </div>
      )}

      {template === "gaps" && (
        <>
          <input className={input} value={item.text || ""} placeholder="Предложение с ___ вместо слова"
            onChange={e => onChange({ text: e.target.value })} />
          <input className={input} value={String(item.answer || "")} placeholder="Пропущенное слово"
            onChange={e => onChange({ answer: e.target.value })} />
        </>
      )}

      {template === "order" && (
        <>
          <input className={input} value={item.sentence || ""} placeholder="Предложение целиком"
            onChange={e => onChange({ sentence: e.target.value })} />
          <input className={input} value={item.hint || ""} placeholder="Перевод-подсказка"
            onChange={e => onChange({ hint: e.target.value })} />
        </>
      )}

      {template === "truefalse" && (
        <>
          <input className={input} value={item.statement || ""} placeholder="Утверждение"
            onChange={e => onChange({ statement: e.target.value })} />
          <div className="flex gap-2">
            <button onClick={() => onChange({ answer: true })}
              className={`flex-1 py-2 rounded-lg text-sm font-montserrat font-medium transition-colors ${
                item.answer === true ? "bg-emerald-600 text-white" : "border border-border text-foreground hover:bg-muted"
              }`}>Верно</button>
            <button onClick={() => onChange({ answer: false })}
              className={`flex-1 py-2 rounded-lg text-sm font-montserrat font-medium transition-colors ${
                item.answer === false ? "bg-rose-500 text-white" : "border border-border text-foreground hover:bg-muted"
              }`}>Неверно</button>
          </div>
        </>
      )}
    </div>
  );
}
