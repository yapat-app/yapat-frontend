/**
 * Color resolution for AL scatter plot.
 *
 * – continuous  → viridis-style gradient (blue → teal → yellow)
 * – stepped     → dedicated palettes (months = 12 colours, hours = 24 hues)
 * – categorical → fixed palette for sound_type; golden-angle HSL for dynamic labels
 */

import type { SampleScores } from "../types/al";
import { getPropertyByKey } from "../constants/alProperties";

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

const _dynamicCache = new Map<string, Map<string, string>>();
// Next unclaimed golden-angle slot per propertyKey. Colors are assigned
// incrementally and never reassigned, so two different call sites passing
// differently-sized/ordered `allValues` snapshots (e.g. the main scatter's
// point coloring vs. the legend builder vs. a per-point tooltip) can never
// collide on the same hue -- each new value simply claims the next slot.
const _dynamicNextIndex = new Map<string, number>();

export function getDynamicCategoricalColor(
  propertyKey: string,
  value: string,
  allValues: string[],
): string {
  if (!_dynamicCache.has(propertyKey)) {
    _dynamicCache.set(propertyKey, new Map());
    _dynamicNextIndex.set(propertyKey, 0);
  }
  const palette = _dynamicCache.get(propertyKey)!;
  if (!palette.has(value)) {
    // First-ever population for this key: seed the full known value set in
    // sorted order so colors read predictably (matches the legend's sort),
    // as long as it's actually known yet. Otherwise fall back to appending
    // just this value at the next free slot.
    const known = palette.size === 0 && allValues.length > 0
      ? [...new Set(allValues)].sort()
      : [value];
    for (const v of known) {
      if (!palette.has(v)) {
        const idx = _dynamicNextIndex.get(propertyKey)!;
        palette.set(v, `hsl(${Math.round((idx * 137.508) % 360)},60%,52%)`);
        _dynamicNextIndex.set(propertyKey, idx + 1);
      }
    }
  }
  return palette.get(value) ?? "#9e9e9e";
}

export function resetDynamicColorCache(): void {
  _dynamicCache.clear();
  _dynamicNextIndex.clear();
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
