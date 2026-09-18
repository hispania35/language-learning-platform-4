import { useState, useRef, useEffect } from "react";
import Icon from "@/components/ui/icon";
import useWebRTC from "@/hooks/useWebRTC";
import DeviceCheck from "@/components/DeviceCheck";
import RoomDevicePanel from "@/components/RoomDevicePanel";
import NetBadge from "@/components/NetBadge";
import RecordButton from "@/components/RecordButton";
import { type Lesson } from "@/lib/api";

const BACKGROUNDS = [
  { name: "Кабинет", url: "https://cdn.poehali.dev/projects/c493c9c0-36da-4678-9f91-8e2c04f4bfe4/files/681530bc-9c65-4d8e-b4e1-ea319efad35d.jpg" },
  { name: "Класс", url: "https://cdn.poehali.dev/projects/c493c9c0-36da-4678-9f91-8e2c04f4bfe4/files/3830d1bd-8336-45e2-b3f7-2adf89542251.jpg" },
  { name: "Севилья", url: "https://cdn.poehali.dev/projects/c493c9c0-36da-4678-9f91-8e2c04f4bfe4/files/d479d3a6-8097-43b6-8929-f4c22efe1a5a.jpg" },
];

interface Props {
  room: string;
  userName: string;
  isTeacher?: boolean;
  lesson?: Lesson;
  onLeave?: () => void;
}

