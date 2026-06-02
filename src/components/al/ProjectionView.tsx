/** ProjectionView — phase-aware 2D feature projection. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { Button, Select, Tooltip, Tag, Spin } from "antd";
import { SyncOutlined, ExperimentOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
  setSelectedSnippet,
  toggleSelectedSnippet,
  setSamplingMethod,
  setVisibilityFilter,
  setVisibilityKeys,
  setVisibilityRangeFor,
} from "../../redux/features/alSlice";
import { getPropertyByKey } from "../../constants/alProperties";
import { resolveColor } from "../../utils/alColors";
import { ALFilterPanel } from "./ALFilterPanel";
import { visualisationsApi } from "../../services/visualisationsApi";
import { alApi } from "../../services/alApi";
import type { SamplingMethod, SampleScores } from "../../types/al";
import type { FPVPointMetadata, FPVProjection2D } from "../../types/visualisation";
import { embeddingApi } from "../../services/api";
import type { SnippetSet } from "../../types";
import { usePhaseConfig } from "../../studyPhases";

const { Option } = Select;

const _fpvPointsCache = new Map<string, FPVPointMetadata[]>();
const _fpvProjectionCache = new Map<string, FPVProjection2D>();

function fpvPointsKey(datasetId: number, embeddingModelId: number): string {
  return `${datasetId}:${embeddingModelId}`;
}
function fpvProjectionKey(
  datasetId: number,
  embeddingModelId: number,
  method: string,
): string {
  return `${datasetId}:${embeddingModelId}:${method}`;
}
function clearFpvCache(datasetId: number, embeddingModelId: number) {
  _fpvPointsCache.delete(fpvPointsKey(datasetId, embeddingModelId));
  for (const m of ["pca", "umap", "tsne", "isomap"]) {
    _fpvProjectionCache.delete(fpvProjectionKey(datasetId, embeddingModelId, m));
  }
}

type PlotPoint = {
  snippet_id: number;
  predicted_label?: string | null;
  scores?: SampleScores;
};

const SELECTED_COLOR = "#facc15";
const HIDDEN_COLOR = "#d1d5db";
const UNLABELED_COLOR = "#9ca3af";
const LABELED_BORDER_COLOR = "#111827";

const COMPOSITE_DOMAIN: [number, number] = [0, 1];
const SAMPLE_SCORE_UPPER_EPS = 1e-9;

type ProjectionMethod = "pca" | "umap" | "tsne" | "isomap";
const ALL_PROJECTION_METHODS: ProjectionMethod[] = ["tsne", "umap", "pca", "isomap"];

function projectionHasValidCoords(proj: FPVProjection2D | undefined): boolean {
  if (!proj || proj.x.length === 0 || proj.y.length !== proj.x.length) return false;
  return proj.x.some(
    (x, i) =>
      x != null &&
      proj.y[i] != null &&
      Number.isFinite(x) &&
      Number.isFinite(proj.y[i] as number),
  );
}

function buildCoordsMap(
  points: FPVPointMetadata[],
  proj: FPVProjection2D,
): Record<number, [number, number]> | null {
  if (!projectionHasValidCoords(proj) || proj.x.length !== points.length) return null;
  const map: Record<number, [number, number]> = {};
  for (let i = 0; i < points.length; i++) {
    const x = proj.x[i];
    const y = proj.y[i];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    map[points[i].snippet_id] = [x, y];
  }
  return map;
}

const FPV_METHOD_FETCH_FALLBACK: ProjectionMethod = "pca";

function fpvScopeKey(datasetId: number, embeddingModelId: number): string {
  return `${datasetId}:${embeddingModelId}`;
}

function isProjectionNotReadyMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("generate projections first") ||
    lower.includes("no dataset-level feature projection rows found")
  );
}

function extractFpvErrorDetail(error: unknown): string {
  const e = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: string }).msg) : String(d))).join("; ");
  }
  return String(e?.message ?? "Failed to load projection.");
}

export const ProjectionView: React.FC = () => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();

  // Track Shift key state via window listeners — more reliable than reading
  // event.event?.shiftKey from Plotly, which loses the modifier on the 3rd+
  // click when Plotly has consumed the event for zoom/select behaviour.
  const isShiftHeld = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftHeld.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === "Shift") isShiftHeld.current = false; };
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
    feedbackCount,
    retrainLoading,
    selectedDatasetId,
    embeddingModelId,
    snippetSetId,
    feedSource,
    feedbacks,
  } = useAppSelector((state) => state.al);
  const selectedSnippetId = selectedSnippetIds[0] ?? null;
  const isClassicFeed = feedSource === "classic";

  const [method, setMethod] = useState<ProjectionMethod>("pca");
  const [fpvLoading, setFpvLoading] = useState(false);
  const [fpvError, setFpvError] = useState<string | null>(null);
  const [fpvPoints, setFpvPoints] = useState<FPVPointMetadata[]>([]);
  const [projectionsByMethod, setProjectionsByMethod] = useState<
    Partial<Record<ProjectionMethod, FPVProjection2D>>
  >({});
  const [loadingMethods, setLoadingMethods] = useState<Set<ProjectionMethod>>(new Set());
  const inFlightMethodsRef = useRef<Set<ProjectionMethod>>(new Set());
  const fpvUnavailableScopeRef = useRef<string | null>(null);
  const [fpvGenerateLoading, setFpvGenerateLoading] = useState(false);
  const [derivedEmbeddingModelId, setDerivedEmbeddingModelId] = useState<number | null>(null);
  const [visRangeOverride, setVisRangeOverride] = useState<{ min: number; max: number; step: number } | null>(null);

  const [labeledSnippetIds, setLabeledSnippetIds] = useState<Set<number>>(new Set());
  const [labelsBySnippet, setLabelsBySnippet] = useState<Record<number, string[]>>({});

  const visMode = phase.visualization.mode;
  const visibilityMode = phase.visualization.visibilityFilter.mode;
  const allowedVisProps = phase.visualization.visibilityFilter.allowedProperties;
  const defaultVisKey = phase.visualization.visibilityFilter.defaultPropertyKey ?? null;
  const visSliderStyle = phase.visualization.visibilityFilter.sliderStyle ?? "range";
  const showLabeledPool = phase.visualization.showLabeledPool;
  const allowPointClick = phase.visualization.allowPointClick;

  const dimRedMethods: Array<{ key: typeof method; label: string }> = [
    { key: "tsne", label: "t‑SNE" },
    { key: "umap", label: "UMAP" },
    { key: "pca", label: "PCA" },
    { key: "isomap", label: "Isomap" },
  ];

  const rawOverlayPredictions = projectionPredictions.length > 0
    ? projectionPredictions
    : predictions;

  const hasOverlayPredictions = rawOverlayPredictions.length > 0;

  useEffect(() => {
    const visAllowed = allowedVisProps as readonly string[];
    if (visibilityMode === "disabled") {
      dispatch(setVisibilityFilter({ propertyKey: null, range: [0, 1] }));
      dispatch(setVisibilityKeys([]));
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

  useEffect(() => {
    let cancelled = false;
    async function deriveEmbeddingModel() {
      if (!selectedDatasetId) {
        setDerivedEmbeddingModelId(null);
        return;
      }
      try {
        const sets: SnippetSet[] = await embeddingApi.allSnippetSets(selectedDatasetId);
        const ready = sets.find((s) => (s.status ?? "").toLowerCase() === "ready") ?? sets[0];
        if (!cancelled) setDerivedEmbeddingModelId(ready?.embedding_model_id ?? null);
      } catch {
        if (!cancelled) setDerivedEmbeddingModelId(null);
      }
    }
    if (!embeddingModelId) deriveEmbeddingModel();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, embeddingModelId]);

  const effectiveEmbeddingModelId = embeddingModelId ?? derivedEmbeddingModelId;

  useEffect(() => {
    fpvUnavailableScopeRef.current = null;
    setFpvError(null);
  }, [selectedDatasetId, effectiveEmbeddingModelId]);

  const resetProjectionComponentState = useCallback(() => {
    setFpvPoints([]);
    setProjectionsByMethod({});
    setLoadingMethods(new Set());
    inFlightMethodsRef.current = new Set();
  }, []);

  const restoreFromCache = useCallback(
    (dsId: number, emId: number) => {
      const pts = _fpvPointsCache.get(fpvPointsKey(dsId, emId));
      if (!pts) return false;
      setFpvPoints(pts);
      const restoredProjections: Partial<Record<ProjectionMethod, FPVProjection2D>> = {};
      for (const m of ["pca", "umap", "tsne", "isomap"] as ProjectionMethod[]) {
        const proj = _fpvProjectionCache.get(fpvProjectionKey(dsId, emId, m));
        if (proj) restoredProjections[m] = proj;
      }
      setProjectionsByMethod(restoredProjections);
      return true;
    },
    [],
  );

  const fetchProjectionMethod = useCallback(
    async (targetMethod: ProjectionMethod, options?: { background?: boolean; force?: boolean }) => {
      if (!selectedDatasetId || !effectiveEmbeddingModelId) return;

      const scopeKey = fpvScopeKey(selectedDatasetId, effectiveEmbeddingModelId);
      if (!options?.force && fpvUnavailableScopeRef.current === scopeKey) {
        return;
      }

      const projKey = fpvProjectionKey(selectedDatasetId, effectiveEmbeddingModelId, targetMethod);
      const cachedProj = _fpvProjectionCache.get(projKey);
      if (cachedProj) {
        const pts = _fpvPointsCache.get(fpvPointsKey(selectedDatasetId, effectiveEmbeddingModelId));
        if (pts) {
          setFpvPoints(pts);
          setProjectionsByMethod((prev) =>
            prev[targetMethod] ? prev : { ...prev, [targetMethod]: cachedProj },
          );
          return;
        }
      }

      if (inFlightMethodsRef.current.has(targetMethod)) return;
      inFlightMethodsRef.current.add(targetMethod);
      setLoadingMethods((prev) => new Set(prev).add(targetMethod));
      if (!options?.background) {
        setFpvLoading(true);
        if (!options?.force) {
          setFpvError(null);
        }
      }

      try {
        const methodsToTry: ProjectionMethod[] =
          targetMethod === FPV_METHOD_FETCH_FALLBACK
            ? [targetMethod]
            : [targetMethod, FPV_METHOD_FETCH_FALLBACK];

        let loaded = false;
        for (const fetchMethod of methodsToTry) {
          const fpv = await visualisationsApi.getFPVDataset({
            dataset_id: selectedDatasetId,
            embedding_model_id: effectiveEmbeddingModelId,
            run_3d: false,
            method: fetchMethod,
          });
          const proj = fpv.projections_2d[fetchMethod];
          if (!projectionHasValidCoords(proj) || fpv.points.length === 0) {
            continue;
          }
          fpvUnavailableScopeRef.current = null;
          _fpvPointsCache.set(
            fpvPointsKey(selectedDatasetId, effectiveEmbeddingModelId),
            fpv.points,
          );
          _fpvProjectionCache.set(projKey, proj);
          setFpvPoints(fpv.points);
          setProjectionsByMethod((prev) =>
            prev[targetMethod] ? prev : { ...prev, [targetMethod]: proj },
          );
          if (!options?.background) {
            setFpvError(null);
          }
          loaded = true;
          break;
        }
        if (!loaded && !options?.background) {
          setFpvError(
            `No valid ${targetMethod} projection coordinates; try PCA or regenerate FPV.`,
          );
        }
      } catch (e: unknown) {
        const detail = extractFpvErrorDetail(e);
        if (isProjectionNotReadyMessage(detail)) {
          fpvUnavailableScopeRef.current = scopeKey;
          if (!options?.background) {
            setFpvError(detail);
          }
        } else if (!options?.background) {
          resetProjectionComponentState();
          setFpvError(detail);
        }
      } finally {
        inFlightMethodsRef.current.delete(targetMethod);
        setLoadingMethods((prev) => {
          const next = new Set(prev);
          next.delete(targetMethod);
          return next;
        });
        if (!options?.background) {
          setFpvLoading(false);
        }
      }
    },
    [selectedDatasetId, effectiveEmbeddingModelId, resetProjectionComponentState],
  );

  useEffect(() => {
    if (visMode === "hidden") {
      resetProjectionComponentState();
      setFpvError(null);
      return;
    }
    if (!selectedDatasetId || !effectiveEmbeddingModelId) return;

    const scopeKey = fpvScopeKey(selectedDatasetId, effectiveEmbeddingModelId);
    if (fpvUnavailableScopeRef.current === scopeKey) return;

    const alreadyCached = restoreFromCache(selectedDatasetId, effectiveEmbeddingModelId);
    if (alreadyCached) {
      fpvUnavailableScopeRef.current = null;
      return;
    }
    resetProjectionComponentState();
    void fetchProjectionMethod(method);
  }, [
    selectedDatasetId,
    effectiveEmbeddingModelId,
    visMode,
    method,
    resetProjectionComponentState,
    restoreFromCache,
    fetchProjectionMethod,
  ]);

  useEffect(() => {
    if (visMode === "hidden" || !selectedDatasetId || !effectiveEmbeddingModelId) return;
    const scopeKey = fpvScopeKey(selectedDatasetId, effectiveEmbeddingModelId);
    if (fpvUnavailableScopeRef.current === scopeKey) return;
    if (projectionsByMethod[method]) return;
    void fetchProjectionMethod(method);
  }, [
    method,
    visMode,
    selectedDatasetId,
    effectiveEmbeddingModelId,
    projectionsByMethod,
    fetchProjectionMethod,
  ]);

  useEffect(() => {
    if (visMode === "hidden" || fpvPoints.length === 0) return;
    for (const m of ALL_PROJECTION_METHODS) {
      if (m === method || projectionsByMethod[m]) continue;
      void fetchProjectionMethod(m, { background: true });
    }
  }, [
    visMode,
    fpvPoints.length,
    method,
    projectionsByMethod,
    fetchProjectionMethod,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabeledPool() {
      if (!selectedDatasetId || !showLabeledPool) {
        if (!cancelled) setLabeledSnippetIds(new Set());
        return;
      }
      try {
        const r = await alApi.getLabeledSnippets(
          selectedDatasetId,
          snippetSetId ?? undefined,
          "any",
        );
        if (!cancelled) setLabeledSnippetIds(new Set(r.snippet_ids));
      } catch {
        if (!cancelled) setLabeledSnippetIds(new Set());
      }
    }
    loadLabeledPool();
    return () => { cancelled = true; };
  }, [selectedDatasetId, snippetSetId, showLabeledPool, lastRetrainJob, feedbackCount]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabels() {
      if (isClassicFeed) {
        const map: Record<number, string[]> = {};
        for (const [snippetId, fb] of Object.entries(feedbacks)) {
          const labels = fb.final_labels ?? [];
          if (labels.length > 0) map[Number(snippetId)] = labels;
        }
        if (!cancelled) setLabelsBySnippet(map);
        return;
      }
      if (!selectedDatasetId) {
        if (!cancelled) setLabelsBySnippet({});
        return;
      }
      try {
        const r = await alApi.getSnippetLabels(selectedDatasetId, snippetSetId ?? undefined);
        if (!cancelled) {
          const map: Record<number, string[]> = {};
          for (const it of r.items) map[it.snippet_id] = it.labels;
          setLabelsBySnippet(map);
        }
      } catch {
        if (!cancelled) setLabelsBySnippet({});
      }
    }
    loadLabels();
    return () => { cancelled = true; };
  }, [isClassicFeed, feedbacks, selectedDatasetId, snippetSetId]);

  const canGenerateNow = Boolean(selectedDatasetId && effectiveEmbeddingModelId);
  const isMissingProjection = isProjectionNotReadyMessage(fpvError ?? "");

  const handleGenerateNow = async () => {
    if (!selectedDatasetId || !effectiveEmbeddingModelId) return;
    setFpvGenerateLoading(true);
    setFpvError(null);
    fpvUnavailableScopeRef.current = null;
    try {
      await visualisationsApi.generateFPVDataset({
        dataset_id: selectedDatasetId,
        embedding_model_id: effectiveEmbeddingModelId,
        run_3d: false,
      });
      clearFpvCache(selectedDatasetId, effectiveEmbeddingModelId);
      resetProjectionComponentState();
      await fetchProjectionMethod(method, { force: true });
      for (const m of ALL_PROJECTION_METHODS) {
        if (m !== method) void fetchProjectionMethod(m, { background: true, force: true });
      }
    } catch (e: any) {
      resetProjectionComponentState();
      setFpvError(String(e?.response?.data?.detail ?? e?.message ?? "Failed to generate projection."));
    } finally {
      setFpvGenerateLoading(false);
    }
  };

  const visKey = alFilters.visibility.propertyKey;
  useEffect(() => {
    if (visibilityMode !== "single" || !visKey) {
      setVisRangeOverride(null);
      return;
    }
    let cancelled = false;
    visualisationsApi.getVisRange(visKey).then((r) => {
      if (!cancelled) setVisRangeOverride({ min: r.min_value, max: r.max_value, step: r.step });
    }).catch(() => {
      if (!cancelled) setVisRangeOverride(null);
    });
    return () => { cancelled = true; };
  }, [visKey, visibilityMode]);

  const fpvCoordsBySnippet: Record<number, [number, number]> | null = useMemo(() => {
    const proj = projectionsByMethod[method];
    if (!proj || fpvPoints.length === 0) return null;
    return buildCoordsMap(fpvPoints, proj);
  }, [fpvPoints, projectionsByMethod, method]);

  const fpvCoordsBySnippetForMethod = useMemo(() => {
    if (fpvPoints.length === 0) return null;
    const maps: Partial<Record<ProjectionMethod, Record<number, [number, number]>>> = {};
    for (const m of ALL_PROJECTION_METHODS) {
      const proj = projectionsByMethod[m];
      if (!proj) continue;
      const map = buildCoordsMap(fpvPoints, proj);
      if (map) maps[m] = map;
    }
    return maps;
  }, [fpvPoints, projectionsByMethod]);

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
    return plotPoints.map((p) => fpvCoordsBySnippet[p.snippet_id] ?? ([0, 0] as [number, number]));
  }, [plotPoints, fpvCoordsBySnippet]);

  const [didAutoSelectKey, setDidAutoSelectKey] = useState<string | null>(null);
  useEffect(() => {
    const shouldAutoSelect = phase.feed.mode === "single_card_on_select";
    if (!shouldAutoSelect) return;
    if (selectedSnippetIds.length > 0) return;
    if (plotPoints.length === 0) return;

    const key = `${phase.id}:${selectedDatasetId ?? "na"}:${snippetSetId ?? "na"}:${method}`;
    if (didAutoSelectKey === key) return;

    const idx = Math.floor(Math.random() * plotPoints.length);
    const snippetId = plotPoints[idx]?.snippet_id;
    if (snippetId == null) return;

    dispatch(setSelectedSnippet(snippetId));
    setDidAutoSelectKey(key);
  }, [
    phase.id,
    phase.feed.mode,
    selectedDatasetId,
    snippetSetId,
    method,
    plotPoints,
    selectedSnippetIds,
    dispatch,
    didAutoSelectKey,
  ]);

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
    () => (visRangeOverride
      ? [visRangeOverride.min, visRangeOverride.max]
      : (visProp?.range ?? [0, 1])),
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
          if (raw === undefined || raw === null) { visible = false; break; }
          let v = raw;
          if (key === "composite" && typeof v === "number") {
            v = Math.min(COMPOSITE_DOMAIN[1], Math.max(COMPOSITE_DOMAIN[0], v));
          }
          if (v < domainLo || v > domainHi + SAMPLE_SCORE_UPPER_EPS) { visible = false; break; }
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

  const thumbnailPoints = useMemo(() => filtered.filter((f) => f.visible), [filtered]);

  const colorKey: "actual_label" = "actual_label";

  const baseTraces = useMemo(() => {
    if (filtered.length === 0) return [];

    const hidden = filtered.filter((f) => !f.visible);
    const visible = filtered.filter((f) => f.visible);

    const hiddenTrace = hidden.length > 0
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
        activeRingXs.push(coord[0]); activeRingYs.push(coord[1]);
        activeDotXs.push(coord[0]); activeDotYs.push(coord[1]);
        activeDotIds.push(id); activeDotLabels.push(label);
      } else {
        queueRingXs.push(coord[0]); queueRingYs.push(coord[1]);
        queueDotXs.push(coord[0]); queueDotYs.push(coord[1]);
        queueDotIds.push(id); queueDotLabels.push(label);
      }
    }

    const traces: object[] = [];

    // Queued (not currently active): subtle blue ring
    if (queueRingXs.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "", showlegend: false, hoverinfo: "skip" as const,
        x: queueRingXs, y: queueRingYs,
        marker: { color: "rgba(0,0,0,0)", size: 18, opacity: 0.7,
                   line: { width: 2, color: "#60a5fa" } },
      });
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "", showlegend: false,
        x: queueDotXs, y: queueDotYs,
        customdata: queueDotIds, text: queueDotLabels,
        marker: { color: "#93c5fd", size: 9, opacity: 0.85,
                   line: { width: 1.5, color: "#3b82f6" } },
        hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata} (queued)<extra></extra>`,
      });
    }

    // Active (currently visible in feed): bright yellow ring
    if (activeRingXs.length > 0) {
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "", showlegend: false, hoverinfo: "skip" as const,
        x: activeRingXs, y: activeRingYs,
        marker: { color: "rgba(0,0,0,0)", size: 22, opacity: 1,
                   line: { width: 2.5, color: SELECTED_COLOR } },
      });
      traces.push({
        type: "scattergl" as const,
        mode: "markers" as const,
        name: "", showlegend: false,
        x: activeDotXs, y: activeDotYs,
        customdata: activeDotIds, text: activeDotLabels,
        marker: { color: SELECTED_COLOR, size: 12, opacity: 1,
                   line: { width: 2, color: LABELED_BORDER_COLOR } },
        hovertemplate: `<b>%{text}</b><br>Snippet #%{customdata}<extra></extra>`,
      });
    }

    return traces;
  }, [selectedSnippetIds, activeSnippetId, filtered, fpvCoordsBySnippet]);

  const traces = useMemo(
    () => [...baseTraces, ...selectionTraces],
    [baseTraces, selectionTraces],
  );

  const handlePlotClick = (event: any) => {
    if (!allowPointClick) return;
    const pt = event.points?.[0];
    if (pt?.customdata === undefined) return;

    const hasHiddenTrace = Boolean(filtered.some((f) => !f.visible));
    if (hasHiddenTrace && pt.curveNumber === 0) return;

    const snippetId = pt.customdata as number;
    if (isShiftHeld.current && phase.feed.mode === "single_card_on_select") {
      dispatch(toggleSelectedSnippet(snippetId));
    } else {
      dispatch(setSelectedSnippet(snippetId));
    }
  };

  if (visMode === "hidden") return null;

  const visibleCount = filtered.filter((f) => f.visible).length;
  const isWaitingForRetrain = predictions.length > 0 && projectionPredictions.length === 0;
  const hasAnyTraces = traces.length > 0;

  const activeProjectionReady =
    visMode !== "whole_dataset" ||
    (fpvPoints.length > 0 && Boolean(projectionsByMethod[method]));

  const isFpvPlotLoading =
    visMode === "whole_dataset" &&
    Boolean(selectedDatasetId && effectiveEmbeddingModelId) &&
    !fpvError &&
    !isMissingProjection &&
    (fpvGenerateLoading ||
      fpvLoading ||
      loadingMethods.has(method) ||
      !activeProjectionReady);

  const showFilterPanel = visibilityMode !== "disabled";

  return (
    <div className="flex flex-col h-full">
      {showFilterPanel && (
        <ALFilterPanel
          filters={alFilters}
          phaseVisibilityMode={visibilityMode}
          phaseColorMode="disabled"
          allowedVisibilityProperties={allowedVisProps}
          allowedColorProperties={[]}
          defaultVisibilityKey={defaultVisKey}
          visibilitySliderStyle={visSliderStyle}
          onVisibilityKeyChange={(key) =>
            dispatch(setVisibilityFilter({ propertyKey: key, range: [0, 1] }))
          }
          onVisibilityRangeChange={(range) =>
            dispatch(setVisibilityFilter({ range }))
          }
          onMultiVisibilityChange={(keys) => dispatch(setVisibilityKeys(keys))}
          onMultiVisibilityRangeChange={(key, range) =>
            dispatch(setVisibilityRangeFor({ key, range }))
          }
          onColorKeyChange={() => {}}
          allCategoricalValues={allCategoricalValues}
          visibilityRangeOverride={visRangeOverride ?? undefined}
        />
      )}

      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 bg-white flex-wrap">
        {phase.ui.showSamplingMethodSelector && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-400 font-ibm-sans">Sampling method</span>
            <Select
              size="small"
              value={samplingMethod}
              onChange={(v: SamplingMethod) => dispatch(setSamplingMethod(v))}
              style={{ width: 140 }}
            >
              <Option value="uncertainty">Uncertainty</Option>
              <Option value="diversity">Diversity</Option>
              <Option value="density">Density</Option>
              <Option value="random">Random</Option>
            </Select>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <span className="text-xs text-gray-400 font-ibm-sans">
            <strong>{visibleCount}</strong> / <strong>{plotPoints.length}</strong> visible
          </span>

          {showLabeledPool && labeledSnippetIds.size > 0 && (
            <Tag color="default" className="text-xs">
              {labeledSnippetIds.size} labeled
            </Tag>
          )}

          {actualLabelLegend.total > 0 && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] text-gray-400 font-ibm-sans whitespace-nowrap">Legend:</span>
              <div
                className={[
                  "min-w-0 max-w-[min(52vw,720px)]",
                  "overflow-x-auto",
                  "[scrollbar-width:thin]",
                  "[-webkit-overflow-scrolling:touch]",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5 py-0.5 pr-1">
                  {actualLabelLegend.shown.map((lbl) => (
                    <span
                      key={lbl}
                      className={[
                        "inline-flex items-center gap-1.5",
                        "px-2 py-0.5",
                        "rounded-full",
                        "border border-gray-200",
                        "bg-white/90",
                        "text-[11px] text-gray-700",
                        "shadow-[0_1px_0_rgba(0,0,0,0.02)]",
                        "max-w-[160px]",
                      ].join(" ")}
                      title={lbl}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0"
                        style={{
                          backgroundColor: resolveColor(
                            { actual_label: lbl } as any,
                            "actual_label",
                            allCategoricalValues.actual_label ?? [],
                          ),
                        }}
                      />
                      <span className="truncate">{lbl}</span>
                    </span>
                  ))}
                  {actualLabelLegend.remaining > 0 && actualLabelLegend.total > actualLabelLegend.shown.length && (
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">+{actualLabelLegend.remaining}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {visMode === "whole_dataset" && fpvLoading && (
            <Tag icon={<SyncOutlined spin />} color="processing" className="text-xs">
              Loading projection…
            </Tag>
          )}
          {visMode === "whole_dataset" && fpvError && (
            <Tooltip title={fpvError}>
              <Tag color="red" className="text-xs">
                Projection unavailable
              </Tag>
            </Tooltip>
          )}
          {visMode === "whole_dataset" && !fpvLoading && !fpvError && (
            <Tag color="blue" className="text-xs">
              {method === "tsne" ? "t‑SNE" : method.toUpperCase()}
            </Tag>
          )}

          {visMode === "whole_dataset" && isMissingProjection && canGenerateNow && (
            <Tooltip title="Normally generated after embeddings finish. Use this to generate immediately (may take time).">
              <Button
                size="small"
                onClick={handleGenerateNow}
                loading={fpvGenerateLoading}
              >
                Generate projection now
              </Button>
            </Tooltip>
          )}

          {lastRetrainJob && (
            <Tooltip title={`Retrain completed at ${lastRetrainJob.completed_at ?? "?"}`}>
              <Tag icon={<ExperimentOutlined />} color="green" className="text-xs">
                Post-retrain view
              </Tag>
            </Tooltip>
          )}
          {isWaitingForRetrain && !retrainLoading && (
            <Tooltip title="Run inference after retrain to update the projection">
              <Tag icon={<SyncOutlined />} color="blue" className="text-xs">
                Updates after retrain
              </Tag>
            </Tooltip>
          )}
          {retrainLoading && (
            <Tag icon={<SyncOutlined spin />} color="processing" className="text-xs">
              Retraining…
            </Tag>
          )}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden flex">
        {phase.ui.showProjectionMethodSelector && (
          <div className="w-[168px] flex-shrink-0 border-r border-gray-100 bg-white">
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="text-xs font-ibm-mono font-semibold text-gray-700">Projection</div>
              <div className="text-[11px] text-gray-400">Pick a method</div>
            </div>
            <div className="p-3 flex flex-col gap-2 overflow-auto" style={{ maxHeight: "100%" }}>
              {dimRedMethods.map((m) => {
                const active = method === m.key;
                const hasProj = Boolean(fpvCoordsBySnippetForMethod?.[m.key]);
                const isLoadingThumb = loadingMethods.has(m.key) && !hasProj;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMethod(m.key)}
                    disabled={fpvLoading && active}
                    className={[
                      "text-left rounded-xl border px-2.5 py-2 transition-all",
                      active
                        ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                        : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300",
                      !hasProj && !isLoadingThumb ? "opacity-50 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <div className="w-full h-[74px] rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 overflow-hidden relative">
                      <MiniProjection
                        points={thumbnailPoints}
                        coordsBySnippet={fpvCoordsBySnippetForMethod?.[m.key] ?? null}
                        selectedSnippetId={selectedSnippetId}
                        allActualLabels={allCategoricalValues.actual_label ?? []}
                        loading={isLoadingThumb}
                      />
                    </div>
                    <div className="mt-1 text-[11px] text-gray-600 font-ibm-sans">{m.label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 relative overflow-hidden min-h-[200px]">
        {isFpvPlotLoading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#f7fafc]/95">
            <Spin size="large" />
            <p className="text-sm text-gray-500 font-ibm-sans">
              Loading feature projection…
            </p>
          </div>
        )}

        {hasOverlayPredictions &&
          !isClassicFeed &&
          rawOverlayPredictions.some((p) => !p.scores) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-ibm-sans shadow-sm pointer-events-none">
            <ExperimentOutlined className="text-blue-400" />
            Filter scores are missing — backend scores not yet available
          </div>
        )}

        {!isFpvPlotLoading && !hasAnyTraces ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            {fpvError
              ? "Projection not available yet — it’s prepared after embeddings finish (or generate it now)."
              : "Select a dataset and generate embeddings to see the projection."}
          </div>
        ) : !isFpvPlotLoading && hasAnyTraces && visibleCount === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            No points in selected range — adjust the visibility filter
          </div>
        ) : !isFpvPlotLoading && visMode === "whole_dataset" && fpvError ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            Projection not available yet — it will appear once the embedding job finishes (FPV is cached).
          </div>
        ) : !isFpvPlotLoading && activeProjectionReady ? (
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 30, r: 10, t: 10, b: 30 },
              showlegend: false,
              legend: {
                font: { size: 10 },
                itemsizing: "constant",
                bgcolor: "rgba(255,255,255,0.85)",
                bordercolor: "#e5e7eb",
                borderwidth: 1,
              },
              xaxis: { showgrid: false, zeroline: false, showticklabels: false },
              yaxis: { showgrid: false, zeroline: false, showticklabels: false },
              paper_bgcolor: "#f7fafc",
              plot_bgcolor: "#f7fafc",
              hovermode: "closest",
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
            onClick={handlePlotClick}
            config={{ displayModeBar: false, responsive: true }}
          />
        ) : null}
        </div>
      </div>
    </div>
  );
};

const THUMB_W = 120;
const THUMB_H = 74;

const MiniProjection: React.FC<{
  points: Array<{ p: any; coord: [number, number]; visible: boolean }>;
  coordsBySnippet: Record<number, [number, number]> | null;
  selectedSnippetId: number | null;
  allActualLabels: string[];
  loading?: boolean;
}> = React.memo(
  ({ points, coordsBySnippet, selectedSnippetId, allActualLabels, loading = false }) => {
    const base = useMemo(() => {
      if (!coordsBySnippet) return null;

      const pts: Array<{ x: number; y: number; id: number; color: string; r: number }> = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

      for (const it of points) {
        const id = it.p.snippet_id as number;
        const c = coordsBySnippet[id];
        if (!c) continue;
        const x = c[0];
        const y = c[1];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);

        const actual = (it.p.scores as any)?.actual_label as string | undefined;
        const isLabeled = Boolean(actual);
        pts.push({
          x, y, id,
          color: isLabeled
            ? resolveColor({ actual_label: actual } as any, "actual_label", allActualLabels)
            : "#9ca3af",
          r: isLabeled ? 2.0 : 1.7,
        });
      }

      if (pts.length === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) return null;

      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      const pad = 4;
      const toSvg = (x: number, y: number): [number, number] => {
        const sx = pad + ((x - minX) / spanX) * (THUMB_W - pad * 2);
        const sy = pad + ((y - minY) / spanY) * (THUMB_H - pad * 2);
        return [sx, THUMB_H - sy];
      };

      const screen = new Map<number, [number, number]>();
      for (const c of pts) screen.set(c.id, toSvg(c.x, c.y));

      return { pts, screen };
    }, [points, coordsBySnippet, allActualLabels]);

    const baseCircles = useMemo(() => {
      if (!base) return null;
      return base.pts.map((c) => {
        const [sx, sy] = base.screen.get(c.id)!;
        return (
          <circle key={c.id} cx={sx} cy={sy} r={c.r} fill={c.color} opacity={0.9} />
        );
      });
    }, [base]);

    if (loading) {
      return (
        <div className="w-full h-full flex items-center justify-center">
          <Spin size="small" />
        </div>
      );
    }
    if (!coordsBySnippet) {
      return (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
          N/A
        </div>
      );
    }
    if (!base || !baseCircles) return null;

    const selScreen =
      selectedSnippetId !== null ? base.screen.get(selectedSnippetId) ?? null : null;
    const hasSelection = selScreen !== null;

    return (
      <svg viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} className="w-full h-full">
        <g opacity={hasSelection ? 0.4 : 0.9}>{baseCircles}</g>

        {selScreen && (
          <g>
            <circle cx={selScreen[0]} cy={selScreen[1]} r={6} fill="none" stroke="#facc15" strokeWidth={1} opacity={0.85} />
            <circle cx={selScreen[0]} cy={selScreen[1]} r={4} fill="#facc15" stroke="#111827" strokeWidth={1.5} />
          </g>
        )}
      </svg>
    );
  },
);
MiniProjection.displayName = "MiniProjection";
