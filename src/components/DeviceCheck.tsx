import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { getCamId, getMicId, setCamId, setMicId, getSpkId, setSpkId, canPickSpeaker, applySink, videoConstraint, audioConstraint } from "@/lib/mediaPrefs";

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
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCam] = useState(getCamId());
  const [micId, setMic] = useState(getMicId());
  const [spks, setSpks] = useState<MediaDeviceInfo[]>([]);
  const [spkId, setSpk] = useState(getSpkId());
  const [testing, setTesting] = useState(false);
  const toneCtxRef = useRef<AudioContext | null>(null);
  const testElRef = useRef<HTMLAudioElement | null>(null);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    toneCtxRef.current?.close().catch(() => {});
    toneCtxRef.current = null;
    testElRef.current?.pause();
    testElRef.current = null;
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
    const AUDIO = audioConstraint();

    const tryGet = (c: MediaStreamConstraints, ms: number) =>
      Promise.race([
        navigator.mediaDevices.getUserMedia(c),
        new Promise<MediaStream>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ]);

    let stream: MediaStream | null = null;
    try {
      stream = await tryGet({ video: videoConstraint(true), audio: AUDIO }, 12000);
    } catch { /* пробуем проще */ }

    if (!stream) {
      try {
        stream = await tryGet({ video: videoConstraint(false), audio: AUDIO }, 8000);
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

    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setCams(list.filter(d => d.kind === "videoinput"));
      setMics(list.filter(d => d.kind === "audioinput"));
      setSpks(list.filter(d => d.kind === "audiooutput"));
      const vSet = stream.getVideoTracks()[0]?.getSettings().deviceId || "";
      const aSet = stream.getAudioTracks()[0]?.getSettings().deviceId || "";
      if (vSet) setCam(vSet);
      if (aSet) setMic(aSet);
    } catch { /* список недоступен */ }

    setPhase("ready");
  }, [listen]);

  useEffect(() => {
    init();
    return stopAll;
  }, [init, stopAll]);

  const playTest = async () => {
    if (testing) return;
    setTesting(true);
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      toneCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(dest);

      const el = new Audio();
      testElRef.current = el;
      el.srcObject = dest.stream;
      await applySink(el);
      el.play().catch(() => {});

      const notes = [523.25, 659.25, 783.99];
      const now = ctx.currentTime;
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f;
        const g = ctx.createGain();
        const t0 = now + i * 0.26;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.04);
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
        toneCtxRef.current = null;
        setTesting(false);
      }, 1100);
    } catch {
      setTesting(false);
      setNote("Не удалось воспроизвести звук");
    }
  };

  const switchDevice = async (kind: "cam" | "mic" | "spk", id: string) => {
    if (kind === "spk") {
      setSpk(id);
      setSpkId(id);
      return;
    }
    if (kind === "cam") { setCam(id); setCamId(id); }
    else { setMic(id); setMicId(id); }
    stopAll();
    await init();
  };

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
    <div className="w-full h-full min-h-[280px] overflow-y-auto bg-neutral-900 p-3 sm:p-4">
      <div className="min-h-full flex items-center justify-center">
        <div className="w-full max-w-4xl grid lg:grid-cols-[1.35fr_1fr] gap-3 lg:gap-4 items-start">

          <div className="space-y-2">
            <div className="lg:hidden text-center">
              <h3 className="font-montserrat font-bold text-white text-base">Проверьте камеру и звук</h3>
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

              {phase === "ready" && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  <button onClick={toggleMic} disabled={!hasAudio} className={`${pill(micOn && hasAudio)} disabled:opacity-40`}
                    title={micOn ? "Выключить микрофон" : "Включить микрофон"}>
                    <Icon name={micOn && hasAudio ? "Mic" : "MicOff"} size={18} />
                  </button>
                  <button onClick={toggleCam} disabled={!hasVideo} className={`${pill(camOn && hasVideo)} disabled:opacity-40`}
                    title={camOn ? "Выключить камеру" : "Включить камеру"}>
                    <Icon name={camOn && hasVideo ? "Video" : "VideoOff"} size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="hidden lg:block">
              <h3 className="font-montserrat font-bold text-white text-base">Проверьте камеру и звук</h3>
              <p className="text-xs font-ibm text-white/50 mt-0.5">Так вас увидит и услышит собеседник</p>
            </div>

            {phase === "ready" && (
              <>
                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/5">
                  <Icon name={micOn && hasAudio ? "Mic" : "MicOff"} size={15} className="text-white/70 flex-shrink-0" />
                  <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-100 rounded-full"
                      style={{ width: `${micOn && hasAudio ? level : 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-ibm text-white/50 flex-shrink-0">
                    {!hasAudio ? "нет микрофона" : !micOn ? "выключен" : level > 6 ? "слышу вас" : "скажите что-нибудь"}
                  </span>
                </div>

                {note && <p className="text-[11px] font-ibm text-amber-400 px-1">{note}</p>}

                {(cams.length > 1 || mics.length > 1 || (canPickSpeaker() && spks.length > 1)) && (
                  <div className="grid gap-2">
                    {cams.length > 1 && (
                      <DevicePicker
                        icon="Video" value={camId} list={cams} fallback="Камера"
                        onChange={id => switchDevice("cam", id)}
                      />
                    )}
                    {mics.length > 1 && (
                      <DevicePicker
                        icon="Mic" value={micId} list={mics} fallback="Микрофон"
                        onChange={id => switchDevice("mic", id)}
                      />
                    )}
                    {canPickSpeaker() && spks.length > 1 && (
                      <DevicePicker
                        icon="Volume2" value={spkId} list={spks} fallback="Динамик"
                        onChange={id => switchDevice("spk", id)}
                      />
                    )}
                  </div>
                )}

                <button onClick={playTest} disabled={testing}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-montserrat font-medium transition-colors disabled:opacity-60">
                  <Icon name={testing ? "Volume2" : "Play"} size={14} className={testing ? "animate-pulse" : ""} />
                  {testing ? "Слышите сигнал?" : "Проверить звук в наушниках"}
                </button>
              </>
            )}

            <div className="flex gap-2 pt-0.5">
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
      </div>
    </div>
  );
}

function DevicePicker({ icon, value, list, fallback, onChange }: {
  icon: string;
  value: string;
  list: MediaDeviceInfo[];
  fallback: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/5">
      <Icon name={icon} size={15} className="text-white/70 flex-shrink-0" />
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent text-xs font-ibm text-white outline-none cursor-pointer"
      >
        {list.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-800 text-white">
            {d.label || `${fallback} ${i + 1}`}
          </option>
        ))}
      </select>
      <Icon name="ChevronDown" size={14} className="text-white/40 flex-shrink-0" />
    </div>
  );
}
