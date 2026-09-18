import { useState } from "react";
import { type NetInfo } from "@/hooks/useWebRTC";

const LOOK = {
  good: { bars: 3, color: "bg-emerald-400", text: "Связь хорошая", tone: "text-emerald-400" },
  ok: { bars: 2, color: "bg-amber-400", text: "Связь нестабильна", tone: "text-amber-400" },
  poor: { bars: 1, color: "bg-red-500", text: "Слабый интернет", tone: "text-red-400" },
  unknown: { bars: 0, color: "bg-white/40", text: "Проверяю связь", tone: "text-white/60" },
} as const;

export default function NetBadge({ net }: { net: NetInfo }) {
  const [open, setOpen] = useState(false);
  const look = LOOK[net.quality];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title={look.text}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur hover:bg-black/70 transition-colors"
      >
        <span className="flex items-end gap-[2px] h-3">
          {[1, 2, 3].map(i => (
            <span
              key={i}
              className={`w-[3px] rounded-sm transition-colors ${i <= look.bars ? look.color : "bg-white/25"}`}
              style={{ height: `${4 + i * 3}px` }}
            />
          ))}
        </span>
        {net.quality !== "good" && (
          <span className={`text-[11px] font-ibm ${look.tone}`}>{look.text}</span>
        )}
      </button>

      {open && (
        <div className="absolute top-8 right-0 w-52 p-2.5 rounded-xl bg-black/80 backdrop-blur border border-white/10 shadow-xl z-20 space-y-1.5">
          <p className={`text-[11px] font-montserrat font-bold ${look.tone}`}>{look.text}</p>

          <Row label="Задержка" value={net.rtt ? `${net.rtt} мс` : "—"} />
          <Row label="Потери" value={`${net.loss}%`} />
          <Row label="Скорость видео" value={net.kbps ? `${net.kbps} кбит/с` : "—"} />
          {net.relayed && <Row label="Через ретранслятор" value="да" />}

          {net.quality !== "good" && (
            <p className="text-[10px] font-ibm text-white/50 leading-snug pt-1 border-t border-white/10">
              {net.quality === "poor"
                ? "Картинка может замирать. Попробуйте выключить видео или подойти ближе к роутеру"
                : "Возможны короткие подвисания картинки"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] font-ibm text-white/50">{label}</span>
      <span className="text-[10px] font-ibm text-white">{value}</span>
    </div>
  );
}
