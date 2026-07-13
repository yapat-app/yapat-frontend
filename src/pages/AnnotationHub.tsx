/**
 * AnnotationHub — the Annotation Hub page at /annotate.
 *
 * - Persistent left sidebar (272px) for Filters + Model-derived-score sliders
 * - Simplified top toolbar: Dataset selector · Generate Feed · Status tags
 * - Projection method as a segmented control at the top of the scatter plot
 * - "Find similar" icon button on every snippet card
 */

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Select, Button, Tag, Tooltip, Spin } from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { NavigationBar } from "../components/NavigationBar";
import { useAppDispatch, useAppSelector } from "../hooks";
import { clearSavedFeed } from "../redux/features/alSlice";
import type { AnnotateMode } from "./annotationHub/types";
import { useHubDatasets } from "./annotationHub/useHubDatasets";
import { useHubALSession } from "./annotationHub/useHubALSession";
import { ALInferenceConfigModal } from "./annotationHub/ALInferenceConfigModal";
import { AnnotationHubSidebar } from "./annotationHub/AnnotationHubSidebar";
import { Workspace } from "./annotationHub/Workspace";
import { ResizableSplit } from "../components/layout/ResizableSplit";
import { usePhaseConfig } from "../studyPhases";
import { datasetApi } from "../services/api";
import { useQuickLabelList } from "../hooks/useQuickLabelList";

const { Option } = Select;

