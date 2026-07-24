/**
 * Color resolution for AL scatter plot.
 *
 * – continuous  → viridis-style gradient (blue → teal → yellow)
 * – stepped     → dedicated palettes (months = 12 colours, hours = 24 hues)
 * – categorical → fixed palette for sound_type; OKLCH ring palette for dynamic labels
 */

import type { SampleScores } from "../types/al";
import { getPropertyByKey } from "../constants/alProperties";

// ── OKLCH → sRGB (Björn Ottosson's OKLab, used only in the ↦sRGB direction) ───
// HSL hue alone isn't perceptually uniform — its "green" region spans a wide
// arc, so two hues 30-50° apart can still both read as "green" to the eye.
// OKLCH hue steps are much closer to equal *perceived* steps, and pairing that
// with alternating lightness/chroma rings (below) means two categories that
// land hue-close still differ in brightness/saturation.
function oklchToSrgbHex(L: number, C: number, hueDeg: number): string {
  const hRad = (hueDeg * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const gamma = (c: number) => {
    const clamped = Math.max(0, Math.min(1, c));
    return clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  };
  r = gamma(r);
  g = gamma(g);
  bl = gamma(bl);

  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

// sRGB → OKLab (forward direction), used only to measure perceptual distance
// between two already-generated colors — see pickFurthestRing below.
function srgbToOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const toLin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = toLin(((n >> 16) & 255) / 255);
  const g = toLin(((n >> 8) & 255) / 255);
  const b = toLin((n & 255) / 255);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  ];
}

