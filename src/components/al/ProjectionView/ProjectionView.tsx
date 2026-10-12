/**
 * ProjectionView — phase-aware 2D feature projection (orchestrator).
 *
 * Data comes from /api/explore: a bounded, grid-stratified set of points per
 * projection method (every point when the dataset is small enough), a
 * filter-dependent visibility/label mask for those points, a density grid
 * covering every snippet when the points are sampled, and full-detail points
 * for the zoomed-in viewport. The browser never receives the whole dataset.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Plot from "react-plotly.js";
import { Spin, Tooltip } from "antd";
import {
  ExperimentOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../../hooks";
import {
  setSelectedSnippet,
  toggleSelectedSnippet,
  setSamplingMethod,
  setVisibilityFilter,
  setVisibilityKeys,
  setVisibilityRangeFor,
  resetVisibilityFilter,
} from "../../../redux/features/alSlice";
import { ScoreHistogramPanel } from "../ScoreHistogramPanel";
import { visualisationsApi } from "../../../services/visualisationsApi";
import { embeddingApi } from "../../../services/api";
import { exploreApi, isAbortError } from "../../../services/exploreApi";
import { usePhaseConfig } from "../../../studyPhases";
import { studyLogger, usePanelDwell } from "../../../studyLogging";
import { resolveColor } from "../../../utils/alColors";
import {
  isProjectionNotReadyMessage,
  HIDDEN_COLOR,
  UNLABELED_COLOR,
  SELECTED_COLOR,
  LABELED_BORDER_COLOR,
  type PlotPoint,
  type ProjectionMethod,
} from "./fpvHelpers";
import { ProjectionToolbar } from "./ProjectionToolbar";
import { ProjectionMethodPanel } from "./ProjectionMethodPanel";
import {
  bitAt,
  type ExploreFilters,
  type ExploreProjectionPoints,
} from "../../../types/explore";
import type { SampleScores } from "../../../types/al";
import { useExploreScope } from "../../../explore/useExploreScope";
import { useExploreSummary } from "../../../explore/useExploreSummary";
import {
  invalidateExplorePoints,
  useExploreProjectionPoints,
  useExploreProjectionState,
  useExploreViewport,
} from "../../../explore/useExploreProjection";

/** Minimal structural type for the Plotly click/hover events we consume. */
type PlotlyPointEvent = {
  points?: Array<{ customdata?: unknown; curveNumber?: number }>;
};

const MODEL_SCORE_FILTER_LOG_DELAY_MS = 1200;
const MODEL_SCORE_FULL_RANGE_EPSILON = 1e-9;
const THUMBNAIL_MAX_POINTS = 2500;
const THUMBNAIL_MAX_EXTRA_VISIBLE = 500;
const MAX_LEGEND_PILLS = 30;
/** Zooming into less than this fraction of the full extent loads full detail. */
const VIEWPORT_DETAIL_AREA_FRACTION = 0.6;
const GENERATE_POLL_MS = 5000;
const GENERATE_MAX_WAIT_MS = 60 * 60 * 1000;

function useModelScoreFilterLogging(
  ranges: Record<string, [number, number]> | undefined,
  visibleCount: number,
  totalCount: number,
): void {
  const initializedRef = useRef(false);
  const lastLoggedRef = useRef<Record<string, [number, number]>>({});
  const timerRef = useRef<number | null>(null);
  const visibleCountRef = useRef(visibleCount);
  const totalCountRef = useRef(totalCount);
  useEffect(() => {
    visibleCountRef.current = visibleCount;
    totalCountRef.current = totalCount;
  }, [visibleCount, totalCount]);

  const rangesKey = JSON.stringify(
    Object.entries(ranges ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  );

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // First render just seeds the baseline — never log the initial state.
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastLoggedRef.current = ranges ?? {};
      return;
    }

    const snapshot = ranges ?? {};

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const prev = lastLoggedRef.current;

      const changed: string[] = [];
      const allKeys = new Set([...Object.keys(prev), ...Object.keys(snapshot)]);
      for (const key of allKeys) {
        const a = prev[key];
        const b = snapshot[key];
        if (!a || !b || a[0] !== b[0] || a[1] !== b[1]) changed.push(key);
      }
      if (changed.length === 0) return;

      lastLoggedRef.current = snapshot;

      const filters: Record<string, { min: number; max: number }> = {};
      for (const [property, [min, max]] of Object.entries(snapshot)) {
        const active =
          min > MODEL_SCORE_FULL_RANGE_EPSILON ||
          max < 1 - MODEL_SCORE_FULL_RANGE_EPSILON;
        if (active) filters[property] = { min, max };
      }

      studyLogger.log("model_score_filter_multi_change", {
        changed: changed.sort(),
        filters,
        activeCount: Object.keys(filters).length,
        visiblePoints: visibleCountRef.current,
        totalPoints: totalCountRef.current,
      });
    }, MODEL_SCORE_FILTER_LOG_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [rangesKey, ranges]);
}

export interface ProjectionThumbnailData {
  thumbnailPoints: Array<{
    p: PlotPoint;
    coord: [number, number];
    visible: boolean;
  }>;
  fpvCoordsBySnippetForMethod: Partial<
    Record<ProjectionMethod, Record<number, [number, number]>>
  > | null;
  selectedSnippetId: number | null;
  selectedCoordByMethod: Partial<
    Record<ProjectionMethod, [number, number]>
  > | null;
  allActualLabels: string[];
  loadingMethods: Set<ProjectionMethod>;
  /**
   * Methods the server reported as unavailable for this dataset (e.g. UMAP/t-SNE
   * over their point caps). PCA is never included. Selectors hide these.
   */
  unavailableMethods: Set<ProjectionMethod>;
  fpvLoading: boolean;
}

