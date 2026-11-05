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
  fetchEmbeddingOptions,
  fetchFeedbackCount,
  selectEmbeddingOption,
  switchEmbeddingModel,
  clearError,
  hydrateSavedFeed,
  restoreFeedFromServer,
  pollRetrainJob,
  trainFromScratch,
  clearRetrainDispatch,
  resetStaleInferenceBinding,
  requestFeedResume,
  clearFirstModelCheckpoint,
} from "../../redux/features/alSlice";
import { embeddingApi } from "../../services/api";
import {
  notifyDatasetDataChanged,
  useDatasetDataEpoch,
} from "../../explore/datasetRefresh";
import { useEmbeddingJobStatus } from "../../hooks/useEmbeddingJobStatus";
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
import type { EmbeddingJobProgress, EmbeddingOption, SnippetSet } from "../../types";
import { usePhaseConfig } from "../../studyPhases";
import {
  buildInferenceSuggestionParams,
  buildValidateInferenceParams,
  exploreBootstrapParams,
  isSuggestionsMode,
} from "./alInferenceHelpers";
import { fetchPamQuickLabelNames } from "../../utils/fetchPamQuickLabelNames";
import type { AnnotateMode } from "./types";

/** Why training a model's first classifier failed, from a 400 or the failed job. */
function showClassifierTrainingError(detail: string): void {
  if (/no labels/i.test(detail)) {
    message.warning("Label some snippets first");
  } else {
    message.error(detail ? `Training failed: ${detail}` : "Training failed");
  }
}

/**
 * AL / validate session for AnnotationHub: URL sync, inference, feed restore,
 * retrain polling, and inference modal configuration.
 */
