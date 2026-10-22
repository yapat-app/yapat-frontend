/**
 * useWorkspaceMotion — the heartbeat behind the home page workspace mockup.
 *
 * One controller and one 1 s beat. Each beat changes something small in one or
 * more panels (playhead, feed, histogram, projection); the CSS transitions in
 * HeroWorkspace.css make every change smooth. The sequence is fixed (no
 * randomness). Illustrative only, not real YAPAT data.
 *
 * It idles when the visitor prefers reduced motion, when the tab is hidden and
 * while the mockup is scrolled off screen.
 */

import { useEffect, type RefObject } from "react";

const BEAT = 1000; // ms, the visual heartbeat
const STATE_BEATS = 5; // beats per annotation state
const STATES = 3;
const ROW = 26; // feed row pitch (SVG units)
const HOT = [7, 11, 3]; // emphasised histogram bar per state
const FOCUS = [
  [316, 118],
  [434, 112],
  [382, 162],
]; // cluster centres
const PZ_CENTER = [384, 134];
const BAR_SEQ = [6, 4, 8, 5, 9, 3, 7, 11, 2, 10, 6, 5];
const BAR_DELTA = [0.08, -0.06, 0.1, -0.05, 0.07, -0.08, 0.06, -0.09, 0.1, -0.06, 0.05, -0.07];
const AUDIO_BEATS = 6; // one playhead pass, ~6 s on screen
const AUDIO_SECS = 3.0; // ...representing a 3 s clip

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const clock = (secs: number) => {
  const t = secs.toFixed(1);
  return "00:" + (t.length < 4 ? "0" : "") + t;
};

export const useWorkspaceMotion = (svgRef: RefObject<SVGSVGElement | null>) => {
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !window.matchMedia) return;

    const feed = svg.querySelector<SVGGElement>(".v-feed");
    const pz = svg.querySelector<SVGGElement>(".v-pz");
    const playhead = svg.querySelector<SVGLineElement>(".v-playhead");
    const timeNow = svg.querySelector<SVGTSpanElement>(".v-time-now");
    const bars = Array.from(svg.querySelectorAll<SVGRectElement>(".hb"));
    const points = Array.from(svg.querySelectorAll<SVGElement>(".v-pz .pt"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let scales = bars.map(() => 1);
    let dimmed: SVGElement[] = [];
    let beat = 0;
    let feedIndex = 0;
    let timer = 0;
    let onScreen = true;

    const setState = (state: number) => {
      svg.setAttribute("data-state", String(state));
      bars.forEach((bar, i) => bar.classList.toggle("hot", i === HOT[state]));
    };

    const renderFeed = () => {
      feed?.style.setProperty("--feed-y", -ROW * feedIndex + "px");
    };

    const distribution = (n: number) => {
      const i = BAR_SEQ[n % BAR_SEQ.length];
      if (!bars[i]) return;
      scales[i] = clamp(scales[i] + BAR_DELTA[n % BAR_DELTA.length], 0.78, 1.22);
      bars[i].style.setProperty("--s", scales[i].toFixed(3));
    };

    // Audio playhead: each beat starts a 1 s linear move to the next slice of
    // the pass; at the end it fades out, jumps back unseen, fades in.
    const audio = (n: number) => {
      if (!playhead) return;
      const k = n % AUDIO_BEATS;
      if (k === 0) {
        svg.classList.add("ph-reset");
        svg.style.setProperty("--ph", "0");
        void playhead.getBoundingClientRect();
        svg.classList.remove("ph-reset", "ph-end");
      }
      const next = (k + 1) / AUDIO_BEATS;
      svg.style.setProperty("--ph", next.toFixed(4));
      if (k === AUDIO_BEATS - 1) svg.classList.add("ph-end");
      if (timeNow) timeNow.textContent = clock(next * AUDIO_SECS);
    };

    const projection = (n: number, state: number) => {
      if (!pz || !points.length) return;
      // Two points gently dim / brighten each beat (fixed sequence).
      const a = points[(n * 7 + 3) % points.length];
      a.classList.add("dim");
      dimmed.push(a);
      if (dimmed.length > 4) dimmed.shift()?.classList.remove("dim");

      // Viewport: 10-beat cycle, scale stays within 0.97 to 1.03.
      const phase = n % 10;
      let s: number | null = null;
      let pan = false;
      if (phase === 0) s = 1;
      else if (phase === 2) s = 0.97;
      else if (phase === 4) { s = 1; pan = true; }
      else if (phase === 6) { s = 1.03; pan = true; }
      else if (phase === 8) s = 1;
      if (s === null) return;
      const f = FOCUS[state];
      const x = pan ? (PZ_CENTER[0] - f[0]) * 0.08 : 0;
      const y = pan ? (PZ_CENTER[1] - f[1]) * 0.08 : 0;
      pz.style.setProperty("--pz-s", String(s));
      pz.style.setProperty("--pz-x", x.toFixed(1) + "px");
      pz.style.setProperty("--pz-y", y.toFixed(1) + "px");
    };

    const tick = () => {
      const state = Math.floor(beat / STATE_BEATS) % STATES;
      if (beat % STATE_BEATS === 0) {
        setState(state);
        if (beat > 0) {
          feedIndex += 1;
          renderFeed();
        }
      }
      distribution(beat);
      audio(beat);
      projection(beat, state);
      beat += 1;
    };

    const stop = () => {
      window.clearInterval(timer);
      timer = 0;
    };

    const start = () => {
      if (timer || reduce.matches || document.hidden || !onScreen) return;
      tick(); // first change happens now
      timer = window.setInterval(tick, BEAT);
    };

    // Back to the first static state (reduced motion).
    const resetStatic = () => {
      stop();
      beat = 0;
      feedIndex = 0;
      setState(0);
      renderFeed();
      scales = bars.map(() => 1);
      bars.forEach((b) => b.style.removeProperty("--s"));
      dimmed.forEach((p) => p.classList.remove("dim"));
      dimmed = [];
      svg.classList.remove("ph-end", "ph-reset");
      svg.style.removeProperty("--ph");
      if (timeNow) timeNow.textContent = "00:01.4";
      if (pz) ["--pz-s", "--pz-x", "--pz-y"].forEach((v) => pz.style.removeProperty(v));
    };

    // After the last duplicated feed row settles, jump back to the first.
    const onFeedTransitionEnd = (e: TransitionEvent) => {
      if (!feed || e.target !== feed || feedIndex < STATES) return;
      feed.style.transition = "none";
      feedIndex = 0;
      renderFeed();
      void feed.getBoundingClientRect();
      feed.style.transition = "";
    };

    const sync = () => {
      if (reduce.matches) resetStatic();
      else if (document.hidden || !onScreen) stop();
      else start();
    };

    feed?.addEventListener("transitionend", onFeedTransitionEnd);
    reduce.addEventListener?.("change", sync);
    document.addEventListener("visibilitychange", sync);

    let observer: IntersectionObserver | undefined;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      });
      observer.observe(svg);
    }

    setState(0);
    sync();

    return () => {
      stop();
      observer?.disconnect();
      feed?.removeEventListener("transitionend", onFeedTransitionEnd);
      reduce.removeEventListener?.("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [svgRef]);
};