interface ProjectionViewProps {
  /** When provided externally, hides the internal method panel and uses this value. */
  projectionMethod?: ProjectionMethod;
  onProjectionMethodChange?: (m: ProjectionMethod) => void;
  /** Called with thumbnail data so a parent can render its own method selector. */
  onThumbnailData?: (data: ProjectionThumbnailData) => void;
  /** Canonical explore filters — points failing them render as hidden (grey). */
  exploreFilters: ExploreFilters;
}

const THUMBNAIL_METHODS: ProjectionMethod[] = ["tsne", "umap", "pca"];

const idIndexCache = new WeakMap<Int32Array, Map<number, number>>();
function idIndex(ids: Int32Array): Map<number, number> {
  let map = idIndexCache.get(ids);
  if (!map) {
    map = new Map();
    for (let i = 0; i < ids.length; i++) map.set(ids[i], i);
    idIndexCache.set(ids, map);
  }
  return map;
}

function coordOf(
  points: ExploreProjectionPoints | null,
  snippetId: number,
): [number, number] | null {
  if (!points) return null;
  const i = idIndex(points.ids).get(snippetId);
  return i === undefined ? null : [points.x[i], points.y[i]];
}

export const ProjectionView: React.FC<ProjectionViewProps> = ({
  projectionMethod: externalMethod,
  onProjectionMethodChange,
  onThumbnailData,
  exploreFilters,
}) => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();

  // Track Shift key state via window listeners — more reliable than reading
  // the modifier from Plotly's event on repeated clicks.
  const isShiftHeld = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") isShiftHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") isShiftHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const {
    predictions,
    projectionPredictions,
    selectedSnippetIds,
    activeSnippetId,
    samplingMethod,
    alFilters,
    lastRetrainJob,
    retrainLoading,
    selectedDatasetId,
    snippetSetId,
    feedbacks,
  } = useAppSelector((state) => state.al);

  const [internalMethod, setInternalMethod] = useState<ProjectionMethod>("pca");
  const requestedMethod = externalMethod ?? internalMethod;
  const setMethod = (m: ProjectionMethod) => {
    setInternalMethod(m);
    onProjectionMethodChange?.(m);
  };

  usePanelDwell("visualization");

  const visMode = phase.visualization.mode;
  const visibilityMode = phase.visualization.visibilityFilter.mode;
  const allowedVisProps =
    phase.visualization.visibilityFilter.allowedProperties;
  const defaultVisKey =
    phase.visualization.visibilityFilter.defaultPropertyKey ?? null;
  const visSliderStyle =
    phase.visualization.visibilityFilter.sliderStyle ?? "range";
  const fixedVisValue = phase.visualization.visibilityFilter.fixedValue ?? 0;
  const showLabeledPool = phase.visualization.showLabeledPool;
  const allowPointClick = phase.visualization.allowPointClick;
  const histogramStyle = phase.ui.histogramStyle ?? "embedded";
  const enabled = visMode !== "hidden";

  const allDimRedMethods: Array<{ key: ProjectionMethod; label: string }> = [
    { key: "tsne", label: "t‑SNE" },
    { key: "umap", label: "UMAP" },
    { key: "pca", label: "PCA" },
  ];

  // ── Phase-change filter reset ──────────────────────────────────────────────

  useEffect(() => {
    const visAllowed = allowedVisProps as readonly string[];
    if (visibilityMode === "disabled") {
      dispatch(setVisibilityFilter({ propertyKey: null, range: [0, 1] }));
      dispatch(setVisibilityKeys([]));
    } else if (visibilityMode === "fixed") {
      dispatch(setVisibilityKeys([]));
      dispatch(
        setVisibilityFilter({
          propertyKey: defaultVisKey,
          range: [fixedVisValue, 1],
        }),
      );
    } else if (visibilityMode === "single") {
      dispatch(setVisibilityKeys([]));
      if (
        alFilters.visibility.propertyKey &&
        !visAllowed.includes(alFilters.visibility.propertyKey)
      ) {
        dispatch(setVisibilityFilter({ propertyKey: null, range: [0, 1] }));
      }
    } else if (visibilityMode === "multi") {
      dispatch(setVisibilityFilter({ propertyKey: null, range: [0, 1] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.id]);

  // ── Server data ────────────────────────────────────────────────────────────

  const { scope, revision } = useExploreScope();
  // Label changes and new inference results re-evaluate masks/labels.
  const labelRefreshKey = useMemo(
    () =>
      `${revision}|` +
      Object.entries(feedbacks)
        .map(
          ([id, fb]) =>
            `${id}:${fb.action}:${(fb.final_labels ?? []).join(",")}`,
        )
        .sort()
        .join("|"),
    [feedbacks, revision],
  );

  const thumbPca = useExploreProjectionPoints(scope, "pca", enabled);
  const thumbUmap = useExploreProjectionPoints(scope, "umap", enabled);
  const thumbTsne = useExploreProjectionPoints(scope, "tsne", enabled);
  const pointsByMethod = useMemo(
    () => ({ pca: thumbPca, umap: thumbUmap, tsne: thumbTsne }),
    [thumbPca, thumbUmap, thumbTsne],
  );
  // UMAP/t-SNE are skipped server-side above their point caps; hide them once the
  // server says so (kept while still loading). PCA is always offered.
  const unavailableMethods = useMemo(() => {
    const set = new Set<ProjectionMethod>();
    if (thumbUmap.points?.available === false) set.add("umap");
    if (thumbTsne.points?.available === false) set.add("tsne");
    return set;
  }, [thumbUmap.points, thumbTsne.points]);
  // A selected method that turns out to be unavailable falls back to PCA.
  const method: ProjectionMethod = unavailableMethods.has(requestedMethod)
    ? "pca"
    : requestedMethod;
  const current = useExploreProjectionPoints(scope, method, enabled);
  const points = current.points;

  const stateQuery = useExploreProjectionState({
    scope,
    filters: exploreFilters,
    method,
    pinnedIds: [],
    enabled: enabled && Boolean(points?.available),
    refreshKey: labelRefreshKey,
  });
  // Only use a mask computed for exactly these points.
  const projState =
    stateQuery.data &&
    points &&
    stateQuery.data.method === method &&
    stateQuery.data.pointCount === points.pointCount &&
    stateQuery.data.versions.projection === points.versions.projection
      ? stateQuery.data
      : null;

  const summary = useExploreSummary(
    scope,
    exploreFilters,
    labelRefreshKey,
    enabled,
  );

  // A stale projection version means projections were regenerated — reload.
  const { reload: reloadPoints } = current;
  useEffect(() => {
    if (
      stateQuery.data?.versions.projection &&
      points?.versions.projection &&
      stateQuery.data.method === method &&
      stateQuery.data.versions.projection !== points.versions.projection
    ) {
      reloadPoints();
    }
  }, [stateQuery.data, points, method, reloadPoints]);

  // ── Zoom / viewport detail ──────────────────────────────────────────────────

  const [axisRange, setAxisRange] = useState<{
    x: [number, number];
    y: [number, number];
  } | null>(null);
  const lastRangeRef = useRef<{
    x: [number, number];
    y: [number, number];
  } | null>(null);
  const [viewBox, setViewBox] = useState<
    [number, number, number, number] | null
  >(null);

  // Different method → different coordinate space; forget the zoom.
  const [viewMethod, setViewMethod] = useState(method);
  if (viewMethod !== method) {
    setViewMethod(method);
    setViewBox(null);
    setAxisRange(null);
  }
  useEffect(() => {
    lastRangeRef.current = null;
  }, [method]);

  const detailBox = useMemo(() => {
    if (!viewBox || !points?.sampled || !points.bounds) return null;
    const [bx0, bx1, by0, by1] = points.bounds;
    const fullArea = Math.max(1e-12, (bx1 - bx0) * (by1 - by0));
    const [vx0, vx1, vy0, vy1] = viewBox;
    const area = Math.abs((vx1 - vx0) * (vy1 - vy0));
    return area / fullArea < VIEWPORT_DETAIL_AREA_FRACTION ? viewBox : null;
  }, [viewBox, points]);

  const viewportQuery = useExploreViewport({
    scope,
    filters: exploreFilters,
    method,
    bbox: detailBox,
    enabled: enabled && detailBox !== null,
    refreshKey: labelRefreshKey,
  });
  const viewport =
    detailBox && viewportQuery.data && viewportQuery.data.method === method
      ? viewportQuery.data
      : null;

  // ── Selection coordinates (may be outside the sample) ───────────────────────

  const [extraCoords, setExtraCoords] = useState<{
    key: string;
    coords: Map<number, [number, number]>;
  }>({ key: "", coords: new Map() });
  const missingSelectionIds = useMemo(() => {
    if (!points?.sampled) return [];
    return selectedSnippetIds.filter((id) => coordOf(points, id) === null);
  }, [points, selectedSnippetIds]);
  const missingKey = `${method}:${missingSelectionIds.join(",")}`;
  useEffect(() => {
    if (!scope || missingSelectionIds.length === 0) return;
    const controller = new AbortController();
    exploreApi
      .projectionCoords(scope, method, missingSelectionIds, {
        signal: controller.signal,
      })
      .then((resp) => {
        const coords = new Map<number, [number, number]>();
        resp.ids.forEach((id, i) => coords.set(id, [resp.x[i], resp.y[i]]));
        setExtraCoords({ key: missingKey, coords });
      })
      .catch((error: unknown) => {
        if (!isAbortError(error))
          console.error("Failed to load selection coordinates", error);
      });
    return () => controller.abort();
    // missingKey captures scope-independent changes of the id list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, method, missingKey]);

  // ── Displayed point set ─────────────────────────────────────────────────────

  const labelVocab = useMemo(
    () => viewport?.labelVocab ?? projState?.labelVocab ?? [],
    [viewport, projState],
  );

  type Display = {
    ids: Int32Array;
    x: Float32Array;
    y: Float32Array;
    visible: (i: number) => boolean;
    label: (i: number) => number;
    count: number;
  };

  const displaySets = useMemo<Display[]>(() => {
    if (viewport) {
      return [
        {
          ids: viewport.ids,
          x: viewport.x,
          y: viewport.y,
          visible: (i) => bitAt(viewport.visible, i),
          label: (i) => viewport.labelIdx[i],
          count: viewport.count,
        },
      ];
    }
    if (!points || !points.available) return [];
    const sets: Display[] = [
      {
        ids: points.ids,
        x: points.x,
        y: points.y,
        visible: projState ? (i) => bitAt(projState.visible, i) : () => true,
        label: projState ? (i) => projState.labelIdx[i] : () => -1,
        count: points.pointCount,
      },
    ];
    if (projState && projState.extras.count > 0) {
      const extras = projState.extras;
      sets.push({
        ids: extras.ids,
        x: extras.x,
        y: extras.y,
        visible: (i) => bitAt(extras.visible, i),
        label: (i) => extras.labelIdx[i],
        count: extras.count,
      });
    }
    return sets;
  }, [viewport, points, projState]);

  const visibleCount = projState?.visiblePoints ?? points?.totalPoints ?? 0;
  const totalCount = projState?.totalPoints ?? points?.totalPoints ?? 0;

  useModelScoreFilterLogging(
    alFilters.visibility.ranges,
    visibleCount,
    totalCount,
  );

  const labelColors = useMemo(
    () =>
      labelVocab.map((label) =>
        resolveColor(
          { actual_label: label } as SampleScores,
          "actual_label",
          labelVocab,
        ),
      ),
    [labelVocab],
  );

  const { baseTraces, visibleLabelIdx, dataBounds } = useMemo(() => {
    const hiddenX: number[] = [];
    const hiddenY: number[] = [];
    const hiddenIds: number[] = [];
    const unlabeledX: number[] = [];
    const unlabeledY: number[] = [];
    const unlabeledIds: number[] = [];
    const labeledX: number[] = [];
    const labeledY: number[] = [];
    const labeledIds: number[] = [];
    const labeledColors: string[] = [];
    const labeledNames: string[] = [];
    const seenLabels = new Set<number>();
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const set of displaySets) {
      for (let i = 0; i < set.count; i++) {
        const x = set.x[i];
        const y = set.y[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
        if (!set.visible(i)) {
          hiddenX.push(x);
          hiddenY.push(y);
          hiddenIds.push(set.ids[i]);
          continue;
        }
        const labelIdx = set.label(i);
        if (labelIdx >= 0 && labelIdx < labelVocab.length) {
          seenLabels.add(labelIdx);
          labeledX.push(x);
          labeledY.push(y);
          labeledIds.push(set.ids[i]);
          labeledColors.push(labelColors[labelIdx]);
          labeledNames.push(labelVocab[labelIdx]);
        } else {
          unlabeledX.push(x);
          unlabeledY.push(y);
          unlabeledIds.push(set.ids[i]);
        }
      }
    }

    const traces: object[] = [];

    // Density of every visible snippet (sampled datasets only): shows where
    // the full filtered population is, including points not drawn.
    const density = !viewport && projState?.density ? projState.density : null;
    if (density) {
      const [bx0, bx1, by0, by1] = density.bounds;
      const cw = (bx1 - bx0) / density.nx || 1;
      const ch = (by1 - by0) / density.ny || 1;
      const xs = Array.from(
        { length: density.nx },
        (_, i) => bx0 + (i + 0.5) * cw,
      );
      const ys = Array.from(
        { length: density.ny },
        (_, j) => by0 + (j + 0.5) * ch,
      );
      const z: (number | null)[][] = [];
      for (let j = 0; j < density.ny; j++) {
        const row: (number | null)[] = new Array(density.nx);
        for (let i = 0; i < density.nx; i++) {
          const v = density.visible[j * density.nx + i];
          row[i] = v > 0 ? Math.log1p(v) : null;
        }
        z.push(row);
      }
      traces.push({
        type: "heatmap" as const,
        x: xs,
        y: ys,
        z,
        showscale: false,
        hoverinfo: "skip" as const,
        colorscale: [
          [0, "rgba(59,130,246,0.06)"],
          [1, "rgba(37,99,235,0.45)"],
        ],
        zsmooth: false,
      });
    }

    if (hiddenX.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        x: hiddenX,
        y: hiddenY,
        customdata: hiddenIds,
        marker: {
          color: HIDDEN_COLOR,
          size: 4,
          opacity: 0.25,
          line: { width: 0 },
        },
        hoverinfo: "skip" as const,
      });
    }
    // Unlabeled first, labeled last: later traces draw on top.
    if (unlabeledX.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        x: unlabeledX,
        y: unlabeledY,
        customdata: unlabeledIds,
        marker: {
          color: UNLABELED_COLOR,
          size: 6,
          opacity: 0.9,
          line: { width: 0, color: "rgba(0,0,0,0)" },
        },
        hovertemplate: "Unlabeled<br>Snippet #%{customdata}<extra></extra>",
      });
    }
    if (labeledX.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        x: labeledX,
        y: labeledY,
        customdata: labeledIds,
        text: labeledNames,
        marker: {
          color: labeledColors,
          size: 7,
          opacity: 0.9,
          line: { width: 1.5, color: "rgba(17,24,39,0.35)" },
        },
        hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata}<extra></extra>`,
      });
    }

    const bounds =
      Number.isFinite(xMin) && Number.isFinite(yMin)
        ? {
            x: [
              xMin - ((xMax - xMin) * 0.05 || 1),
              xMax + ((xMax - xMin) * 0.05 || 1),
            ] as [number, number],
            y: [
              yMin - ((yMax - yMin) * 0.05 || 1),
              yMax + ((yMax - yMin) * 0.05 || 1),
            ] as [number, number],
          }
        : null;
    return {
      baseTraces: traces,
      visibleLabelIdx: seenLabels,
      dataBounds: bounds,
    };
  }, [displaySets, labelVocab, labelColors, projState, viewport]);

  // Visibility / label lookup for a snippet in the displayed data.
  const lookupDisplayed = useCallback(
    (
      snippetId: number,
    ): { coord: [number, number]; visible: boolean; label: number } | null => {
      for (const set of displaySets) {
        const i = idIndex(set.ids).get(snippetId);
        if (i !== undefined) {
          return {
            coord: [set.x[i], set.y[i]],
            visible: set.visible(i),
            label: set.label(i),
          };
        }
      }
      return null;
    },
    [displaySets],
  );

  const selectionTraces = useMemo(() => {
    if (selectedSnippetIds.length === 0) return [];
    const effectiveActiveId =
      selectedSnippetIds.length > 1
        ? (activeSnippetId ?? selectedSnippetIds[0])
        : selectedSnippetIds[0];
    const extras = extraCoords.key === missingKey ? extraCoords.coords : null;

    const active = {
      x: [] as number[],
      y: [] as number[],
      ids: [] as number[],
      labels: [] as string[],
    };
    const queue = {
      x: [] as number[],
      y: [] as number[],
      ids: [] as number[],
      labels: [] as string[],
    };
    for (const id of selectedSnippetIds) {
      const shown = lookupDisplayed(id);
      // Only highlight points that pass the active filters.
      if (shown && !shown.visible) continue;
      const coord = shown?.coord ?? extras?.get(id);
      if (!coord) continue;
      const label =
        shown && shown.label >= 0 && shown.label < labelVocab.length
          ? labelVocab[shown.label]
          : "Unlabeled";
      const target = id === effectiveActiveId ? active : queue;
      target.x.push(coord[0]);
      target.y.push(coord[1]);
      target.ids.push(id);
      target.labels.push(label);
    }

    const traces: object[] = [];
    if (queue.x.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        hoverinfo: "skip" as const,
        x: queue.x,
        y: queue.y,
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
        x: queue.x,
        y: queue.y,
        customdata: queue.ids,
        text: queue.labels,
        marker: {
          color: "#93c5fd",
          size: 9,
          opacity: 0.85,
          line: { width: 1.5, color: "#3b82f6" },
        },
        hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata} (queued)<extra></extra>`,
      });
    }
    if (active.x.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "",
        showlegend: false,
        hoverinfo: "skip" as const,
        x: active.x,
        y: active.y,
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
        x: active.x,
        y: active.y,
        customdata: active.ids,
        text: active.labels,
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
  }, [
    selectedSnippetIds,
    activeSnippetId,
    lookupDisplayed,
    extraCoords,
    missingKey,
    labelVocab,
  ]);

  const traces = useMemo(
    () => [...baseTraces, ...selectionTraces],
    [baseTraces, selectionTraces],
  );
  // Bump datarevision whenever the trace data changes so Plotly re-reads the
  // arrays and repaints the selection overlay.
  const plotRevision = useMemo(() => Date.now() + traces.length, [traces]);

  const actualLabelLegend = useMemo(() => {
    const labels = [...visibleLabelIdx].map((i) => labelVocab[i]).sort();
    const shown = labels.slice(0, MAX_LEGEND_PILLS);
    return {
      shown,
      remaining: Math.max(0, labels.length - shown.length),
      total: labels.length,
    };
  }, [visibleLabelIdx, labelVocab]);

  // ── Thumbnails for the parent's method selector ─────────────────────────────

  const selectedSnippetId = selectedSnippetIds[0] ?? null;

  const thumbnailPoints = useMemo(() => {
    if (!points || !points.available) return [];
    // Every stride-th point gives the overall shape (filtered-out ones are drawn
    // faint), plus every *visible* point up to the cap. Keeping only visible
    // stride points emptied the list under narrow filters (e.g. 2 visible of
    // 65k with stride 27), which turned every thumbnail into "N/A".
    // At most THUMBNAIL_MAX_POINTS + THUMBNAIL_MAX_EXTRA_VISIBLE points.
    const stride = Math.max(
      1,
      Math.ceil(points.pointCount / THUMBNAIL_MAX_POINTS),
    );
    const out: ProjectionThumbnailData["thumbnailPoints"] = [];
    let extraVisible = 0;
    for (let i = 0; i < points.pointCount; i++) {
      const visible = projState ? bitAt(projState.visible, i) : true;
      const onStride = i % stride === 0;
      if (!onStride) {
        if (!visible || extraVisible >= THUMBNAIL_MAX_EXTRA_VISIBLE) continue;
        extraVisible++;
      }
      const labelIdx = projState ? projState.labelIdx[i] : -1;
      out.push({
        p: {
          snippet_id: points.ids[i],
          scores:
            labelIdx >= 0 && labelIdx < labelVocab.length
              ? { actual_label: labelVocab[labelIdx] }
              : undefined,
        },
        coord: [points.x[i], points.y[i]],
        visible,
      });
    }
    return out;
  }, [points, projState, labelVocab]);

  const fpvCoordsBySnippetForMethod = useMemo(() => {
    if (thumbnailPoints.length === 0) return null;
    const maps: Partial<
      Record<ProjectionMethod, Record<number, [number, number]>>
    > = {};
    for (const m of THUMBNAIL_METHODS) {
      const mp = pointsByMethod[m as "pca" | "umap" | "tsne"].points;
      if (!mp || !mp.available) continue;
      const index = idIndex(mp.ids);
      const map: Record<number, [number, number]> = {};
      for (const t of thumbnailPoints) {
        const i = index.get(t.p.snippet_id);
        if (i !== undefined) map[t.p.snippet_id] = [mp.x[i], mp.y[i]];
      }
      maps[m] = map;
    }
    return maps;
  }, [thumbnailPoints, pointsByMethod]);

  const selectedCoordByMethod = useMemo(() => {
    if (selectedSnippetId === null) return null;
    const out: Partial<Record<ProjectionMethod, [number, number]>> = {};
    for (const m of THUMBNAIL_METHODS) {
      const coord = coordOf(
        pointsByMethod[m as "pca" | "umap" | "tsne"].points,
        selectedSnippetId,
      );
      if (coord) out[m] = coord;
    }
    return out;
  }, [selectedSnippetId, pointsByMethod]);

  const loadingMethods = useMemo(() => {
    const set = new Set<ProjectionMethod>();
    for (const m of THUMBNAIL_METHODS) {
      if (pointsByMethod[m as "pca" | "umap" | "tsne"].loading) set.add(m);
    }
    return set;
  }, [pointsByMethod]);

  useEffect(() => {
    if (!onThumbnailData) return;
    onThumbnailData({
      thumbnailPoints,
      fpvCoordsBySnippetForMethod,
      selectedSnippetId,
      selectedCoordByMethod,
      allActualLabels: labelVocab,
      loadingMethods,
      unavailableMethods,
      fpvLoading: current.loading,
    });
  }, [
    onThumbnailData,
    thumbnailPoints,
    fpvCoordsBySnippetForMethod,
    selectedSnippetId,
    selectedCoordByMethod,
    labelVocab,
    loadingMethods,
    unavailableMethods,
    current.loading,
  ]);

  // ── Auto-select a point (single_card_on_select phases) ─────────────────────

  const [didAutoSelectKey, setDidAutoSelectKey] = useState<string | null>(null);
  useEffect(() => {
    if (phase.feed.mode !== "single_card_on_select") return;
    if (selectedSnippetIds.length > 0) return;
    if (!points || points.pointCount === 0) return;
    const key = `${phase.id}:${selectedDatasetId ?? "na"}:${snippetSetId ?? "na"}:${method}`;
    if (didAutoSelectKey === key) return;
    const idx = Math.floor(Math.random() * points.pointCount);
    dispatch(setSelectedSnippet(points.ids[idx]));
    setDidAutoSelectKey(key);
  }, [
    phase.id,
    phase.feed.mode,
    selectedDatasetId,
    snippetSetId,
    method,
    points,
    selectedSnippetIds,
    dispatch,
    didAutoSelectKey,
  ]);

  // ── Generate projections ────────────────────────────────────────────────────

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const generateCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => generateCancelRef.current?.(), []);

  const handleGenerateNow = async () => {
    if (!selectedDatasetId || !scope) return;
    generateCancelRef.current?.();
    let cancelled = false;
    generateCancelRef.current = () => {
      cancelled = true;
    };
    setGenerating(true);
    setGenerateError(null);
    try {
      const sets = await embeddingApi.allSnippetSets(selectedDatasetId);
      const embeddingModelId = sets.find(
        (s) => s.id === scope.snippet_set_id,
      )?.embedding_model_id;
      if (!embeddingModelId)
        throw new Error(
          "Could not resolve the embedding model for this snippet set.",
        );
      await visualisationsApi.generateFPVDataset({
        dataset_id: selectedDatasetId,
        embedding_model_id: embeddingModelId,
        run_3d: false,
      });
      // Generation runs on a worker: poll until the projection is served.
      const started = Date.now();
      for (;;) {
        await new Promise((r) => window.setTimeout(r, GENERATE_POLL_MS));
        if (cancelled) return;
        invalidateExplorePoints(scope);
        try {
          await exploreApi.projection({ ...scope, checkpoint_id: null }, "pca");
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (!isProjectionNotReadyMessage(message)) throw error;
          if (Date.now() - started > GENERATE_MAX_WAIT_MS) throw error;
        }
      }
      if (cancelled) return;
      invalidateExplorePoints(scope);
      reloadPoints();
    } catch (error) {
      if (!cancelled) {
        setGenerateError(
          error instanceof Error
            ? error.message
            : "Failed to generate projection.",
        );
      }
    } finally {
      if (!cancelled) setGenerating(false);
    }
  };

  // ── Derived booleans ───────────────────────────────────────────────────────

  const fpvError = generateError ?? current.error?.message ?? null;
  const isMissingProjection = isProjectionNotReadyMessage(fpvError ?? "");
  const canGenerateNow = Boolean(selectedDatasetId && scope);
  const isWaitingForRetrain =
    predictions.length > 0 && projectionPredictions.length === 0;
  const unavailableReason = points && !points.available ? points.reason : null;
  const isFpvPlotLoading =
    enabled &&
    scope !== null &&
    !fpvError &&
    (generating ||
      current.loading ||
      (points?.available === true && !projState && stateQuery.loading));
  const showStandaloneHistogram =
    visibilityMode !== "disabled" && histogramStyle === "standalone";

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (visMode === "hidden") return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const handlePlotClick = (event: PlotlyPointEvent) => {
    if (!allowPointClick) return;
    const pt = event.points?.[0];
    if (pt?.customdata === undefined) return;
    const snippetId = pt.customdata as number;
    const shown = lookupDisplayed(snippetId);
    if (shown && !shown.visible) return;
    studyLogger.log(
      "vis_point_click",
      { snippetId, shiftHeld: isShiftHeld.current, projectionMethod: method },
      { snippetId },
    );
    if (isShiftHeld.current && phase.feed.mode === "single_card_on_select") {
      dispatch(toggleSelectedSnippet(snippetId));
    } else {
      dispatch(setSelectedSnippet(snippetId));
    }
  };

  const handlePlotHover = (event: PlotlyPointEvent) => {
    const pt = event.points?.[0];
    if (pt?.customdata === undefined) return;
    const snippetId = pt.customdata as number;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      studyLogger.log(
        "vis_point_hover",
        { snippetId, projectionMethod: method },
        { snippetId, durationMs: 2000 },
      );
    }, 2000);
  };
  const handlePlotUnhover = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const zoomBy = (factor: number) => {
    const currentRange = lastRangeRef.current ?? dataBounds;
    if (!currentRange) return;
    const [x0, x1] = currentRange.x;
    const [y0, y1] = currentRange.y;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const next = {
      x: [cx - (cx - x0) * factor, cx + (x1 - cx) * factor] as [number, number],
      y: [cy - (cy - y0) * factor, cy + (y1 - cy) * factor] as [number, number],
    };
    lastRangeRef.current = next;
    setAxisRange(next);
    setViewBox([next.x[0], next.x[1], next.y[0], next.y[1]]);
  };
  const handleZoomIn = () => zoomBy(0.7);
  const handleZoomOut = () => zoomBy(1 / 0.7);

  const handlePlotRelayout = (event: Record<string, unknown>) => {
    if (event["xaxis.autorange"] || event["yaxis.autorange"]) {
      lastRangeRef.current = null;
      setViewBox(null);
      return;
    }
    const x0 = event["xaxis.range[0]"];
    const x1 = event["xaxis.range[1]"];
    const y0 = event["yaxis.range[0]"];
    const y1 = event["yaxis.range[1]"];
    if (
      typeof x0 === "number" &&
      typeof x1 === "number" &&
      typeof y0 === "number" &&
      typeof y1 === "number"
    ) {
      lastRangeRef.current = { x: [x0, x1], y: [y0, y1] };
      setViewBox([x0, x1, y0, y1]);
    }
  };
  const handlePlotDoubleClick = () => {
    lastRangeRef.current = null;
    setAxisRange(null);
    setViewBox(null);
  };

  const hasAnyTraces = baseTraces.length > 0;
  const noVisiblePoints = Boolean(projState) && visibleCount === 0 && !viewport;

  return (
    <div data-tour="projection" className="flex flex-col h-full">
      {showStandaloneHistogram && (
        <ScoreHistogramPanel
          data={
            summary.data
              ? {
                  bins: summary.data.histograms,
                  visibleCount: summary.data.counts.visible,
                  totalCount: summary.data.counts.non_score,
                }
              : null
          }
          domains={summary.data?.domains}
          allowedProperties={allowedVisProps}
          visibilityMode={visibilityMode}
          alFilters={alFilters}
          onVisibilityKeyChange={(key) => {
            if (key)
              studyLogger.log("histogram_property_select", { property: key });
            dispatch(setVisibilityFilter({ propertyKey: key, range: [0, 1] }));
          }}
          onVisibilityRangeChange={(range) => {
            studyLogger.log("visibility_range_change", {
              property: alFilters.visibility.propertyKey ?? "",
              min: range[0],
              max: range[1],
            });
            dispatch(setVisibilityFilter({ range }));
          }}
          onMultiVisibilityChange={(keys) => {
            const prev = alFilters.visibility.propertyKeys ?? [];
            const added = keys.find((k) => !prev.includes(k));
            const removed = prev.find((k) => !keys.includes(k));
            studyLogger.log("histogram_multi_toggle", {
              property: added ?? removed ?? "",
              enabled: Boolean(added),
              keysAfter: keys,
            });
            dispatch(setVisibilityKeys(keys));
          }}
          onMultiVisibilityRangeChange={(key, range) => {
            studyLogger.log("visibility_range_change", {
              property: key,
              min: range[0],
              max: range[1],
            });
            dispatch(setVisibilityRangeFor({ key, range }));
          }}
          onReset={() => dispatch(resetVisibilityFilter())}
          sliderMode={visSliderStyle}
        />
      )}

      <ProjectionToolbar
        visibleCount={visibleCount}
        totalCount={totalCount}
        labeledCount={summary.data?.counts.labeled ?? 0}
        showLabeledPool={showLabeledPool}
        actualLabelLegend={actualLabelLegend}
        allActualLabels={labelVocab}
        visMode={visMode}
        fpvLoading={current.loading}
        fpvError={fpvError}
        isMissingProjection={isMissingProjection}
        canGenerateNow={canGenerateNow}
        fpvGenerateLoading={generating}
        lastRetrainJob={lastRetrainJob}
        isWaitingForRetrain={isWaitingForRetrain}
        retrainLoading={retrainLoading}
        showSamplingMethodSelector={phase.ui.showSamplingMethodSelector}
        samplingMethod={samplingMethod}
        onSamplingMethodChange={(v) => dispatch(setSamplingMethod(v))}
        onGenerateNow={handleGenerateNow}
      />

      <div className="flex-1 relative overflow-hidden flex">
        {phase.ui.showProjectionMethodSelector && !externalMethod && (
          <ProjectionMethodPanel
            method={method}
            dimRedMethods={allDimRedMethods.filter(
              (m) => !unavailableMethods.has(m.key),
            )}
            fpvLoading={current.loading}
            loadingMethods={loadingMethods}
            fpvCoordsBySnippetForMethod={fpvCoordsBySnippetForMethod}
            selectedSnippetId={selectedSnippetId}
            selectedCoordByMethod={selectedCoordByMethod}
            thumbnailPoints={thumbnailPoints}
            allActualLabels={labelVocab}
            onMethodChange={setMethod}
          />
        )}

        <div className="flex-1 relative overflow-hidden min-h-50">
          {isFpvPlotLoading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#f7fafc]/95">
              <Spin size="large" />
              <p className="text-sm text-gray-500 font-ibm-sans">
                {generating
                  ? "Generating feature projection…"
                  : current.building || stateQuery.building
                    ? "Preparing this dataset for the projection…"
                    : "Loading feature projection…"}
              </p>
            </div>
          )}

          {summary.data &&
            !summary.data.has_model &&
            visibilityMode !== "disabled" && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-fs-11 font-ibm-sans shadow-sm pointer-events-none">
                <ExperimentOutlined className="text-blue-400" />
                Filter scores are missing — backend scores not yet available
              </div>
            )}

          {points?.sampled && !isFpvPlotLoading && (
            <div className="absolute bottom-2 left-2 z-10 px-2 py-0.5 rounded bg-white/85 border border-gray-200 text-fs-10 text-gray-500 font-ibm-sans pointer-events-none">
              {viewport
                ? viewport.complete
                  ? `All ${viewport.count.toLocaleString()} points in view`
                  : `${viewport.count.toLocaleString()} points in view (zoom in for more)`
                : `${points.pointCount.toLocaleString()} of ${points.totalPoints.toLocaleString()} points drawn · shading covers all`}
              {detailBox && viewportQuery.loading ? " · loading detail…" : ""}
            </div>
          )}

          {!isFpvPlotLoading && unavailableReason ? (
            <div className="flex items-center justify-center h-full px-6 text-center text-gray-400 text-sm font-ibm-sans">
              {unavailableReason}
            </div>
          ) : !isFpvPlotLoading && fpvError ? (
            <div className="flex items-center justify-center h-full px-6 text-center text-gray-400 text-sm font-ibm-sans">
              {isMissingProjection
                ? "Projection not available yet — it's prepared after embeddings finish (or generate it now)."
                : fpvError}
            </div>
          ) : !isFpvPlotLoading && !scope ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
              Select a dataset and generate embeddings to see the projection.
            </div>
          ) : !isFpvPlotLoading && noVisiblePoints ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
              No points in selected range — adjust the visibility filter
            </div>
          ) : !isFpvPlotLoading && hasAnyTraces ? (
            <>
              <div
                data-tour="projection-zoom"
                className="absolute top-2 right-2 z-10 flex flex-col items-end  gap-1 pointer-events-none"
              >
                <div className="flex  items-center gap-1 pointer-events-auto">
                  <Tooltip title="Zoom out">
                    <button
                      type="button"
                      onClick={handleZoomOut}
                      aria-label="Zoom out"
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-600"
                    >
                      <ZoomOutOutlined className="text-xs" />
                    </button>
                  </Tooltip>
                  <Tooltip title="Zoom in">
                    <button
                      type="button"
                      onClick={handleZoomIn}
                      aria-label="Zoom in"
                      className="flex h-6 w-6 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-600"
                    >
                      <ZoomInOutlined className="text-xs" />
                    </button>
                  </Tooltip>
                </div>
                <span className="text-fs-10 text-gray-400 font-ibm-sans pointer-events-none">
                  Double-click plot to reset zoom
                </span>
              </div>
              <Plot
                data={traces}
                layout={{
                  autosize: true,
                  // Stable uirevision keeps the user's zoom/pan across updates.
                  uirevision: "stable",
                  datarevision: plotRevision,
                  margin: { l: 30, r: 10, t: 10, b: 30 },
                  showlegend: false,
                  xaxis: {
                    showgrid: false,
                    zeroline: false,
                    showticklabels: false,
                    range: axisRange?.x,
                  },
                  yaxis: {
                    showgrid: false,
                    zeroline: false,
                    showticklabels: false,
                    range: axisRange?.y,
                  },
                  paper_bgcolor: "#f7fafc",
                  plot_bgcolor: "#f7fafc",
                  hovermode: "closest",
                }}
                style={{ width: "100%", height: "100%" }}
                useResizeHandler
                onClick={handlePlotClick}
                onHover={handlePlotHover}
                onUnhover={handlePlotUnhover}
                onRelayout={handlePlotRelayout}
                onDoubleClick={handlePlotDoubleClick}
                config={{ displayModeBar: false, responsive: true }}
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
