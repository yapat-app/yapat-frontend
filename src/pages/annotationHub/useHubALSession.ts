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
  fetchAndAppendSuggestions,
} from "../../redux/features/alSlice";
import { embeddingApi } from "../../services/api";
import { alApi } from "../../services/alApi";
import { studyLogger } from "../../studyLogging";
import type { PAMCheckpoint } from "../../types/al";

export interface LabelScopeOption {
  value: string;
  label: string;
  disabled: boolean;
  tooltip: string | null;
  sampleCount: number | null;
}
import type { SnippetSet } from "../../types";
import { usePhaseConfig } from "../../studyPhases";
import {
  buildInferenceSuggestionParams,
  buildValidateInferenceParams,
  isSuggestionsMode,
} from "./alInferenceHelpers";
import { fetchPamQuickLabelNames } from "../../utils/fetchPamQuickLabelNames";
import type { AnnotateMode } from "./types";

/**
 * AL / validate session for AnnotationHub: URL sync, inference, feed restore,
 * retrain polling, and inference modal configuration.
 */
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

  // Upgrade top-K suggestions to the full dataset when the phase needs it.
  // A ref guards against repeated dispatches — Immer creates a new modelInfo
  // object reference on every fulfilled action, which would otherwise re-run
  // this effect even after the upgrade completed.
  const hasUpgradedRef = useRef(false);
  const isSuggestions = (modelInfo as Record<string, unknown>)?.mode === "suggestions";
  // Reset the guard when suggestions mode clears (upgrade completed) or dataset changes.
  useEffect(() => {
    if (!isSuggestions) hasUpgradedRef.current = false;
  }, [isSuggestions]);

  useEffect(() => {
    if (isValidateMode) return;
    const needsFullSet =
      phase.feed.mode === "single_card_on_select" ||
      phase.visualization.mode === "whole_dataset";
    if (
      needsFullSet &&
      isSuggestions &&
      selectedDatasetId !== null &&
      snippetSetId !== null &&
      modelFamilyName !== null &&
      !inferenceLoading &&
      !hasUpgradedRef.current
    ) {
      hasUpgradedRef.current = true;
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
    isSuggestions,
    isValidateMode,
    selectedDatasetId,
    snippetSetId,
    modelFamilyName,
    inferenceLoading,
    dispatch,
  ]);


  useEffect(() => {
    const raw = searchParams.get("dataset_id");
    const urlDatasetId = raw ? Number.parseInt(raw, 10) : null;
    dispatch(
      hydrateSavedFeed({
        expectedDatasetId: Number.isFinite(urlDatasetId as number) ? urlDatasetId : null,
      }),
    );
  }, [dispatch, searchParams]);

  // Restore a truncated feed from the server once when predictions are missing.
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
  const [localFamily, setLocalFamily] = useState<string | null>(modelFamilyName);
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);
  const [localK, setLocalK] = useState<number>(inferenceK);
  const [localTopKOnly, setLocalTopKOnly] = useState<boolean>(true);
  const [localMinConfidence, setLocalMinConfidence] = useState<number | null>(null);
  const [localLabelScope, setLocalLabelScope] = useState<string[]>([]);
  const [labelScopeOptions, setLabelScopeOptions] = useState<LabelScopeOption[]>([]);
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
    hasAttemptedRestoreRef.current = false;
    hasAutoInferredRef.current = false;
    hasUpgradedRef.current = false;
  }, [selectedDatasetId]);

  // Clear snippet-set and checkpoint state when the dataset changes.
  const prevDatasetIdRef = useRef<number | null>(null);
  if (prevDatasetIdRef.current !== selectedDatasetId) {
    if (prevDatasetIdRef.current !== null) {
      setLocalSS(null);
      setCheckpoints([]);
      setSnippetSets([]);
    }
    prevDatasetIdRef.current = selectedDatasetId;
  }

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

  const localCkpt = checkpoints[0]?.id ?? null;

  // Auto-run inference for the full dataset when a dataset+checkpoint is ready
  // and there are no predictions yet (fresh session, no prior localStorage).
  const hasAutoInferredRef = useRef(false);
  useEffect(() => {
    if (!isAlLikeMode || isValidateMode) return;
    if (inferenceLoading || predictions.length > 0 || lastInferenceAt) return;
    if (selectedDatasetId === null || !localFamily || resolvedSnippetSetId === null) return;
    if (checkpoints.length === 0) return;
    if (hasAutoInferredRef.current) return;
    hasAutoInferredRef.current = true;

    dispatch(
      setInferenceConfig({
        modelCheckpointId: localCkpt,
        modelFamilyName: localFamily,
        snippetSetId: resolvedSnippetSetId,
        embeddingModelId:
          snippetSets.find((s) => s.id === resolvedSnippetSetId)?.embedding_model_id ?? 1,
        k: localK,
      }),
    );
    dispatch(
      runInference({
        model_family_name: localFamily,
        dataset_id: selectedDatasetId,
        snippet_set_id: resolvedSnippetSetId,
        sample_suggestion: false,
      }),
    );
    dispatch(
      fetchFeedbackCount({ dataset_id: selectedDatasetId, model_family_name: localFamily }),
    );
  }, [
    isAlLikeMode,
    isValidateMode,
    inferenceLoading,
    predictions.length,
    lastInferenceAt,
    selectedDatasetId,
    localFamily,
    resolvedSnippetSetId,
    checkpoints.length,
    localCkpt,
    localK,
    snippetSets,
    dispatch,
  ]);

  useEffect(() => {
    if (checkpoints.length === 0) {
      if (!localFamily) setLocalFamily(modelFamilyName ?? "default");
      return;
    }
    const first = checkpoints[0];
    if (first && first.model_family_name !== localFamily) {
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

        const ckpt = checkpoints.find((c) => c.id === ckptId);
        const hyper = ckpt?.hyperparameters ?? null;
        const classCounts = hyper?.class_counts ?? {};
        const LOW_SAMPLE_THRESHOLD = 10;

        const activeOptions: LabelScopeOption[] = names.map((name) => {
          const count = classCounts[name] ?? null;
          let tooltip: string | null = null;
          if (count !== null) {
            tooltip = count < LOW_SAMPLE_THRESHOLD
              ? `${count} training samples — low confidence`
              : `${count} training samples`;
          }
          return { value: name, label: name, disabled: false, tooltip, sampleCount: count };
        });

        const excludedOptions: LabelScopeOption[] = (hyper?.excluded_species ?? []).map((name) => {
          const count = classCounts[name] ?? null;
          const tooltip = count !== null
            ? `Excluded — only ${count} training sample${count === 1 ? "" : "s"}`
            : "Excluded — insufficient training samples";
          return { value: name, label: name, disabled: true, tooltip, sampleCount: count };
        });

        const allOptions = [...activeOptions, ...excludedOptions];
        setLabelScopeOptions(allOptions);

        setLocalLabelScope((prev) => {
          const activeNames = activeOptions.map((o) => o.value);
          if (prev.length === 0) return activeNames;
          const kept = prev.filter((n) => activeNames.includes(n));
          return kept.length > 0 ? kept : activeNames;
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
    checkpoints,
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

  const handleRunInferenceRef = useRef<() => void>(() => {});
  const predictionsRef = useRef(predictions);
  predictionsRef.current = predictions;
  const modelInfoRef = useRef(modelInfo);
  modelInfoRef.current = modelInfo;

  // Reload inference when switching between al and validate (deps limited to mode).
  const prevModeRef = useRef<AnnotateMode | null>(null);
  useEffect(() => {
    const prev = prevModeRef.current;
    prevModeRef.current = mode;

    if (prev === null || prev === mode) return;
    if (!isAlLikeMode) return;

    // Reuse in-memory validate predictions when returning from another mode.
    if (
      mode === "validate" &&
      predictionsRef.current.length > 0 &&
      (modelInfoRef.current as Record<string, unknown>)?.suggestion_strategy === "confidence"
    ) {
      return;
    }

    handleRunInferenceRef.current();
  }, [mode, isAlLikeMode]);

  const handleDatasetChange = useCallback(
    (value: number) => {
      dispatch(setSelectedDataset(value));
      setSearchParams({ mode, dataset_id: String(value) });
    },
    [dispatch, setSearchParams, mode],
  );

  const handleRunInference = useCallback(() => {
    if (selectedDatasetId === null || resolvedSnippetSetId === null) return;
    const family = (localFamily ?? "").trim() || (checkpoints[0]?.model_family_name ?? "");
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

  handleRunInferenceRef.current = handleRunInference;

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

  const retrainJobId = lastRetrainDispatch?.job_id ?? null;

  const lastNotifiedJobIdRef = useRef<number | null>(null);
  const retrainStartedAtRef = useRef<Record<number, number>>({});
  useEffect(() => {
    if (!selectedDatasetId || retrainJobId === null) return;
    const stableDatasetId: number = selectedDatasetId;
    const stableJobId: number = retrainJobId;
    if (retrainStartedAtRef.current[stableJobId] === undefined) {
      retrainStartedAtRef.current[stableJobId] = performance.now();
    }
    let cancelled = false;
    let timer: number | null = null;
    async function tick() {
      if (cancelled) return;
      const r = await dispatch(pollRetrainJob(stableJobId));
      if (!pollRetrainJob.fulfilled.match(r)) {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
        }
        dispatch(clearRetrainDispatch());
        return;
      }
      const status = r.payload.status;
      if (status === "COMPLETED" || status === "FAILED") {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          if (status === "COMPLETED") {
            const startedAt = retrainStartedAtRef.current[stableJobId];
            studyLogger.log(
              "retrain_complete",
              { durationMs: startedAt ? Math.round(performance.now() - startedAt) : 0, modelFamilyName },
              startedAt ? { durationMs: Math.round(performance.now() - startedAt) } : undefined,
            );
          } else {
            const detail = r.payload.error_message;
            studyLogger.log("retrain_failed", { modelFamilyName, error: detail ?? "unknown" });
          }
        }
        dispatch(clearRetrainDispatch());
        if (status === "COMPLETED" && modelFamilyName !== null && snippetSetId !== null && selectedDatasetId !== null) {
          if (phase.feed.mode === "scrollable_topk") {
            // Scrollable feed: append fresh suggestions without disrupting scroll position.
            dispatch(
              fetchAndAppendSuggestions({
                model_family_name: modelFamilyName,
                dataset_id: selectedDatasetId,
                snippet_set_id: snippetSetId,
                sample_suggestion: true,
                suggestion_strategy: "uncertainty",
                k: inferenceK,
                force_refresh: true,
              }),
            );
          } else {
            // single_card_on_select (P2+, P3+): silently replace the prediction pool.
            // The user is navigating via the projection, so no scroll position is lost.
            const suggestionParams = buildSuggestionParams(
              inferenceK,
              isValidateMode || isSuggestionsMode(modelInfo),
            );
            dispatch(
              runInference({
                model_family_name: modelFamilyName,
                dataset_id: selectedDatasetId,
                snippet_set_id: snippetSetId,
                ...suggestionParams,
              }),
            );
          }
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
    phase,
  ]);

  const isRestoredFeed = lastInferenceAt !== null && predictions.length > 0;
  const savedFeedLabel = isRestoredFeed
    ? new Date(lastInferenceAt!).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const openInferenceModal = useCallback(() => {
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
