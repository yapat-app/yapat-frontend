/**
 * Workspace — the Annotation Hub's main content area, phase-aware.
 *
 * Every phase (P1–P5) renders through this one component. Layout and
 * interactivity are driven entirely by the resolved PhaseConfig: whether the
 * Feature Projection View renders at all, whether its points are clickable,
 * and which Sort fields are available. The feed itself always uses
 * PredictionFeed's blind/scrollable rendering path.
 */

import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import { Tooltip, Button } from "antd";
import { ResizableSplit } from "../../components/layout/ResizableSplit";
import {
  ProjectionView,
  MiniProjection,
  type ProjectionMethod,
  type ProjectionThumbnailData,
} from "../../components/al/ProjectionView";
import { PredictionFeed } from "../../components/al/PredictionFeed";
import { SnippetHeader } from "./SnippetHeader";
import { SortPanel } from "./SortPanel";
import { defaultSortFields } from "./sortPanelHelpers";
import { usePhaseConfig } from "../../studyPhases";
import { studyLogger } from "../../studyLogging";
import type { SortField } from "../../types/sort";

const PROJECTION_METHODS: { key: ProjectionMethod; label: string }[] = [
  { key: "tsne", label: "t-SNE" },
  { key: "umap", label: "UMAP" },
  { key: "pca", label: "PCA" },
  // { key: "isomap", label: "Isomap" },
];

type WorkspaceProps = {
  onFindSimilar?: (snippetId: number) => void;
  filterAnnotationStatus: "any" | "annotated" | "unannotated";
  filterLocations: string[];
  filterDateRange: [number, number] | null;
  filterTimeRange: [number, number] | null;
  localLabelScope: string[];
  /** Feed action button ("Generate Feed" / "Edit Feed") — lives on the feed side. */
  feedActionLabel: string;
  feedActionLoading: boolean;
  feedActionDisabled: boolean;
  onFeedAction: () => void;
  quickLabels: string[];
  quickLabelsLoading: boolean;
};

