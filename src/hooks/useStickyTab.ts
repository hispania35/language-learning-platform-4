import { useState, useEffect } from "react";

/**
 * Вкладка, которая переживает обновление страницы.
 * Значение хранится в адресе (?sub=...), чтобы работала и перезагрузка, и ссылка.
 */
export function useStickyTab<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const read = (): T => {
    const v = new URLSearchParams(window.location.search).get(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  };

  const [tab, setTab] = useState<T>(read);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get(key) === tab) return;
    if (tab === fallback) params.delete(key);
    else params.set(key, tab);
    const q = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (q ? `?${q}` : ""));
  }, [tab, key, fallback]);

  useEffect(() => {
    const onPop = () => setTab(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return [tab, setTab] as const;
}

export default useStickyTab;
