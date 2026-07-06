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

  const rawMode = searchParams.get("mode");
  const mode: AnnotateMode =
    rawMode === "al" ||
    rawMode === "validate" ||
    rawMode === "similarity" ||
    rawMode === "filter"
      ? rawMode
      : "random";

  const setMode = useCallback(
    (next: AnnotateMode) => {
      // Clone existing params so `phase` (and anything else) is preserved —
      // rebuilding a fresh {mode, dataset_id} object dropped the phase param.
      const params = new URLSearchParams(searchParams);
      params.set("mode", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const phase = usePhaseConfig();

  const al = useHubALSession(mode, searchParams, setSearchParams, {
    treatAllModesAsAl: true,
  });
  const [filterAnnotationStatus, setFilterAnnotationStatus] =
    useState<"any" | "annotated" | "unannotated">("any");
  const [filterLocations, setFilterLocations] = useState<string[]>([]);
  const [recordingLocations, setRecordingLocations] = useState<string[]>([]);
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
  const handleFindSimilar = useCallback(
    () => {
      setMode("similarity");
    },
    [setMode],
  );

  if (awaitingHubDatasetBootstrap) {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
        <NavigationBar />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Spin size="large" />
          <p className="text-sm text-gray-500 font-ibm-sans">Loading workspace…</p>
        </div>
      </div>
    );
  }

  const feedActionLabel = al.predictions.length > 0 ? "Edit Feed" : "Generate Feed";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
      <NavigationBar />

      {/* ── Simplified toolbar ── */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
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
              <Option key={d.id} value={d.id}>{d.name}</Option>
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
                    <Tag color="gold" className="ml-1 text-[10px]">Training…</Tag>
                  )}
                </span>
              </Tooltip>
              {al.lastRetrainJob && (
                <Tag
                  color={
                    ({
                      PENDING: "default",
                      RUNNING: "processing",
                      COMPLETED: "success",
                      FAILED: "error",
                    } as Record<string, string>)[al.lastRetrainJob.status] ?? "default"
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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar — Filters + Model scores */}
        <AnnotationHubSidebar
          mode={mode}
          setMode={setMode}
          filterAnnotationStatus={filterAnnotationStatus}
          onFilterAnnotationStatusChange={setFilterAnnotationStatus}
          filterLocations={filterLocations}
          onFilterLocationsChange={setFilterLocations}
          recordingLocations={visibleRecordingLocations}
          locationsLoading={false}
          localLabelScope={al.localLabelScope}
          setLocalLabelScope={al.setLocalLabelScope}
          localMinConfidence={al.localMinConfidence}
          setLocalMinConfidence={al.setLocalMinConfidence}
          labelScopeOptions={al.labelScopeOptions}
          labelScopeLoading={al.labelScopeLoading}
          showSampleProperties={phase.sidebar.sampleProperties}
          showModelScores={phase.sidebar.modelScores}
          onResetFilters={() => {
            setFilterAnnotationStatus("any");
            setFilterLocations([]);
            al.setLocalLabelScope([]);
            al.setLocalMinConfidence(null);
          }}
        />

        {/* Center + Right: workspace area */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {al.isRestoredFeed && !al.selectedDatasetId && (
            <div className="mx-4 mt-3 flex-shrink-0 px-4 py-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center gap-3 text-sm font-ibm-sans text-blue-800">
              <HistoryOutlined />
              <span>
                Showing saved feed from <strong>{al.savedFeedLabel}</strong> — select the original dataset to run new inference.
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
                Select a dataset to start {mode === "validate" ? "Validate" : "Active Learning"}
              </p>
              <p className="text-sm font-ibm-sans">Then click "Generate Feed" to load predictions.</p>
            </div>
          )}

          {(al.selectedDatasetId || al.isRestoredFeed) && (
            <Workspace
              onFindSimilar={handleFindSimilar}
              filterAnnotationStatus={filterAnnotationStatus}
              filterLocations={filterLocations}
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
      </div>

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
