import { useMemo } from "react";
import {
  buildCoordsMap,
  projectionHasValidCoords,
  COMPOSITE_DOMAIN,
  SAMPLE_SCORE_UPPER_EPS,
  DISPLAY_MAX_POINTS,
  ALL_PROJECTION_METHODS,
  SELECTED_COLOR,
  HIDDEN_COLOR,
  UNLABELED_COLOR,
  LABELED_BORDER_COLOR,
  type PlotPoint,
  type ProjectionMethod,
} from "./fpvHelpers";
import { getPropertyByKey } from "../../../constants/alProperties";
import { resolveColor } from "../../../utils/alColors";
import type { FPVPointMetadata, FPVProjection2D } from "../../../types/visualisation";
import type { PAMPrediction, ALFilterState, SampleScores } from "../../../types/al";
import type { VisMode, FilterMode } from "../../../studyPhases";

export interface UseProjectionTracesResult {
  fpvCoordsBySnippet: Record<number, [number, number]> | null;
  fpvCoordsBySnippetForMethod: Partial<Record<ProjectionMethod, Record<number, [number, number]>>> | null;
  selectedCoordByMethod: Partial<Record<ProjectionMethod, [number, number]>> | null;
  plotPoints: PlotPoint[];
  enrichedPlotPoints: PlotPoint[];
  allCategoricalValues: Record<string, string[]>;
  filtered: Array<{ p: PlotPoint; coord: [number, number]; visible: boolean }>;
  visibleCount: number;
  thumbnailPoints: Array<{ p: PlotPoint; coord: [number, number]; visible: boolean }>;
  actualLabelLegend: { shown: string[]; remaining: number; total: number };
  traces: object[];
}

