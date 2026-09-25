export const DEFAULT_TZ = "Europe/Moscow";

export interface TzOption {
  id: string;
  label: string;
  city: string;
}

/** Часовые пояса России + страны, где живут наши ученики */
export const TIMEZONES: TzOption[] = [
  { id: "Europe/Kaliningrad", label: "MSK−1", city: "Калининград" },
  { id: "Europe/Moscow", label: "MSK", city: "Москва, Санкт-Петербург" },
  { id: "Europe/Samara", label: "MSK+1", city: "Самара, Ижевск" },
  { id: "Asia/Yekaterinburg", label: "MSK+2", city: "Екатеринбург, Пермь" },
  { id: "Asia/Omsk", label: "MSK+3", city: "Омск" },
  { id: "Asia/Krasnoyarsk", label: "MSK+4", city: "Красноярск, Новокузнецк" },
  { id: "Asia/Irkutsk", label: "MSK+5", city: "Иркутск, Улан-Удэ" },
  { id: "Asia/Yakutsk", label: "MSK+6", city: "Якутск, Чита" },
  { id: "Asia/Vladivostok", label: "MSK+7", city: "Владивосток, Хабаровск" },
  { id: "Asia/Magadan", label: "MSK+8", city: "Магадан, Сахалин" },
  { id: "Asia/Kamchatka", label: "MSK+9", city: "Камчатка, Анадырь" },
  { id: "Europe/Minsk", label: "MSK", city: "Минск" },
  { id: "Asia/Almaty", label: "MSK+3", city: "Алматы, Астана" },
  { id: "Asia/Tashkent", label: "MSK+2", city: "Ташкент" },
  { id: "Asia/Tbilisi", label: "MSK+1", city: "Тбилиси" },
  { id: "Asia/Yerevan", label: "MSK+1", city: "Ереван" },
  { id: "Asia/Baku", label: "MSK+1", city: "Баку" },
  { id: "Europe/Kyiv", label: "MSK−1", city: "Киев" },
  { id: "Europe/Chisinau", label: "MSK−1", city: "Кишинёв" },
  { id: "Europe/Riga", label: "MSK−1", city: "Рига, Вильнюс, Таллин" },
  { id: "Europe/Berlin", label: "MSK−2", city: "Берлин, Мадрид, Париж, Рим" },
  { id: "Europe/London", label: "MSK−3", city: "Лондон, Лиссабон" },
  { id: "America/New_York", label: "MSK−8", city: "Нью-Йорк, Майами" },
  { id: "America/Los_Angeles", label: "MSK−11", city: "Лос-Анджелес" },
  { id: "Asia/Dubai", label: "MSK+1", city: "Дубай" },
  { id: "Asia/Bangkok", label: "MSK+4", city: "Бангкок, Пхукет" },
  { id: "Asia/Shanghai", label: "MSK+5", city: "Пекин, Шанхай" },
];

/** Часовой пояс браузера, если он нам знаком */
export function detectTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONES.some(t => t.id === tz)) return tz;
    return tz || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

export function tzTitle(id: string): string {
  const found = TIMEZONES.find(t => t.id === id);
  if (found) return `${found.city} (${found.label})`;
  return id;
}

/** Смещение пояса от UTC в минутах на конкретный момент */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const p: Record<string, string> = {};
    dtf.formatToParts(at).forEach(x => { if (x.type !== "literal") p[x.type] = x.value; });
    const asUtc = Date.UTC(
      Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour === "24" ? "0" : p.hour), Number(p.minute), Number(p.second),
    );
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Разница между поясом пользователя и его же браузером — в часах */
export function tzDiffHours(tz: string): number {
  const browser = -new Date().getTimezoneOffset();
  return Math.round((tzOffsetMinutes(tz) - browser) / 60);
}

/** Текущее время в указанном поясе, для подсказки в настройках */
export function nowIn(tz: string): string {
  try {
    return new Date().toLocaleTimeString("ru-RU", {
      timeZone: tz, hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "";
  }
}
