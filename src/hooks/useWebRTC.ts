import { useState, useEffect, useRef, useCallback } from "react";
import { apiRtcPoll, apiRtcSend, apiRtcLeave, type RtcPeer } from "@/lib/api";
import { createBackgroundFx, type BgMode, type FxHandle } from "@/lib/backgroundFx";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
  ],
};

export type RtcStatus = "idle" | "connecting" | "waiting" | "connected" | "failed";

interface Options {
  room: string;
  enabled: boolean;
}

export function useWebRTC({ room, enabled }: Options) {
  const [status, setStatus] = useState<RtcStatus>("idle");
  const [peers, setPeers] = useState<RtcPeer[]>([]);
  const [error, setError] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [bgMode, setBgModeState] = useState<BgMode>("none");
  const [bgLoading, setBgLoading] = useState(false);

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

  const send = useCallback((kind: string, payload: unknown) => {
    apiRtcSend(room, kind, payload).catch(() => {});
  }, [room]);

  const createPeer = useCallback(() => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    streamRef.current?.getTracks().forEach(t => pc.addTrack(t, streamRef.current!));

    pc.onicecandidate = e => {
      if (e.candidate) send("ice", e.candidate.toJSON());
    };

    pc.ontrack = e => {
      if (remoteRef.current && e.streams[0]) {
        remoteRef.current.srcObject = e.streams[0];
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

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === "connected") setStatus("connected");
      else if (st === "failed") { setStatus("failed"); setError("Не удалось установить прямое соединение"); }
      else if (st === "disconnected") setStatus("waiting");
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
        if (desc.type === "offer") {
          await pc.setLocalDescription();
          send("sdp", pc.localDescription);
        }
      } catch { /* ok */ }
    } else if (kind === "ice") {
      try { await pc.addIceCandidate(data as RTCIceCandidateInit); } catch { /* ok */ }
    } else if (kind === "bye") {
      if (remoteRef.current) remoteRef.current.srcObject = null;
      setStatus("waiting");
    }
  }, [createPeer, send]);

  useEffect(() => {
    if (!enabled || !room) return;
    stopRef.current = false;
    setStatus("connecting");
    setError("");
    sinceRef.current = 0;

    let timer: ReturnType<typeof setTimeout>;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (stopRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        camTrackRef.current = stream.getVideoTracks()[0] || null;
        rawTrackRef.current = camTrackRef.current;
        if (localRef.current) {
          localRef.current.srcObject = stream;
          localRef.current.play().catch(() => {});
        }
        setStatus("waiting");
        loop();
      } catch {
        setError("Нет доступа к камере или микрофону");
        setStatus("failed");
      }
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
          if (others.length > 0 && !pcRef.current) createPeer();
        }
        if (res.last_id) sinceRef.current = res.last_id;
        for (const s of res.signals || []) {
          await handleSignal(s.kind, s.payload);
        }
      } catch { /* ok */ }
      timer = setTimeout(loop, 1200);
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
  }, [room, enabled, createPeer, handleSignal]);

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
    localRef, remoteRef, status, peers, error,
    micOn, camOn, sharing, bgMode, bgLoading,
    toggleMic, toggleCam, toggleShare, setBackground,
    remoteCount: peers.filter(p => p.id !== meRef.current).length,
  };
}

export default useWebRTC;
