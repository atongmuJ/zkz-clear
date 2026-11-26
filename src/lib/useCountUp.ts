import { useEffect, useRef, useState } from "react";

/** 数字从 0 滚动到目标值，用于「已释放 X」这类结果展示 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!Number.isFinite(target) || target <= 0) {
      setValue(target || 0);
      return;
    }

    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(target * eased);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}
