import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";

interface Props {
  onReady: (opts: { micOn: boolean; camOn: boolean }) => void;
  onCancel?: () => void;
}

type Phase = "asking" | "ready" | "denied";

export default function DeviceCheck({ onReady, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const [phase, setPhase] = useState<Phase>("asking");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [level, setLevel] = useState(0);
  const [hasVideo, setHasVideo] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const [note, setNote] = useState("");

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const listen = useCallback((stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, Math.round((avg / 90) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* без индикатора */ }
  }, []);

  const init = useCallback(async () => {
    setPhase("asking");
    setNote("");
    const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

    const tryGet = (c: MediaStreamConstraints, ms: number) =>
      Promise.race([
        navigator.mediaDevices.getUserMedia(c),
        new Promise<MediaStream>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ]);

    let stream: MediaStream | null = null;
    try {
      stream = await tryGet({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: AUDIO }, 12000);
    } catch { /* пробуем проще */ }

    if (!stream) {
      try {
        stream = await tryGet({ video: true, audio: AUDIO }, 8000);
        setNote("Камера работает в упрощённом качестве");
      } catch { /* только звук */ }
    }

    if (!stream) {
      try {
        stream = await tryGet({ audio: AUDIO }, 8000);
        setCamOn(false);
        setNote("Камера недоступна — урок пройдёт со звуком");
      } catch { /* нет доступа */ }
    }

    if (!stream) {
      setPhase("denied");
      return;
    }

    streamRef.current = stream;
    const v = stream.getVideoTracks().length > 0;
    const a = stream.getAudioTracks().length > 0;
    setHasVideo(v);
    setHasAudio(a);
    if (!v) setCamOn(false);
    if (v && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    if (a) listen(stream);
    setPhase("ready");
  }, [listen]);

  useEffect(() => {
    init();
    return stopAll;
  }, [init, stopAll]);

  const toggleCam = () => {
    const t = streamRef.current?.getVideoTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setCamOn(t.enabled);
  };

  const toggleMic = () => {
    const t = streamRef.current?.getAudioTracks()[0];
    if (!t) return;
    t.enabled = !t.enabled;
    setMicOn(t.enabled);
  };

  const join = () => {
    stopAll();
    onReady({ micOn, camOn });
  };

  const pill = (active: boolean) =>
    `w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
      active ? "bg-white/15 hover:bg-white/25 text-white" : "bg-red-600 hover:bg-red-700 text-white"
    }`;

  return (
    <div className="w-full h-full min-h-[280px] flex items-center justify-center bg-neutral-900 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h3 className="font-montserrat font-bold text-white text-base">Проверьте камеру и звук</h3>
          <p className="text-xs font-ibm text-white/50 mt-0.5">Так вас увидит и услышит собеседник</p>
        </div>

        <div className="relative aspect-video rounded-xl overflow-hidden bg-neutral-800 border border-white/10">
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

          {phase === "asking" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-5">
              <Icon name="Loader" size={26} className="text-white animate-spin" />
              <p className="text-sm font-montserrat font-bold text-white">Включаю камеру...</p>
              <p className="text-xs font-ibm text-white/50">Разрешите доступ в окне браузера</p>
            </div>
          )}

          {phase === "denied" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-5">
              <Icon name="VideoOff" size={26} className="text-white/70" />
              <p className="text-sm font-montserrat font-bold text-white">Нет доступа к камере</p>
              <p className="text-xs font-ibm text-white/50 max-w-xs">
                Закройте другие программы с камерой и разрешите доступ в браузере
              </p>
            </div>
          )}

          {phase === "ready" && (!hasVideo || !camOn) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-neutral-800">
              <Icon name="VideoOff" size={24} className="text-white/50" />
              <p className="text-xs font-ibm text-white/50">{hasVideo ? "Камера выключена" : "Камера недоступна"}</p>
            </div>
          )}
        </div>

        {phase === "ready" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/5">
              <Icon name={micOn && hasAudio ? "Mic" : "MicOff"} size={15} className="text-white/70 flex-shrink-0" />
              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-100 rounded-full"
                  style={{ width: `${micOn && hasAudio ? level : 0}%` }}
                />
              </div>
              <span className="text-[11px] font-ibm text-white/50 w-24 text-right">
                {!hasAudio ? "нет микрофона" : !micOn ? "выключен" : level > 6 ? "слышу вас" : "скажите что-нибудь"}
              </span>
            </div>
            {note && <p className="text-[11px] font-ibm text-amber-400 px-1">{note}</p>}
          </div>
        )}

        <div className="flex items-center justify-center gap-2">
          <button onClick={toggleMic} disabled={!hasAudio} className={`${pill(micOn && hasAudio)} disabled:opacity-40`}
            title={micOn ? "Выключить микрофон" : "Включить микрофон"}>
            <Icon name={micOn && hasAudio ? "Mic" : "MicOff"} size={18} />
          </button>
          <button onClick={toggleCam} disabled={!hasVideo} className={`${pill(camOn && hasVideo)} disabled:opacity-40`}
            title={camOn ? "Выключить камеру" : "Включить камеру"}>
            <Icon name={camOn && hasVideo ? "Video" : "VideoOff"} size={18} />
          </button>
        </div>

        <div className="flex gap-2">
          {onCancel && (
            <button onClick={() => { stopAll(); onCancel(); }}
              className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-montserrat font-medium transition-colors">
              Назад
            </button>
          )}
          {phase === "denied" ? (
            <button onClick={init}
              className="flex-1 py-2.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-montserrat font-bold transition-colors">
              Попробовать снова
            </button>
          ) : (
            <button onClick={join} disabled={phase !== "ready"}
              className="flex-1 py-2.5 red-accent text-white rounded-lg text-sm font-montserrat font-bold hover:opacity-90 transition-opacity disabled:opacity-40">
              Войти в урок
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
