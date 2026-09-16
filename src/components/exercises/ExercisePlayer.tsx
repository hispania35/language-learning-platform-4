import { useState, useEffect, useMemo } from "react";
import Icon from "@/components/ui/icon";
import { shuffle, getTemplate } from "@/lib/exTemplates";
import { apiSaveExResult, type Exercise, type ExItem } from "@/lib/api";

interface Props {
  exercise: Exercise;
  onExit: () => void;
}

export default function ExercisePlayer({ exercise, onExit }: Props) {
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [startedAt] = useState(Date.now());
  const [saved, setSaved] = useState(false);

  const items = useMemo(() => shuffle(exercise.items), [exercise.items]);
  const total = items.length;
  const item = items[idx];
  const tpl = getTemplate(exercise.template);

  const next = (correct: boolean) => {
    if (correct) setScore(s => s + 1);
    if (idx + 1 >= total) setDone(true);
    else setIdx(i => i + 1);
  };

  useEffect(() => {
    if (!done || saved) return;
    setSaved(true);
    apiSaveExResult({
      exercise_id: exercise.id,
      score,
      total,
      seconds: Math.round((Date.now() - startedAt) / 1000),
    }).catch(() => {});
  }, [done, saved, exercise.id, score, total, startedAt]);

  if (done) {
    const pct = total ? Math.round((score / total) * 100) : 0;
    const secs = Math.round((Date.now() - startedAt) / 1000);
    return (
      <div className="max-w-md mx-auto bg-card rounded-xl border border-border p-8 text-center animate-scale-in">
        <div className={`w-16 h-16 rounded-2xl ${pct >= 80 ? "bg-emerald-600" : pct >= 50 ? "bg-amber-500" : "bg-rose-500"} flex items-center justify-center mx-auto mb-4`}>
          <Icon name={pct >= 80 ? "Trophy" : pct >= 50 ? "ThumbsUp" : "RefreshCw"} size={30} className="text-white" />
        </div>
        <h3 className="font-montserrat font-bold text-xl text-foreground mb-1">
          {score} из {total}
        </h3>
        <p className="text-sm text-muted-foreground font-ibm mb-1">
          {pct >= 80 ? "Отличный результат!" : pct >= 50 ? "Неплохо, можно лучше" : "Стоит повторить тему"}
        </p>
        <p className="text-xs text-muted-foreground font-ibm mb-6">Время: {secs} сек</p>
        <div className="flex gap-2">
          <button
            onClick={() => { setIdx(0); setScore(0); setDone(false); setSaved(false); }}
            className="flex-1 py-2.5 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors">
            Ещё раз
          </button>
          <button onClick={onExit} className="flex-1 py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity">
            Готово
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-muted-foreground font-ibm">В задании нет вопросов</p>
        <button onClick={onExit} className="mt-3 px-4 py-2 rounded-lg border border-border text-sm font-montserrat">Назад</button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onExit} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <Icon name="ArrowLeft" size={18} className="text-muted-foreground" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-montserrat font-bold text-sm text-foreground truncate">{exercise.title}</p>
          <p className="text-xs text-muted-foreground font-ibm">{tpl.name} · вопрос {idx + 1} из {total}</p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-montserrat font-bold">
          {score}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full red-accent transition-all duration-300" style={{ width: `${(idx / total) * 100}%` }} />
      </div>

      {exercise.instruction && (
        <p className="text-xs text-muted-foreground font-ibm px-1">{exercise.instruction}</p>
      )}

      <StepBody key={idx} template={exercise.template} item={item} allItems={items} onAnswer={next} />
    </div>
  );
}

function StepBody({ template, item, allItems, onAnswer }: {
  template: string;
  item: ExItem;
  allItems: ExItem[];
  onAnswer: (correct: boolean) => void;
}) {
  if (template === "quiz") return <QuizStep item={item} onAnswer={onAnswer} />;
  if (template === "truefalse") return <TrueFalseStep item={item} onAnswer={onAnswer} />;
  if (template === "gaps") return <GapStep item={item} onAnswer={onAnswer} />;
  if (template === "order") return <OrderStep item={item} onAnswer={onAnswer} />;
  if (template === "match" || template === "cards") return <MatchStep item={item} allItems={allItems} onAnswer={onAnswer} />;
  return null;
}

const cardBox = "bg-card rounded-xl border border-border p-5 sm:p-6";