export default function WebRTCRoom({ room, isTeacher = false, lesson, onLeave }: Props) {
  const [joined, setJoined] = useState(false);
  const [startOpts, setStartOpts] = useState<{ micOn: boolean; camOn: boolean }>({ micOn: true, camOn: true });

  const {
    localRef, remoteRef, status, error, net, qualityNote,
    micOn, camOn, sharing, bgMode, bgLoading,
    toggleMic, toggleCam, toggleShare, setBackground, remoteCount,
    switchCamera, switchMic, switchSpeaker, tier, setVideoTier,
    getLocalStream, getRemoteStream,
  } = useWebRTC({ room, enabled: joined, startMuted: !startOpts.micOn, startCamOff: !startOpts.camOn });

  const [bgOpen, setBgOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch { /* не поддерживается */ }
  };

  if (!joined) {
    return (
      <DeviceCheck
        onReady={opts => { setStartOpts(opts); setJoined(true); }}
        onCancel={onLeave}
      />
    );
  }

  const statusText = {
    idle: "Подключаюсь...",
    media: "Включаю камеру и микрофон...",
    connecting: "Устанавливаю связь...",
    waiting: "Жду собеседника",
    connected: "Связь установлена",
    failed: "Ошибка соединения",
  }[status];

  const btn = (active: boolean) =>
    `w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
      active ? "bg-muted hover:bg-muted/70 text-foreground" : "bg-red-600 hover:bg-red-700 text-white"
    }`;

  return (
    <div ref={shellRef} className="w-full h-full min-h-[280px] flex flex-col bg-neutral-900">
      <div className="flex-1 relative min-h-0">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-neutral-900"
        />

        {remoteCount === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center p-6">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
              <Icon name="Radio" size={26} className="text-white" />
            </div>
            <p className="text-sm font-montserrat font-bold text-white">{statusText}</p>
            <p className="text-xs font-ibm text-white/60 max-w-xs">
              {error || "Как только собеседник откроет урок, видео появится здесь"}
            </p>
            {status === "failed" && (
              <button
                onClick={() => window.location.reload()}
                className="mt-2 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-montserrat font-bold transition-colors">
                <Icon name="RefreshCw" size={14} />
                Попробовать снова
              </button>
            )}
          </div>
        )}

        <div className="absolute bottom-3 right-3 w-32 sm:w-44 aspect-video rounded-lg overflow-hidden border-2 border-white/20 shadow-lg bg-neutral-800">
          <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {!camOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-800">
              <Icon name="VideoOff" size={18} className="text-white/60" />
            </div>
          )}
        </div>

        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur">
          <span className={`w-2 h-2 rounded-full ${status === "connected" ? "bg-green-500" : "bg-amber-400"} animate-pulse`} />
          <span className="text-[11px] font-ibm text-white">{statusText}</span>
        </div>

        {status === "connected" && (
          <div className="absolute top-3 right-3">
            <NetBadge net={net} />
          </div>
        )}

        {recording && (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[11px] font-montserrat font-bold text-white">Идёт запись</span>
          </div>
        )}

        {qualityNote && (
          <div key={qualityNote.id}
            className="absolute top-12 right-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur border border-white/10 animate-scale-in max-w-[240px]">
            <Icon
              name={qualityNote.down ? "TrendingDown" : "TrendingUp"}
              size={14}
              className={qualityNote.down ? "text-amber-400 flex-shrink-0" : "text-emerald-400 flex-shrink-0"}
            />
            <span className="text-[11px] font-ibm text-white leading-snug">
              {qualityNote.down
                ? qualityNote.tier === "low"
                  ? "Слабый интернет — качество снижено, чтобы связь не оборвалась"
                  : "Интернет просел — качество видео снижено"
                : qualityNote.tier === "high"
                  ? "Связь восстановилась — вернул высокое качество"
                  : "Связь улучшилась — качество повышено"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 py-3 px-2 bg-neutral-950">
        <button onClick={toggleMic} className={btn(micOn)} title={micOn ? "Выключить микрофон" : "Включить микрофон"}>
          <Icon name={micOn ? "Mic" : "MicOff"} size={18} />
        </button>
        <button onClick={toggleCam} className={btn(camOn)} title={camOn ? "Выключить камеру" : "Включить камеру"}>
          <Icon name={camOn ? "Video" : "VideoOff"} size={18} />
        </button>
        <button
          onClick={toggleShare}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            sharing ? "bg-primary text-white" : "bg-muted hover:bg-muted/70 text-foreground"
          }`}
          title={sharing ? "Остановить показ экрана" : "Показать экран"}
        >
          <Icon name="MonitorUp" size={18} />
        </button>
        <div className="relative">
          <button
            onClick={() => setBgOpen(v => !v)}
            disabled={sharing || bgLoading}
            className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors disabled:opacity-40 ${
              bgMode !== "none" ? "bg-primary text-white" : "bg-muted hover:bg-muted/70 text-foreground"
            }`}
            title="Фон"
          >
            <Icon name={bgLoading ? "Loader" : "Sparkles"} size={18} className={bgLoading ? "animate-spin" : ""} />
          </button>

          {bgOpen && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-52 p-2 rounded-xl bg-card border border-border shadow-xl z-10">
              <p className="text-[11px] font-montserrat font-bold text-foreground px-1 mb-1.5">Фон в кадре</p>
              {[
                { m: "none" as const, label: "Обычный", icon: "User" },
                { m: "blur" as const, label: "Размытие", icon: "Droplets" },
              ].map(o => (
                <button
                  key={o.m}
                  onClick={() => { setBackground(o.m); setBgOpen(false); }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs font-ibm transition-colors ${
                    bgMode === o.m ? "red-accent text-white" : "hover:bg-muted text-foreground"
                  }`}
                >
                  <Icon name={o.icon} size={14} />
                  {o.label}
                </button>
              ))}
              <div className="h-px bg-border my-1.5" />
              <p className="text-[11px] font-montserrat font-bold text-foreground px-1 mb-1.5">Виртуальный фон</p>
              <div className="grid grid-cols-3 gap-1.5">
                {BACKGROUNDS.map(b => (
                  <button
                    key={b.url}
                    onClick={() => { setBackground("image", b.url); setBgOpen(false); }}
                    title={b.name}
                    className="aspect-video rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                  >
                    <img src={b.url} alt={b.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <RecordButton
          getLocalStream={getLocalStream}
          getRemoteStream={getRemoteStream}
          isTeacher={isTeacher}
          onStateChange={setRecording}
          lesson={lesson}
        />

        <RoomDevicePanel
          onCamera={switchCamera}
          onMic={switchMic}
          onSpeaker={switchSpeaker}
          disabledCam={sharing}
          tier={tier}
          onTier={setVideoTier}
        />

        <button
          onClick={toggleFull}
          className="w-11 h-11 rounded-full bg-muted hover:bg-muted/70 text-foreground flex items-center justify-center transition-colors"
          title={isFull ? "Выйти из полного экрана" : "Развернуть на весь экран"}
        >
          <Icon name={isFull ? "Minimize" : "Maximize"} size={18} />
        </button>

        {onLeave && (
          <button onClick={onLeave} className="w-11 h-11 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center transition-colors" title="Выйти">
            <Icon name="PhoneOff" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}