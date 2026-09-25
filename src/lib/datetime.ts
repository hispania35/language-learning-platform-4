import { currentTz } from "@/hooks/useTimezone";

/**
 * Разбор времени с сервера. Если метка зоны отсутствует — считаем это UTC,
 * потому что база хранит всё в UTC.
 */
export function parseServerDate(raw?: string | null): Date | null {
  if (!raw) return null;
  let s = String(raw).trim().replace(" ", "T");
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) s += "Z";
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const opts = (extra: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({
  timeZone: currentTz(), ...extra,
});

/** Только время: 14:35 */
export function fmtTime(raw?: string | null): string {
  const d = parseServerDate(raw);
  if (!d) return "";
  return d.toLocaleTimeString("ru-RU", opts({ hour: "2-digit", minute: "2-digit" }));
}

/** Дата: 25 сентября */
export function fmtDate(raw?: string | null, withYear = false): string {
  const d = parseServerDate(raw);
  if (!d) return "";
  return d.toLocaleDateString("ru-RU", opts({
    day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}),
  }));
}

/** Коротко: 25 сен, 14:35 */
export function fmtDateTime(raw?: string | null): string {
  const d = parseServerDate(raw);
  if (!d) return "";
  return d.toLocaleString("ru-RU", opts({
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }));
}

/** Относительное время: «только что», «5 мин назад», «3 ч назад», дальше — дата */
export function fmtAgo(raw?: string | null): string {
  const d = parseServerDate(raw);
  if (!d) return "";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 0) return fmtTime(raw);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.floor(h / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн назад`;
  return d.toLocaleDateString("ru-RU", opts({ day: "numeric", month: "short" }));
}

/** Ключ дня в поясе пользователя — для группировки сообщений по датам */
export function dayKey(raw?: string | null): string {
  const d = parseServerDate(raw);
  if (!d) return "";
  return d.toLocaleDateString("en-CA", opts({}));
}

/** «Сегодня», «Вчера» или дата — заголовок группы в чате */
export function dayLabel(raw?: string | null): string {
  const key = dayKey(raw);
  if (!key) return "";
  const today = new Date().toLocaleDateString("en-CA", opts({}));
  const yest = new Date(Date.now() - 86400000).toLocaleDateString("en-CA", opts({}));
  if (key === today) return "Сегодня";
  if (key === yest) return "Вчера";
  return fmtDate(raw);
}