export function useProjectionTraces(opts: {
  fpvPoints: FPVPointMetadata[];
  projectionsByMethod: Partial<Record<ProjectionMethod, FPVProjection2D>>;
  rawOverlayPredictions: PAMPrediction[];
  labelsBySnippet: Record<number, string[]>;
  alFilters: ALFilterState;
  visibilityMode: FilterMode;
  visSliderStyle: "range" | "threshold";
  visMode: VisMode;
  method: ProjectionMethod;
  selectedSnippetIds: number[];
  activeSnippetId: number | null;
  visRangeOverride: { min: number; max: number; step: number } | null;
}): UseProjectionTracesResult {
  const {
    fpvPoints,
    projectionsByMethod,
    rawOverlayPredictions,
    labelsBySnippet,
    alFilters,
    visibilityMode,
    visSliderStyle,
    visMode,
    method,
    selectedSnippetIds,
    activeSnippetId,
    visRangeOverride,
  } = opts;

  const visKey = alFilters.visibility.propertyKey;

  // Subsample used ONLY for the four 120x74px sidebar thumbnails. The main plot
  // renders every point; a thumbnail can't resolve more than a couple thousand,
  // and building 4 full coordinate maps (4 x ~130k) was a large share of the
  // load-time freeze. `displayIndices === null` means "use all points".
  const displayIndices = useMemo<number[] | null>(() => {
    const n = fpvPoints.length;
    if (n <= DISPLAY_MAX_POINTS) return null;
    const stride = Math.ceil(n / DISPLAY_MAX_POINTS);
    const idx: number[] = [];
    for (let i = 0; i < n; i += stride) idx.push(i);
    return idx;
  }, [fpvPoints.length]);

  const fpvCoordsBySnippet = useMemo(() => {
    const proj = projectionsByMethod[method];
    if (!proj || fpvPoints.length === 0) return null;
    return buildCoordsMap(fpvPoints, proj);
  }, [fpvPoints, projectionsByMethod, method]);

  const fpvCoordsBySnippetForMethod = useMemo(() => {
    if (fpvPoints.length === 0) return null;
    const maps: Partial<Record<ProjectionMethod, Record<number, [number, number]>>> = {};
    for (const m of ALL_PROJECTION_METHODS) {
      const proj = projectionsByMethod[m];
      if (!proj || !projectionHasValidCoords(proj) || proj.x.length !== fpvPoints.length) {
        continue;
      }
      const map: Record<number, [number, number]> = {};
      const iter = displayIndices ?? fpvPoints.map((_, i) => i);
      for (const i of iter) {
        const x = proj.x[i];
        const y = proj.y[i];
        if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
        map[fpvPoints[i].snippet_id] = [x as number, y as number];
      }
      maps[m] = map;
    }
    return maps;
  }, [fpvPoints, projectionsByMethod, displayIndices]);

  // The selected snippet may fall outside the thumbnail subsample, so look up its
  // coordinate per method directly (one index lookup), and pass it to each
  // thumbnail so the highlight always shows without rebuilding the base cloud.
  const selectedSnippetId = selectedSnippetIds[0] ?? null;
  const selectedCoordByMethod = useMemo(() => {
    if (selectedSnippetId == null || fpvPoints.length === 0) return null;
    const idx = fpvPoints.findIndex((p) => p.snippet_id === selectedSnippetId);
    if (idx < 0) return null;
    const out: Partial<Record<ProjectionMethod, [number, number]>> = {};
    for (const m of ALL_PROJECTION_METHODS) {
      const proj = projectionsByMethod[m];
      const x = proj?.x[idx];
      const y = proj?.y[idx];
      if (x != null && y != null && Number.isFinite(x) && Number.isFinite(y)) {
        out[m] = [x as number, y as number];
      }
    }
    return out;
  }, [selectedSnippetId, fpvPoints, projectionsByMethod]);

  const scoresBySnippet = useMemo(() => {
    const map = new Map<number, SampleScores>();
    for (const p of rawOverlayPredictions) {
      if (p?.snippet_id != null && p.scores) map.set(p.snippet_id, p.scores);
    }
    return map;
  }, [rawOverlayPredictions]);

  const plotPoints: PlotPoint[] = useMemo(() => {
    if (visMode === "whole_dataset" && fpvPoints.length > 0) {
      return fpvPoints.map((pt) => ({
        snippet_id: pt.snippet_id,
        predicted_label: pt.predicted_labels?.[0] ?? "—",
        scores: scoresBySnippet.get(pt.snippet_id) ?? {
          uncertainty: pt.uncertainty ?? undefined,
          diversity: pt.diversity ?? undefined,
          density: pt.density ?? undefined,
          composite: pt.composite_score ?? undefined,
        },
      }));
    }
    return rawOverlayPredictions as unknown as PlotPoint[];
  }, [visMode, fpvPoints, rawOverlayPredictions, scoresBySnippet]);

  const coords: [number, number][] = useMemo(() => {
    if (!fpvCoordsBySnippet) return plotPoints.map(() => [0, 0] as [number, number]);
    return plotPoints.map(
      (p) => fpvCoordsBySnippet[p.snippet_id] ?? ([0, 0] as [number, number]),
    );
  }, [plotPoints, fpvCoordsBySnippet]);

  const enrichedPlotPoints: PlotPoint[] = useMemo(() => {
    if (Object.keys(labelsBySnippet).length === 0) return plotPoints;
    return plotPoints.map((p) => {
      const lbls = labelsBySnippet[p.snippet_id];
      if (!lbls || lbls.length === 0) return p;
      return { ...p, scores: { ...(p.scores ?? {}), actual_label: lbls[0] } };
    });
  }, [plotPoints, labelsBySnippet]);

  const allCategoricalValues = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const p of enrichedPlotPoints) {
      for (const key of ["sound_type", "birdnet_label", "yamnet_label", "actual_label"] as const) {
        const val = p.scores?.[key];
        if (val) {
          if (!result[key]) result[key] = [];
          result[key].push(val);
        }
      }
    }
    return result;
  }, [enrichedPlotPoints]);

  const visProp = visKey ? getPropertyByKey(visKey) : null;
  const effectiveRange = useMemo<[number, number]>(
    () =>
      visRangeOverride
        ? [visRangeOverride.min, visRangeOverride.max]
        : (visProp?.range ?? [0, 1]),
    [visRangeOverride, visProp],
  );

  const filtered = useMemo(() => {
    return enrichedPlotPoints.map((p, i) => {
      let visible = true;

      if (visibilityMode === "single" && visProp) {
        const [pMin, pMax] = visKey === "composite" ? COMPOSITE_DOMAIN : effectiveRange;
        const [normLo, normHi] = alFilters.visibility.range;
        const span = pMax - pMin;
        const domainLo = pMin + normLo * span;
        const domainHi = visSliderStyle === "threshold" ? pMax : pMin + normHi * span;
        let raw = p.scores?.[visKey as keyof SampleScores] as number | undefined;
        if (visKey === "composite" && typeof raw === "number") {
          raw = Math.min(COMPOSITE_DOMAIN[1], Math.max(COMPOSITE_DOMAIN[0], raw));
        }
        if (raw === undefined || raw === null) visible = false;
        else visible = raw >= domainLo && raw <= domainHi + SAMPLE_SCORE_UPPER_EPS;
      } else if (visibilityMode === "multi") {
        const keys = alFilters.visibility.propertyKeys ?? [];
        const ranges = alFilters.visibility.ranges ?? {};
        for (const key of keys) {
          const prop = getPropertyByKey(key);
          if (!prop || !prop.range) continue;
          const [pMin, pMax] = key === "composite" ? COMPOSITE_DOMAIN : prop.range;
          const [normLo, normHi] = ranges[key] ?? [0, 1];
          const domainLo = pMin + normLo * (pMax - pMin);
          const domainHi = pMin + normHi * (pMax - pMin);
          const raw = p.scores?.[key as keyof SampleScores] as number | undefined;
          if (raw === undefined || raw === null) {
            visible = false;
            break;
          }
          let v = raw;
          if (key === "composite" && typeof v === "number") {
            v = Math.min(COMPOSITE_DOMAIN[1], Math.max(COMPOSITE_DOMAIN[0], v));
          }
          if (v < domainLo || v > domainHi + SAMPLE_SCORE_UPPER_EPS) {
            visible = false;
            break;
          }
        }
      }

      return { p, coord: coords[i], visible };
    });
  }, [
    enrichedPlotPoints,
    coords,
    visProp,
    visKey,
    alFilters.visibility,
    effectiveRange,
    visibilityMode,
    visSliderStyle,
  ]);

  const visibleCount = useMemo(() => filtered.filter((f) => f.visible).length, [filtered]);

  const actualLabelLegend = useMemo(() => {
    const labels = Array.from(
      new Set(
        filtered
          .filter((f) => f.visible)
          .map((f) => (f.p.scores as any)?.actual_label as string | undefined)
          .filter((v): v is string => Boolean(v)),
      ),
    ).sort();
    const MAX_LEGEND_PILLS = 30;
    const shown = labels.slice(0, MAX_LEGEND_PILLS);
    const remaining = Math.max(0, labels.length - shown.length);
    return { shown, remaining, total: labels.length };
  }, [filtered]);

  const thumbnailPoints = useMemo(() => {
    const visible = filtered.filter((f) => f.visible);
    const MAX = 2500;
    if (visible.length <= MAX) return visible;
    const stride = Math.ceil(visible.length / MAX);
    const sampled: typeof visible = [];
    for (let i = 0; i < visible.length; i += stride) sampled.push(visible[i]);
    return sampled;
  }, [filtered]);

  const colorKey: "actual_label" = "actual_label";

  const baseTraces = useMemo(() => {
    if (filtered.length === 0) return [];

    const hidden = filtered.filter((f) => !f.visible);
    const visible = filtered.filter((f) => f.visible);

    const hiddenTrace =
      hidden.length > 0
        ? {
            type: "scattergl" as const,
            mode: "markers" as const,
            name: "",
            showlegend: false,
            x: hidden.map((f) => f.coord[0]),
            y: hidden.map((f) => f.coord[1]),
            customdata: hidden.map((f) => f.p.snippet_id),
            marker: { color: HIDDEN_COLOR, size: 4, opacity: 0.25, line: { width: 0 } },
            hovertemplate: "Snippet #%{customdata} (filtered)<extra></extra>",
            hoverinfo: "skip" as const,
          }
        : null;

    const xs: number[] = [];
    const ys: number[] = [];
    const ids: number[] = [];
    const colors: string[] = [];
    const sizes: number[] = [];
    const lineWidths: number[] = [];
    const lineColors: string[] = [];
    const hoverNames: string[] = [];

    visible.forEach(({ p, coord }) => {
      xs.push(coord[0]);
      ys.push(coord[1]);
      ids.push(p.snippet_id);

      const actual = (p.scores as any)?.actual_label as string | undefined;
      const isLabeled = Boolean(actual);

      sizes.push(isLabeled ? 7 : 6);
      colors.push(
        isLabeled
          ? resolveColor(p.scores ?? {}, colorKey, allCategoricalValues[colorKey] ?? [])
          : UNLABELED_COLOR,
      );
      if (isLabeled) {
        lineWidths.push(1.5);
        lineColors.push("rgba(17,24,39,0.35)");
      } else {
        lineWidths.push(0);
        lineColors.push("rgba(0,0,0,0)");
      }
      hoverNames.push(actual ?? "Unlabeled");
    });

    const visibleTrace = {
      type: "scattergl" as const,
      mode: "markers" as const,
      name: "",
      showlegend: false,
      x: xs,
      y: ys,
      customdata: ids,
      text: hoverNames,
      marker: {
        color: colors,
        size: sizes,
        opacity: 0.9,
        line: { width: lineWidths, color: lineColors },
      },
      hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata}<extra></extra>`,
    };

    return hiddenTrace ? [hiddenTrace, visibleTrace] : [visibleTrace];
  }, [filtered, allCategoricalValues, colorKey]);

  const selectionTraces = useMemo(() => {
    if (selectedSnippetIds.length === 0) return [];

    // Resolve the "active" ID: scroll-synced in multi-select, else the single selection.
    const effectiveActiveId =
      selectedSnippetIds.length > 1
        ? (activeSnippetId ?? selectedSnippetIds[0])
        : selectedSnippetIds[0];

    const activeRingXs: number[] = [];
    const activeRingYs: number[] = [];
    const activeDotXs: number[] = [];
    const activeDotYs: number[] = [];
    const activeDotIds: number[] = [];
    const activeDotLabels: string[] = [];

    const queueRingXs: number[] = [];
    const queueRingYs: number[] = [];
    const queueDotXs: number[] = [];
    const queueDotYs: number[] = [];
    const queueDotIds: number[] = [];
    const queueDotLabels: string[] = [];

    for (const id of selectedSnippetIds) {
      let coord: [number, number] | null = null;
      let label = "Unlabeled";
      const inFiltered = filtered.find((f) => f.p.snippet_id === id);
      if (inFiltered) {
        coord = inFiltered.coord;
        label = (inFiltered.p.scores as any)?.actual_label ?? "Unlabeled";
      } else if (fpvCoordsBySnippet?.[id]) {
        coord = fpvCoordsBySnippet[id];
      }
      if (!coord) continue;

      if (id === effectiveActiveId) {
        activeRingXs.push(coord[0]);
        activeRingYs.push(coord[1]);
        activeDotXs.push(coord[0]);
        activeDotYs.push(coord[1]);
        activeDotIds.push(id);
        activeDotLabels.push(label);
      } else {
        queueRingXs.push(coord[0]);
        queueRingYs.push(coord[1]);
        queueDotXs.push(coord[0]);
        queueDotYs.push(coord[1]);
        queueDotIds.push(id);
        queueDotLabels.push(label);
      }
    }

    const traces: object[] = [];

    // Queued (not currently active): subtle blue ring
    if (queueRingXs.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        hoverinfo: "skip" as const,
        x: queueRingXs,
        y: queueRingYs,
        marker: {
          color: "rgba(0,0,0,0)",
          size: 18,
          opacity: 0.7,
          line: { width: 2, color: "#60a5fa" },
        },
      });
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        x: queueDotXs,
        y: queueDotYs,
        customdata: queueDotIds,
        text: queueDotLabels,
        marker: {
          color: "#93c5fd",
          size: 9,
          opacity: 0.85,
          line: { width: 1.5, color: "#3b82f6" },
        },
        hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata} (queued)<extra></extra>`,
      });
    }

    // Active (currently visible in feed): bright yellow ring
    if (activeRingXs.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        hoverinfo: "skip" as const,
        x: activeRingXs,
        y: activeRingYs,
        marker: {
          color: "rgba(0,0,0,0)",
          size: 22,
          opacity: 1,
          line: { width: 2.5, color: SELECTED_COLOR },
        },
      });
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        x: activeDotXs,
        y: activeDotYs,
        customdata: activeDotIds,
        text: activeDotLabels,
        marker: {
          color: SELECTED_COLOR,
          size: 12,
          opacity: 1,
          line: { width: 2, color: LABELED_BORDER_COLOR },
        },
        hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata}<extra></extra>`,
      });
    }

    return traces;
  }, [selectedSnippetIds, activeSnippetId, filtered, fpvCoordsBySnippet]);

  const traces = useMemo(
    () => [...baseTraces, ...selectionTraces],
    [baseTraces, selectionTraces],
  );

  return {
    fpvCoordsBySnippet,
    fpvCoordsBySnippetForMethod,
    selectedCoordByMethod,
    plotPoints,
    enrichedPlotPoints,
    allCategoricalValues,
    filtered,
    visibleCount,
    thumbnailPoints,
    actualLabelLegend,
    traces,
  };
}