export const Workspace: React.FC<WorkspaceProps> = ({
  onFindSimilar,
  filterAnnotationStatus,
  filterLocations,
  filterDateRange,
  filterTimeRange,
  localLabelScope,
  feedActionLabel,
  feedActionLoading,
  feedActionDisabled,
  onFeedAction,
  quickLabels,
  quickLabelsLoading,
}) => {
  const phase = usePhaseConfig();
  const [projMethod, setProjMethod] = useState<ProjectionMethod>("pca");
  const [thumbData, setThumbData] = useState<ProjectionThumbnailData | null>(
    null,
  );
  const handleThumbnailData = useCallback((data: ProjectionThumbnailData) => {
    setThumbData(data);
  }, []);
  const handleMethodChange = useCallback(
    (m: ProjectionMethod) => {
      if (m !== projMethod)
        studyLogger.log("projection_method_change", {
          from: projMethod,
          to: m,
        });
      setProjMethod(m);
    },
    [projMethod],
  );

  const [sortFields, setSortFields] = useState<SortField[]>(() =>
    defaultSortFields(phase.sort.nonModel, phase.sort.model),
  );
  const activeSortFields = useMemo(
    () =>
      (sortFields ?? [])
        .filter((f) => !f.disabled)
        .map((f) => ({ property: f.property, direction: f.direction })),
    [sortFields],
  );
  const activeSortFieldsKey = useMemo(
    () => activeSortFields.map((f) => `${f.property}:${f.direction}`).join("|"),
    [activeSortFields],
  );
  const sortLogInitializedRef = useRef(false);
  const sortLogPhaseIdRef = useRef(phase.id);
  const sortLogLastKeyRef = useRef<string | null>(null);
  const sortLogTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (sortLogTimerRef.current !== null) {
      window.clearTimeout(sortLogTimerRef.current);
      sortLogTimerRef.current = null;
    }

    if (!sortLogInitializedRef.current) {
      sortLogInitializedRef.current = true;
      sortLogPhaseIdRef.current = phase.id;
      sortLogLastKeyRef.current = activeSortFieldsKey;
      return;
    }

    if (sortLogPhaseIdRef.current !== phase.id) {
      sortLogPhaseIdRef.current = phase.id;
      sortLogLastKeyRef.current = activeSortFieldsKey;
      return;
    }

    if (sortLogLastKeyRef.current === activeSortFieldsKey) return;

    const snapshotFields = activeSortFields;
    const snapshotKey = activeSortFieldsKey;

    sortLogTimerRef.current = window.setTimeout(() => {
      sortLogTimerRef.current = null;
      if (sortLogLastKeyRef.current === snapshotKey) return;
      sortLogLastKeyRef.current = snapshotKey;
      studyLogger.log("feed_sort_change", {
        action: "sort_change",
        panel: "prediction_feed",
        activeCount: snapshotFields.length,
        fields: snapshotFields,
      });
    }, 500);

    return () => {
      if (sortLogTimerRef.current !== null) {
        window.clearTimeout(sortLogTimerRef.current);
        sortLogTimerRef.current = null;
      }
    };
  }, [activeSortFields, activeSortFieldsKey, phase.id]);
  // Reset sort fields when the phase's capabilities change, following React's
  // "adjust state during render" pattern (avoids the extra effect-triggered
  // render an equivalent useEffect would cause).
  const [sortFieldsPhaseId, setSortFieldsPhaseId] = useState(phase.id);
  if (phase.id !== sortFieldsPhaseId) {
    setSortFieldsPhaseId(phase.id);
    setSortFields(defaultSortFields(phase.sort.nonModel, phase.sort.model));
  }

  // Same filters the feed applies — passed to the projection so both stay in sync.
  const projectionClientFilters = useMemo(
    () => ({
      annotationStatus: filterAnnotationStatus,
      locations: filterLocations,
      dateRange: filterDateRange,
      timeRange: filterTimeRange,
      labelScope: localLabelScope,
    }),
    [
      filterAnnotationStatus,
      filterLocations,
      filterDateRange,
      filterTimeRange,
      localLabelScope,
    ],
  );

  const rightPanel = (
    <div data-tour="feed" className="h-full flex flex-col overflow-hidden bg-[#f7fafc]">
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-white">
        <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 leading-none">
          Feed
        </h2>
        <Button
          type="primary"
          size="small"
          loading={feedActionLoading}
          disabled={feedActionDisabled}
          onClick={onFeedAction}
        >
          {feedActionLabel}
        </Button>
      </div>
      <SortPanel
        fields={sortFields}
        onChange={setSortFields}
        allowNonModel={phase.sort.nonModel}
        allowModel={phase.sort.model}
        disabled={phase.sort.disabled}
      />
      <SnippetHeader onFindSimilar={onFindSimilar} />
      <div className="flex-1 overflow-hidden">
        <PredictionFeed
          onFindSimilar={onFindSimilar}
          hideCardHeader
          sortFields={sortFields}
          enableClientFilters
          filterAnnotationStatus={filterAnnotationStatus}
          filterLocations={filterLocations}
          filterDateRange={filterDateRange}
          filterTimeRange={filterTimeRange}
          localLabelScope={localLabelScope}
          quickLabels={quickLabels}
          quickLabelsLoading={quickLabelsLoading}
        />
      </div>
    </div>
  );

  const fpvVisible = phase.visualization.mode !== "hidden";
  if (!fpvVisible) {
    return rightPanel;
  }

  return (
    <ResizableSplit
      mode="right_px"
      initialRightRatio={0.45}
      minRightPanelPx={400}
      maxRightPanelPx={4000}
      maxRightRatio={0.55}
      left={
        <div className="flex flex-col h-full border-r border-gray-200 overflow-hidden">
          <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-100 bg-white">
            <Tooltip
              title={
                phase.visualization.allowPointClick
                  ? "Click a point to inspect that snippet"
                  : "Projection view (view only)"
              }
            >
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 leading-none cursor-default">
                Feature Projection
              </h2>
            </Tooltip>
          </div>

          <div
            data-tour="projection-methods"
            className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-white overflow-x-auto"
          >
            {PROJECTION_METHODS.map((m) => {
              const isActive = m.key === projMethod;
              const hasProj = Boolean(
                thumbData?.fpvCoordsBySnippetForMethod?.[m.key],
              );
              const isLoadingThumb =
                Boolean(thumbData?.loadingMethods.has(m.key)) && !hasProj;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleMethodChange(m.key)}
                  disabled={thumbData?.fpvLoading && isActive}
                  className={[
                    "shrink-0 text-left rounded-lg border px-1.5 py-1.5 transition-all",
                    isActive
                      ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                      : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300",
                    !hasProj && !isLoadingThumb
                      ? "opacity-50 cursor-not-allowed"
                      : "",
                  ].join(" ")}
                >
                  <div className="w-22.5 h-13 rounded-md bg-linear-to-br from-gray-50 to-gray-100 border border-gray-200 overflow-hidden relative">
                    <MiniProjection
                      points={thumbData?.thumbnailPoints ?? []}
                      coordsBySnippet={
                        thumbData?.fpvCoordsBySnippetForMethod?.[m.key] ?? null
                      }
                      selectedSnippetId={thumbData?.selectedSnippetId ?? null}
                      selectedCoord={
                        thumbData?.selectedCoordByMethod?.[m.key] ?? null
                      }
                      allActualLabels={thumbData?.allActualLabels ?? []}
                      loading={isLoadingThumb}
                    />
                  </div>
                  <div
                    className={[
                      "mt-1 text-center text-[11px] font-ibm-sans",
                      isActive
                        ? "text-blue-700 font-semibold"
                        : "text-gray-600",
                    ].join(" ")}
                  >
                    {m.label}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-hidden">
            <ProjectionView
              projectionMethod={projMethod}
              onProjectionMethodChange={setProjMethod}
              onThumbnailData={handleThumbnailData}
              clientFilters={projectionClientFilters}
            />
          </div>
        </div>
      }
      right={rightPanel}
    />
  );
};

Workspace.displayName = "Workspace";
