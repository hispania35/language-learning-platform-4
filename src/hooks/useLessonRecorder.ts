import { useState, useRef, useCallback, useEffect } from "react";

export type RecState = "idle" | "recording" | "saving";

function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export function recorderSupported(): boolean {
  return typeof MediaRecorder !== "undefined" && !!pickMime();
}

interface Options {
  getLocalStream: () => MediaStream | null;
  getRemoteStream: () => MediaStream | null;
}

export function useLessonRecorder({ getLocalStream, getRemoteStream }: Options) {
  const [state, setState] = useState<RecState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const mixRef = useRef<MediaStream | null>(null);
  const doneRef = useRef<((f: File | null) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mixRef.current = null;
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    recRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(() => {
    if (state !== "idle") return;
    const local = getLocalStream();
    const remote = getRemoteStream();
    const mime = pickMime();

    if (!mime) { setError("Браузер не поддерживает запись"); return; }
    if (!local && !remote) { setError("Нет видео для записи"); return; }

    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      for (const s of [local, remote]) {
        if (!s || s.getAudioTracks().length === 0) continue;
        try { ctx.createMediaStreamSource(s).connect(dest); } catch { /* пропускаем */ }
      }

      const videoTrack = remote?.getVideoTracks()[0] || local?.getVideoTracks()[0] || null;

      const mix = new MediaStream();
      if (videoTrack) mix.addTrack(videoTrack);
      dest.stream.getAudioTracks().forEach(t => mix.addTrack(t));
      mixRef.current = mix;

      if (mix.getTracks().length === 0) { setError("Нет данных для записи"); cleanup(); return; }

      chunksRef.current = [];
      const rec = new MediaRecorder(mix, { mimeType: mime, videoBitsPerSecond: 1_200_000 });
      recRef.current = rec;

      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      rec.onstop = () => {
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
        chunksRef.current = [];
        cleanup();
        const stamp = new Date().toLocaleDateString("ru-RU").replace(/\./g, "-");
        const file = blob.size > 0
          ? new File([blob], `Запись урока ${stamp}.${ext}`, { type: blob.type })
          : null;
        doneRef.current?.(file);
        doneRef.current = null;
      };

      rec.start(1000);
      setSeconds(0);
      setError("");
      setState("recording");
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setError("Не удалось начать запись");
      cleanup();
    }
  }, [state, getLocalStream, getRemoteStream, cleanup]);

  const stop = useCallback((): Promise<File | null> => {
    return new Promise(resolve => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") { resolve(null); return; }
      doneRef.current = resolve;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setState("saving");
      try { rec.stop(); } catch { resolve(null); }
    });
  }, []);

  const reset = useCallback(() => { setState("idle"); setSeconds(0); }, []);

  return { state, seconds, error, start, stop, reset, setError };
}

export default useLessonRecorder;
