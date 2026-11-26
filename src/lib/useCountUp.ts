import { useEffect, useRef, useState } from "react";

/**
 * 数字滚动到目标值。
 * 每次目标变化都从「上一次的目标」出发，所以既能 0→X 的入场滚动，
 * 也能 X→Y 的渐变（比如 C 盘清理后已用空间回落）。
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = target;

    if (!Number.isFinite(target)) {
      setValue(0);
      return;
    }

    const reduce =
      typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === from) {
      setValue(target);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(from + (target - from) * eased);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration]);

  return value;
}
