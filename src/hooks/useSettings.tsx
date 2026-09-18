import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { apiGetSettings, apiSaveSettings, type AppSettings, type HomeBlockPref } from "@/lib/api";
import { setPlatform, setPlatformLink, type VideoPlatform } from "@/lib/videoPlatform";

export const HOME_BLOCKS: { id: string; label: string; hint: string }[] = [
  { id: "welcome", label: "Приветствие", hint: "Полоса прогресса и обращение по имени" },
  { id: "stats", label: "Показатели", hint: "Четыре карточки со сводкой" },
  { id: "lessons", label: "Ближайшие занятия", hint: "Список предстоящих уроков" },
  { id: "homework", label: "Домашние задания", hint: "Активные задания и сроки" },
  { id: "leaderboard", label: "Рейтинг группы", hint: "Места и баллы учеников" },
  { id: "materials", label: "Новые материалы", hint: "Последние загруженные файлы" },
  { id: "chat", label: "Сообщения", hint: "Непрочитанные из чата" },
];

export const DEFAULT_SETTINGS: AppSettings = {
  home_blocks: HOME_BLOCKS.map(b => ({ id: b.id, on: true })),
  schedule_mode: "assigned",
  video_platform: "jitsi",
  video_link: "",
  notify_chat_sound: true,
  notify_chat_toast: true,
  notify_chat_email: false,
};

function normalizeBlocks(list?: HomeBlockPref[]): HomeBlockPref[] {
  const known = new Set(HOME_BLOCKS.map(b => b.id));
  const seen = new Set<string>();
  const out: HomeBlockPref[] = [];
  for (const b of list || []) {
    if (known.has(b.id) && !seen.has(b.id)) { out.push({ id: b.id, on: b.on !== false }); seen.add(b.id); }
  }
  for (const b of HOME_BLOCKS) {
    if (!seen.has(b.id)) out.push({ id: b.id, on: true });
  }
  return out;
}

interface Ctx {
  settings: AppSettings;
  inherited: string[];
  loading: boolean;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  reload: () => Promise<void>;
}

const SettingsCtx = createContext<Ctx>({
  settings: DEFAULT_SETTINGS,
  inherited: [],
  loading: true,
  update: async () => {},
  reload: async () => {},
});

export function SettingsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [inherited, setInherited] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const applyPlatform = useCallback((s: AppSettings) => {
    const p = s.video_platform as VideoPlatform;
    if (p) {
      setPlatform(p);
      if (s.video_link) setPlatformLink(p, s.video_link);
    }
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    try {
      const res = await apiGetSettings();
      if (res.settings) {
        const merged: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...res.settings,
          home_blocks: normalizeBlocks(res.settings.home_blocks),
        };
        setSettings(merged);
        setInherited(res.inherited || []);
        applyPlatform(merged);
      }
    } catch { /* остаются значения по умолчанию */ }
    setLoading(false);
  }, [enabled, applyPlatform]);

  useEffect(() => { reload(); }, [reload]);

  const update = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      applyPlatform(next);
      return next;
    });
    await apiSaveSettings(patch).catch(() => {});
  }, [applyPlatform]);

  return (
    <SettingsCtx.Provider value={{ settings, inherited, loading, update, reload }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsCtx);
}

export default useSettings;
