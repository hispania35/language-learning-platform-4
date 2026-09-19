export interface TimezoneOption {
  id: string;
  label: string;
  offset: string;
}

export const TIMEZONES: TimezoneOption[] = [
  { id: "Europe/Kaliningrad", label: "Калининград", offset: "UTC+2" },
  { id: "Europe/Moscow", label: "Москва, Санкт-Петербург", offset: "UTC+3" },
  { id: "Europe/Samara", label: "Самара, Ижевск", offset: "UTC+4" },
  { id: "Asia/Yekaterinburg", label: "Екатеринбург, Пермь", offset: "UTC+5" },
  { id: "Asia/Omsk", label: "Омск", offset: "UTC+6" },
  { id: "Asia/Krasnoyarsk", label: "Красноярск, Новосибирск", offset: "UTC+7" },
  { id: "Asia/Irkutsk", label: "Иркутск, Улан-Удэ", offset: "UTC+8" },
  { id: "Asia/Yakutsk", label: "Якутск, Чита", offset: "UTC+9" },
  { id: "Asia/Vladivostok", label: "Владивосток, Хабаровск", offset: "UTC+10" },
  { id: "Asia/Magadan", label: "Магадан, Сахалин", offset: "UTC+11" },
  { id: "Asia/Kamchatka", label: "Камчатка, Анадырь", offset: "UTC+12" },
  { id: "Europe/Minsk", label: "Минск", offset: "UTC+3" },
  { id: "Asia/Almaty", label: "Алматы, Астана", offset: "UTC+5" },
  { id: "Asia/Tbilisi", label: "Тбилиси", offset: "UTC+4" },
  { id: "Asia/Yerevan", label: "Ереван", offset: "UTC+4" },
  { id: "Europe/Kyiv", label: "Киев", offset: "UTC+3" },
  { id: "Europe/Madrid", label: "Мадрид, Барселона", offset: "UTC+2" },
  { id: "Europe/Berlin", label: "Берлин, Прага", offset: "UTC+2" },
  { id: "Europe/Lisbon", label: "Лиссабон", offset: "UTC+1" },
  { id: "Europe/London", label: "Лондон", offset: "UTC+1" },
  { id: "Asia/Dubai", label: "Дубай", offset: "UTC+4" },
  { id: "Asia/Bangkok", label: "Бангкок", offset: "UTC+7" },
  { id: "America/Argentina/Buenos_Aires", label: "Буэнос-Айрес", offset: "UTC-3" },
  { id: "America/Mexico_City", label: "Мехико", offset: "UTC-6" },
];

export const DEFAULT_TZ = "Europe/Moscow";

export function tzLabel(id?: string): string {
  const tz = TIMEZONES.find(t => t.id === id);
  return tz ? `${tz.label} · ${tz.offset}` : id || "не указан";
}

export function guessTimezone(): string {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.some(t => t.id === local) ? local : DEFAULT_TZ;
}

export interface LanguageOption {
  id: string;
  label: string;
  flag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { id: "es", label: "Испанский", flag: "🇪🇸" },
  { id: "en", label: "Английский", flag: "🇬🇧" },
  { id: "de", label: "Немецкий", flag: "🇩🇪" },
  { id: "fr", label: "Французский", flag: "🇫🇷" },
  { id: "it", label: "Итальянский", flag: "🇮🇹" },
  { id: "pt", label: "Португальский", flag: "🇵🇹" },
  { id: "zh", label: "Китайский", flag: "🇨🇳" },
];

export function langLabels(ids?: string[]): string {
  if (!ids || ids.length === 0) return "не указан";
  return ids
    .map(id => LANGUAGES.find(l => l.id === id)?.label || id)
    .join(", ");
}

export default TIMEZONES;
