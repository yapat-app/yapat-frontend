/** ProjectionView — phase-aware 2D feature projection (orchestrator). */

import React, { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { Spin } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
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
import { ALFilterPanel } from "../ALFilterPanel";
import { ScoreHistogramPanel } from "../ScoreHistogramPanel";
import { visualisationsApi } from "../../../services/visualisationsApi";
import { usePhaseConfig } from "../../../studyPhases";
import { studyLogger, usePanelDwell } from "../../../studyLogging";
import { isProjectionNotReadyMessage, type PlotPoint, type ProjectionMethod } from "./fpvHelpers";
import { useFpvData } from "./useFpvData";
import { useLabeledPool } from "./useLabeledPool";
import { useProjectionTraces } from "./useProjectionTraces";
import { ProjectionToolbar } from "./ProjectionToolbar";
import { ProjectionMethodPanel } from "./ProjectionMethodPanel";
import { useRecordingLocations } from "../../../pages/annotationHub/useRecordingLocations";
import { useRecordingDateTimes } from "../../../pages/annotationHub/useRecordingDateTimes";
import { dateStringToEpochDay } from "../../../pages/annotationHub/dateTimeFilterHelpers";
import { useSnippetRecordingIds } from "../../../pages/annotationHub/useSnippetRecordingIds";

/** Minimal structural type for the Plotly click/hover events we consume. */
type PlotlyPointEvent = {
  points?: Array<{ customdata?: unknown; curveNumber?: number }>;
};

export interface ProjectionThumbnailData {
  thumbnailPoints: Array<{ p: PlotPoint; coord: [number, number]; visible: boolean }>;
  fpvCoordsBySnippetForMethod: Partial<Record<ProjectionMethod, Record<number, [number, number]>>> | null;
  selectedSnippetId: number | null;
  selectedCoordByMethod: Partial<Record<ProjectionMethod, [number, number]>> | null;
  allActualLabels: string[];
  loadingMethods: Set<ProjectionMethod>;
  fpvLoading: boolean;
}

/**
 * Sidebar client filters, mirrored from PredictionFeed's pipeline so the
 * projection hides exactly the points the feed hides.
 */
export interface ProjectionClientFilters {
  annotationStatus: "any" | "annotated" | "unannotated";
  locations: string[];
  dateRange: [number, number] | null;
  timeRange: [number, number] | null;
  labelScope: string[];
}

interface ProjectionViewProps {
  /** When provided externally, hides the internal method panel and uses this value. */
  projectionMethod?: ProjectionMethod;
  onProjectionMethodChange?: (m: ProjectionMethod) => void;
  /** Called with thumbnail data so a parent can render its own method selector. */
  onThumbnailData?: (data: ProjectionThumbnailData) => void;
  /** When provided, points failing these filters render as hidden (grey). */
  clientFilters?: ProjectionClientFilters;
}

export const ProjectionView: React.FC<ProjectionViewProps> = ({
  projectionMethod: externalMethod,
  onProjectionMethodChange,
  onThumbnailData,
  clientFilters,
}) => {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();

  // Track Shift key state via window listeners — more reliable than reading
  // event.event?.shiftKey from Plotly, which loses the modifier on the 3rd+
  // click when Plotly has consumed the event for zoom/select behaviour.
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
    feedbackCount,
    retrainLoading,
    selectedDatasetId,
    embeddingModelId,
    snippetSetId,
    feedSource,
    feedbacks,
  } = useAppSelector((state) => state.al);
  const isClassicFeed = feedSource === "classic";

  const [internalMethod, setInternalMethod] = useState<ProjectionMethod>("pca");
  const method = externalMethod ?? internalMethod;
  const setMethod = (m: ProjectionMethod) => {
    setInternalMethod(m);
    onProjectionMethodChange?.(m);
  };

  // Dwell tracking for the visualisation panel.
  usePanelDwell("visualization");

  const visMode = phase.visualization.mode;
  const visibilityMode = phase.visualization.visibilityFilter.mode;
  const allowedVisProps = phase.visualization.visibilityFilter.allowedProperties;
  const defaultVisKey = phase.visualization.visibilityFilter.defaultPropertyKey ?? null;
  const visSliderStyle = phase.visualization.visibilityFilter.sliderStyle ?? "range";
  const fixedVisValue = phase.visualization.visibilityFilter.fixedValue ?? 0;
  const showLabeledPool = phase.visualization.showLabeledPool;
  const allowPointClick = phase.visualization.allowPointClick;
  const histogramStyle = phase.ui.histogramStyle ?? "embedded";

  const dimRedMethods: Array<{ key: ProjectionMethod; label: string }> = [
    { key: "tsne", label: "t‑SNE" },
    { key: "umap", label: "UMAP" },
    { key: "pca", label: "PCA" },
    { key: "isomap", label: "Isomap" },
  ];

  const rawOverlayPredictions =
    projectionPredictions.length > 0 ? projectionPredictions : predictions;
  const hasOverlayPredictions = rawOverlayPredictions.length > 0;

  // ── Phase-change filter reset ──────────────────────────────────────────────

  useEffect(() => {
    const visAllowed = allowedVisProps as readonly string[];
    if (visibilityMode === "disabled") {
      dispatch(setVisibilityFilter({ propertyKey: null, range: [0, 1] }));
      dispatch(setVisibilityKeys([]));
    } else if (visibilityMode === "fixed") {
      dispatch(setVisibilityKeys([]));
      dispatch(setVisibilityFilter({ propertyKey: defaultVisKey, range: [fixedVisValue, 1] }));
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

  // ── FPV data hook ──────────────────────────────────────────────────────────

  const {
    fpvPoints,
    projectionsByMethod,
    fpvLoading,
    fpvError,
    fpvGenerateLoading,
    loadingMethods,
    effectiveEmbeddingModelId,
    effectiveSnippetSetId,
    handleGenerateNow,
  } = useFpvData({
    selectedDatasetId,
    embeddingModelId,
    snippetSetId,
    visMode,
    method,
  });

  // ── Labeled pool hook ──────────────────────────────────────────────────────

  const { labeledSnippetIds, labelsBySnippet } = useLabeledPool({
    selectedDatasetId,
    snippetSetId,
    showLabeledPool,
    isClassicFeed,
    feedbacks,
    lastRetrainJob,
    feedbackCount,
  });

  // ── Client filters → extra visibility predicate ────────────────────────
  // Mirrors PredictionFeed's client filter pipeline (annotation status,
  // species scope, location) so the projection and the feed stay in sync.

  const wantsLocationFilter = (clientFilters?.locations.length ?? 0) > 0;
  const wantsDateTimeFilter = Boolean(clientFilters?.dateRange || clientFilters?.timeRange);
  const { locationByRecordingId: recordingLocationById, loading: recordingLocationsLoading } =
    useRecordingLocations(wantsLocationFilter ? selectedDatasetId : null);
  const recordingDateTimeById = useRecordingDateTimes(
    wantsDateTimeFilter ? selectedDatasetId : null,
  );
  // Covers every snippet in the ready snippet set (i.e. the whole-dataset FPV
  // background), not just the small overlay/feed predictions — the FPV API
  // response has no recording_id per point, so without this most background
  // points would have no known recording (hence no known location/date/time)
  // and get hidden as soon as a location or date/time filter is active.
  const wantsRecordingScopedFilter = wantsLocationFilter || wantsDateTimeFilter;
  const { recordingIdBySnippetId: snippetSetRecordingIdBySnippet, loading: snippetSetIdsLoading } =
    useSnippetRecordingIds(
      wantsRecordingScopedFilter ? selectedDatasetId : null,
      wantsRecordingScopedFilter ? effectiveSnippetSetId : null,
    );
  // Both maps are fetched lazily (only once a location filter is picked), so
  // there's a brief window right after the first selection where they're
  // still loading. Treat that window as "don't hide anything yet" — otherwise
  // every point looks like it vanished until the fetches resolve.
  const locationDataLoading = recordingLocationsLoading || snippetSetIdsLoading;

  const recordingIdBySnippet = useMemo(() => {
    if (!wantsLocationFilter && !wantsDateTimeFilter) return null;
    const map = new Map<number, number>(snippetSetRecordingIdBySnippet);
    for (const p of rawOverlayPredictions) {
      if (typeof p.recording_id === "number") map.set(p.snippet_id, p.recording_id);
    }
    return map;
  }, [wantsLocationFilter, wantsDateTimeFilter, rawOverlayPredictions, snippetSetRecordingIdBySnippet]);

  const wantsScopeFilter = (clientFilters?.labelScope.length ?? 0) > 0;
  const predictedLabelsBySnippet = useMemo(() => {
    if (!wantsScopeFilter) return null;
    const map = new Map<number, string[]>();
    for (const pt of fpvPoints) {
      if (pt.predicted_labels?.length) map.set(pt.snippet_id, pt.predicted_labels);
    }
    for (const p of rawOverlayPredictions) {
      if (p.predicted_labels?.length) map.set(p.snippet_id, p.predicted_labels);
    }
    return map;
  }, [wantsScopeFilter, fpvPoints, rawOverlayPredictions]);

  const extraVisible = useMemo(() => {
    if (!clientFilters) return undefined;
    const { annotationStatus, locations, dateRange, timeRange, labelScope } = clientFilters;
    const locationSet = locations.length > 0 ? new Set(locations) : null;
    const scopeSet = labelScope.length > 0 ? new Set(labelScope) : null;
    if (annotationStatus === "any" && !locationSet && !dateRange && !timeRange && !scopeSet) {
      return undefined;
    }

    return (snippetId: number): boolean => {
      if (annotationStatus !== "any") {
        const hasLabel =
          Boolean(feedbacks[snippetId]) ||
          (labelsBySnippet[snippetId]?.length ?? 0) > 0;
        if (hasLabel !== (annotationStatus === "annotated")) return false;
      }
      if (scopeSet) {
        const labels = predictedLabelsBySnippet?.get(snippetId);
        if (!labels || !labels.some((l) => scopeSet.has(l))) return false;
      }
      if (locationSet && !locationDataLoading) {
        const recId = recordingIdBySnippet?.get(snippetId);
        if (recId === undefined) return false;
        const location = recordingLocationById.get(recId);
        if (location === undefined || !locationSet.has(location)) return false;
      }
      if (dateRange || timeRange) {
        const recId = recordingIdBySnippet?.get(snippetId);
        if (recId === undefined) return false;
        const dt = recordingDateTimeById.get(recId);
        if (!dt) return false;
        if (dateRange) {
          const epochDay = dateStringToEpochDay(dt.date);
          if (epochDay < dateRange[0] || epochDay > dateRange[1]) return false;
        }
        if (timeRange) {
          if (dt.timeSeconds < timeRange[0] || dt.timeSeconds > timeRange[1]) return false;
        }
      }
      return true;
    };
  }, [
    clientFilters,
    feedbacks,
    labelsBySnippet,
    predictedLabelsBySnippet,
    recordingIdBySnippet,
    recordingLocationById,
    recordingDateTimeById,
    locationDataLoading,
  ]);

  // ── Visibility range override (async API fetch) ────────────────────────────

  const [visRangeOverride, setVisRangeOverride] = useState<{
    min: number;
    max: number;
    step: number;
  } | null>(null);

  const visKey = alFilters.visibility.propertyKey;
  useEffect(() => {
    if (visibilityMode !== "single" || !visKey) {
      setVisRangeOverride(null);
      return;
    }
    let cancelled = false;
    visualisationsApi
      .getVisRange(visKey)
      .then((r) => {
        if (!cancelled) setVisRangeOverride({ min: r.min_value, max: r.max_value, step: r.step });
      })
      .catch(() => {
        if (!cancelled) setVisRangeOverride(null);
      });
    return () => {
      cancelled = true;
    };
  }, [visKey, visibilityMode]);

  // ── Projection traces hook ─────────────────────────────────────────────────

  const {
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
  } = useProjectionTraces({
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
    extraVisible,
  });

  // ── Expose thumbnail data to parent when an external method is provided ──────

  const selectedSnippetId = selectedSnippetIds[0] ?? null;

  useEffect(() => {
    if (!onThumbnailData) return;
    onThumbnailData({
      thumbnailPoints,
      fpvCoordsBySnippetForMethod,
      selectedSnippetId,
      selectedCoordByMethod,
      allActualLabels: allCategoricalValues.actual_label ?? [],
      loadingMethods,
      fpvLoading,
    });
  }, [
    onThumbnailData,
    thumbnailPoints,
    fpvCoordsBySnippetForMethod,
    selectedSnippetId,
    selectedCoordByMethod,
    allCategoricalValues.actual_label,
    loadingMethods,
    fpvLoading,
  ]);

  // ── Score values for histogram (active visibility property) ──────────────

  const visibilityScoreValues = useMemo<number[]>(() => {
    const key = alFilters.visibility.propertyKey;
    if (!key || enrichedPlotPoints.length === 0) return [];
    const out: number[] = [];
    for (const p of enrichedPlotPoints) {
      const v = p.scores?.[key as keyof typeof p.scores];
      if (typeof v === "number" && Number.isFinite(v)) out.push(v);
    }
    return out;
  }, [alFilters.visibility.propertyKey, enrichedPlotPoints]);

  // ── Auto-select first point (single_card_on_select phases) ────────────────

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

  // ── Derived booleans ───────────────────────────────────────────────────────

  const isMissingProjection = isProjectionNotReadyMessage(fpvError ?? "");
  const canGenerateNow = Boolean(selectedDatasetId && effectiveEmbeddingModelId);
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
    (fpvGenerateLoading || fpvLoading || loadingMethods.has(method) || !activeProjectionReady);
  // "embedded"   → ALFilterPanel with histogram inside
  // "standalone" → ScoreHistogramPanel above projection
  // "none"       → filter UI lives outside (e.g. Annotation Hub sidebar); show nothing here
  const showEmbeddedFilter = visibilityMode !== "disabled" && histogramStyle === "embedded";
  const showStandaloneHistogram = visibilityMode !== "disabled" && histogramStyle === "standalone";

  // Log a hover only after the cursor dwells on a point for ≥ 2s.
  // Declared before the early return below — hooks must run unconditionally.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (visMode === "hidden") return null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const handlePlotClick = (event: PlotlyPointEvent) => {
    if (!allowPointClick) return;
    const pt = event.points?.[0];
    if (pt?.customdata === undefined) return;

    const hasHiddenTrace = Boolean(filtered.some((f) => !f.visible));
    if (hasHiddenTrace && pt.curveNumber === 0) return;

    const snippetId = pt.customdata as number;
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

  return (
    <div data-tour="projection" className="flex flex-col h-full">
      {showStandaloneHistogram && (
        <ScoreHistogramPanel
          enrichedPlotPoints={enrichedPlotPoints}
          filtered={filtered}
          allowedProperties={allowedVisProps}
          visibilityMode={visibilityMode}
          alFilters={alFilters}
          onVisibilityKeyChange={(key) => {
            if (key) studyLogger.log("histogram_property_select", { property: key });
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

      {showEmbeddedFilter && (
        <ALFilterPanel
          filters={alFilters}
          phaseVisibilityMode={visibilityMode}
          phaseColorMode="disabled"
          allowedVisibilityProperties={allowedVisProps}
          allowedColorProperties={[]}
          defaultVisibilityKey={defaultVisKey}
          visibilitySliderStyle={visSliderStyle}
          visibilityScoreValues={visibilityScoreValues}
          onVisibilityKeyChange={(key) => {
            if (key) studyLogger.log("histogram_property_select", { property: key });
            dispatch(setVisibilityFilter({ propertyKey: key, range: [0, 1] }));
          }}
          onVisibilityRangeChange={(range) => {
            studyLogger.log("visibility_threshold_change", {
              property: alFilters.visibility.propertyKey ?? "",
              value: range[0],
            });
            dispatch(setVisibilityFilter({ range }));
          }}
          onResetVisibility={() => dispatch(resetVisibilityFilter())}
          onMultiVisibilityChange={(keys) => dispatch(setVisibilityKeys(keys))}
          onMultiVisibilityRangeChange={(key, range) => {
            studyLogger.log("visibility_range_change", {
              property: key,
              min: range[0],
              max: range[1],
            });
            dispatch(setVisibilityRangeFor({ key, range }));
          }}
          onColorKeyChange={() => {}}
          allCategoricalValues={allCategoricalValues}
          visibilityRangeOverride={visRangeOverride ?? undefined}
        />
      )}

      <ProjectionToolbar
        visibleCount={visibleCount}
        totalCount={plotPoints.length}
        labeledCount={labeledSnippetIds.size}
        showLabeledPool={showLabeledPool}
        actualLabelLegend={actualLabelLegend}
        allActualLabels={allCategoricalValues.actual_label ?? []}
        visMode={visMode}
        fpvLoading={fpvLoading}
        fpvError={fpvError}
        isMissingProjection={isMissingProjection}
        canGenerateNow={canGenerateNow}
        fpvGenerateLoading={fpvGenerateLoading}
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
            dimRedMethods={dimRedMethods}
            fpvLoading={fpvLoading}
            loadingMethods={loadingMethods}
            fpvCoordsBySnippetForMethod={fpvCoordsBySnippetForMethod}
            selectedSnippetId={selectedSnippetId}
            selectedCoordByMethod={selectedCoordByMethod}
            thumbnailPoints={thumbnailPoints}
            allActualLabels={allCategoricalValues.actual_label ?? []}
            onMethodChange={setMethod}
          />
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

          {wantsLocationFilter && locationDataLoading && (
            <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-ibm-sans shadow-sm pointer-events-none">
              <Spin size="small" />
              Applying location filter…
            </div>
          )}

          {!isFpvPlotLoading && !hasAnyTraces ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
              {fpvError
                ? "Projection not available yet — it's prepared after embeddings finish (or generate it now)."
                : "Select a dataset and generate embeddings to see the projection."}
            </div>
          ) : !isFpvPlotLoading && hasAnyTraces && visibleCount === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
              No points in selected range — adjust the visibility filter
            </div>
          ) : !isFpvPlotLoading && visMode === "whole_dataset" && fpvError ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm font-ibm-sans">
              Projection not available yet — it will appear once the embedding job finishes (FPV is
              cached).
            </div>
          ) : !isFpvPlotLoading && activeProjectionReady ? (
            <Plot
              data={traces}
              layout={{
                autosize: true,
                // Stable uirevision tells Plotly to keep the user's current zoom/pan
                // when traces update (e.g. after a point click or filter change).
                uirevision: "stable",
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
              onHover={handlePlotHover}
              onUnhover={handlePlotUnhover}
              config={{ displayModeBar: false, responsive: true }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
