import { useState, useEffect, useRef } from "react";
import Icon from "@/components/ui/icon";
import { getCamId, getMicId, getSpkId, canPickSpeaker, applySink } from "@/lib/mediaPrefs";

interface Props {
  onCamera: (id: string) => void;
  onMic: (id: string) => void;
  onSpeaker: (id: string) => void;
  disabledCam?: boolean;
}

export default function RoomDevicePanel({ onCamera, onMic, onSpeaker, disabledCam }: Props) {
  const [open, setOpen] = useState(false);
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [spks, setSpks] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamSel] = useState(getCamId());
  const [micId, setMicSel] = useState(getMicId());
  const [spkId, setSpkSel] = useState(getSpkId());
  const [testing, setTesting] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        setCams(list.filter(d => d.kind === "videoinput"));
        setMics(list.filter(d => d.kind === "audioinput"));
        setSpks(list.filter(d => d.kind === "audiooutput"));
      } catch { /* список недоступен */ }
    };
    load();
    navigator.mediaDevices.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", load);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const playTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const dest = ctx.createMediaStreamDestination();
      const el = new Audio();
      el.srcObject = dest.stream;
      await applySink(el);
      el.play().catch(() => {});

      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const g = ctx.createGain();
        const t0 = now + i * 0.26;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.24);
        osc.connect(g);
        g.connect(dest);
        osc.start(t0);
        osc.stop(t0 + 0.26);
      });

      setTimeout(() => {
        el.pause();
        el.srcObject = null;
        ctx.close().catch(() => {});
        setTesting(false);
      }, 1100);
    } catch {
      setTesting(false);
    }
  };

  const pick = (kind: "cam" | "mic" | "spk", id: string) => {
    if (kind === "cam") { setCamSel(id); onCamera(id); }
    if (kind === "mic") { setMicSel(id); onMic(id); }
    if (kind === "spk") { setSpkSel(id); onSpeaker(id); }
  };

  const row = (icon: string, list: MediaDeviceInfo[], value: string, fallback: string, kind: "cam" | "mic" | "spk", disabled?: boolean) => (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted ${disabled ? "opacity-50" : ""}`}>
      <Icon name={icon} size={14} className="text-muted-foreground flex-shrink-0" />
      <select
        value={value}
        disabled={disabled}
        onChange={e => pick(kind, e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-xs font-ibm text-foreground outline-none cursor-pointer disabled:cursor-not-allowed"
      >
        {list.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${fallback} ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
          open ? "bg-primary text-white" : "bg-muted hover:bg-muted/70 text-foreground"
        }`}
        title="Настройки камеры и звука"
      >
        <Icon name="Settings" size={18} />
      </button>

      {open && (
        <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-64 p-2.5 rounded-xl bg-card border border-border shadow-xl z-20 space-y-2">
          <p className="text-[11px] font-montserrat font-bold text-foreground px-1">Камера и звук</p>

          {cams.length > 0 && row("Video", cams, camId, "Камера", "cam", disabledCam)}
          {disabledCam && (
            <p className="text-[10px] font-ibm text-muted-foreground px-1 -mt-1">
              Остановите показ экрана, чтобы сменить камеру
            </p>
          )}
          {mics.length > 0 && row("Mic", mics, micId, "Микрофон", "mic")}
          {canPickSpeaker() && spks.length > 0 && row("Volume2", spks, spkId, "Динамик", "spk")}

          <button
            onClick={playTest}
            disabled={testing}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border border-border hover:bg-muted text-xs font-montserrat font-medium text-foreground transition-colors disabled:opacity-60"
          >
            <Icon name={testing ? "Volume2" : "Play"} size={13} className={testing ? "animate-pulse" : ""} />
            {testing ? "Слышите сигнал?" : "Проверить звук"}
          </button>
        </div>
      )}
    </div>
  );
}