function oklabDistance(hexA: string, hexB: string): number {
  const [L1, a1, b1] = srgbToOklab(hexA);
  const [L2, a2, b2] = srgbToOklab(hexB);
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// Lightness/chroma rings a dynamic palette can draw from at a given hue.
// Chroma is pushed toward the edge of (and sometimes past, relying on gamut
// clipping) the sRGB gamut per ring, since hues in some regions (yellow/brown)
// have much less gamut headroom than others (blue/purple) at the same chroma.
// Tuned against the data-viz skill's OKLab CVD/normal-vision validator run
// with --pairs all (scatter semantics: any two categories can sit side by
// side) — this combination clears every check except the CVD floor for
// counts up to ~10, which no palette can clear past ~4 categories in that
// mode (confirmed against this app's own reference palette too).
const DYNAMIC_COLOR_RINGS: { L: number; C: number }[] = [
  { L: 0.58, C: 0.16 },
  { L: 0.44, C: 0.22 },
  { L: 0.71, C: 0.13 },
  { L: 0.50, C: 0.18 },
];

// For a hue, pick whichever ring keeps this color furthest (in OKLab) from
// every color already assigned in this palette — plain index-alternation can
// still collide (e.g. two same-hue-family rings landing on adjacent indices),
// so this greedily maximizes the minimum distance instead.
function pickFurthestRingColor(hueDeg: number, alreadyChosen: string[]): string {
  let best: { hex: string; minDist: number } | null = null;
  for (const ring of DYNAMIC_COLOR_RINGS) {
    const hex = oklchToSrgbHex(ring.L, ring.C, hueDeg);
    const minDist = alreadyChosen.length
      ? Math.min(...alreadyChosen.map((c) => oklabDistance(c, hex)))
      : Infinity;
    if (!best || minDist > best.minDist) best = { hex, minDist };
  }
  return best!.hex;
}

// ── Gradient helpers ──────────────────────────────────────────────────────────

/** Viridis-inspired: dark-blue (0) → teal (0.5) → yellow (1) */
export function continuousGradient(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  // R: 0→68→253→253  G: 1→1→231→231  B: 84→84→37→0  (simplified cubic fit)
  const r = Math.round(c < 0.5 ? 68 * (c / 0.5) : 68 + (253 - 68) * ((c - 0.5) / 0.5));
  const g = Math.round(c < 0.5 ? 1 + (138 - 1) * (c / 0.5) : 138 + (231 - 138) * ((c - 0.5) / 0.5));
  const b = Math.round(c < 0.5 ? 84 + (120 - 84) * (c / 0.5) : 120 - 120 * ((c - 0.5) / 0.5));
  return `rgb(${r},${g},${b})`;
}

// ── Discrete palettes ─────────────────────────────────────────────────────────

/** 12 visually distinct colours for the 12 calendar months */
export const MONTH_COLORS: string[] = [
  "#1b9e77", "#d95f02", "#7570b3", "#e7298a",
  "#66a61e", "#e6ab02", "#a6761d", "#80b1d3",
  "#1f78b4", "#33a02c", "#fb9a99", "#cab2d6",
];

/** 24 colours cycling through hue space (15° per hour) */
export const HOUR_COLORS: string[] = Array.from(
  { length: 24 },
  (_, i) => `hsl(${(i * 15) % 360},70%,52%)`,
);

/** Fixed palette for biological sound types */
export const SOUND_TYPE_COLORS: Record<string, string> = {
  Bio:    "#4caf50",
  Anthro: "#f44336",
  Geo:    "#2196f3",
};

// ── Dynamic categorical palette (golden-angle HSL) ────────────────────────────

// Keyed by propertyKey + the exact current value set, not by propertyKey alone —
// a palette is only ever reused for the value set it was built from, so a value
// newly seen in one call can never inherit the color of an unrelated value that
// happened to occupy the same index in some earlier, different-context call.
const _dynamicCache = new Map<string, Map<string, string>>();

function buildPaletteCacheKey(propertyKey: string, sortedValues: string[]): string {
  return `${propertyKey} ${sortedValues.join(" ")}`;
}

export function getDynamicCategoricalColor(
  propertyKey: string,
  value: string,
  allValues: string[],
): string {
  const sorted = [...new Set(allValues)].sort();
  const cacheKey = buildPaletteCacheKey(propertyKey, sorted);
  let palette = _dynamicCache.get(cacheKey);
  if (!palette) {
    palette = new Map<string, string>();
    // Evenly divide the OKLCH hue circle across the exact set of values in
    // this context (rebuilt fresh each time — golden-angle's incremental-growth
    // benefit doesn't apply here). For each hue, greedily pick whichever
    // lightness/chroma ring keeps it furthest from every color already chosen,
    // so hue-close neighbors — unavoidable once there are more than a handful
    // of categories — still differ in brightness/saturation.
    const step = 360 / sorted.length;
    const chosenHexes: string[] = [];
    sorted.forEach((v, i) => {
      const hue = (i * step) % 360;
      const hex = pickFurthestRingColor(hue, chosenHexes);
      chosenHexes.push(hex);
      palette!.set(v, hex);
    });
    _dynamicCache.set(cacheKey, palette);
  }
  return palette.get(value) ?? "#9e9e9e";
}

export function resetDynamicColorCache(): void {
  _dynamicCache.clear();
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export function resolveColor(
  scores: SampleScores,
  propertyKey: string,
  allCategoricalValues: string[] = [],
): string {
  const prop = getPropertyByKey(propertyKey);
  if (!prop) return "#9e9e9e";

  const raw = scores[propertyKey as keyof SampleScores];
  if (raw === undefined || raw === null) return "#cccccc";

  switch (prop.filterMode) {
    case "continuous": {
      const [min, max] = prop.range!;
      return continuousGradient(((raw as number) - min) / (max - min));
    }
    case "stepped": {
      if (propertyKey === "year_cycle") {
        return MONTH_COLORS[Math.max(0, Math.min(11, (raw as number) - 1))];
      }
      if (propertyKey === "day_cycle") {
        return HOUR_COLORS[Math.max(0, Math.min(23, raw as number))];
      }
      // Fallback for future stepped keys
      const [min, max] = prop.range!;
      return continuousGradient(((raw as number) - min) / (max - min));
    }
    case "categorical": {
      const str = raw as string;
      if (propertyKey === "sound_type") return SOUND_TYPE_COLORS[str] ?? "#9e9e9e";
      return getDynamicCategoricalColor(propertyKey, str, allCategoricalValues);
    }
  }
}

// ── Legend builder ────────────────────────────────────────────────────────────

export interface LegendEntry {
  label: string;
  color: string;
}

/** Returns ordered legend entries for the given property */
export function buildLegend(
  propertyKey: string,
  allCategoricalValues?: string[],
): LegendEntry[] {
  const prop = getPropertyByKey(propertyKey);
  if (!prop) return [];

  switch (prop.filterMode) {
    case "continuous": {
      // 5 gradient stops labelled with their domain value
      const [min, max] = prop.range!;
      return Array.from({ length: 5 }, (_, i) => {
        const t = i / 4;
        return { label: (min + t * (max - min)).toFixed(2), color: continuousGradient(t) };
      });
    }
    case "stepped": {
      const labels = prop.stepLabels ?? [];
      if (propertyKey === "year_cycle") {
        return labels.map((l, i) => ({ label: l, color: MONTH_COLORS[i] }));
      }
      if (propertyKey === "day_cycle") {
        return labels.map((l, i) => ({ label: l, color: HOUR_COLORS[i] }));
      }
      return [];
    }
    case "categorical": {
      if (propertyKey === "sound_type") {
        return Object.entries(SOUND_TYPE_COLORS).map(([label, color]) => ({ label, color }));
      }
      const vals = [...new Set(allCategoricalValues ?? [])].sort();
      return vals.map((v) => ({
        label: v,
        color: getDynamicCategoricalColor(propertyKey, v, vals),
      }));
    }
  }
}
