import { type ExTemplate, type ExItem } from "@/lib/api";

export interface TemplateInfo {
  id: ExTemplate;
  name: string;
  icon: string;
  desc: string;
  color: string;
  fields: string;
}

export const EX_TEMPLATES: TemplateInfo[] = [
  {
    id: "quiz",
    name: "Викторина",
    icon: "ListChecks",
    desc: "Вопрос и четыре варианта ответа",
    color: "bg-rose-500",
    fields: "Вопрос, правильный ответ и три неверных",
  },
  {
    id: "match",
    name: "Найди пару",
    icon: "Shuffle",
    desc: "Соединить слово с переводом",
    color: "bg-amber-500",
    fields: "Слово и его перевод",
  },
  {
    id: "gaps",
    name: "Пропущенное слово",
    icon: "TextCursorInput",
    desc: "Вставить слово в предложение",
    color: "bg-emerald-600",
    fields: "Предложение с ___ и нужное слово",
  },
  {
    id: "order",
    name: "Собери фразу",
    icon: "ArrowLeftRight",
    desc: "Расставить слова по порядку",
    color: "bg-sky-600",
    fields: "Предложение целиком и перевод",
  },
  {
    id: "truefalse",
    name: "Верно или нет",
    icon: "ToggleLeft",
    desc: "Утверждение правда или ложь",
    color: "bg-violet-600",
    fields: "Утверждение и ответ",
  },
  {
    id: "cards",
    name: "Карточки",
    icon: "Layers",
    desc: "Переворачивать и запоминать",
    color: "bg-teal-600",
    fields: "Слово и перевод",
  },
];

export function getTemplate(id: ExTemplate) {
  return EX_TEMPLATES.find(t => t.id === id) || EX_TEMPLATES[0];
}

export function emptyItem(template: ExTemplate): ExItem {
  switch (template) {
    case "quiz": return { question: "", options: ["", "", "", ""], answer: 0 };
    case "match":
    case "cards": return { left: "", right: "" };
    case "gaps": return { text: "", answer: "" };
    case "order": return { sentence: "", hint: "" };
    case "truefalse": return { statement: "", answer: true };
    default: return {};
  }
}

export function itemPreview(template: ExTemplate, item: ExItem): string {
  switch (template) {
    case "quiz": return item.question || "";
    case "match":
    case "cards": return `${item.left || ""} — ${item.right || ""}`;
    case "gaps": return item.text || "";
    case "order": return item.sentence || "";
    case "truefalse": return item.statement || "";
    default: return "";
  }
}

export function isItemFilled(template: ExTemplate, item: ExItem): boolean {
  switch (template) {
    case "quiz": return !!item.question?.trim() && (item.options || []).filter(o => o.trim()).length >= 2;
    case "match":
    case "cards": return !!item.left?.trim() && !!item.right?.trim();
    case "gaps": return !!item.text?.trim() && !!String(item.answer || "").trim();
    case "order": return (item.sentence || "").trim().split(/\s+/).length >= 2;
    case "truefalse": return !!item.statement?.trim();
    default: return false;
  }
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default EX_TEMPLATES;
