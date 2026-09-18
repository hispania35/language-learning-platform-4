import { useState, useEffect, useRef, useCallback } from "react";
import { apiRtcPoll, apiRtcSend, apiRtcLeave, apiRtcIce, type RtcPeer } from "@/lib/api";
import { createBackgroundFx, type BgMode, type FxHandle } from "@/lib/backgroundFx";
import { videoConstraint, audioConstraint, applySink, setCamId, setMicId, setSpkId } from "@/lib/mediaPrefs";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    {
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 4,
};

export type RtcStatus = "idle" | "media" | "connecting" | "waiting" | "connected" | "failed";
export type NetQuality = "unknown" | "good" | "ok" | "poor";
export type VideoTier = "high" | "medium" | "low";

export interface QualityNote {
  id: number;
  tier: VideoTier;
  down: boolean;
}

export interface NetInfo {
  quality: NetQuality;
  rtt: number;
  loss: number;
  kbps: number;
  relayed: boolean;
}

interface Options {
  room: string;
  enabled: boolean;
  startMuted?: boolean;
  startCamOff?: boolean;
}

export function useWebRTC({ room, enabled, startMuted = false, startCamOff = false }: Options) {
  const [status, setStatus] = useState<RtcStatus>("idle");
  const [peers, setPeers] = useState<RtcPeer[]>([]);
  const [error, setError] = useState("");
  const [micOn, setMicOn] = useState(!startMuted);
  const [camOn, setCamOn] = useState(!startCamOff);
  const [sharing, setSharing] = useState(false);
  const [bgMode, setBgModeState] = useState<BgMode>("none");
  const [bgLoading, setBgLoading] = useState(false);
  const [net, setNet] = useState<NetInfo>({ quality: "unknown", rtt: 0, loss: 0, kbps: 0, relayed: false });
  const [tier, setTier] = useState<VideoTier>("high");
  const [qualityNote, setQualityNote] = useState<QualityNote | null>(null);

  const localRef = useRef<HTMLVideoElement | null>(null);
  const remoteRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const camTrackRef = useRef<MediaStreamTrack | null>(null);
  const sinceRef = useRef(0);
  const meRef = useRef(0);
  const politeRef = useRef(false);
  const makingOfferRef = useRef(false);
  const stopRef = useRef(false);
  const fxRef = useRef<FxHandle | null>(null);
  const rawTrackRef = useRef<MediaStreamTrack | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteRef = useRef(false);
  const restartsRef = useRef(0);
  const statsRef = useRef({ lost: 0, recv: 0, bytes: 0, at: 0 });
  const iceCfgRef = useRef<RTCConfiguration>(ICE_SERVERS);
  const tierRef = useRef<VideoTier>("high");
  const streakRef = useRef({ bad: 0, good: 0 });
  const autoTierRef = useRef(true);

  const send = useCallback((kind: string, payload: unknown) => {
    apiRtcSend(room, kind, payload).catch(() => {});
  }, [room]);

  const createPeer = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(iceCfgRef.current);
    pcRef.current = pc;

    streamRef.current?.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));

    pc.onicecandidate = e => {
      if (e.candidate) send("ice", e.candidate.toJSON());
    };

    pc.ontrack = e => {
      if (remoteRef.current && e.streams[0]) {
        remoteRef.current.srcObject = e.streams[0];
        applySink(remoteRef.current);
        remoteRef.current.play().catch(() => {});
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        send("sdp", pc.localDescription);
      } catch { /* ok */ } finally {
        makingOfferRef.current = false;
      }
    };

    pc.onconnectionstatechange = async () => {
      const st = pc.connectionState;
      if (st === "connected") {
        restartsRef.current = 0;
        setError("");
        setStatus("connected");
        return;
      }
      if (st === "failed") {
        if (restartsRef.current < 6) {
          restartsRef.current += 1;
          setStatus("connecting");
          setError("");
          try {
            pc.restartIce();
            await pc.setLocalDescription();
            send("sdp", pc.localDescription);
          } catch { /* ok */ }
        } else {
          setStatus("failed");
          setError("Связь не устанавливается. На мобильном интернете попробуйте Wi-Fi или выключите видео");
        }
        return;
      }
      if (st === "disconnected") setStatus("connecting");
    };

    return pc;
  }, [send]);

  const handleSignal = useCallback(async (kind: string, raw: string) => {
    const pc = createPeer();
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return; }

    if (kind === "sdp") {
      const desc = data as RTCSessionDescriptionInit;
      const offerCollision = desc.type === "offer" && (makingOfferRef.current || pc.signalingState !== "stable");
      if (offerCollision && !politeRef.current) return;
      try {
        if (offerCollision) await pc.setLocalDescription({ type: "rollback" } as RTCLocalSessionDescriptionInit);
        await pc.setRemoteDescription(desc);
        hasRemoteRef.current = true;
        const queued = pendingIceRef.current;
        pendingIceRef.current = [];
        for (const c of queued) {
          try { await pc.addIceCandidate(c); } catch { /* ok */ }
        }
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          send("sdp", pc.localDescription);
        }
      } catch { /* ok */ }
    } else if (kind === "ice") {
      const cand = data as RTCIceCandidateInit;
      if (!hasRemoteRef.current) {
        pendingIceRef.current.push(cand);
        return;
      }
      try { await pc.addIceCandidate(cand); } catch { /* ok */ }
    } else if (kind === "bye") {
      if (remoteRef.current) remoteRef.current.srcObject = null;
      hasRemoteRef.current = false;
      pendingIceRef.current = [];
      pcRef.current?.close();
      pcRef.current = null;
      restartsRef.current = 0;
      setError("");
      setStatus("waiting");
    }
  }, [createPeer, send]);

  useEffect(() => {
    if (!enabled || !room) return;
    stopRef.current = false;
    setStatus("media");
    setError("");
    sinceRef.current = 0;

    let timer: ReturnType<typeof setTimeout>;

    const AUDIO_OPTS = audioConstraint();

    const withTimeout = (p: Promise<MediaStream>, ms: number) =>
      Promise.race([
        p,
        new Promise<MediaStream>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
      ]);

    const grabMedia = async (): Promise<MediaStream | null> => {
      try {
        return await withTimeout(navigator.mediaDevices.getUserMedia({
          video: videoConstraint(true),
          audio: AUDIO_OPTS,
        }), 12000);
      } catch { /* камера занята или не отвечает */ }

      try {
        const s = await withTimeout(navigator.mediaDevices.getUserMedia({
          video: videoConstraint(false), audio: AUDIO_OPTS,
        }), 8000);
        setError("Камера работает в упрощённом качестве");
        return s;
      } catch { /* пробуем без видео */ }

      try {
        const s = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: AUDIO_OPTS }), 8000);
        setCamOn(false);
        setError("Камера занята другой программой — включён только звук");
        return s;
      } catch { /* нет доступа вообще */ }

      return null;
    };

    const start = async () => {
      try {
        const ice = await apiRtcIce();
        if (ice.ice_servers?.length) {
          iceCfgRef.current = { iceServers: ice.ice_servers, iceCandidatePoolSize: 4 };
        }
      } catch { /* останутся серверы по умолчанию */ }

      const stream = await grabMedia();
      if (stopRef.current) { stream?.getTracks().forEach(t => t.stop()); return; }

      if (!stream) {
        setError("Не удалось включить камеру и микрофон. Закройте другие программы, использующие камеру, разрешите доступ в браузере и обновите страницу");
        setStatus("failed");
        return;
      }

      const aTrack = stream.getAudioTracks()[0];
      if (aTrack && startMuted) { aTrack.enabled = false; setMicOn(false); }
      const vTrack = stream.getVideoTracks()[0];
      if (vTrack && startCamOff) { vTrack.enabled = false; setCamOn(false); }

      streamRef.current = stream;
      camTrackRef.current = stream.getVideoTracks()[0] || null;
      rawTrackRef.current = camTrackRef.current;
      if (localRef.current) {
        localRef.current.srcObject = stream;
        localRef.current.play().catch(() => {});
      }
      setStatus("waiting");
      loop();
    };

    const loop = async () => {
      if (stopRef.current) return;
      try {
        const res = await apiRtcPoll(room, sinceRef.current);
        if (stopRef.current) return;
        if (res.me) meRef.current = res.me;
        if (res.peers) {
          setPeers(res.peers);
          const others = res.peers.filter(p => p.id !== meRef.current);
          politeRef.current = others.some(p => p.id < meRef.current);

          if (others.length === 0) {
            if (pcRef.current) {
              pcRef.current.close();
              pcRef.current = null;
              hasRemoteRef.current = false;
              pendingIceRef.current = [];
              restartsRef.current = 0;
              if (remoteRef.current) remoteRef.current.srcObject = null;
              setError("");
            }
            setStatus("waiting");
          } else if (!pcRef.current && !politeRef.current) {
            createPeer();
          }
        }
        if (res.last_id) sinceRef.current = res.last_id;
        for (const s of res.signals || []) {
          await handleSignal(s.kind, s.payload);
        }
      } catch { /* ok */ }
      timer = setTimeout(loop, 900);
    };

    start();

    return () => {
      stopRef.current = true;
      clearTimeout(timer);
      apiRtcLeave(room).catch(() => {});
      fxRef.current?.stop();
      fxRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setStatus("idle");
      setPeers([]);
    };
  }, [room, enabled, createPeer, handleSignal, startMuted, startCamOff]);

  const applyTier = useCallback(async (next: VideoTier, auto: boolean) => {
    const prev = tierRef.current;
    if (prev === next) return;
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
    if (!sender) return;

    const LIMITS: Record<VideoTier, { maxBitrate: number; scale: number; fps: number }> = {
      high: { maxBitrate: 1_200_000, scale: 1, fps: 30 },
      medium: { maxBitrate: 500_000, scale: 2, fps: 24 },
      low: { maxBitrate: 180_000, scale: 4, fps: 15 },
    };

    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
      const cfg = LIMITS[next];
      params.encodings[0].maxBitrate = cfg.maxBitrate;
      params.encodings[0].scaleResolutionDownBy = cfg.scale;
      params.encodings[0].maxFramerate = cfg.fps;
      await sender.setParameters(params);
    } catch { return; }

    tierRef.current = next;
    setTier(next);
    if (!auto) autoTierRef.current = false;

    const order: VideoTier[] = ["low", "medium", "high"];
    setQualityNote({ id: Date.now(), tier: next, down: order.indexOf(next) < order.indexOf(prev) });
  }, []);

  useEffect(() => {
    if (!qualityNote) return;
    const t = setTimeout(() => setQualityNote(null), 4000);
    return () => clearTimeout(t);
  }, [qualityNote]);

  useEffect(() => {
    if (!enabled || status !== "connected") {
      if (status !== "connected") setNet(n => (n.quality === "unknown" ? n : { ...n, quality: "unknown" }));
      return;
    }

    const tick = async () => {
      const pc = pcRef.current;
      if (!pc) return;
      let stats: RTCStatsReport;
      try { stats = await pc.getStats(); } catch { return; }

      let rtt = 0;
      let relayed = false;
      let lost = 0;
      let recv = 0;
      let bytes = 0;
      let jitter = 0;

      stats.forEach(r => {
        const rep = r as unknown as Record<string, number | string>;
        if (rep.type === "candidate-pair" && rep.state === "succeeded") {
          if (typeof rep.currentRoundTripTime === "number") rtt = Math.round(rep.currentRoundTripTime * 1000);
        }
        if (rep.type === "local-candidate" && rep.candidateType === "relay") relayed = true;
        if (rep.type === "remote-candidate" && rep.candidateType === "relay") relayed = true;
        if (rep.type === "inbound-rtp" && rep.kind === "video") {
          lost = Number(rep.packetsLost || 0);
          recv = Number(rep.packetsReceived || 0);
          bytes = Number(rep.bytesReceived || 0);
          jitter = Number(rep.jitter || 0) * 1000;
        }
      });

      const prev = statsRef.current;
      const now = Date.now();
      const dLost = Math.max(0, lost - prev.lost);
      const dRecv = Math.max(0, recv - prev.recv);
      const dBytes = Math.max(0, bytes - prev.bytes);
      const dt = prev.at ? (now - prev.at) / 1000 : 0;
      statsRef.current = { lost, recv, bytes, at: now };

      const loss = dRecv + dLost > 0 ? Math.round((dLost / (dRecv + dLost)) * 100) : 0;
      const kbps = dt > 0 ? Math.round((dBytes * 8) / dt / 1000) : 0;

      let quality: NetQuality = "good";
      if (loss > 8 || rtt > 400 || jitter > 60 || (dt > 0 && kbps < 60 && dRecv > 0)) quality = "poor";
      else if (loss > 3 || rtt > 220 || jitter > 30 || (dt > 0 && kbps < 180 && dRecv > 0)) quality = "ok";

      if (!prev.at) quality = "good";
      setNet({ quality, rtt, loss, kbps, relayed });

      if (!autoTierRef.current || !prev.at) return;

      const streak = streakRef.current;
      if (quality === "poor") { streak.bad += 1; streak.good = 0; }
      else if (quality === "good") { streak.good += 1; streak.bad = 0; }
      else { streak.bad = 0; streak.good = 0; }

      const cur = tierRef.current;
      if (streak.bad >= 2) {
        streak.bad = 0;
        if (cur === "high") await applyTier("medium", true);
        else if (cur === "medium") await applyTier("low", true);
      } else if (streak.good >= 4) {
        streak.good = 0;
        if (cur === "low") await applyTier("medium", true);
        else if (cur === "medium") await applyTier("high", true);
      }
    };

    const id = setInterval(tick, 3000);
    tick();
    return () => {
      clearInterval(id);
      statsRef.current = { lost: 0, recv: 0, bytes: 0, at: 0 };
      streakRef.current = { bad: 0, good: 0 };
    };
  }, [enabled, status, applyTier]);

  const toggleMic = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  };

  const toggleCam = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  };

  const replaceVideoTrack = async (track: MediaStreamTrack) => {
    const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(track);
    if (localRef.current && streamRef.current) {
      const old = streamRef.current.getVideoTracks()[0];
      if (old) streamRef.current.removeTrack(old);
      streamRef.current.addTrack(track);
      localRef.current.srcObject = streamRef.current;
    }
  };

  const setBackground = async (mode: BgMode, imageUrl?: string) => {
    if (sharing) return;
    if (mode === "none") {
      if (fxRef.current) {
        fxRef.current.stop();
        fxRef.current = null;
      }
      if (rawTrackRef.current) {
        camTrackRef.current = rawTrackRef.current;
        await replaceVideoTrack(rawTrackRef.current);
      }
      setBgModeState("none");
      return;
    }
    if (fxRef.current) {
      fxRef.current.setMode(mode, imageUrl);
      setBgModeState(mode);
      return;
    }
    if (!rawTrackRef.current) return;
    setBgLoading(true);
    try {
      const fx = await createBackgroundFx(rawTrackRef.current, mode, imageUrl);
      fxRef.current = fx;
      const track = fx.stream.getVideoTracks()[0];
      camTrackRef.current = track;
      await replaceVideoTrack(track);
      setBgModeState(mode);
    } catch {
      setError("Не удалось включить обработку фона");
    } finally {
      setBgLoading(false);
    }
  };

  const switchCamera = async (deviceId: string) => {
    if (sharing) return;
    setCamId(deviceId);
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const track = fresh.getVideoTracks()[0];
      if (!track) return;

      const wasOff = !camOn;
      rawTrackRef.current?.stop();
      rawTrackRef.current = track;

      if (fxRef.current) {
        const mode = bgMode;
        fxRef.current.stop();
        fxRef.current = null;
        setBgModeState("none");
        await replaceVideoTrack(track);
        camTrackRef.current = track;
        if (mode !== "none") await setBackground(mode);
      } else {
        camTrackRef.current = track;
        await replaceVideoTrack(track);
      }
      if (wasOff) { track.enabled = false; }
    } catch {
      setError("Не удалось переключить камеру");
    }
  };

  const switchMic = async (deviceId: string) => {
    setMicId(deviceId);
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = fresh.getAudioTracks()[0];
      if (!track) return;
      track.enabled = micOn;

      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "audio");
      if (sender) await sender.replaceTrack(track);
      if (streamRef.current) {
        const old = streamRef.current.getAudioTracks()[0];
        if (old) { streamRef.current.removeTrack(old); old.stop(); }
        streamRef.current.addTrack(track);
      }
    } catch {
      setError("Не удалось переключить микрофон");
    }
  };

  const switchSpeaker = async (deviceId: string) => {
    setSpkId(deviceId);
    await applySink(remoteRef.current);
  };

  const toggleShare = async () => {
    if (sharing) {
      if (camTrackRef.current) await replaceVideoTrack(camTrackRef.current);
      setSharing(false);
      return;
    }
    try {
      const disp = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = disp.getVideoTracks()[0];
      track.onended = async () => {
        if (camTrackRef.current) await replaceVideoTrack(camTrackRef.current);
        setSharing(false);
      };
      await replaceVideoTrack(track);
      setSharing(true);
    } catch { /* отменено */ }
  };

  return {
    localRef, remoteRef, status, peers, error, net, tier, qualityNote,
    setVideoTier: (t: VideoTier) => applyTier(t, false),
    autoQuality: autoTierRef.current,
    micOn, camOn, sharing, bgMode, bgLoading,
    toggleMic, toggleCam, toggleShare, setBackground,
    switchCamera, switchMic, switchSpeaker,
    getLocalStream: () => streamRef.current,
    getRemoteStream: () => (remoteRef.current?.srcObject as MediaStream | null) || null,
    remoteCount: peers.filter(p => p.id !== meRef.current).length,
  };
}

export default useWebRTC;
