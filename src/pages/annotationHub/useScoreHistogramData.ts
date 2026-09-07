/**
 * useScoreHistogramData — computes enrichedPlotPoints + filtered from Redux state.
 *
 * The ScoreHistogramPanel only needs snippet scores and visibility booleans — it
 * doesn't need x/y projection coordinates. This hook derives that data from the
 * predictions array in Redux, so the sidebar can render the histogram without
 * being inside ProjectionView's data pipeline.
 */

import { useDeferredValue, useMemo } from "react";
import { useAppSelector } from "../../hooks";
import { getPropertyByKey } from "../../constants/alProperties";
import { applyPredictedSpeciesScope } from "./predictedSpeciesScope";
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

/** Stable empty scope so the default arg doesn't churn the memo each render. */
const EMPTY_SCOPE: string[] = [];
const EMPTY_LABELS: Record<number, string[]> = {};

export interface ScoreHistogramOptions {
  /** Model-side species scope: narrows the set and rescopes confidence. */
  predictedSpeciesScope?: string[];
  /** Same Status filter the feed applies, so the bars describe the feed's set. */
  annotationStatus?: "any" | "annotated" | "unannotated";
  /** Ground-truth species narrowing (Status = Labeled), mirroring the feed. */
  annotatedSpeciesScope?: string[];
  /** Ground-truth labels, used by the two filters above. */
  labelsBySnippet?: Record<number, string[]>;
}

export function useScoreHistogramData(
  visibilityMode: FilterMode,
  visSliderStyle: "range" | "threshold",
  options: ScoreHistogramOptions = {},
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
  const allPredictions = useAppSelector((s) => s.al.predictions);
  // Narrow + rescope confidence before anything derives domains or visibility,
  // so the histograms, their [min,max] domains and the sliders all describe the
  // same species-scoped population.
  const {
    predictedSpeciesScope: rawPredictedSpeciesScope = EMPTY_SCOPE,
    annotationStatus: rawAnnotationStatus = "any",
    annotatedSpeciesScope: rawAnnotatedSpeciesScope = EMPTY_SCOPE,
    labelsBySnippet = EMPTY_LABELS,
  } = options;

  // Re-deriving these histograms walks the whole prediction set (65k+ rows) and
  // then bins it per property, which is far too slow to run synchronously in the
  // click that flips a filter — it froze the UI for the duration. Deferring the
  // filter inputs lets React paint the click immediately and recompute the bars
  // at lower priority, so the control stays responsive and the histogram catches
  // up a frame or two later.
  const predictedSpeciesScope = useDeferredValue(rawPredictedSpeciesScope);
  const annotationStatus = useDeferredValue(rawAnnotationStatus);
  const annotatedSpeciesScope = useDeferredValue(rawAnnotatedSpeciesScope);

  // Mirror the feed's population filters so "visible in the histogram" implies
  // "visible in the feed". The score sliders themselves are deliberately NOT
  // applied here: `filtered` below marks each point visible/dimmed, so the bars
  // keep showing what lies outside the current selection — otherwise the
  // histogram would collapse onto the selection and could never be widened.
  const rawPredictions = useMemo(() => {
    let rows = applyPredictedSpeciesScope(allPredictions, predictedSpeciesScope);

    if (annotationStatus !== "any") {
      const wantAnnotated = annotationStatus === "annotated";
      rows = rows.filter(
        (p) =>
          ((labelsBySnippet[p.snippet_id]?.length ?? 0) > 0) === wantAnnotated,
      );
    }

    if (annotatedSpeciesScope.length > 0) {
      const speciesSet = new Set(annotatedSpeciesScope);
      rows = rows.filter((p) =>
        (labelsBySnippet[p.snippet_id] ?? []).some((l) => speciesSet.has(l)),
      );
    }

    return rows;
  }, [
    allPredictions,
    predictedSpeciesScope,
    annotationStatus,
    annotatedSpeciesScope,
    labelsBySnippet,
  ]);

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
