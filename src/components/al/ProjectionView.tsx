/**
 * ProjectionView — phase-aware 2D feature projection.
 *
 * Behaviour driven by `phase.visualization`:
 *   • mode "hidden"            → renders nothing
 *   • mode "predictions_only"  → only points whose snippet is in `predictions`
 *   • mode "whole_dataset"     → full FPV background + (optional) per-snippet
 *                                color filtering / labeled-pool halo / single
 *                                selection on click
 *
 * Color filter supports an `actual_label` virtual property which is joined
 * client-side from `/api/pam-al/snippet-labels`.
 */

import React, { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { Button, Select, Tooltip, Tag } from "antd";
import { SyncOutlined, ExperimentOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../../hooks";
import {
  setSelectedSnippet,
  setSamplingMethod,
  setVisibilityFilter,
  setColorFilter,
  setVisibilityKeys,
  setVisibilityRangeFor,
} from "../../redux/features/alSlice";
import { getPropertyByKey } from "../../constants/alProperties";
import { resolveColor } from "../../utils/alColors";
import { ALFilterPanel } from "./ALFilterPanel";
import { visualisationsApi } from "../../services/visualisationsApi";
import { alApi } from "../../services/alApi";
import type { SamplingMethod, SampleScores } from "../../types/al";
import type { FPVResponse } from "../../types/visualisation";
import { embeddingApi } from "../../services/api";
import type { SnippetSet } from "../../types";
import { usePhaseConfig } from "../../studyPhases";

const { Option } = Select;

type PlotPoint = {
  snippet_id: number;
  predicted_label?: string | null;
  scores?: SampleScores;
};

// ── Default colours ───────────────────────────────────────────────────────────
const DEFAULT_COLOR = "#6366f1";
const SELECTED_COLOR = "#facc15";
const HIDDEN_COLOR = "#d1d5db";
const LABELED_BORDER_COLOR = "#111827";

// ── Component ─────────────────────────────────────────────────────────────────

export const ProjectionView: React.FC = () => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();

  const {
    predictions,
    projectionPredictions,
    selectedSnippetId,
    samplingMethod,
    alFilters,
    lastRetrainJob,
    feedbackCount,
    retrainLoading,
    selectedDatasetId,
    embeddingModelId,
    snippetSetId,
  } = useAppSelector((state) => state.al);

  const [method, setMethod] = useState<"pca" | "umap" | "tsne" | "isomap">("umap");
  const [fpvLoading, setFpvLoading] = useState(false);
  const [fpvError, setFpvError] = useState<string | null>(null);
  const [fpvData, setFpvData] = useState<FPVResponse | null>(null);
  const [fpvGenerateLoading, setFpvGenerateLoading] = useState(false);
  const [derivedEmbeddingModelId, setDerivedEmbeddingModelId] = useState<number | null>(null);
  const [visRangeOverride, setVisRangeOverride] = useState<{ min: number; max: number; step: number } | null>(null);

  // Study-mode side data — labeled pool + per-snippet ground-truth labels.
  const [labeledSnippetIds, setLabeledSnippetIds] = useState<Set<number>>(new Set());
  const [labelsBySnippet, setLabelsBySnippet] = useState<Record<number, string[]>>({});

  // ── Phase shortcuts ───────────────────────────────────────────────────────
  const visMode = phase.visualization.mode;
  const colorMode = phase.visualization.colorFilter.mode;
  const visibilityMode = phase.visualization.visibilityFilter.mode;
  const allowedColorProps = phase.visualization.colorFilter.allowedProperties;
  const allowedVisProps = phase.visualization.visibilityFilter.allowedProperties;
  const showLabeledPool = phase.visualization.showLabeledPool;
  const allowPointClick = phase.visualization.allowPointClick;

  // ── Overlay data source (inference snapshot if available, else live) ─────
  // Used only for the feed / selection panel. The plot in `whole_dataset` mode
  // is driven by FPV points, not by this list.
  const rawOverlayPredictions = projectionPredictions.length > 0
    ? projectionPredictions
    : predictions;

  const hasOverlayPredictions = rawOverlayPredictions.length > 0;

  // Reset filters whenever the active phase changes — prevents stale color/key
  // selections that aren't allowed under the new phase.
  useEffect(() => {
    const colorAllowed = allowedColorProps as readonly string[];
    const visAllowed = allowedVisProps as readonly string[];
    if (colorMode === "disabled") {
      dispatch(setColorFilter({ propertyKey: null }));
    } else if (
      alFilters.color.propertyKey &&
      !colorAllowed.includes(alFilters.color.propertyKey)
    ) {
      dispatch(setColorFilter({ propertyKey: null }));
    }
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
      // Drop any single-mode selection so the panel renders cleanly.
      dispatch(setVisibilityFilter({ propertyKey: null, range: [0, 1] }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.id]);

  // ── Derive embedding model from selected snippet set if missing ──────────
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
        setDerivedEmbeddingModelId(ready?.embedding_model_id ?? null);
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

  // ── Load FPV coords when needed by the current phase ─────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadFPV() {
      // We still need FPV coordinates for `predictions_only`; we just don't
      // render the background dataset trace in that mode.
      if (visMode === "hidden") {
        setFpvData(null);
        setFpvError(null);
        return;
      }
      if (!selectedDatasetId || !effectiveEmbeddingModelId) return;

      setFpvLoading(true);
      setFpvError(null);
      try {
        const params = { dataset_id: selectedDatasetId, embedding_model_id: effectiveEmbeddingModelId, run_3d: false };
        const fpv = await visualisationsApi.getFPVDataset(params);
        if (!cancelled) setFpvData(fpv);
      } catch (e: any) {
        if (!cancelled) {
          setFpvData(null);
          setFpvError(String(e?.response?.data?.detail ?? e?.message ?? "Failed to load projection."));
        }
      } finally {
        if (!cancelled) setFpvLoading(false);
      }
    }

    loadFPV();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, effectiveEmbeddingModelId, visMode]);

  // ── Load labeled pool + per-snippet labels for study features ─────────────
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
      if (!selectedDatasetId || !allowedColorProps.includes("actual_label")) {
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
  }, [selectedDatasetId, snippetSetId, allowedColorProps]);

  const canGenerateNow = Boolean(selectedDatasetId && effectiveEmbeddingModelId);
  const isMissingProjection =
    (fpvError ?? "").toLowerCase().includes("generate projections first") ||
    (fpvError ?? "").toLowerCase().includes("no dataset-level feature projection rows found");

  const handleGenerateNow = async () => {
    if (!selectedDatasetId || !effectiveEmbeddingModelId) return;
    setFpvGenerateLoading(true);
    setFpvError(null);
    try {
      const body = { dataset_id: selectedDatasetId, embedding_model_id: effectiveEmbeddingModelId, run_3d: false };
      const fpv = await visualisationsApi.generateFPVDataset(body);
      setFpvData(fpv);
    } catch (e: any) {
      setFpvData(null);
      setFpvError(String(e?.response?.data?.detail ?? e?.message ?? "Failed to generate projection."));
    } finally {
      setFpvGenerateLoading(false);
    }
  };

  // ── Fetch live min/max/step for the active visibility filter property ─────
  // For multi mode we still need ranges per property — fetch the first one only;
  // ALFilterPanel handles per-property ranges via its own slider state in multi mode.
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

  // ── Coordinates lookup ───────────────────────────────────────────────────
  const fpvCoordsBySnippet: Record<number, [number, number]> | null = useMemo(() => {
    if (!fpvData) return null;
    const proj = fpvData.projections_2d?.[method];
    if (!proj || proj.x.length !== fpvData.points.length || proj.y.length !== fpvData.points.length) return null;
    const map: Record<number, [number, number]> = {};
    for (let i = 0; i < fpvData.points.length; i++) {
      map[fpvData.points[i].snippet_id] = [proj.x[i], proj.y[i]];
    }
    return map;
  }, [fpvData, method]);

  // ── Score join for whole-dataset filtering/coloring ──────────────────────
  // The FPV dataset response may not contain sampler-suite scores. In phase 3.x
  // we need uncertainty/diversity/density for visibility/color filters, so we
  // join scores from the full inference predictions by snippet_id.
  const scoresBySnippet = useMemo(() => {
    const map = new Map<number, SampleScores>();
    for (const p of rawOverlayPredictions) {
      if (p?.snippet_id != null && p.scores) map.set(p.snippet_id, p.scores);
    }
    return map;
  }, [rawOverlayPredictions]);

  // ── Plot points (phase-dependent) ────────────────────────────────────────
  const plotPoints: PlotPoint[] = useMemo(() => {
    if (visMode === "whole_dataset" && fpvData) {
      return fpvData.points.map((pt) => ({
        snippet_id: pt.snippet_id,
        predicted_label: pt.predicted_labels?.[0] ?? "—",
        // Prefer scores from AL inference (full set), fall back to FPV metadata.
        scores: scoresBySnippet.get(pt.snippet_id) ?? {
          uncertainty: pt.uncertainty ?? undefined,
          diversity: pt.diversity ?? undefined,
          density: pt.density ?? undefined,
          composite: pt.composite_score ?? undefined,
        },
      }));
    }
    // predictions_only: plot the inference subset
    return rawOverlayPredictions as unknown as PlotPoint[];
  }, [visMode, fpvData, rawOverlayPredictions, scoresBySnippet]);

  const coords: [number, number][] = useMemo(() => {
    if (!fpvCoordsBySnippet) return plotPoints.map(() => [0, 0] as [number, number]);
    return plotPoints.map((p) => fpvCoordsBySnippet[p.snippet_id] ?? ([0, 0] as [number, number]));
  }, [plotPoints, fpvCoordsBySnippet]);

  // ── Default selection (Phase 2/3) ───────────────────────────────────────
  // In click-to-inspect phases, pick a random point so users start with a
  // concrete snippet card instead of an empty panel.
  const [didAutoSelectKey, setDidAutoSelectKey] = useState<string | null>(null);
  useEffect(() => {
    const shouldAutoSelect = phase.feed.mode === "single_card_on_select";
    if (!shouldAutoSelect) return;
    if (selectedSnippetId !== null) return;
    if (plotPoints.length === 0) return;

    // Only auto-select once per (phase,dataset,snippet_set,projection method).
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
    selectedSnippetId,
    dispatch,
    didAutoSelectKey,
  ]);

  // Overlay predictions stay in Redux and are used by the feed / single-card panel.

  const enrichedPlotPoints: PlotPoint[] = useMemo(() => {
    if (Object.keys(labelsBySnippet).length === 0) return plotPoints;
    return plotPoints.map((p) => {
      const lbls = labelsBySnippet[p.snippet_id];
      if (!lbls || lbls.length === 0) return p;
      return { ...p, scores: { ...(p.scores ?? {}), actual_label: lbls[0] } };
    });
  }, [plotPoints, labelsBySnippet]);

  // ── Categorical legend support (incl. actual_label) ──────────────────────
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

  // ── Visibility filtering (single OR multi) ───────────────────────────────
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
        const [pMin, pMax] = effectiveRange;
        const [normLo, normHi] = alFilters.visibility.range;
        const domainLo = pMin + normLo * (pMax - pMin);
        const domainHi = pMin + normHi * (pMax - pMin);
        const raw = p.scores?.[visKey as keyof SampleScores] as number | undefined;
        if (raw === undefined || raw === null) visible = false;
        else visible = raw >= domainLo && raw <= domainHi;
      } else if (visibilityMode === "multi") {
        const keys = alFilters.visibility.propertyKeys ?? [];
        const ranges = alFilters.visibility.ranges ?? {};
        for (const key of keys) {
          const prop = getPropertyByKey(key);
          if (!prop || !prop.range) continue;
          const [pMin, pMax] = prop.range;
          const [normLo, normHi] = ranges[key] ?? [0, 1];
          const domainLo = pMin + normLo * (pMax - pMin);
          const domainHi = pMin + normHi * (pMax - pMin);
          const raw = p.scores?.[key as keyof SampleScores] as number | undefined;
          if (raw === undefined || raw === null) { visible = false; break; }
          if (raw < domainLo || raw > domainHi) { visible = false; break; }
        }
      }

      return { p, coord: coords[i], visible };
    });
  }, [enrichedPlotPoints, coords, visProp, visKey, alFilters.visibility, effectiveRange, visibilityMode]);

  // ── Plot traces ──────────────────────────────────────────────────────────
  const colorKey = colorMode === "disabled" ? null : alFilters.color.propertyKey;

  const traces = useMemo(() => {
    const backgroundTrace = null;

    if (filtered.length === 0) return backgroundTrace ? [backgroundTrace] : [];

    const hidden = filtered.filter((f) => !f.visible);
    const visible = filtered.filter((f) => f.visible);

    const hiddenTrace = hidden.length > 0
      ? {
          type: "scatter" as const,
          mode: "markers" as const,
          name: "",
          showlegend: false,
          x: hidden.map((f) => f.coord[0]),
          y: hidden.map((f) => f.coord[1]),
          customdata: hidden.map((f) => f.p.snippet_id),
          marker: { color: HIDDEN_COLOR, size: 4, opacity: 0.25, line: { width: 0 } },
          hovertemplate: "Snippet #%{customdata} (filtered)<extra></extra>",
        }
      : null;

    const byLabel = new Map<string, {
      xs: number[];
      ys: number[];
      ids: number[];
      colors: string[];
      sizes: number[];
      lineWidths: number[];
      lineColors: string[];
    }>();

    visible.forEach(({ p, coord }) => {
      const label = p.predicted_label ?? "—";
      if (!byLabel.has(label)) {
        byLabel.set(label, { xs: [], ys: [], ids: [], colors: [], sizes: [], lineWidths: [], lineColors: [] });
      }
      const g = byLabel.get(label)!;
      g.xs.push(coord[0]);
      g.ys.push(coord[1]);
      g.ids.push(p.snippet_id);

      const isSelected = p.snippet_id === selectedSnippetId;
      g.sizes.push(isSelected ? 13 : 6);
      g.colors.push(
        isSelected
          ? SELECTED_COLOR
          : colorKey
          ? resolveColor(p.scores ?? {}, colorKey, allCategoricalValues[colorKey] ?? [])
          : DEFAULT_COLOR,
      );

      // Labeled-pool halo (border).
      const isLabeled = showLabeledPool && labeledSnippetIds.has(p.snippet_id);
      g.lineWidths.push(isLabeled ? 2 : 0);
      g.lineColors.push(isLabeled ? LABELED_BORDER_COLOR : "rgba(0,0,0,0)");
    });

    const visibleTraces = Array.from(byLabel.entries()).map(([label, g]) => ({
      type: "scatter" as const,
      mode: "markers" as const,
      name: label,
      x: g.xs,
      y: g.ys,
      customdata: g.ids,
      marker: {
        color: g.colors,
        size: g.sizes,
        opacity: 0.88,
        line: { width: g.lineWidths, color: g.lineColors },
      },
      hovertemplate: `<b>${label}</b><br>Snippet #%{customdata}<extra></extra>`,
    }));

    const base = hiddenTrace ? [hiddenTrace, ...visibleTraces] : visibleTraces;
    return backgroundTrace ? [backgroundTrace, ...base] : base;
  }, [filtered, selectedSnippetId, colorKey, allCategoricalValues, fpvData, method, visMode, labeledSnippetIds, showLabeledPool]);

  const handlePlotClick = (event: any) => {
    if (!allowPointClick) return;
    const pt = event.points?.[0];
    if (pt?.customdata !== undefined) {
      dispatch(setSelectedSnippet(pt.customdata as number));
    }
  };

  // ── Phase guard: hide entire view when phase says so ─────────────────────
  if (visMode === "hidden") return null;

  const visibleCount = filtered.filter((f) => f.visible).length;
  const isWaitingForRetrain = predictions.length > 0 && projectionPredictions.length === 0;
  const hasAnyTraces = traces.length > 0;

  const showFilterPanel = visibilityMode !== "disabled" || colorMode !== "disabled";

  return (
    <div className="flex flex-col h-full">
      {showFilterPanel && (
        <ALFilterPanel
          filters={alFilters}
          phaseVisibilityMode={visibilityMode}
          phaseColorMode={colorMode}
          allowedVisibilityProperties={allowedVisProps}
          allowedColorProperties={allowedColorProps}
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
          onColorKeyChange={(key) =>
            dispatch(setColorFilter({ propertyKey: key }))
          }
          allCategoricalValues={allCategoricalValues}
          visibilityRangeOverride={visRangeOverride ?? undefined}
        />
      )}

      {/* ── Secondary controls ────────────────────────────────────────── */}
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

        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 font-ibm-sans">Projection</span>
          <Select
            size="small"
            value={method}
            onChange={(v) => setMethod(v)}
            style={{ width: 120 }}
          >
            <Option value="umap">UMAP</Option>
            <Option value="pca">PCA</Option>
            <Option value="tsne">t-SNE</Option>
            <Option value="isomap">Isomap</Option>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-wrap ml-auto">
          <span className="text-xs text-gray-400 font-ibm-sans">
            <strong>{visibleCount}</strong> / <strong>{plotPoints.length}</strong> visible
          </span>

          {showLabeledPool && labeledSnippetIds.size > 0 && (
            <Tag color="default" className="text-xs">
              {labeledSnippetIds.size} labeled
            </Tag>
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
              {method.toUpperCase()}
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

      {/* ── Plot area ─────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {hasOverlayPredictions && rawOverlayPredictions.some((p) => !p.scores) && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-ibm-sans shadow-sm pointer-events-none">
            <ExperimentOutlined className="text-blue-400" />
            Filter scores are missing — backend scores not yet available
          </div>
        )}

        {!hasAnyTraces ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            {fpvLoading
              ? "Loading projection…"
              : fpvError
              ? "Projection not available yet — it’s prepared after embeddings finish (or generate it now)."
              : "Select a dataset and generate embeddings to see the projection."}
          </div>
        ) : visibleCount === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            No points in selected range — adjust the visibility filter
          </div>
        ) : visMode === "whole_dataset" && fpvError ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
            Projection not available yet — it will appear once the embedding job finishes (FPV is cached).
          </div>
        ) : (
          <Plot
            data={traces}
            layout={{
              autosize: true,
              margin: { l: 30, r: 10, t: 10, b: 30 },
              showlegend: true,
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
        )}
      </div>
    </div>
  );
};