export const AnnotationHub: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAppSelector((s) => s.auth);
  const { allDatasets, awaitingHubDatasetBootstrap } = useHubDatasets(
    searchParams,
    setSearchParams,
    user,
  );

  const [mode, setMode] = useState<AnnotateMode>(() => {
    const raw = searchParams.get("mode");
    return raw === "al" ||
      raw === "validate" ||
      raw === "similarity" ||
      raw === "filter"
      ? raw
      : "random";
  });

  useEffect(() => {
    if (!searchParams.has("mode")) return;
    const params = new URLSearchParams(searchParams);
    // params.delete("mode");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const phase = usePhaseConfig();

  const al = useHubALSession(mode, searchParams, setSearchParams, {
    treatAllModesAsAl: true,
  });
  const [filterAnnotationStatus, setFilterAnnotationStatus] = useState<
    "any" | "annotated" | "unannotated"
  >("any");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [recordingLocations, setRecordingLocations] = useState<string[]>([]);
  const [filterDateRange, setFilterDateRange] = useState<
    [number, number] | null
  >(null);
  const [filterTimeRange, setFilterTimeRange] = useState<
    [number, number] | null
  >(null);
  // Fixed "zoom window" the date-range histogram bins/displays against, set
  // only by the calendar picker (or a reset) — NOT by the histogram's own
  // slider drags, so the backdrop stays put while the user narrows their
  // selection within it. Null means "not zoomed, show the full domain."
  const [dateZoomDomain, setDateZoomDomain] = useState<[number, number] | null>(
    null,
  );
  const handleCalendarDateRangeChange = (r: [number, number] | null) => {
    setFilterDateRange(r);
    setDateZoomDomain(r);
  };
  const quickLabelList = useQuickLabelList();

  useEffect(() => {
    if (al.selectedDatasetId === null) return;

    let cancelled = false;
    void datasetApi
      .getRecordingLocations(al.selectedDatasetId)
      .then((res) => {
        if (!cancelled) setRecordingLocations(res.locations ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecordingLocations([]);
      });

    return () => {
      cancelled = true;
    };
  }, [al.selectedDatasetId]);

  const visibleRecordingLocations =
    al.selectedDatasetId === null ? [] : recordingLocations;

  // ── Find Similar handler ─────────────────────────────────────────────────
  const handleFindSimilar = useCallback(() => {
    setMode("similarity");
  }, [setMode]);

  if (awaitingHubDatasetBootstrap) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
        <NavigationBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Spin size="large" />
          <p className="text-sm text-gray-500 font-ibm-sans">
            Loading workspace…
          </p>
        </div>
      </div>
    );
  }

  const feedActionLabel =
    al.predictions.length > 0 ? "Edit Feed" : "Generate Feed";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
      <NavigationBar />

      {/* ── Simplified toolbar ── */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-200 bg-white shrink-0 flex-wrap">
        {/* Dataset selector */}
        <div className="flex items-center gap-2">
          <DatabaseOutlined className="text-gray-400 text-sm" />
          <Select
            placeholder="Select dataset"
            value={al.selectedDatasetId ?? undefined}
            onChange={al.handleDatasetChange}
            style={{ width: 200 }}
            size="middle"
            showSearch
            optionFilterProp="children"
          >
            {allDatasets.map((d) => (
              <Option key={d.id} value={d.id}>
                {d.name}
              </Option>
            ))}
          </Select>
        </div>

        {/* Status tags */}
        <div className="flex items-center gap-2 ml-auto">
          {al.predictions.length > 0 && (
            <>
              <Tooltip title="Total predictions">
                <span className="flex items-center gap-1 text-xs font-ibm-sans text-gray-500">
                  <BulbOutlined className="text-blue-400" />
                  {al.predictions.length} predictions
                </span>
              </Tooltip>
              <Tooltip title="Feedbacks since last retrain">
                <span className="flex items-center gap-1 text-xs font-ibm-sans text-gray-500">
                  <CheckCircleOutlined className="text-green-500" />
                  {al.feedbackCountDisplay.shown}/{al.retrainThreshold}
                  {al.feedbackCountDisplay.pending && (
                    <Tag color="gold" className="ml-1 text-[10px]">
                      Training…
                    </Tag>
                  )}
                </span>
              </Tooltip>
              {al.lastRetrainJob && (
                <Tag
                  color={
                    (
                      {
                        PENDING: "default",
                        RUNNING: "processing",
                        COMPLETED: "success",
                        FAILED: "error",
                      } as Record<string, string>
                    )[al.lastRetrainJob.status] ?? "default"
                  }
                  className="text-xs"
                >
                  Model: {al.lastRetrainJob.status}
                </Tag>
              )}
            </>
          )}
          {al.isRestoredFeed && (
            <Tooltip title="Showing saved feed from a previous session. Click to clear.">
              <Tag
                icon={<HistoryOutlined />}
                color="blue"
                closable
                onClose={() => dispatch(clearSavedFeed())}
                className="cursor-pointer text-xs"
              >
                Saved · {al.savedFeedLabel}
              </Tag>
            </Tooltip>
          )}
          {al.inferenceLoading && <Spin size="small" />}
        </div>
      </div>

      {/* ── Main content ── */}
      {(() => {
        const workspaceArea = (
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden h-full">
            {al.isRestoredFeed && !al.selectedDatasetId && (
              <div className="mx-4 mt-3 shrink-0 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-3 text-sm font-ibm-sans text-blue-800">
                <HistoryOutlined />
                <span>
                  Showing saved feed from <strong>{al.savedFeedLabel}</strong> —
                  select the original dataset to run new inference.
                </span>
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => dispatch(clearSavedFeed())}
                  className="ml-auto"
                >
                  Clear
                </Button>
              </div>
            )}

            {!al.selectedDatasetId && !al.isRestoredFeed && (
              <div className="flex flex-1 items-center justify-center flex-col gap-3 text-gray-400">
                <DatabaseOutlined style={{ fontSize: 48 }} />
                <p className="text-lg font-ibm-sans">
                  Select a dataset to start{" "}
                  {mode === "validate" ? "Validate" : "Active Learning"}
                </p>
                <p className="text-sm font-ibm-sans">
                  Then click "Generate Feed" to load predictions.
                </p>
              </div>
            )}

            {(al.selectedDatasetId || al.isRestoredFeed) && (
              <Workspace
                onFindSimilar={
                  phase.ui.showFindSimilarButton ? handleFindSimilar : undefined
                }
                filterAnnotationStatus={filterAnnotationStatus}
                filterLocations={filterLocations}
                filterDateRange={filterDateRange}
                filterTimeRange={filterTimeRange}
                localLabelScope={al.localLabelScope}
                feedActionLabel={feedActionLabel}
                feedActionLoading={al.inferenceLoading}
                feedActionDisabled={!al.selectedDatasetId}
                onFeedAction={al.openInferenceModal}
                quickLabels={quickLabelList.labels}
                quickLabelsLoading={quickLabelList.loading}
              />
            )}
          </div>
        );

        if (!phase.sidebar.showPane) {
          return (
            <div className="flex flex-1 min-h-0 overflow-hidden">
              {workspaceArea}
            </div>
          );
        }

        return (
          <div className="flex-1 min-h-0 overflow-hidden">
            <ResizableSplit
              mode="left_px"
              initialLeftRatio={0.35}
              minLeftPanelPx={220}
              maxLeftRatio={0.2}
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
              left={
                <AnnotationHubSidebar
                  mode={mode}
                  setMode={setMode}
                  filterAnnotationStatus={filterAnnotationStatus}
                  onFilterAnnotationStatusChange={setFilterAnnotationStatus}
                  filterLocations={filterLocations}
                  onFilterLocationsChange={setFilterLocations}
                  recordingLocations={visibleRecordingLocations}
                  locationsLoading={false}
                  filterDateRange={filterDateRange}
                  onFilterDateRangeChange={setFilterDateRange}
                  dateZoomDomain={dateZoomDomain}
                  onCalendarDateRangeChange={handleCalendarDateRangeChange}
                  filterTimeRange={filterTimeRange}
                  onFilterTimeRangeChange={setFilterTimeRange}
                  localLabelScope={al.localLabelScope}
                  setLocalLabelScope={al.setLocalLabelScope}
                  localMinConfidence={al.localMinConfidence}
                  setLocalMinConfidence={al.setLocalMinConfidence}
                  labelScopeOptions={al.labelScopeOptions}
                  labelScopeLoading={al.labelScopeLoading}
                  showSampleProperties={phase.sidebar.sampleProperties}
                  showModelScores={phase.sidebar.modelScores}
                  showFindSimilar={phase.sidebar.findSimilar}
                  showLabelScope={phase.sidebar.labelScope}
                  onResetFilters={() => {
                    setFilterAnnotationStatus("any");
                    setFilterLocations([]);
                    setFilterDateRange(null);
                    setDateZoomDomain(null);
                    setFilterTimeRange(null);
                    al.setLocalLabelScope([]);
                    al.setLocalMinConfidence(null);
                  }}
                />
              }
              right={workspaceArea}
            />
          </div>
        );
      })()}

      {/* ── Modals ── */}
      <ALInferenceConfigModal
        open={al.alConfigOpen}
        onCancel={() => al.setAlConfigOpen(false)}
        onOk={al.handleOpenALSession}
        checkpoints={al.checkpoints}
        embeddingMethods={al.embeddingMethods}
        embeddingMethodsLoading={al.embeddingMethodsLoading}
        localFamily={al.localFamily}
        setLocalFamily={al.setLocalFamily}
        localK={al.localK}
        setLocalK={al.setLocalK}
        localTopKOnly={al.localTopKOnly}
        setLocalTopKOnly={al.setLocalTopKOnly}
        hasReadySnippetSet={al.hasReadySnippetSet}
        hasGroundTruthMetadata={al.hasGroundTruthMetadata}
        setHasGroundTruthMetadata={al.setHasGroundTruthMetadata}
        trainEmbeddingModelId={al.trainEmbeddingModelId}
        setTrainEmbeddingModelId={al.setTrainEmbeddingModelId}
        trainMetadataPath={al.trainMetadataPath}
        setTrainMetadataPath={al.setTrainMetadataPath}
        trainLabelConfigPath={al.trainLabelConfigPath}
        setTrainLabelConfigPath={al.setTrainLabelConfigPath}
        trainDevice={al.trainDevice}
        setTrainDevice={al.setTrainDevice}
        trainRunInference={al.trainRunInference}
        setTrainRunInference={al.setTrainRunInference}
        isValidateMode={mode === "validate"}
        localMinConfidence={al.localMinConfidence}
        setLocalMinConfidence={al.setLocalMinConfidence}
        localLabelScope={al.localLabelScope}
        setLocalLabelScope={al.setLocalLabelScope}
        labelScopeOptions={al.labelScopeOptions}
        labelScopeLoading={al.labelScopeLoading}
      />
    </div>
  );
};
