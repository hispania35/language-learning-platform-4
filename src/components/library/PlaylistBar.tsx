import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import { type LibraryItem } from "@/lib/api";

interface Props {
  tracks: LibraryItem[];
  startId: number;
  title: string;
  onClose: () => void;
}

const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

export default function PlaylistBar({ tracks, startId, title, onClose }: Props) {
  // Список фиксируем при запуске — смена фильтров не обрывает воспроизведение
  const [list] = useState<LibraryItem[]>(() => tracks);
  const [idx, setIdx] = useState(() => Math.max(0, tracks.findIndex(t => t.id === startId)));
  const [playing, setPlaying] = useState(true);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);
  const [repeat, setRepeat] = useState<"off" | "one" | "all">("all");
  const [showList, setShowList] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const track = list[idx];

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.playbackRate = rate;
  }, [rate, idx]);

  useEffect(() => {
    setPos(0);
    setDur(0);
  }, [idx]);

  const go = (delta: number) => {
    const next = idx + delta;
    if (next < 0) setIdx(list.length - 1);
    else if (next >= list.length) setIdx(0);
    else setIdx(next);
    setPlaying(true);
  };

  const onEnded = () => {
    if (repeat === "one") {
      const a = audioRef.current;
      if (a) { a.currentTime = 0; a.play(); }
      return;
    }
    if (idx + 1 < list.length) { setIdx(idx + 1); setPlaying(true); return; }
    if (repeat === "all") { setIdx(0); setPlaying(true); return; }
    setPlaying(false);
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); setPlaying(true); }
    else { a.pause(); setPlaying(false); }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const v = Number(e.target.value);
    a.currentTime = v;
    setPos(v);
  };

  if (!track) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-2xl animate-fade-in">
      {showList && (
        <div className="max-h-64 overflow-y-auto border-b border-border">
          {list.map((t, i) => (
            <button key={t.id} onClick={() => { setIdx(i); setPlaying(true); }}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                i === idx ? "bg-primary/10" : "hover:bg-muted/50"
              }`}>
              <span className={`w-6 text-[11px] font-montserrat font-bold flex-shrink-0 ${
                i === idx ? "text-primary" : "text-muted-foreground"
              }`}>
                {i === idx ? <Icon name="Volume2" size={13} /> : i + 1}
              </span>
              <span className={`flex-1 min-w-0 text-sm font-ibm truncate ${
                i === idx ? "text-foreground font-medium" : "text-muted-foreground"
              }`}>
                {t.title}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
            <Icon name="Music" size={17} className="text-purple-700" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-montserrat font-bold text-foreground truncate">{track.title}</p>
            <p className="text-[11px] text-muted-foreground font-ibm truncate">
              {idx + 1} из {list.length} · {title}
            </p>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => go(-1)} title="Предыдущий"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground hover:bg-muted transition-colors">
              <Icon name="SkipBack" size={16} />
            </button>
            <button onClick={toggle} title={playing ? "Пауза" : "Играть"}
              className="w-10 h-10 rounded-full red-accent text-white flex items-center justify-center hover:opacity-90 transition-opacity">
              <Icon name={playing ? "Pause" : "Play"} size={17} />
            </button>
            <button onClick={() => go(1)} title="Следующий"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-foreground hover:bg-muted transition-colors">
              <Icon name="SkipForward" size={16} />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
            <button onClick={() => setRate(r => (r >= 2 ? 0.75 : r === 1 ? 1.25 : r === 1.25 ? 1.5 : r === 1.5 ? 2 : 1))}
              title="Скорость воспроизведения"
              className="px-2 h-8 rounded-lg text-[11px] font-montserrat font-bold text-foreground hover:bg-muted transition-colors">
              {rate}x
            </button>
            <button onClick={() => setRepeat(r => (r === "all" ? "one" : r === "one" ? "off" : "all"))}
              title={repeat === "all" ? "Повтор каталога" : repeat === "one" ? "Повтор трека" : "Без повтора"}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                repeat === "off" ? "text-muted-foreground hover:bg-muted" : "text-primary bg-primary/10"
              }`}>
              <Icon name={repeat === "one" ? "Repeat1" : "Repeat"} size={15} />
            </button>
            <button onClick={() => setShowList(v => !v)} title="Список треков"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                showList ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"
              }`}>
              <Icon name="ListMusic" size={16} />
            </button>
          </div>

          <button onClick={onClose} title="Закрыть плеер"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors flex-shrink-0">
            <Icon name="X" size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] font-ibm text-muted-foreground w-9 text-right flex-shrink-0">{fmtTime(pos)}</span>
          <input type="range" min={0} max={dur || 0} value={pos} onChange={seek}
            className="flex-1 h-1 accent-primary cursor-pointer" />
          <span className="text-[10px] font-ibm text-muted-foreground w-9 flex-shrink-0">{fmtTime(dur)}</span>
        </div>
      </div>

      <audio
        ref={audioRef}
        src={track.file_url}
        autoPlay
        onEnded={onEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={e => setPos(e.currentTarget.currentTime)}
        onLoadedMetadata={e => {
          setDur(e.currentTarget.duration || 0);
          e.currentTarget.playbackRate = rate;
        }}
        className="hidden"
      />
    </div>
  );
}
