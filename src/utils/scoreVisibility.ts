/**
 * scoreVisibility — the single source of truth for "does this snippet pass the
 * model-derived score filters".
 *
 * The sliders store *normalised* [0,1] fractions, so every consumer has to map
 * a fraction back onto a real score value before it can compare. Doing that
 * mapping in more than one place is how the projection and the feed drifted
 * apart: the feed scaled by the data's actual [min,max] while the projection
 * scaled by the property's declared range, so the same handle position meant
 * e.g. density >= 0.01 in the feed and density >= 0.50 in the plot — emptying
 * the projection while the feed still held snippets.
 *
 * Everything that filters by score (PredictionFeed, useProjectionTraces,
 * useScoreHistogramData) calls `isPointVisible` with domains from
 * `computeScoreDomains`, so a divergence can't reappear.
 */

import { getPropertyByKey } from "../constants/alProperties";
import type { ALFilterState, SampleScores } from "../types/al";
import type { FilterMode } from "../studyPhases";

const SCORE_UPPER_EPS = 1e-9;

/** Model-derived score properties whose histogram domain follows the data.*/
export const SCORE_DOMAIN_KEYS = [
  "uncertainty",
  "diversity",
  "density",
  "composite",
] as const;

export type ScoreDomains = Record<string, [number, number]>;

/**
 * Actual [min, max] per score property, computed from the live predictions.
 */
export function computeScoreDomains(
  predictions: { scores?: SampleScores }[],
): ScoreDomains {
  const domains: ScoreDomains = {};
  for (const key of SCORE_DOMAIN_KEYS) {
    let min = Infinity;
    let max = -Infinity;
    for (const p of predictions) {
      const v = p.scores?.[key as keyof SampleScores] as number | undefined;
      if (typeof v === "number" && Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (min <= max) domains[key] = [min, max];
  }
  return domains;
}

export function isPointVisible(
  scores: SampleScores | undefined,
  alFilters: ALFilterState,
  visibilityMode: FilterMode,
  visSliderStyle: "range" | "threshold",
  domains?: ScoreDomains,
): boolean {
  // "fixed" applies the same single-property threshold as "single"; the only
  // difference is that its slider isn't rendered for the participant.
  if (visibilityMode === "single" || visibilityMode === "fixed") {
    const visKey = alFilters.visibility.propertyKey;
    if (!visKey) return true;
    const prop = getPropertyByKey(visKey);
    if (!prop) return true;
    const [pMin, pMax] = domains?.[visKey] ?? prop.range ?? [0, 1];
    const [normLo, normHi] = alFilters.visibility.range ?? [0, 1];
    const span = pMax - pMin || 1;
    const domainLo = pMin + normLo * span;
    const domainHi =
      visSliderStyle === "threshold" ? pMax : pMin + normHi * span;
    const raw = scores?.[visKey as keyof SampleScores] as number | undefined;
    if (raw === undefined || raw === null) {
      const hasConstraint =
        normLo > 0 || (visSliderStyle !== "threshold" && normHi < 1);
      return !hasConstraint;
    }
    return raw >= domainLo && raw <= domainHi + SCORE_UPPER_EPS;
  }

  if (visibilityMode === "multi") {
    const keys = alFilters.visibility.propertyKeys ?? [];
    const ranges = alFilters.visibility.ranges ?? {};
    for (const key of keys) {
      const prop = getPropertyByKey(key);
      if (!prop?.range) continue;
      const [pMin, pMax] = domains?.[key] ?? prop.range;
      const [normLo, normHi] = ranges[key] ?? [0, 1];
      const domainLo = pMin + normLo * (pMax - pMin);
      const domainHi = pMin + normHi * (pMax - pMin);
      const raw = scores?.[key as keyof SampleScores] as number | undefined;
      if (raw === undefined || raw === null) {
        // Missing score: the histogram/slider never represents unscored
        // points, so a threshold must not hide them — otherwise combining a
        // slider with e.g. the "Labeled" filter (whose labeled-pool snippets
        // often have no sampler scores) empties the view entirely.
        continue;
      }
      const v = Math.min(pMax, Math.max(pMin, raw));
      if (v < domainLo || v > domainHi + SCORE_UPPER_EPS) return false;
    }
  }

  return true;
}
