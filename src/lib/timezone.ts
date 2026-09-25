export const DEFAULT_TZ = "Europe/Moscow";

export interface TzOption {
  id: string;
  label: string;
  city: string;
}

/** Полный список часовых поясов по смещению UTC */
export const TIMEZONES: TzOption[] = [
  { id: "Etc/GMT+12", label: "UTC−12:00", city: "Внешние малые о-ва США (Бейкер, Хауленд)" },
  { id: "Pacific/Pago_Pago", label: "UTC−11:00", city: "Американское Самоа, Ниуэ, о-ва Мидуэй" },
  { id: "Pacific/Honolulu", label: "UTC−10:00", city: "Гавайи, Французская Полинезия, о-ва Кука" },
  { id: "Pacific/Marquesas", label: "UTC−09:30", city: "Маркизские о-ва" },
  { id: "America/Anchorage", label: "UTC−09:00", city: "Аляска, о-ва Гамбье" },
  { id: "America/Los_Angeles", label: "UTC−08:00", city: "США (тихоокеанское), Британская Колумбия, Тихуана" },
  { id: "America/Denver", label: "UTC−07:00", city: "США (горное), Альберта, Чиуауа" },
  { id: "America/Chicago", label: "UTC−06:00", city: "США (центральное), Мексика, Гватемала, Коста-Рика" },
  { id: "America/New_York", label: "UTC−05:00", city: "США (восточное), Колумбия, Перу, Эквадор, Куба" },
  { id: "America/Halifax", label: "UTC−04:00", city: "Венесуэла, Боливия, Чили, Канада (атлантическое)" },
  { id: "America/St_Johns", label: "UTC−03:30", city: "Канада (Ньюфаундленд и Лабрадор)" },
  { id: "America/Sao_Paulo", label: "UTC−03:00", city: "Аргентина, Бразилия, Уругвай, Парагвай" },
  { id: "Atlantic/South_Georgia", label: "UTC−02:00", city: "Южная Георгия, Фернанду-ди-Норонья" },
  { id: "Atlantic/Azores", label: "UTC−01:00", city: "Кабо-Верде, Гренландия, Азорские о-ва" },
  { id: "Europe/London", label: "UTC±00:00", city: "Великобритания, Ирландия, Португалия, Исландия, Марокко" },
  { id: "Europe/Berlin", label: "UTC+01:00", city: "Германия, Франция, Испания, Италия, Польша, Алжир" },
  { id: "Europe/Athens", label: "UTC+02:00", city: "Греция, Румыния, Египет, ЮАР, Израиль, Финляндия" },
  { id: "Europe/Moscow", label: "UTC+03:00", city: "Россия (Москва), Турция, Саудовская Аравия, Кения" },
  { id: "Asia/Tehran", label: "UTC+03:30", city: "Иран" },
  { id: "Asia/Dubai", label: "UTC+04:00", city: "ОАЭ, Оман, Азербайджан, Армения, Грузия, Самара" },
  { id: "Asia/Kabul", label: "UTC+04:30", city: "Афганистан" },
  { id: "Asia/Yekaterinburg", label: "UTC+05:00", city: "Пакистан, Узбекистан, Казахстан, Екатеринбург" },
  { id: "Asia/Kolkata", label: "UTC+05:30", city: "Индия, Шри-Ланка" },
  { id: "Asia/Kathmandu", label: "UTC+05:45", city: "Непал" },
  { id: "Asia/Omsk", label: "UTC+06:00", city: "Бангладеш, Бутан, Кыргызстан, Омск" },
  { id: "Asia/Yangon", label: "UTC+06:30", city: "Мьянма, Кокосовые о-ва" },
  { id: "Asia/Krasnoyarsk", label: "UTC+07:00", city: "Таиланд, Вьетнам, Лаос, Камбоджа, Красноярск" },
  { id: "Asia/Irkutsk", label: "UTC+08:00", city: "Китай, Сингапур, Малайзия, Филиппины, Иркутск" },
  { id: "Australia/Eucla", label: "UTC+08:45", city: "Австралия (Юкла)" },
  { id: "Asia/Yakutsk", label: "UTC+09:00", city: "Япония, Корея, Якутск" },
  { id: "Australia/Adelaide", label: "UTC+09:30", city: "Австралия (Южная Австралия, Северная территория)" },
  { id: "Asia/Vladivostok", label: "UTC+10:00", city: "Австралия (Квинсленд), Папуа — Новая Гвинея, Владивосток" },
  { id: "Australia/Lord_Howe", label: "UTC+10:30", city: "Австралия (о-в Лорд-Хау)" },
  { id: "Asia/Srednekolymsk", label: "UTC+11:00", city: "Соломоновы о-ва, Новая Каледония, Сретенск" },
  { id: "Asia/Kamchatka", label: "UTC+12:00", city: "Новая Зеландия, Фиджи, Камчатка, Маршалловы о-ва" },
  { id: "Pacific/Chatham", label: "UTC+12:45", city: "Новая Зеландия (о-ва Чатем)" },
  { id: "Pacific/Tongatapu", label: "UTC+13:00", city: "Тонга, Самоа, Кирибати (о-ва Феникс)" },
  { id: "Pacific/Kiritimati", label: "UTC+14:00", city: "Кирибати (о-ва Лайн)" },
];

/**
 * Часовой пояс браузера. Если точного совпадения в списке нет —
 * берём пояс с тем же смещением от UTC.
 */
export function detectTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONES.some(t => t.id === tz)) return tz;
    const mine = -new Date().getTimezoneOffset();
    const same = TIMEZONES.find(t => tzOffsetMinutes(t.id) === mine);
    return same?.id || tz || DEFAULT_TZ;
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

/** Разница между двумя поясами в часах: насколько «other» впереди «base» */
export function tzDiffBetween(other: string, base: string): number {
  return Math.round((tzOffsetMinutes(other) - tzOffsetMinutes(base)) / 60);
}

/** Подпись разницы: «+7 ч», «−2 ч» или пустая строка, если время совпадает */
export function tzDiffLabel(other: string, base: string): string {
  const d = tzDiffBetween(other, base);
  if (d === 0) return "";
  return d > 0 ? `+${d} ч` : `−${Math.abs(d)} ч`;
}

/**
 * Время урока в другом поясе. На входе «14:30» в поясе base,
 * на выходе «21:30» в поясе other (или «21:30, завтра» при переходе через сутки).
 */
export function lessonTimeIn(time: string, other: string, base: string, date?: string): string {
  const hhmm = (time || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const diff = tzDiffBetween(other, base);
  if (diff === 0) return "";

  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "2026-01-15";
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);

  // Момент урока как «условный UTC», сдвигаем на разницу поясов
  const at = new Date(Date.UTC(y, m - 1, d, h, min));
  const shifted = new Date(at.getTime() + diff * 3600000);

  const t = `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
  const dayShift = shifted.getUTCDate() - at.getUTCDate();
  if (dayShift === 0) return t;
  return dayShift > 0 ? `${t}, след. день` : `${t}, пред. день`;
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