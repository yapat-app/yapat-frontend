import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message } from "antd";
import {
  useAppDispatch,
  useAppSelector,
  usePamTrainingPathDefaults,
} from "../../hooks";
import {
  setSelectedDataset,
  setInferenceConfig,
  runInference,
  fetchFeedbackCount,
  hydrateSavedFeed,
  restoreFeedFromServer,
  pollRetrainJob,
  trainFromScratch,
  clearRetrainDispatch,
} from "../../redux/features/alSlice";
import { embeddingApi } from "../../services/api";
import { alApi } from "../../services/alApi";
import type { PAMCheckpoint } from "../../types/al";
import type { SnippetSet } from "../../types";
import { usePhaseConfig } from "../../studyPhases";
import {
  buildInferenceSuggestionParams,
  buildValidateInferenceParams,
  isSuggestionsMode,
} from "./alInferenceHelpers";
import { fetchPamQuickLabelNames } from "../../utils/fetchPamQuickLabelNames";
import type { AnnotateMode } from "./types";

export function useHubALSession(
  mode: AnnotateMode,
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<typeof import("react-router-dom").useSearchParams>[1],
) {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const isValidateMode = mode === "validate";
  const isAlLikeMode = mode === "al" || mode === "validate";

  const { embeddingMethods, loading: embeddingMethodsLoading } = useAppSelector(
    (s) => s.embedding,
  );
  const {
    selectedDatasetId,
    modelCheckpointId,
    modelFamilyName,
    samplingMethod,
    snippetSetId,
    inferenceK,
    predictions,
    modelInfo,
    inferenceLoading,
    feedbackCount,
    retrainThreshold,
    retrainPending,
    lastRetrainJob,
    lastInferenceAt,
    lastRetrainDispatch,
  } = useAppSelector((s) => s.al);

  const feedbackCountDisplay = useMemo(() => {
    if (!Number.isFinite(retrainThreshold) || retrainThreshold <= 0) {
      return { shown: feedbackCount, pending: retrainPending };
    }
    return {
      shown: retrainPending ? 0 : Math.min(feedbackCount, retrainThreshold),
      pending: retrainPending,
    };
  }, [feedbackCount, retrainThreshold, retrainPending]);

  useEffect(() => {
    if (selectedDatasetId === null || !modelFamilyName || predictions.length === 0) return;
    dispatch(
      fetchFeedbackCount({
        dataset_id: selectedDatasetId,
        model_family_name: modelFamilyName,
      }),
    );
  }, [dispatch, selectedDatasetId, modelFamilyName, predictions.length]);

  useEffect(() => {
    if (isValidateMode) return;
    const needsFullSet =
      phase.feed.mode === "single_card_on_select" ||
      phase.visualization.mode === "whole_dataset";
    const isSuggestions = (modelInfo as Record<string, unknown>)?.mode === "suggestions";
    // Guard against re-running once predictions are already loaded: without this,
    // the effect would loop indefinitely because inferenceLoading and modelInfo both
    // change on every completed inference, re-triggering another dispatch.
    if (
      needsFullSet &&
      isSuggestions &&
      predictions.length === 0 &&
      selectedDatasetId !== null &&
      snippetSetId !== null &&
      modelFamilyName !== null &&
      !inferenceLoading
    ) {
      dispatch(
        runInference({
          model_family_name: modelFamilyName,
          dataset_id: selectedDatasetId,
          snippet_set_id: snippetSetId,
          sample_suggestion: false,
        }),
      );
    }
  }, [
    phase.id,
    phase.feed.mode,
    phase.visualization.mode,
    modelInfo,
    isValidateMode,
    selectedDatasetId,
    snippetSetId,
    modelFamilyName,
    inferenceLoading,
    predictions.length,
    dispatch,
  ]);

  useEffect(() => {
    dispatch(hydrateSavedFeed());
  }, [dispatch]);

  // Restore truncated feed from server once per session — only when predictions
  // are genuinely absent (not just cleared by a tab switch) and we haven't tried yet.
  useEffect(() => {
    if (inferenceLoading || predictions.length > 0) return;
    if (
      !lastInferenceAt ||
      selectedDatasetId === null ||
      snippetSetId === null ||
      !modelFamilyName
    )
      return;
    if (hasAttemptedRestoreRef.current) return;
    hasAttemptedRestoreRef.current = true;
    void dispatch(restoreFeedFromServer());
  }, [
    dispatch,
    inferenceLoading,
    predictions.length,
    lastInferenceAt,
    selectedDatasetId,
    snippetSetId,
    modelFamilyName,
  ]);

  useEffect(() => {
    if (!isAlLikeMode) return;
    const raw = searchParams.get("dataset_id");
    if (!raw) {
      if (
        selectedDatasetId !== null &&
        (predictions.length > 0 || lastInferenceAt)
      ) {
        setSearchParams(
          { mode, dataset_id: String(selectedDatasetId) },
          { replace: true },
        );
      }
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    if (parsed !== (selectedDatasetId === null ? null : Number(selectedDatasetId))) {
      dispatch(setSelectedDataset(parsed));
    }
  }, [
    dispatch,
    searchParams,
    mode,
    isAlLikeMode,
    selectedDatasetId,
    predictions.length,
    lastInferenceAt,
    setSearchParams,
  ]);

  const hasAttemptedRestoreRef = useRef(false);
  const [alConfigOpen, setAlConfigOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<PAMCheckpoint[]>([]);
  const [snippetSets, setSnippetSets] = useState<SnippetSet[]>([]);
  const [localCkpt, setLocalCkpt] = useState<number | null>(modelCheckpointId);
  const [localFamily, setLocalFamily] = useState<string | null>(modelFamilyName);
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);
  const [localK, setLocalK] = useState<number>(inferenceK);
  const [localTopKOnly, setLocalTopKOnly] = useState<boolean>(true);
  const [localMinConfidence, setLocalMinConfidence] = useState<number | null>(null);
  const [localLabelScope, setLocalLabelScope] = useState<string[]>([]);
  const [labelScopeOptions, setLabelScopeOptions] = useState<string[]>([]);
  const [labelScopeLoading, setLabelScopeLoading] = useState(false);
  const [hasGroundTruthMetadata, setHasGroundTruthMetadata] =
    useState<boolean>(false);
  const [trainEmbeddingModelId, setTrainEmbeddingModelId] = useState<number>(1);
  const [trainMetadataPath, setTrainMetadataPath] = useState<string>("");
  const [trainLabelConfigPath, setTrainLabelConfigPath] = useState<string>("");
  const [trainDevice, setTrainDevice] = useState<"cpu" | "cuda">("cpu");
  const [trainRunInference, setTrainRunInference] = useState<boolean>(false);

  usePamTrainingPathDefaults(
    selectedDatasetId,
    hasGroundTruthMetadata,
    setTrainMetadataPath,
    setTrainLabelConfigPath,
  );

  useEffect(() => {
    const family = searchParams.get("model_family");
    if (family) setLocalFamily(family);
  }, [searchParams]);

  useEffect(() => {
    // Reset restore guard when the dataset changes so the new dataset can restore.
    hasAttemptedRestoreRef.current = false;
  }, [selectedDatasetId]);

  useEffect(() => {
    if (selectedDatasetId === null) return;
    alApi.getCheckpoints(selectedDatasetId).then(setCheckpoints).catch(() => {});
    embeddingApi
      .allSnippetSets(selectedDatasetId)
      .then(setSnippetSets)
      .catch(() => {});
  }, [selectedDatasetId]);

  const resolvedSnippetSetId = useMemo(() => {
    if (localSS !== null) return localSS;
    if (snippetSetId !== null) return snippetSetId;
    const ready = snippetSets.find((s) => String(s.status).toLowerCase() === "ready");
    return ready?.id ?? null;
  }, [localSS, snippetSetId, snippetSets]);
  const hasReadySnippetSet = resolvedSnippetSetId !== null;

  useEffect(() => {
    if (localSS !== null) return;
    const ready = snippetSets.find((s) => String(s.status).toLowerCase() === "ready");
    if (ready?.id != null) setLocalSS(ready.id);
  }, [snippetSets, localSS]);

  useEffect(() => {
    if (checkpoints.length === 0) {
      if (!localFamily) setLocalFamily(modelFamilyName ?? "default");
      setLocalCkpt(null);
      return;
    }
    if (localCkpt !== null) {
      const fam =
        checkpoints.find((c) => c.id === localCkpt)?.model_family_name ?? null;
      if (fam && fam !== localFamily) setLocalFamily(fam);
      return;
    }
    const first = checkpoints[0];
    if (first) {
      setLocalCkpt(first.id);
      setLocalFamily(first.model_family_name ?? null);
    }
  }, [checkpoints]);

  useEffect(() => {
    if (!isAlLikeMode) return;
    const ckptId = localCkpt ?? modelCheckpointId;
    let cancelled = false;
    setLabelScopeLoading(true);
    void fetchPamQuickLabelNames(ckptId, selectedDatasetId)
      .then((names) => {
        if (cancelled) return;
        setLabelScopeOptions(names);
        setLocalLabelScope((prev) => {
          if (prev.length === 0) return names;
          const kept = prev.filter((n) => names.includes(n));
          return kept.length > 0 ? kept : names;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLabelScopeOptions([]);
          setLocalLabelScope([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLabelScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isAlLikeMode,
    localCkpt,
    modelCheckpointId,
    selectedDatasetId,
  ]);

  const buildSuggestionParams = useCallback(
    (k: number, topKOnly: boolean) => {
      const scope = localLabelScope.length > 0 ? localLabelScope : undefined;
      const minConf =
        localMinConfidence != null && localMinConfidence > 0
          ? localMinConfidence
          : null;
      if (isValidateMode) {
        return buildValidateInferenceParams(k, scope, minConf);
      }
      return buildInferenceSuggestionParams(
        phase,
        topKOnly,
        k,
        samplingMethod,
        { labelScope: scope, minConfidence: minConf },
      );
    },
    [
      isValidateMode,
      localLabelScope,
      localMinConfidence,
      phase,
      samplingMethod,
    ],
  );

  const handleDatasetChange = useCallback(
    (value: number) => {
      dispatch(setSelectedDataset(value));
      setSearchParams({ mode, dataset_id: String(value) });
    },
    [dispatch, setSearchParams, mode],
  );

  const handleRunInference = useCallback(() => {
    if (selectedDatasetId === null || resolvedSnippetSetId === null) return;
    const family =
      (localFamily ?? "").trim() ||
      (localCkpt !== null
        ? checkpoints.find((c) => c.id === localCkpt)?.model_family_name ?? ""
        : "");
    if (!family) return;
    const embeddingModelId =
      snippetSets.find((s) => s.id === resolvedSnippetSetId)?.embedding_model_id ??
      embeddingMethods?.[0]?.id ??
      1;
    const suggestionParams = buildSuggestionParams(
      localK,
      isValidateMode ? true : localTopKOnly,
    );
    const k = suggestionParams.k ?? localK;
    dispatch(
      setInferenceConfig({
        modelCheckpointId: localCkpt,
        modelFamilyName: family,
        snippetSetId: resolvedSnippetSetId,
        embeddingModelId,
        k,
      }),
    );
    dispatch(
      runInference({
        model_family_name: family,
        dataset_id: selectedDatasetId,
        snippet_set_id: resolvedSnippetSetId,
        ...suggestionParams,
      }),
    );
    dispatch(
      fetchFeedbackCount({
        dataset_id: selectedDatasetId,
        model_family_name: family,
      }),
    );
    setAlConfigOpen(false);
  }, [
    selectedDatasetId,
    resolvedSnippetSetId,
    localFamily,
    localCkpt,
    checkpoints,
    snippetSets,
    embeddingMethods,
    phase,
    localTopKOnly,
    localK,
    buildSuggestionParams,
    dispatch,
  ]);

  const handleOpenALSession = useCallback(async () => {
    if (checkpoints.length > 0) {
      handleRunInference();
      return;
    }
    if (selectedDatasetId === null || resolvedSnippetSetId === null) return;
    const family = (localFamily ?? "").trim() || "default";
    if (!hasGroundTruthMetadata) {
      handleRunInference();
      return;
    }
    if (!trainEmbeddingModelId || !Number.isFinite(trainEmbeddingModelId)) return;
    if (!trainMetadataPath.trim() || !trainLabelConfigPath.trim()) return;
    const result = await dispatch(
      trainFromScratch({
        dataset_id: selectedDatasetId,
        model_family_name: family,
        snippet_set_id: resolvedSnippetSetId ?? undefined,
        embedding_model_id: trainEmbeddingModelId,
        metadata_path: trainMetadataPath.trim(),
        label_config_path: trainLabelConfigPath.trim(),
        device: trainDevice,
        run_inference: trainRunInference,
      }),
    );
    if (!trainFromScratch.fulfilled.match(result)) {
      message.error("Failed to dispatch training job");
      return;
    }
    message.success(`Training job ${result.payload.job_id} dispatched`);
    setAlConfigOpen(false);
  }, [
    checkpoints.length,
    handleRunInference,
    selectedDatasetId,
    resolvedSnippetSetId,
    localFamily,
    hasGroundTruthMetadata,
    trainEmbeddingModelId,
    trainMetadataPath,
    trainLabelConfigPath,
    trainDevice,
    trainRunInference,
    dispatch,
  ]);

  // Use the primitive job_id as the dep — the lastRetrainDispatch object reference
  // changes on every Redux update even when the job_id is the same, which would
  // restart the polling loop on every render and flood the server with requests.
  const retrainJobId = lastRetrainDispatch?.job_id ?? null;

  const lastNotifiedJobIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedDatasetId || retrainJobId === null) return;
    const stableDatasetId: number = selectedDatasetId;
    const stableJobId: number = retrainJobId;
    let cancelled = false;
    let timer: number | null = null;
    async function tick() {
      if (cancelled) return;
      const r = await dispatch(pollRetrainJob(stableJobId));
      if (!pollRetrainJob.fulfilled.match(r)) {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          message.warning("Could not poll retrain job — please retry manually");
        }
        // Do NOT dispatch runInference here: if the backend is returning job
        // dispatches on every inference call (e.g. broken checkpoint), a fallback
        // runInference would immediately produce another job_id, restarting this
        // polling loop indefinitely. Clear state and let the user retry via UI.
        dispatch(clearRetrainDispatch());
        return;
      }
      const status = r.payload.status;
      if (status === "COMPLETED" || status === "FAILED") {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          if (status === "COMPLETED") {
            message.success("Training completed — click Generate Feed to load predictions");
          } else {
            message.error("Training failed — please check the model checkpoint and retry");
          }
        }
        // Clear before any further dispatch so that runInference returning a job
        // dispatch does not chain into another polling loop for a new job_id.
        dispatch(clearRetrainDispatch());
        if (status === "COMPLETED" && modelFamilyName !== null && snippetSetId !== null && selectedDatasetId !== null) {
          const suggestionParams = buildSuggestionParams(
            inferenceK,
            isValidateMode || isSuggestionsMode(modelInfo),
          );
          dispatch(
            runInference({
              model_family_name: modelFamilyName,
              dataset_id: selectedDatasetId,
              snippet_set_id: snippetSetId,
              force_refresh: true,
              ...suggestionParams,
            }),
          );
        }
        try {
          const updated = await alApi.getCheckpoints(stableDatasetId);
          setCheckpoints(updated);
        } catch {
          /* ignore */
        }
        return;
      }
      timer = window.setTimeout(tick, 2000);
    }
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    dispatch,
    retrainJobId,
    selectedDatasetId,
    modelFamilyName,
    snippetSetId,
    hasReadySnippetSet,
    isValidateMode,
    inferenceK,
    buildSuggestionParams,
    modelInfo,
  ]);

  const isRestoredFeed = lastInferenceAt !== null && predictions.length > 0;
  const savedFeedLabel = isRestoredFeed
    ? new Date(lastInferenceAt!).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const openInferenceModal = useCallback(() => {
    setLocalCkpt(modelCheckpointId);
    setLocalFamily(modelFamilyName);
    setLocalSS(resolvedSnippetSetId);
    setLocalK(inferenceK);
    setLocalTopKOnly(
      isValidateMode || predictions.length === 0 || isSuggestionsMode(modelInfo),
    );
    setHasGroundTruthMetadata(false);
    setTrainEmbeddingModelId(embeddingMethods?.[0]?.id ?? 1);
    setTrainMetadataPath("");
    setTrainLabelConfigPath("");
    setTrainDevice("cpu");
    setTrainRunInference(false);
    setAlConfigOpen(true);
  }, [
    modelCheckpointId,
    modelFamilyName,
    resolvedSnippetSetId,
    inferenceK,
    predictions.length,
    modelInfo,
    isValidateMode,
    embeddingMethods,
  ]);

  return {
    phase,
    embeddingMethods,
    embeddingMethodsLoading,
    selectedDatasetId,
    modelCheckpointId,
    modelFamilyName,
    samplingMethod,
    snippetSetId,
    hasReadySnippetSet,
    inferenceK,
    predictions,
    modelInfo,
    inferenceLoading,
    feedbackCount,
    retrainThreshold,
    lastRetrainJob,
    lastInferenceAt,
    feedbackCountDisplay,
    handleDatasetChange,
    isRestoredFeed,
    savedFeedLabel,
    alConfigOpen,
    setAlConfigOpen,
    checkpoints,
    snippetSets,
    localCkpt,
    setLocalCkpt,
    localFamily,
    setLocalFamily,
    localK,
    setLocalK,
    localTopKOnly,
    setLocalTopKOnly,
    hasGroundTruthMetadata,
    setHasGroundTruthMetadata,
    trainEmbeddingModelId,
    setTrainEmbeddingModelId,
    trainMetadataPath,
    setTrainMetadataPath,
    trainLabelConfigPath,
    setTrainLabelConfigPath,
    trainDevice,
    setTrainDevice,
    trainRunInference,
    setTrainRunInference,
    localMinConfidence,
    setLocalMinConfidence,
    localLabelScope,
    setLocalLabelScope,
    labelScopeOptions,
    labelScopeLoading,
    isValidateMode,
    handleRunInference,
    handleOpenALSession,
    openInferenceModal,
  };
}
