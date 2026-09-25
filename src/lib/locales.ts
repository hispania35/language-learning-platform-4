import { TIMEZONES as TZ_LIST, DEFAULT_TZ as TZ_DEFAULT, detectTz, tzTitle } from "@/lib/timezone";

export interface TimezoneOption {
  id: string;
  label: string;
  offset: string;
}

/** Единый список поясов — источник в @/lib/timezone */
export const TIMEZONES: TimezoneOption[] = TZ_LIST.map(t => ({
  id: t.id, label: t.city, offset: t.label,
}));

export const DEFAULT_TZ = TZ_DEFAULT;

export function tzLabel(id?: string): string {
  if (!id) return "не указан";
  return tzTitle(id);
}

export function guessTimezone(): string {
  return detectTz();
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
