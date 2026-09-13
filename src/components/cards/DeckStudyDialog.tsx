import { useState } from "react";
import Icon from "@/components/ui/icon";
import { apiCardProgress, type CardDeck } from "@/lib/api";

type Mode = "flip" | "test" | "list";

const norm = (s: string) =>
  s.toLowerCase().trim()
    .replace(/^(el|la|los|las|un|una|the|der|die|das|le|il)\s+/i, "")
    .replace(/[.,!?;:()"']/g, "")
    .replace(/\s+/g, " ");

export default function DeckStudyDialog({
  deck, isTeacher, onClose,
}: {
  deck: CardDeck;
  isTeacher: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("flip");
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState<null | boolean>(null);
  const [stats, setStats] = useState({ ok: 0, fail: 0 });
  const [done, setDone] = useState(false);

  const cards = deck.cards;
  const card = cards[idx];

  const save = (known: boolean, correct: boolean) => {
    if (isTeacher || !card?.id) return;
    apiCardProgress({ card_id: card.id, known, correct }).catch(() => {});
  };

  const next = () => {
    setFlipped(false);
    setAnswer("");
    setChecked(null);
    if (idx + 1 >= cards.length) setDone(true);
    else setIdx(idx + 1);
  };

  const restart = () => {
    setIdx(0); setFlipped(false); setAnswer(""); setChecked(null);
    setStats({ ok: 0, fail: 0 }); setDone(false);
  };

  const check = () => {
    if (!answer.trim() || !card) return;
    const variants = (card.back || "").split(/[,/]/).map(norm).filter(Boolean);
    const ok = variants.some(v => v === norm(answer));
    setChecked(ok);
    setStats(s => ({ ok: s.ok + (ok ? 1 : 0), fail: s.fail + (ok ? 0 : 1) }));
    save(ok, ok);
  };

  const switchMode = (m: Mode) => { setMode(m); restart(); };

  const modes: { key: Mode; label: string; icon: string }[] = [
    { key: "flip", label: "Учить", icon: "Layers" },
    { key: "test", label: "Проверка", icon: "PenLine" },
    { key: "list", label: "Список", icon: "List" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-xl w-full max-w-lg p-5 animate-scale-in max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0">
            <h2 className="font-montserrat font-bold text-base text-foreground truncate">{deck.title}</h2>
            <p className="text-xs text-muted-foreground font-ibm">
              {deck.lang_from} → {deck.lang_to} · {cards.length} слов
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors flex-shrink-0">
            <Icon name="X" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex gap-1 bg-muted/40 rounded-lg p-1 my-3">
          {modes.map(m => (
            <button key={m.key} onClick={() => switchMode(m.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-montserrat font-bold transition-all
                ${mode === m.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon name={m.icon} size={13} />
              {m.label}
            </button>
          ))}
        </div>

        {!cards.length && (
          <p className="py-10 text-center text-sm text-muted-foreground font-ibm">В наборе нет слов</p>
        )}

        {/* Режим: список */}
        {!!cards.length && mode === "list" && (
          <div className="rounded-lg border border-border overflow-hidden">
            {cards.map((c, i) => (
              <div key={i} className={`flex items-start gap-3 px-3 py-2.5 ${i % 2 ? "bg-muted/20" : ""}`}>
                <span className="w-6 text-xs text-muted-foreground font-ibm flex-shrink-0 pt-0.5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-ibm font-medium text-foreground">{c.front}</p>
                  {c.example && <p className="text-[12px] italic text-muted-foreground font-ibm">{c.example}</p>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-ibm text-foreground">{c.back || "—"}</p>
                  {c.example_ru && <p className="text-[12px] text-muted-foreground font-ibm">{c.example_ru}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Итоги прохождения */}
        {!!cards.length && mode !== "list" && done && (
          <div className="py-10 text-center">
            <Icon name="PartyPopper" size={38} className="text-primary mx-auto mb-3" />
            <p className="font-montserrat font-bold text-foreground">Набор пройден</p>
            {mode === "test" && (
              <p className="text-sm text-muted-foreground font-ibm mt-1">
                Верно {stats.ok} из {stats.ok + stats.fail}
              </p>
            )}
            <div className="flex gap-2 justify-center mt-4">
              <button onClick={restart}
                className="px-4 py-2 rounded-lg border border-border text-sm font-montserrat font-medium text-foreground hover:bg-muted">
                Ещё раз
              </button>
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90">
                Готово
              </button>
            </div>
          </div>
        )}

        {/* Режим: карточки */}
        {!!cards.length && mode === "flip" && !done && card && (
          <>
            <button onClick={() => setFlipped(!flipped)}
              className={`w-full min-h-[180px] rounded-xl border-2 p-5 flex flex-col items-center justify-center gap-2 transition-colors
                ${flipped ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20 hover:bg-muted/40"}`}>
              {!flipped ? (
                <>
                  <p className="font-montserrat font-black text-2xl text-foreground text-center">{card.front}</p>
                  {card.example && (
                    <p className="text-sm italic text-muted-foreground font-ibm text-center">{card.example}</p>
                  )}
                  <span className="text-[11px] text-muted-foreground font-ibm mt-2">нажмите, чтобы увидеть перевод</span>
                </>
              ) : (
                <>
                  <p className="font-montserrat font-black text-2xl text-primary text-center">{card.back || "—"}</p>
                  {card.example_ru && (
                    <p className="text-sm text-muted-foreground font-ibm text-center">{card.example_ru}</p>
                  )}
                  <span className="text-[11px] text-muted-foreground font-ibm mt-2">{card.front}</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2 mt-3">
              <button onClick={() => { save(false, false); next(); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-amber-300 text-amber-700 text-sm font-montserrat font-bold hover:bg-amber-50">
                <Icon name="RotateCcw" size={14} /> Повторить
              </button>
              <button onClick={() => { save(true, true); next(); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-green-300 text-green-700 text-sm font-montserrat font-bold hover:bg-green-50">
                <Icon name="Check" size={14} /> Знаю
              </button>
            </div>
          </>
        )}

        {/* Режим: проверка */}
        {!!cards.length && mode === "test" && !done && card && (
          <>
            <div className="rounded-xl border-2 border-border bg-muted/20 p-5 text-center">
              <p className="font-montserrat font-black text-2xl text-foreground">{card.front}</p>
              {card.example && (
                <p className="text-sm italic text-muted-foreground font-ibm mt-1">{card.example}</p>
              )}
            </div>

            <input value={answer} autoFocus
              onChange={e => { setAnswer(e.target.value); setChecked(null); }}
              onKeyDown={e => { if (e.key === "Enter") (checked === null ? check() : next()); }}
              placeholder={`Перевод на ${deck.lang_to.toLowerCase()}`}
              disabled={checked !== null}
              className={`mt-3 w-full px-3 py-2.5 rounded-lg border bg-muted/30 text-sm font-ibm outline-none transition-colors
                ${checked === null ? "border-border focus:border-primary/40"
                  : checked ? "border-green-400 bg-green-50" : "border-red-400 bg-red-50"}`} />

            {checked !== null && (
              <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-lg ${checked ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                <Icon name={checked ? "CheckCircle" : "XCircle"} size={15}
                  className={`flex-shrink-0 mt-0.5 ${checked ? "text-green-600" : "text-red-600"}`} />
                <p className={`text-xs font-ibm ${checked ? "text-green-700" : "text-red-700"}`}>
                  {checked ? "Верно!" : <>Правильный ответ: <b>{card.back}</b></>}
                </p>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              {checked === null ? (
                <button onClick={check} disabled={!answer.trim()}
                  className="flex-1 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90 disabled:opacity-60">
                  Проверить
                </button>
              ) : (
                <button onClick={next}
                  className="flex-1 py-2 rounded-lg red-accent text-white text-sm font-montserrat font-bold hover:opacity-90">
                  {idx + 1 >= cards.length ? "Завершить" : "Дальше"}
                </button>
              )}
            </div>
          </>
        )}

        {/* Прогресс */}
        {!!cards.length && mode !== "list" && !done && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-ibm mb-1">
              <span>{idx + 1} из {cards.length}</span>
              {mode === "test" && <span>верно {stats.ok} · ошибок {stats.fail}</span>}
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full red-accent transition-all duration-300"
                style={{ width: `${((idx + 1) / cards.length) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
