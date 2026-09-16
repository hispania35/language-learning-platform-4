import { useEffect, useState } from "react";

export function useKeyboardOpen(threshold = 140) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => setOpen(window.innerHeight - vv.height > threshold);
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, [threshold]);

  return open;
}

export default useKeyboardOpen;
