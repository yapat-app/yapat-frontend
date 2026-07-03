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

export function isPointVisible(
  scores: SampleScores | undefined,
  alFilters: ALFilterState,
  visibilityMode: FilterMode,
  visSliderStyle: "range" | "threshold",
): boolean {
  if (visibilityMode === "single") {
    const visKey = alFilters.visibility.propertyKey;
    if (!visKey) return true;
    const prop = getPropertyByKey(visKey);
    if (!prop) return true;
    const [pMin, pMax] = prop.range ?? [0, 1];
    const [normLo, normHi] = alFilters.visibility.range ?? [0, 1];
    const span = pMax - pMin || 1;
    const domainLo = pMin + normLo * span;
    const domainHi = visSliderStyle === "threshold" ? pMax : pMin + normHi * span;
    const raw = scores?.[visKey as keyof SampleScores] as number | undefined;
    if (raw === undefined || raw === null) {
      const hasConstraint = normLo > 0 || (visSliderStyle !== "threshold" && normHi < 1);
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
      const [pMin, pMax] = prop.range;
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
} {
  const alFilters = useAppSelector((s) => s.al.alFilters);
  const rawPredictions = useAppSelector((s) => {
    const proj = s.al.projectionPredictions;
    return proj.length > 0 ? proj : s.al.predictions;
  });

  const enrichedPlotPoints = useMemo<EnrichedPoint[]>(
    () => rawPredictions.map((p) => ({ snippet_id: p.snippet_id, scores: p.scores })),
    [rawPredictions],
  );

  const filtered = useMemo<FilteredEnrichedPoint[]>(
    () =>
      enrichedPlotPoints.map((p) => ({
        p,
        visible: isPointVisible(p.scores, alFilters, visibilityMode, visSliderStyle),
      })),
    [enrichedPlotPoints, alFilters, visibilityMode, visSliderStyle],
  );

  return { enrichedPlotPoints, filtered, alFilters };
}
