/**
 * AnnotationHub — unified annotation entry point.
 *
 * Composed from `annotationHub/*` modules (hooks, toolbar, modals, main pane).
 */

import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { NavigationBar } from "../components/NavigationBar";
import { useAppSelector } from "../hooks";
import type { AnnotateMode } from "./annotationHub/types";
import { useHubDatasets } from "./annotationHub/useHubDatasets";
import { useHubClassic } from "./annotationHub/useHubClassic";
import { useHubALSession } from "./annotationHub/useHubALSession";
import { AnnotationHubToolbar } from "./annotationHub/AnnotationHubToolbar";
import { AnnotationHubMain } from "./annotationHub/AnnotationHubMain";
import { ALInferenceConfigModal } from "./annotationHub/ALInferenceConfigModal";
import { ClassicFeedConfigModal } from "./annotationHub/ClassicFeedConfigModal";

export const AnnotationHub: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAppSelector((s) => s.auth);
  const { allDatasets, awaitingHubDatasetBootstrap } = useHubDatasets(
    searchParams,
    setSearchParams,
    user,
  );

  // User study: lock to AL mode only.
  const mode: AnnotateMode = "al";

  const classicDatasetId = searchParams.get("dataset_id");
  const classic = useHubClassic(mode, classicDatasetId, user?.id ?? null);
  const al = useHubALSession(mode, searchParams, setSearchParams);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
      <NavigationBar />

      <AnnotationHubToolbar
        mode={mode}
        phase={al.phase}
        allDatasets={allDatasets}
        classicDatasetId={classicDatasetId}
        onClassicDatasetChange={(v) =>
          setSearchParams({ mode, dataset_id: String(v) })
        }
        alSelectedDatasetId={al.selectedDatasetId}
        onAlDatasetChange={al.handleDatasetChange}
        inferenceLoading={al.inferenceLoading}
        predictionsLength={al.predictions.length}
        feedbackCountDisplay={al.feedbackCountDisplay}
        retrainThreshold={al.retrainThreshold}
        lastRetrainJob={al.lastRetrainJob}
        isRestoredFeed={al.isRestoredFeed}
        savedFeedLabel={al.savedFeedLabel}
      />

      <AnnotationHubMain
        awaitingHubDatasetBootstrap={awaitingHubDatasetBootstrap}
        mode={mode}
        selectedDatasetId={al.selectedDatasetId}
        isRestoredFeed={al.isRestoredFeed}
        savedFeedLabel={al.savedFeedLabel}
        isClassicMode={classic.isClassicMode}
        showClassicSpinner={classic.showClassicSpinner}
        showClassicEmpty={classic.showClassicEmpty}
        classicDatasetId={classicDatasetId}
        generateFeedLabel={classic.generateFeedLabel}
        classicGenerateLoading={classic.feedGenerateBusy}
        onOpenClassicFeedConfig={() => classic.setClassicConfigOpen(true)}
        alFeedActionLabel={al.predictions.length > 0 ? "Edit Feed" : "Generate Feed"}
        alFeedActionLoading={al.inferenceLoading}
        onOpenAlFeedConfig={al.openInferenceModal}
        onBrowseDatasets={() => navigate("/datasets")}
      />

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
        isValidateMode={false}
        localMinConfidence={al.localMinConfidence}
        setLocalMinConfidence={al.setLocalMinConfidence}
        localLabelScope={al.localLabelScope}
        setLocalLabelScope={al.setLocalLabelScope}
        labelScopeOptions={al.labelScopeOptions}
        labelScopeLoading={al.labelScopeLoading}
      />

      <ClassicFeedConfigModal
        open={classic.classicConfigOpen}
        mode={mode}
        feedLimit={classic.feedLimit}
        onFeedLimitChange={classic.setFeedLimit}
        filterAnnotationStatus={classic.filterAnnotationStatus}
        onFilterAnnotationStatusChange={classic.setFilterAnnotationStatus}
        filterLocations={classic.filterLocations}
        onFilterLocationsChange={classic.setFilterLocations}
        recordingLocations={classic.recordingLocations}
        locationsLoading={classic.locationsLoading}
        similarityState={classic.similarityState}
        onSimilarityChange={classic.handleSimilarityChange}
        onCancel={() => classic.setClassicConfigOpen(false)}
        onOk={classic.handleGenerateFeed}
        okText="Apply"
        okDisabled={!classic.classicCanGenerate || classic.feedGenerateBusy}
        okLoading={classic.feedGenerateBusy}
      />
    </div>
  );
};
