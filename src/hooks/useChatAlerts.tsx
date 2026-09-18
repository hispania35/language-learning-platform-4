import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from "react";
import { apiChatPing, type UnreadMessage } from "@/lib/api";
import { useSettings } from "@/hooks/useSettings";

interface Toast { id: number; name: string; preview: string }

interface ChatAlertsValue {
  unread: number;
  toasts: Toast[];
  soundOn: boolean;
  setSoundOn: (v: boolean) => void;
  inLesson: boolean;
  setInLesson: (v: boolean) => void;
  dismiss: (id: number) => void;
  refresh: () => void;
}

const Ctx = createContext<ChatAlertsValue>({
  unread: 0, toasts: [], soundOn: true, inLesson: false,
  setSoundOn: () => {}, setInLesson: () => {}, dismiss: () => {}, refresh: () => {},
});

export const useChatAlerts = () => useContext(Ctx);

function playBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const now = ctx.currentTime;
    [880, 1180].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.13;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    });
    setTimeout(() => ctx.close(), 800);
  } catch { /* звук недоступен */ }
}

export function ChatAlertsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const { settings, update } = useSettings();
  const soundOn = settings.notify_chat_sound !== false;
  const toastOn = settings.notify_chat_toast !== false;
  const [inLesson, setInLesson] = useState(false);
  const seenRef = useRef<Set<number>>(new Set());
  const firstRef = useRef(true);

  const setSoundOn = (v: boolean) => { update({ notify_chat_sound: v }); };

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const tick = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await apiChatPing();
      setUnread(res.unread || 0);
      const list: UnreadMessage[] = res.messages || [];
      const fresh = list.filter(m => !seenRef.current.has(m.id));
      list.forEach(m => seenRef.current.add(m.id));

      if (firstRef.current) { firstRef.current = false; return; }
      if (!fresh.length) return;

      if (soundOn && !inLesson) playBeep();
      if (!toastOn) return;
      const newToasts = fresh.slice(0, 3).map(m => ({ id: m.id, name: m.from_name, preview: m.preview }));
      setToasts(prev => [...newToasts, ...prev].slice(0, 4));
      newToasts.forEach(t => setTimeout(() => dismiss(t.id), 7000));
    } catch { /* сеть недоступна */ }
  }, [enabled, soundOn, toastOn, inLesson, dismiss]);

  useEffect(() => {
    if (!enabled) return;
    tick();
    const t = setInterval(tick, 20000);
    return () => clearInterval(t);
  }, [enabled, tick]);

  return (
    <Ctx.Provider value={{ unread, toasts, soundOn, setSoundOn, inLesson, setInLesson, dismiss, refresh: tick }}>
      {children}
    </Ctx.Provider>
  );
}