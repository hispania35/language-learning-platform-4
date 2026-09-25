import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiGetProfile, apiUpdateProfile } from "@/lib/api";
import { DEFAULT_TZ, detectTz } from "@/lib/timezone";

const KEY = "user_tz";

interface Ctx {
  tz: string;
  loading: boolean;
  setTz: (tz: string) => Promise<void>;
}

const TzCtx = createContext<Ctx>({ tz: DEFAULT_TZ, loading: true, setTz: async () => {} });

export function TimezoneProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [tz, setTzState] = useState<string>(() => localStorage.getItem(KEY) || DEFAULT_TZ);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    apiGetProfile()
      .then(r => {
        const saved = r.profile?.timezone;
        if (saved) {
          setTzState(saved);
          localStorage.setItem(KEY, saved);
        } else {
          // Пояса ещё нет — подставим из браузера и запомним
          const guess = detectTz();
          setTzState(guess);
          localStorage.setItem(KEY, guess);
          apiUpdateProfile({ timezone: guess }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  const setTz = useCallback(async (next: string) => {
    setTzState(next);
    localStorage.setItem(KEY, next);
    await apiUpdateProfile({ timezone: next }).catch(() => {});
  }, []);

  return <TzCtx.Provider value={{ tz, loading, setTz }}>{children}</TzCtx.Provider>;
}

export function useTimezone() {
  return useContext(TzCtx);
}

/** Пояс без контекста — для мест, где нет провайдера */
export function currentTz(): string {
  return localStorage.getItem(KEY) || DEFAULT_TZ;
}
