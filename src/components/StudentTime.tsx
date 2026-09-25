import Icon from "@/components/ui/icon";
import { lessonTimeIn, tzDiffLabel, tzTitle, nowIn } from "@/lib/timezone";

interface Props {
  tz?: string;
  myTz: string;
  /** Время урока «14:30» — если задано, показываем его в поясе ученика */
  time?: string;
  date?: string;
}

/** Метка с временем ученика: у него сейчас / во сколько у него будет урок */
export default function StudentTime({ tz, myTz, time, date }: Props) {
  if (!tz) return null;
  const diff = tzDiffLabel(tz, myTz);
  if (!diff) return null;

  const lesson = time ? lessonTimeIn(time, tz, myTz, date) : "";
  const text = lesson || `сейчас ${nowIn(tz)}`;

  return (
    <span title={`${tzTitle(tz)} · ${diff} к вашему времени`}
      className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-700 font-ibm flex-shrink-0 whitespace-nowrap">
      <Icon name="Clock" size={9} />
      {text}
    </span>
  );
}
