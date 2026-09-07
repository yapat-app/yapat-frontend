/** Derives histogram points and visibility from live Redux predictions. */

import { useDeferredValue, useMemo } from "react";
import { useAppSelector } from "../../hooks";
import { getPropertyByKey } from "../../constants/alProperties";
import { applyPredictedSpeciesScope } from "./predictedSpeciesScope";
import type { ALFilterState, SampleScores } from "../../types/al";
import type { FilterMode } from "../../studyPhases";

const SCORE_UPPER_EPS = 1e-9;

/** Score properties whose domains are derived from the current data. */
export const SCORE_DOMAIN_KEYS = [
  "uncertainty",
  "diversity",
  "density",
  "composite",
] as const;

export type ScoreDomains = Record<string, [number, number]>;

/** Computes the actual [min, max] domain for each score property. */
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
        // Unscored points are outside the histogram, so score filters do not
        // hide them when combined with other filters.
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

/** Stable defaults used by the memoized calculations. */
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
  // Histograms use live predictions; projection predictions are a frozen
  // coordinate snapshot.
  const allPredictions = useAppSelector((s) => s.al.predictions);
  // Apply population filters before deriving domains or visibility.
  const {
    predictedSpeciesScope: rawPredictedSpeciesScope = EMPTY_SCOPE,
    annotationStatus: rawAnnotationStatus = "any",
    annotatedSpeciesScope: rawAnnotatedSpeciesScope = EMPTY_SCOPE,
    labelsBySnippet = EMPTY_LABELS,
  } = options;

  // Defer large dataset recalculations so filter controls remain responsive.
  const predictedSpeciesScope = useDeferredValue(rawPredictedSpeciesScope);
  const annotationStatus = useDeferredValue(rawAnnotationStatus);
  const annotatedSpeciesScope = useDeferredValue(rawAnnotatedSpeciesScope);

  // Match the feed's population filters. Score ranges are applied separately
  // below so the histogram still shows values outside the current selection.
  const rawPredictions = useMemo(() => {
    let rows = applyPredictedSpeciesScope(
      allPredictions,
      predictedSpeciesScope,
    );

    if (annotationStatus !== "any") {
      const wantAnnotated = annotationStatus === "annotated";
      rows = rows.filter(
        (p) =>
          (labelsBySnippet[p.snippet_id]?.length ?? 0) > 0 === wantAnnotated,
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
