/**
 * useScoreHistogramData — computes enrichedPlotPoints + filtered from Redux state.
 *
 * The ScoreHistogramPanel only needs snippet scores and visibility booleans — it
 * doesn't need x/y projection coordinates. This hook derives that data from the
 * predictions array in Redux, so the sidebar can render the histogram without
 * being inside ProjectionView's data pipeline.
 */

import { useMemo } from "react";
import { useAppSelector } from "../../hooks";
import { getPropertyByKey } from "../../constants/alProperties";
import type { ALFilterState, SampleScores } from "../../types/al";
import type { FilterMode } from "../../studyPhases";

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
  if (visibilityMode === "single") {
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

export interface EnrichedPoint {
  snippet_id: number;
  scores?: SampleScores;
}

export interface FilteredEnrichedPoint {
  p: EnrichedPoint;
  visible: boolean;
}

export function useScoreHistogramData(
  visibilityMode: FilterMode,
  visSliderStyle: "range" | "threshold",
): {
  enrichedPlotPoints: EnrichedPoint[];
  filtered: FilteredEnrichedPoint[];
  alFilters: ALFilterState;
  domains: ScoreDomains;
} {
  const alFilters = useAppSelector((s) => s.al.alFilters);
  // Read the live feed, not `projectionPredictions` — that snapshot is frozen
  // between retrains to keep the projection scatter plot's coordinates
  // stable, but the score histogram has no such requirement and should
  // reflect current scores as soon as a retrain lands new rows.
  const rawPredictions = useAppSelector((s) => s.al.predictions);

  const enrichedPlotPoints = useMemo<EnrichedPoint[]>(
    () =>
      rawPredictions.map((p) => ({
        snippet_id: p.snippet_id,
        scores: p.scores,
      })),
    [rawPredictions],
  );

  const domains = useMemo(
    () => computeScoreDomains(rawPredictions),
    [rawPredictions],
  );

  const filtered = useMemo<FilteredEnrichedPoint[]>(
    () =>
      enrichedPlotPoints.map((p) => ({
        p,
        visible: isPointVisible(
          p.scores,
          alFilters,
          visibilityMode,
          visSliderStyle,
          domains,
        ),
      })),
    [enrichedPlotPoints, alFilters, visibilityMode, visSliderStyle, domains],
  );

  return { enrichedPlotPoints, filtered, alFilters, domains };
}
