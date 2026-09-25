import { useState, useEffect } from "react";
import { apiGetHomework } from "@/lib/api";

/**
 * Сколько заданий требует внимания.
 * Преподавателю — присланные на проверку, ученику — ещё не сданные.
 */
export function useHomeworkCount(role?: string) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!role) return;
    const isTeacher = role === "teacher" || role === "admin";

    const load = () => {
      apiGetHomework()
        .then(r => {
          const list = r.homework || [];
          setCount(list.filter(h =>
            isTeacher
              ? h.status === "review"
              : h.status === "pending" || h.status === "inprogress"
          ).length);
        })
        .catch(() => {});
    };

    load();
    const t = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("homework-changed", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("homework-changed", onFocus);
    };
  }, [role]);

  return count;
}

export default useHomeworkCount;
