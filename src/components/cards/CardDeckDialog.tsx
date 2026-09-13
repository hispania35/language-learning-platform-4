import { useState } from "react";
import Icon from "@/components/ui/icon";
import { apiTranslateWords, apiCreateDeck, type WordCard, type StudentInfo } from "@/lib/api";

const LANGS = ["Испанский", "Английский", "Немецкий", "Французский", "Итальянский", "Русский"];

export default function CardDeckDialog({
  students, aiReady, onClose, onDone,
}: {
  students: StudentInfo[];
  aiReady: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<"input" | "review">("input");
  const [title, setTitle] = useState("");
  const [raw, setRaw] = useState("");
  const [langFrom, setLangFrom] = useState("Испанский");
  const [langTo, setLangTo] = useState("Русский");
  const [withExamples, setWithExamples] = useState(true);
  const [cards, setCards] = useState<WordCard[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const wordCount = raw.split(/[\n,;]+/).filter(w => w.trim()).length;

  const translate = async () => {
    if (!raw.trim()) { setErr("Вставьте слова — по одному в строке или через запятую"); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiTranslateWords({
        words: raw, lang_from: langFrom, lang_to: langTo, with_examples: withExamples,
      });
      if (res.cards?.length) {
        setCards(res.cards);
        if (!title.trim()) setTitle(`${langFrom} — ${res.cards.length} слов`);
        setStep("review");
      } else setErr(res.error || "ИИ не смог разобрать список");
    } catch {
      setErr("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
  };

  const skipAi = () => {
    const words = raw.split(/[\n,;]+/).map(w => w.trim()).filter(Boolean);
    if (!words.length) { setErr("Вставьте слова"); return; }
    setCards(words.map(w => ({ front: w, back: "", example: "", example_ru: "" })));
    if (!title.trim()) setTitle(`${langFrom} — ${words.length} слов`);
    setStep("review");
    setErr("");
  };

  const patch = (i: number, data: Partial<WordCard>) =>
    setCards(prev => prev.map((c, idx) => (idx === i ? { ...c, ...data } : c)));

  const save = async () => {
    if (!title.trim()) { setErr("Введите название набора"); return; }
    const ready = cards.filter(c => c.front.trim());
    if (!ready.length) { setErr("Нет ни одного слова"); return; }
    setBusy(true); setErr("");
    try {
      const res = await apiCreateDeck({
        title: title.trim(), lang_from: langFrom, lang_to: langTo,
        cards: ready, student_ids: picked,
      });
      if (res.ok) { onDone(); onClose(); }
      else setErr(res.error || "Не удалось сохранить набор");
    } catch {
      setErr("Нет связи с сервером");
    } finally {
      setBusy(false);
    }
  };

  const field = "mt-1 w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm font-ibm outline-none focus:border-primary/40";
  const emptyBacks = cards.filter(c => !c.back?.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={() => !busy && onClose()} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-5 animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-montserrat font-bold text-base text-foreground">
            {step === "input" ? "Новый набор карточек" : "Проверьте перевод"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>

        {step === "input" ? (
          <>
            <p className="text-sm text-muted-foreground font-ibm mb-4">
              Вставьте слова — ИИ сам переведёт их и придумает примеры
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Язык слов</label>
                <select value={langFrom} onChange={e => setLangFrom(e.target.value)} className={field}>
                  {LANGS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-montserrat font-bold text-muted-foreground">Перевод на</label>
                <select value={langTo} onChange={e => setLangTo(e.target.value)} className={field}>
                  {LANGS.map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-montserrat font-bold text-muted-foreground">
                  Слова на {langFrom.toLowerCase()}ом
                </label>
                {wordCount > 0 && (
                  <span className="text-[11px] text-muted-foreground font-ibm">{wordCount} шт.</span>
                )}
              </div>
              <textarea rows={7} value={raw}
                onChange={e => { setRaw(e.target.value); setErr(""); }}
                placeholder={"la mesa\nel libro\ncomer\nhablar por teléfono"}
                className={`${field} resize-none font-mono text-[13px]`} />
              <p className="text-[11px] text-muted-foreground font-ibm mt-1">
                По одному в строке или через запятую, до 60 слов
              </p>
            </div>

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input type="checkbox" checked={withExamples}
                onChange={e => setWithExamples(e.target.checked)}
                className="w-4 h-4 accent-primary" />
              <span className="text-sm font-ibm text-foreground">Добавить примеры употребления</span>
            </label>

            {!aiReady && (
              <p className="text-xs text-amber-700 font-ibm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                ИИ пока не подключён — можно создать набор и вписать переводы вручную
              </p>
            )}

            {err && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 mt-3">
                <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-ibm">{err}</p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={skipAi} disabled={busy}
                className="px-4 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Вручную
              </button>
              <button onClick={translate} disabled={busy || !aiReady}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                {busy ? (
                  <><Icon name="Loader" size={15} className="animate-spin" />Перевожу...</>
                ) : (
                  <><Icon name="Sparkles" size={15} />Перевести с ИИ</>
                )}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground font-ibm mb-3">
              {cards.length} карточек · можно поправить любой перевод
              {emptyBacks > 0 && <span className="text-amber-700"> · {emptyBacks} без перевода</span>}
            </p>

            <div>
              <label className="text-xs font-montserrat font-bold text-muted-foreground">Название набора</label>
              <input value={title} onChange={e => { setTitle(e.target.value); setErr(""); }}
                placeholder="Урок 5 — еда и напитки" className={field} />
            </div>

            <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
              {cards.map((c, i) => (
                <div key={i} className="rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <input value={c.front} onChange={e => patch(i, { front: e.target.value })}
                      className="flex-1 min-w-0 bg-transparent text-sm font-ibm font-medium text-foreground outline-none border-b border-transparent focus:border-primary/40" />
                    <Icon name="ArrowRight" size={13} className="text-muted-foreground flex-shrink-0" />
                    <input value={c.back} onChange={e => patch(i, { back: e.target.value })}
                      placeholder="перевод"
                      className={`flex-1 min-w-0 bg-transparent text-sm font-ibm outline-none border-b focus:border-primary/40
                        ${c.back?.trim() ? "text-foreground border-transparent" : "text-foreground border-amber-300"}`} />
                    <button onClick={() => setCards(prev => prev.filter((_, idx) => idx !== i))}
                      className="p-0.5 rounded hover:bg-muted flex-shrink-0">
                      <Icon name="X" size={13} className="text-muted-foreground" />
                    </button>
                  </div>
                  {(c.example || c.example_ru) && (
                    <div className="mt-1.5 pl-0.5 space-y-0.5">
                      <input value={c.example || ""} onChange={e => patch(i, { example: e.target.value })}
                        className="w-full bg-transparent text-[12px] font-ibm italic text-muted-foreground outline-none" />
                      <input value={c.example_ru || ""} onChange={e => patch(i, { example_ru: e.target.value })}
                        className="w-full bg-transparent text-[12px] font-ibm text-muted-foreground/80 outline-none" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => setCards(prev => [...prev, { front: "", back: "", example: "", example_ru: "" }])}
              className="mt-2 flex items-center gap-1.5 text-xs font-montserrat font-bold text-primary hover:underline">
              <Icon name="Plus" size={13} /> Добавить слово
            </button>

            {!!students.length && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-montserrat font-bold text-muted-foreground">Кому выдать</label>
                  <button onClick={() => setPicked(picked.length === students.length ? [] : students.map(s => s.id))}
                    className="text-xs font-montserrat font-medium text-primary hover:underline">
                    {picked.length === students.length ? "Снять всех" : "Выбрать всех"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {students.map(s => {
                    const on = picked.includes(s.id);
                    return (
                      <button key={s.id}
                        onClick={() => setPicked(p => on ? p.filter(x => x !== s.id) : [...p, s.id])}
                        className={`flex items-center gap-1.5 text-xs pl-1 pr-2.5 py-1 rounded-full font-montserrat font-medium transition-colors
                          ${on ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-muted"}`}>
                        <span className="w-5 h-5 rounded-full red-accent flex items-center justify-center">
                          <span className="text-white font-bold text-[9px]">{s.avatar}</span>
                        </span>
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {err && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 mt-3">
                <Icon name="TriangleAlert" size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 font-ibm">{err}</p>
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep("input")} disabled={busy}
                className="px-4 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-60">
                Назад
              </button>
              <button onClick={save} disabled={busy}
                className="flex-1 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-60">
                {busy ? "Сохраняю..." : `Создать набор (${cards.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