function Feedback({ ok }: { ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg animate-scale-in ${ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
      <Icon name={ok ? "CircleCheck" : "CircleX"} size={16} />
      <span className="text-sm font-montserrat font-medium">{ok ? "Верно!" : "Не угадали"}</span>
    </div>
  );
}

function useDelayedNext(onAnswer: (c: boolean) => void) {
  const [picked, setPicked] = useState<number | null>(null);
  const [ok, setOk] = useState(false);
  const answer = (index: number, correct: boolean) => {
    if (picked !== null) return;
    setPicked(index);
    setOk(correct);
    setTimeout(() => onAnswer(correct), 900);
  };
  return { picked, ok, answer };
}

function QuizStep({ item, onAnswer }: { item: ExItem; onAnswer: (c: boolean) => void }) {
  const { picked, ok, answer } = useDelayedNext(onAnswer);
  const options = item.options || [];
  const correctIdx = Number(item.answer ?? 0);

  return (
    <div className={`${cardBox} space-y-4`}>
      <p className="font-montserrat font-bold text-base sm:text-lg text-foreground">{item.question}</p>
      <div className="grid gap-2">
        {options.map((o, i) => {
          const isRight = i === correctIdx;
          const show = picked !== null;
          return (
            <button
              key={i}
              onClick={() => answer(i, isRight)}
              disabled={show}
              className={`text-left px-4 py-3 rounded-lg border text-sm font-ibm transition-colors ${
                show && isRight ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : show && picked === i ? "border-rose-500 bg-rose-50 text-rose-800"
                : "border-border hover:border-primary hover:bg-muted text-foreground"
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && <Feedback ok={ok} />}
    </div>
  );
}

function TrueFalseStep({ item, onAnswer }: { item: ExItem; onAnswer: (c: boolean) => void }) {
  const { picked, ok, answer } = useDelayedNext(onAnswer);
  const correct = item.answer === true;

  return (
    <div className={`${cardBox} space-y-5 text-center`}>
      <p className="font-montserrat font-bold text-base sm:text-lg text-foreground">{item.statement}</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => answer(1, correct)} disabled={picked !== null}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
          <Icon name="Check" size={18} /> Верно
        </button>
        <button onClick={() => answer(0, !correct)} disabled={picked !== null}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-500 text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
          <Icon name="X" size={18} /> Неверно
        </button>
      </div>
      {picked !== null && <Feedback ok={ok} />}
    </div>
  );
}

function GapStep({ item, onAnswer }: { item: ExItem; onAnswer: (c: boolean) => void }) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(false);
  const right = String(item.answer || "").trim().toLowerCase();
  const ok = value.trim().toLowerCase() === right;

  const check = () => {
    if (checked || !value.trim()) return;
    setChecked(true);
    setTimeout(() => onAnswer(ok), 1100);
  };

  const parts = (item.text || "").split("___");

  return (
    <div className={`${cardBox} space-y-4`}>
      <p className="font-montserrat font-bold text-base sm:text-lg text-foreground leading-relaxed">
        {parts[0]}
        <span className="inline-block min-w-[80px] mx-1 px-2 border-b-2 border-primary text-primary">
          {checked ? right : value || "..."}
        </span>
        {parts[1]}
      </p>
      <input
        autoFocus
        value={value}
        disabled={checked}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") check(); }}
        placeholder="Впишите слово"
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40 disabled:opacity-60"
      />
      {checked ? <Feedback ok={ok} /> : (
        <button onClick={check} disabled={!value.trim()}
          className="w-full py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-40">
          Проверить
        </button>
      )}
    </div>
  );
}

function OrderStep({ item, onAnswer }: { item: ExItem; onAnswer: (c: boolean) => void }) {
  const words = useMemo(() => (item.sentence || "").trim().split(/\s+/), [item.sentence]);
  const [pool, setPool] = useState(() => shuffle(words.map((w, i) => ({ w, i }))));
  const [picked, setPicked] = useState<{ w: string; i: number }[]>([]);
  const [checked, setChecked] = useState(false);

  const ok = picked.map(p => p.w).join(" ") === words.join(" ");

  const check = () => {
    setChecked(true);
    setTimeout(() => onAnswer(ok), 1200);
  };

  return (
    <div className={`${cardBox} space-y-4`}>
      {item.hint && <p className="text-xs text-muted-foreground font-ibm">{item.hint}</p>}

      <div className="min-h-[52px] flex flex-wrap gap-2 p-2.5 rounded-lg bg-muted/40 border border-dashed border-border">
        {picked.length === 0 && <span className="text-xs text-muted-foreground font-ibm self-center px-1">Нажимайте слова по порядку</span>}
        {picked.map((p, n) => (
          <button key={`${p.i}-${n}`} disabled={checked}
            onClick={() => { setPicked(picked.filter((_, k) => k !== n)); setPool([...pool, p]); }}
            className="px-3 py-1.5 rounded-lg red-accent text-white text-sm font-ibm hover:opacity-90 transition-opacity">
            {p.w}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {pool.map((p, n) => (
          <button key={`${p.i}-${n}`} disabled={checked}
            onClick={() => { setPicked([...picked, p]); setPool(pool.filter((_, k) => k !== n)); }}
            className="px-3 py-1.5 rounded-lg border border-border text-sm font-ibm text-foreground hover:border-primary hover:bg-muted transition-colors">
            {p.w}
          </button>
        ))}
      </div>

      {checked ? (
        <div className="space-y-2">
          <Feedback ok={ok} />
          {!ok && <p className="text-xs text-muted-foreground font-ibm">Правильно: {words.join(" ")}</p>}
        </div>
      ) : (
        <button onClick={check} disabled={pool.length > 0}
          className="w-full py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-40">
          Проверить
        </button>
      )}
    </div>
  );
}

function MatchStep({ item, allItems, onAnswer }: { item: ExItem; allItems: ExItem[]; onAnswer: (c: boolean) => void }) {
  const { picked, ok, answer } = useDelayedNext(onAnswer);

  const options = useMemo(() => {
    const wrong = shuffle(allItems.filter(x => x.right !== item.right)).slice(0, 3).map(x => x.right || "");
    return shuffle([item.right || "", ...wrong]);
  }, [item, allItems]);

  return (
    <div className={`${cardBox} space-y-5`}>
      <div className="text-center py-5 rounded-xl bg-muted/50">
        <p className="font-montserrat font-black text-2xl sm:text-3xl text-foreground">{item.left}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o, i) => {
          const isRight = o === item.right;
          const show = picked !== null;
          return (
            <button key={i} onClick={() => answer(i, isRight)} disabled={show}
              className={`px-3 py-3 rounded-lg border text-sm font-ibm transition-colors ${
                show && isRight ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : show && picked === i ? "border-rose-500 bg-rose-50 text-rose-800"
                : "border-border hover:border-primary hover:bg-muted text-foreground"
              }`}>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && <Feedback ok={ok} />}
    </div>
  );
}
