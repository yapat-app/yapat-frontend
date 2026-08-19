/**
 * useSceneClock — a single requestAnimationFrame clock for one explainer scene.
 *
 * Returns elapsed seconds since mount. Only one loop runs per mounted scene,
 * and it stops entirely when `active` is false, so the five sidebar popovers
 * cost nothing while closed.
 *
 * Under `prefers-reduced-motion` the clock does not tick: it parks at
 * `STILL_TIME`, a moment chosen so every scene renders its "high score" beat
 * fully resolved. The explanation is then static but still complete.
 */

import { useEffect, useState } from "react";

/** Length of one full two-beat cycle, in seconds. */
export const CYCLE_SECONDS = 8;

/**
 * Frozen timestamp used when motion is reduced — inside the first beat and past
 * the growth ramp, so lines are fully drawn and the verdict label is visible.
 */
export const STILL_TIME = 3;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useSceneClock(active = true): number {
  const [seconds, setSeconds] = useState(prefersReducedMotion() ? STILL_TIME : 0);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;

    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setSeconds((now - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return seconds;
}

/** Cubic ease-out, clamped to [0, 1]. */
export function easeOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Split the clock into a two-beat cycle: which case is showing, and how far
 * into that beat we are (0 → 1).
 */
export function beat(seconds: number): { index: number; progress: number } {
  const phase = (seconds % CYCLE_SECONDS) / CYCLE_SECONDS;
  const index = phase < 0.5 ? 0 : 1;
  return { index, progress: (phase < 0.5 ? phase : phase - 0.5) * 2 };
}