export function useHubALSession(
  mode: AnnotateMode,
  searchParams: URLSearchParams,
  setSearchParams: ReturnType<
    typeof import("react-router-dom").useSearchParams
  >[1],
  options?: { treatAllModesAsAl?: boolean },
) {
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const isValidateMode = mode === "validate";
  const isAlLikeMode =
    options?.treatAllModesAsAl || mode === "al" || mode === "validate";

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
    retrainLoading,
    lastRetrainJob,
    lastInferenceAt,
    lastRetrainDispatch,
    usedCheckpointId,
    embeddingModelId,
    embeddingOptions,
    embeddingOptionsDatasetId,
    classifierTrainingModelId,
    firstModelCheckpointId,
  } = useAppSelector((s) => s.al);
  const selectedOption = useAppSelector(selectEmbeddingOption);
  // Settled for this dataset, whether the request succeeded or not.
  const embeddingOptionsLoaded =
    selectedDatasetId !== null &&
    embeddingOptionsDatasetId === Number(selectedDatasetId);
  const dataEpoch = useDatasetDataEpoch(
    selectedDatasetId === null ? null : Number(selectedDatasetId),
  );

  // A model switch leaves no rows in memory, but its feed exists on the server.
  const hasFeed = predictions.length > 0 || lastInferenceAt !== null;

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
    if (
      selectedDatasetId === null ||
      !modelFamilyName ||
      !hasFeed
    )
      return;
    dispatch(
      fetchFeedbackCount({
        dataset_id: selectedDatasetId,
        model_family_name: modelFamilyName,
      }),
    );
  }, [dispatch, selectedDatasetId, modelFamilyName, predictions.length, hasFeed]);
  const [allCheckpoints, setCheckpoints] = useState<PAMCheckpoint[]>([]);
  // A classifier belongs to one embedding model: only the selected model's count.
  const checkpoints = useMemo(() => {
    if (!embeddingOptionsLoaded) return [];
    return embeddingModelId === null
      ? allCheckpoints
      : allCheckpoints.filter((c) => c.embedding_model_id === embeddingModelId);
  }, [allCheckpoints, embeddingModelId, embeddingOptionsLoaded]);
  const [checkpointsDatasetId, setCheckpointsDatasetId] = useState<
    number | null
  >(null);
  const [snippetSetsRaw, setSnippetSets] = useState<SnippetSet[]>([]);
  const [snippetSetsDatasetId, setSnippetSetsDatasetId] = useState<
    number | null
  >(null);
  const snippetSets = useMemo(
    () => (snippetSetsDatasetId === selectedDatasetId ? snippetSetsRaw : []),
    [snippetSetsDatasetId, selectedDatasetId, snippetSetsRaw],
  );
  const [localFamily, setLocalFamily] = useState<string | null>(
    modelFamilyName,
  );
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);

  // Resume the feed where the participant left off when the study phase
  // changes. Each phase renders a different workspace layout (the projection
  // panel appears from P2 on), which remounts the feed and restarts it at the
  // first row — so without this a participant re-enters on snippets they
  // already worked through. Deliberately keyed on a phase *change*, not on
  // mount: a first-time feed should open at its natural start.
  const lastResumedPhaseRef = useRef(phase.id);
  useEffect(() => {
    if (lastResumedPhaseRef.current === phase.id) return;
    // Wait for the feed to exist — the anchor can't be located in an empty
    // list, and the ref stays put so this retries once predictions land.
    if (predictions.length === 0) return;
    lastResumedPhaseRef.current = phase.id;
    dispatch(requestFeedResume());
  }, [phase.id, predictions.length, dispatch]);

  useEffect(() => {
    const raw = searchParams.get("dataset_id");
    const urlDatasetId = raw ? Number.parseInt(raw, 10) : null;
    dispatch(
      hydrateSavedFeed({
        expectedDatasetId: Number.isFinite(urlDatasetId as number)
          ? urlDatasetId
          : null,
      }),
    );
  }, [dispatch, searchParams]);

  // NOTE: the "restore a truncated feed from the server" effect lives further
  // down, after `snippetSets` is defined — it must validate that the persisted
  // snippetSetId belongs to the current dataset before firing.

  useEffect(() => {
    if (!isAlLikeMode) return;
    const raw = searchParams.get("dataset_id");
    if (!raw) {
      if (
        selectedDatasetId !== null &&
        (predictions.length > 0 || lastInferenceAt)
      ) {
        // Clone existing params so `phase` (and anything else) is preserved —
        // rebuilding a fresh {mode, dataset_id} object dropped the phase param.
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.set("dataset_id", String(selectedDatasetId));
            return next;
          },
          { replace: true },
        );
      }
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    if (
      parsed !== (selectedDatasetId === null ? null : Number(selectedDatasetId))
    ) {
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
  const [localK, setLocalK] = useState<number>(inferenceK);
  const [localTopKOnly, setLocalTopKOnly] = useState<boolean>(true);
  const [localMinConfidence, setLocalMinConfidence] = useState<number | null>(
    null,
  );
  const [localLabelScope, setLocalLabelScope] = useState<string[]>([]);
  const [labelScopeOptions, setLabelScopeOptions] = useState<
    LabelScopeOption[]
  >([]);
  const [labelScopeLoading, setLabelScopeLoading] = useState(false);
  const [hasGroundTruthMetadata, setHasGroundTruthMetadata] =
    useState<boolean>(false);
  const [trainEmbeddingModelId, setTrainEmbeddingModelId] = useState<number>(0);
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
    // Guard against a stale response: if the dataset changes again before
    // this resolves, applying it would overwrite checkpoints/snippetSets
    // with the previous dataset's data, silently breaking the auto-infer
    // effect below (its snippetSets-membership check would then never pass
    // for the new dataset, leaving the feed blank until a manual refresh).
    const fetchedForDatasetId = selectedDatasetId;
    let cancelled = false;
    alApi
      .getCheckpoints(fetchedForDatasetId)
      .then((data) => {
        if (!cancelled) {
          setCheckpoints(data);
          setCheckpointsDatasetId(fetchedForDatasetId);
        }
      })
      .catch((e) =>
        console.error(
          "Failed to load checkpoints for dataset",
          fetchedForDatasetId,
          e,
        ),
      );
    embeddingApi
      .allSnippetSets(fetchedForDatasetId)
      .then((data) => {
        if (!cancelled) {
          setSnippetSets(data);
          setSnippetSetsDatasetId(fetchedForDatasetId);
        }
      })
      .catch((e) =>
        console.error(
          "Failed to load snippet sets for dataset",
          fetchedForDatasetId,
          e,
        ),
      );
    return () => {
      cancelled = true;
    };
    // dataEpoch: embeddings finished or recordings were added while the hub was
    // open (datasetRefresh.ts) — a ready snippet set may exist now.
  }, [selectedDatasetId, dataEpoch]);

  useEffect(() => {
    if (selectedDatasetId === null) return;
    void dispatch(fetchEmbeddingOptions(Number(selectedDatasetId)));
    // dataEpoch: a model finished embedding or recordings were added.
  }, [dispatch, selectedDatasetId, dataEpoch]);

  // Keep the hub on the current model while another one embeds, and offer the
  // new one when it finishes. The first model's job is watched by
  // useDatasetActivity, which also replaces the workspace during that job.
  const runningEmbeddingJobId =
    embeddingOptions.find((o) => o.status === "pending" || o.status === "running")
      ?.embedding_job_id ?? null;
  const onEmbeddingJobFinished = useCallback(
    (progress: EmbeddingJobProgress) => {
      if (progress.status === "completed") {
        notifyDatasetDataChanged(progress.dataset_id);
      } else {
        void dispatch(fetchEmbeddingOptions(progress.dataset_id));
      }
    },
    [dispatch],
  );
  useEmbeddingJobStatus(runningEmbeddingJobId, onEmbeddingJobFinished);

  const resolvedSnippetSetId = useMemo(() => {
    if (selectedOption) return selectedOption.snippet_set_id;
    if (localSS !== null) return localSS;
    if (snippetSetId !== null) return snippetSetId;
    const ready = snippetSets.find(
      (s) => String(s.status).toLowerCase() === "ready",
    );
    return ready?.id ?? null;
  }, [selectedOption, localSS, snippetSetId, snippetSets]);
  const hasReadySnippetSet = resolvedSnippetSetId !== null;

  useEffect(() => {
    if (localSS !== null) return;
    const ready = snippetSets.find(
      (s) => String(s.status).toLowerCase() === "ready",
    );
    if (ready?.id != null) setLocalSS(ready.id);
  }, [snippetSets, localSS]);

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
    // Wait until this dataset's snippet sets are loaded before validating.
    if (snippetSets.length === 0) return;
    if (!snippetSets.some((s) => s.id === snippetSetId)) {
      dispatch(resetStaleInferenceBinding());
      return;
    }
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
    snippetSets,
  ]);

  const localCkpt = checkpoints[0]?.id ?? null;

  // Auto-run inference for the full dataset when a dataset+checkpoint is ready
  // and there are no predictions yet (fresh session, no prior localStorage).
  const hasAutoInferredRef = useRef(false);
  useEffect(() => {
    if (!isAlLikeMode || isValidateMode) return;
    if (inferenceLoading || predictions.length > 0 || lastInferenceAt) return;
    if (selectedDatasetId === null || resolvedSnippetSetId === null) return;
    if (!embeddingOptionsLoaded) return;
    if (checkpoints.length === 0) return;
    if (hasAutoInferredRef.current) return;
    // Same cross-dataset guard as handleRunInference — checkpoints and
    // snippetSets are fetched independently for the current dataset, so one
    // can resolve before the other; don't fire until resolvedSnippetSetId is
    // confirmed to belong to the currently-selected dataset.
    if (!snippetSets.some((s) => s.id === resolvedSnippetSetId)) return;

    // Read the family from `checkpoints` directly, not `localFamily` — a
    // later effect corrects `localFamily` from the same `checkpoints` value,
    // but same-commit effects can't see each other's updates, so this one
    // would otherwise latch onto a stale placeholder family and infer with
    // the wrong model_family_name.
    const effectiveFamily =
      selectedOption?.model_family_name ??
      checkpoints[0]?.model_family_name ??
      localFamily;
    if (!effectiveFamily) return;
    hasAutoInferredRef.current = true;

    dispatch(
      setInferenceConfig({
        modelCheckpointId: localCkpt,
        modelFamilyName: effectiveFamily,
        snippetSetId: resolvedSnippetSetId,
        embeddingModelId,
        k: localK,
      }),
    );
    dispatch(
      runInference({
        model_family_name: effectiveFamily,
        dataset_id: selectedDatasetId,
        snippet_set_id: resolvedSnippetSetId,
        // Only ensures predictions exist; the feed itself is paged by /explore.
        ...exploreBootstrapParams(),
      }),
    );
    dispatch(
      fetchFeedbackCount({
        dataset_id: selectedDatasetId,
        model_family_name: effectiveFamily,
      }),
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
    embeddingOptionsLoaded,
    selectedOption,
    embeddingModelId,
    checkpoints.length,
    localCkpt,
    localK,
    snippetSets,
    dispatch,
  ]);

  useEffect(() => {
    if (selectedOption) {
      setLocalFamily(selectedOption.model_family_name);
      return;
    }
    if (checkpoints.length === 0) {
      if (!localFamily) setLocalFamily(modelFamilyName ?? "default");
      return;
    }
    const first = checkpoints[0];
    if (first && first.model_family_name !== localFamily) {
      setLocalFamily(first.model_family_name ?? null);
    }
  }, [checkpoints, selectedOption]);

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
            tooltip =
              count < LOW_SAMPLE_THRESHOLD
                ? `${count} training samples — low confidence`
                : `${count} training samples`;
          }
          return {
            value: name,
            label: name,
            disabled: false,
            tooltip,
            sampleCount: count,
          };
        });

        const excludedOptions: LabelScopeOption[] = (
          hyper?.excluded_species ?? []
        ).map((name) => {
          const count = classCounts[name] ?? null;
          const tooltip =
            count !== null
              ? `Excluded — only ${count} training sample${count === 1 ? "" : "s"}`
              : "Excluded — insufficient training samples";
          return {
            value: name,
            label: name,
            disabled: true,
            tooltip,
            sampleCount: count,
          };
        });

        const allOptions = [...activeOptions, ...excludedOptions];
        setLabelScopeOptions(allOptions);

        // Don't auto-select every species — an empty scope already means "no
        // restriction" wherever it's consumed (training scope falls back to
        // undefined; the sidebar Species filter shows unfiltered). Auto-filling
        // it made the Filters panel look like a species filter was actively
        // applied on first load, when the user hadn't chosen one.
        setLocalLabelScope((prev) => {
          const activeNames = activeOptions.map((o) => o.value);
          const kept = prev.filter((n) => activeNames.includes(n));
          return kept;
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
      (modelInfoRef.current as Record<string, unknown>)?.suggestion_strategy ===
        "confidence"
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
    if (selectedDatasetId === null) return;
    if (resolvedSnippetSetId === null) {
      message.info(
        "Still loading this dataset's snippet sets — try Apply again in a moment.",
      );
      return;
    }
    // Defense in depth against sending a cross-dataset (snippet_set_id,
    // dataset_id) pair — the backend rejects this, but by then the request
    // has already round-tripped and failed silently from the user's point of
    // view. snippetSets is re-fetched fresh on every selectedDatasetId
    // change, so checking membership here catches a stale
    // resolvedSnippetSetId (carried over from a previous dataset via
    // localSS/redux snippetSetId) before it ever leaves the browser.
    if (!snippetSets.some((s) => s.id === resolvedSnippetSetId)) {
      message.info(
        "This dataset's snippet sets are still syncing — try Apply again in a moment.",
      );
      return;
    }
    const family =
      selectedOption?.model_family_name ??
      ((localFamily ?? "").trim() || (checkpoints[0]?.model_family_name ?? ""));
    if (!family) {
      message.info(
        "No model family selected for this dataset yet — try Apply again in a moment.",
      );
      return;
    }
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
    selectedOption,
    embeddingModelId,
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
    const family =
      selectedOption?.model_family_name ?? ((localFamily ?? "").trim() || "default");
    if (!hasGroundTruthMetadata) {
      handleRunInference();
      return;
    }
    const trainModelId = embeddingModelId ?? trainEmbeddingModelId;
    if (!trainModelId || !Number.isFinite(trainModelId)) return;
    if (!trainMetadataPath.trim() || !trainLabelConfigPath.trim()) return;
    const result = await dispatch(
      trainFromScratch({
        dataset_id: selectedDatasetId,
        model_family_name: family,
        snippet_set_id: resolvedSnippetSetId ?? undefined,
        embedding_model_id: trainModelId,
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
    // The backend holds a cold start while recordings are being added.
    if (result.payload.waiting_for_ingest_job_id != null) {
      message.info("Training starts when the new recordings finish being added.");
    }
    setAlConfigOpen(false);
  }, [
    checkpoints.length,
    handleRunInference,
    selectedDatasetId,
    resolvedSnippetSetId,
    localFamily,
    selectedOption,
    embeddingModelId,
    hasGroundTruthMetadata,
    trainEmbeddingModelId,
    trainMetadataPath,
    trainLabelConfigPath,
    trainDevice,
    trainRunInference,
    dispatch,
  ]);

  /**
   * Switch to another embedding model. Explore reloads everything from the new
   * scope, so this never asks for inference.
   */
  const handleSwitchEmbeddingModel = useCallback(
    (option: EmbeddingOption) => {
      if (option.status !== "completed") return;
      if (option.embedding_model_id === embeddingModelId) return;
      studyLogger.log("embedding_model_change", {
        from: embeddingModelId,
        to: option.embedding_model_id,
        snippetSetChanged: option.snippet_set_id !== snippetSetId,
        hasClassifier: option.active_checkpoint_id !== null,
      });
      refreshedForCheckpointRef.current = null;
      setLocalSS(option.snippet_set_id);
      setLocalFamily(option.model_family_name);
      setLocalLabelScope([]);
      dispatch(switchEmbeddingModel(option));
    },
    [dispatch, embeddingModelId, snippetSetId],
  );

  const refreshEmbeddingOptions = useCallback(() => {
    if (selectedDatasetId !== null) {
      void dispatch(fetchEmbeddingOptions(Number(selectedDatasetId)));
    }
  }, [dispatch, selectedDatasetId]);

  /** First classifier for the selected model, from the labels already on its snippets. */
  const handleTrainClassifier = useCallback(async () => {
    if (selectedDatasetId === null || !selectedOption) return;
    const result = await dispatch(
      trainFromScratch({
        dataset_id: selectedDatasetId,
        snippet_set_id: selectedOption.snippet_set_id,
        embedding_model_id: selectedOption.embedding_model_id,
        model_family_name: selectedOption.model_family_name,
        use_existing_labels: true,
        run_inference: true,
      }),
    );
    if (trainFromScratch.fulfilled.match(result)) {
      if (result.payload.waiting_for_ingest_job_id != null) {
        message.info("Training starts when the new recordings finish being added.");
      }
      return;
    }
    // Reported here, not as a failed feed.
    dispatch(clearError());
    showClassifierTrainingError(String(result.payload ?? ""));
  }, [dispatch, selectedDatasetId, selectedOption]);

  const retrainJobId = lastRetrainDispatch?.job_id ?? null;
  const classifierTrainingRef = useRef(classifierTrainingModelId);
  classifierTrainingRef.current = classifierTrainingModelId;

  const lastNotifiedJobIdRef = useRef<number | null>(null);
  const retrainStartedAtRef = useRef<Record<number, number>>({});
  const inferenceChainCountRef = useRef(0);
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
      // Left behind while waiting, e.g. by switching embedding model.
      if (cancelled) return;
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
          if (classifierTrainingRef.current !== null) {
            if (status === "COMPLETED") {
              message.success("Classifier trained. Loading its predictions…");
            } else {
              showClassifierTrainingError(r.payload.error_message ?? "");
            }
          }
          if (status === "COMPLETED") {
            const startedAt = retrainStartedAtRef.current[stableJobId];
            studyLogger.log(
              "retrain_complete",
              {
                durationMs: startedAt
                  ? Math.round(performance.now() - startedAt)
                  : 0,
                modelFamilyName,
              },
              startedAt
                ? { durationMs: Math.round(performance.now() - startedAt) }
                : undefined,
            );
          } else {
            const detail = r.payload.error_message;
            studyLogger.log("retrain_failed", {
              modelFamilyName,
              error: detail ?? "unknown",
            });
          }
        }
        dispatch(clearRetrainDispatch());
        // Only refresh if the user is still on the dataset this retrain job
        // was for (selectedDatasetId may have moved on to a different
        // dataset while the job was polling) and snippetSetId is confirmed
        // to belong to it — otherwise this would fire the same cross-dataset
        // (snippet_set_id, dataset_id) mismatch the backend rejects. If the
        // user has navigated away, skip the refresh; the auto-inference
        // effect fetches fresh data when they return to this dataset anyway.
        const stillOnSameDataset = selectedDatasetId === stableDatasetId;
        const snippetSetValid =
          snippetSetId !== null &&
          snippetSets.some((s) => s.id === snippetSetId);
        // Job dispatches now also flow through this same
        // lastRetrainDispatch/poll loop when fetchAndAppendSuggestions/
        // runInference itself gets queued as an async job (checkpoint just
        // changed, nothing cached for it yet) — so that job's own
        // completion re-enters this branch too. Chase it until real rows
        // come back, but cap the chase: if the backend keeps queuing a new
        // job every time instead of ever serving the now-cached result,
        // stop rather than loop forever.
        const isRealRetrain = r.payload.trigger !== "inference";
        if (isRealRetrain) {
          inferenceChainCountRef.current = 0;
        }
        const shouldChain = isRealRetrain || inferenceChainCountRef.current < 2;
        if (
          status === "COMPLETED" &&
          shouldChain &&
          modelFamilyName !== null &&
          stillOnSameDataset &&
          snippetSetValid
        ) {
          if (!isRealRetrain) inferenceChainCountRef.current += 1;
          // Re-resolve the active checkpoint with a small top-K request. The
          // explore feed, histograms and projection follow the new
          // used_checkpoint_id automatically, keeping the scroll position.
          const suggestionParams = buildSuggestionParams(
            inferenceK,
            isValidateMode || isSuggestionsMode(modelInfo),
          );
          dispatch(
            runInference({
              model_family_name: modelFamilyName,
              dataset_id: stableDatasetId,
              snippet_set_id: snippetSetId as number,
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
        void dispatch(fetchEmbeddingOptions(stableDatasetId));
        return;
      }
      // A retrain held for an add-recordings run can wait up to an hour; poll
      // slowly until the backend releases it (the field turns null).
      timer = window.setTimeout(tick, r.payload.waiting_for_ingest_job_id ? 15000 : 2000);
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

  // ── Keep predictions in sync with the backend's active checkpoint ──────────
  const refreshedForCheckpointRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isAlLikeMode) return;
    if (selectedDatasetId === null || modelFamilyName === null) return;
    // Nothing scored yet, or a job is already in flight — don't interfere.
    if (lastInferenceAt === null) return;
    if (usedCheckpointId === null || snippetSetId === null) return;

    const datasetId = selectedDatasetId;
    const family = modelFamilyName;
    let cancelled = false;
    let timer: number | null = null;

    async function checkActiveCheckpoint() {
      if (cancelled) return;
      try {
        const fc = await alApi.getFeedbackCount(datasetId, family);
        const active = fc.active_checkpoint_id ?? null;
        if (
          !cancelled &&
          active !== null &&
          active !== usedCheckpointId &&
          active !== refreshedForCheckpointRef.current &&
          !inferenceLoading &&
          !retrainLoading
        ) {
          refreshedForCheckpointRef.current = active;
          const suggestionParams = buildSuggestionParams(
            inferenceK,
            isValidateMode || isSuggestionsMode(modelInfo),
          );
          dispatch(
            runInference({
              model_family_name: family,
              dataset_id: datasetId,
              snippet_set_id: snippetSetId as number,
              ...suggestionParams,
              // The new checkpoint's cache is empty; force a fresh scoring pass
              // so predictions carry the new model's scores.
              force_refresh: true,
            }),
          );
        }
      } catch {
        /* ignore transient poll errors — retried on the next tick */
      }
      timer = window.setTimeout(checkActiveCheckpoint, 12000);
    }

    void checkActiveCheckpoint();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [
    isAlLikeMode,
    selectedDatasetId,
    modelFamilyName,
    lastInferenceAt,
    usedCheckpointId,
    snippetSetId,
    inferenceLoading,
    retrainLoading,
    inferenceK,
    isValidateMode,
    buildSuggestionParams,
    modelInfo,
    dispatch,
  ]);

  // ── First model from bootstrap feedback ───────────────────────────────────
  // The feedback request that reached the threshold already trained the model
  // and ran full inference, so only the payload cache is refreshed
  // (force_refresh, never force_inference). The new used_checkpoint_id changes
  // the explore scope, so the feed, histograms and projection switch from the
  // score-less suggestions view to the model-ranked one.
  useEffect(() => {
    if (firstModelCheckpointId === null) return;
    const newCheckpointId = firstModelCheckpointId;
    dispatch(clearFirstModelCheckpoint());
    if (
      selectedDatasetId === null ||
      modelFamilyName === null ||
      snippetSetId === null ||
      !snippetSets.some((s) => s.id === snippetSetId)
    ) {
      return;
    }
    const datasetId = selectedDatasetId;
    // The active-checkpoint sync above must not refresh for it a second time.
    refreshedForCheckpointRef.current = newCheckpointId;
    dispatch(
      setInferenceConfig({
        modelCheckpointId: newCheckpointId,
        modelFamilyName,
        snippetSetId,
        embeddingModelId,
      }),
    );
    dispatch(
      runInference({
        model_family_name: modelFamilyName,
        dataset_id: datasetId,
        snippet_set_id: snippetSetId,
        ...buildSuggestionParams(inferenceK, true),
        force_refresh: true,
      }),
    );
    dispatch(
      fetchFeedbackCount({ dataset_id: datasetId, model_family_name: modelFamilyName }),
    );
    void dispatch(fetchEmbeddingOptions(datasetId));
    alApi
      .getCheckpoints(datasetId)
      .then((updated) => {
        // Label scope options and the Generate Feed button follow `checkpoints`.
        setCheckpoints(updated);
        setCheckpointsDatasetId(datasetId);
      })
      .catch(() => {
        /* the next dataset load refetches them */
      });
  }, [firstModelCheckpointId]);

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
      isValidateMode ||
        predictions.length === 0 ||
        isSuggestionsMode(modelInfo),
    );
    setHasGroundTruthMetadata(false);
    setTrainEmbeddingModelId(embeddingModelId ?? embeddingMethods?.[0]?.id ?? 0);
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
    embeddingModelId,
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
    checkpointsLoaded:
      checkpointsDatasetId === selectedDatasetId && embeddingOptionsLoaded,
    embeddingOptions,
    embeddingModelId,
    selectedOption,
    classifierTrainingModelId,
    handleSwitchEmbeddingModel,
    refreshEmbeddingOptions,
    handleTrainClassifier,
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
