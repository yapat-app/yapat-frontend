/**
 * AnnotationHub — unified annotation entry point.
 *
 * Three modes, one page:
 *   • random      → Classic feed (random snippets) + Feature Projection
 *   • similarity  → Classic feed (similarity search) + Feature Projection
 *   • al          → PAM Active Learning (PhaseLayout with full inference loop)
 *
 * URL params: ?mode=random|similarity|al  &  dataset_id=<id>
 */

import React, {
  useEffect,
  useCallback,
  useRef,
  useState,
  useMemo,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Select,
  Segmented,
  Spin,
  Tag,
  Tooltip,
  Button,
  InputNumber,
  Modal,
  Form,
  Alert,
  Input,
  Switch,
  message,
  Empty,
} from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  DeleteOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  ThunderboltOutlined,
  AudioOutlined,
} from "@ant-design/icons";

import { NavigationBar } from "../components/NavigationBar";
import { PhaseLayout } from "./ActiveLearning";
import { ClassicWorkspace } from "../components/layout/ClassicWorkspace";
import { UploadSampleAudio } from "../components/UploadingAudio";
import { useAnnotationWorkflow } from "../hooks/useAnnotationWorkflow";

import { useAppDispatch, useAppSelector } from "../hooks";
import {
  setSelectedDataset,
  setInferenceConfig,
  runInference,
  fetchFeedbackCount,
  clearSavedFeed,
  hydrateSavedFeed,
  restoreFeedFromServer,
  pollRetrainJob,
  trainFromScratch,
  setClassicAnnotationFeed,
  hydrateClassicFeedbacks,
  clearClassicAnnotationFeed,
} from "../redux/features/alSlice";
import { annotationApi } from "../services/api";
import { annotationsToClassicFeedbacks } from "../utils/classicFeedSync";
import {
  fetchSnippetFeed,
  fetchSimilaritySnippetFeed,
  clearSnippets,
  loadSnippets,
  saveClassicFeedSlot,
  restoreClassicFeedSlot,
} from "../redux/features/snippetSlice";
import { getFeedHistory } from "../redux/features/feedSlice";
import { getAllEmbeddingMethods, getAllDatasetEmbeddings } from "../redux/features/embeddingSlice";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../redux/features/datasetSlice";
import { embeddingApi } from "../services/api";
import { alApi } from "../services/alApi";
import type { PAMCheckpoint, PAMRunInferenceRequest, PAMSuggestionMode } from "../types/al";
import type { FeedSimilarityCreate, SnippetSet } from "../types";
import { usePhaseConfig } from "../studyPhases";
import type { PhaseConfig } from "../studyPhases/types";
import { pickLatestServerClassicFeed } from "../utils/classicFeedServerHydrate";
import store from "../redux/store";

const { Option } = Select;

// ── Types ─────────────────────────────────────────────────────────────────────

type AnnotateMode = "random" | "similarity" | "al";

// ── AL helpers (unchanged from ActiveLearning.tsx) ────────────────────────────

function buildInferenceSuggestionParams(
  phase: PhaseConfig,
  topKOnly: boolean,
  k: number,
  samplingMethod: string,
): Pick<PAMRunInferenceRequest, "sample_suggestion" | "suggestion_strategy" | "k"> {
  const feedSupportsSuggestions =
    phase.feed.mode !== "single_card_on_select" && phase.feed.mode !== "hidden";
  if (!topKOnly || !feedSupportsSuggestions) {
    return { sample_suggestion: false };
  }
  return {
    sample_suggestion: true,
    suggestion_strategy: (phase.feed.samplingStrategy ?? samplingMethod) as PAMRunInferenceRequest["suggestion_strategy"],
    k: phase.feed.topK ?? k,
  };
}

function isSuggestionsMode(modelInfo: Record<string, unknown>): boolean {
  return (modelInfo.mode as PAMSuggestionMode | undefined) === "suggestions";
}

// ── Component ─────────────────────────────────────────────────────────────────

export const AnnotationHub: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const phase = usePhaseConfig();

  // ── Mode ──────────────────────────────────────────────────────────────────
  const rawMode = searchParams.get("mode");
  const mode: AnnotateMode =
    rawMode === "al" || rawMode === "similarity" ? rawMode : "random";

  const setMode = useCallback(
    (next: AnnotateMode) => {
      const params: Record<string, string> = { mode: next };
      const dsId = searchParams.get("dataset_id");
      if (dsId) params.dataset_id = dsId;

      if (next === "al") {
        if (dsId && (mode === "random" || mode === "similarity")) {
          const ds = Number(dsId);
          if (!Number.isNaN(ds)) {
            dispatch(saveClassicFeedSlot({ datasetId: ds, kind: mode }));
          }
        }
        dispatch(clearSnippets());
        dispatch(clearClassicAnnotationFeed());
      }

      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, dispatch, mode],
  );

  // ── Shared dataset state ───────────────────────────────────────────────────
  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (user?.role === "admin") dispatch(fetchAllDatasets());
    else if (user?.role === "team_owner") dispatch(fetchAllTeamDatasets());
  }, [user, dispatch]);

  // ── AL state (mirrors ActiveLearning.tsx) ─────────────────────────────────
  const { embeddingMethods, loading: embeddingMethodsLoading } = useAppSelector(
    (state) => state.embedding,
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
  } = useAppSelector((state) => state.al);

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
    dispatch(fetchFeedbackCount({ dataset_id: selectedDatasetId, model_family_name: modelFamilyName }));
  }, [dispatch, selectedDatasetId, modelFamilyName, predictions.length]);

  useEffect(() => {
    const needsFullSet =
      phase.feed.mode === "single_card_on_select" ||
      phase.visualization.mode === "whole_dataset";
    const isSuggestions = (modelInfo as any)?.mode === "suggestions";
    if (
      needsFullSet && isSuggestions &&
      selectedDatasetId !== null && snippetSetId !== null &&
      modelFamilyName !== null && !inferenceLoading
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
    phase.id, phase.feed.mode, phase.visualization.mode,
    modelInfo, selectedDatasetId, snippetSetId, modelFamilyName, inferenceLoading, dispatch,
  ]);

  useEffect(() => { dispatch(hydrateSavedFeed()); }, [dispatch]);

  useEffect(() => {
    if (inferenceLoading || predictions.length > 0) return;
    if (!lastInferenceAt || selectedDatasetId === null || snippetSetId === null || !modelFamilyName) return;
    void dispatch(restoreFeedFromServer());
  }, [dispatch, inferenceLoading, predictions.length, lastInferenceAt, selectedDatasetId, snippetSetId, modelFamilyName]);

  // Sync dataset_id URL param ↔ AL slice
  useEffect(() => {
    if (mode !== "al") return;
    const raw = searchParams.get("dataset_id");
    if (!raw) {
      if (selectedDatasetId !== null && (predictions.length > 0 || lastInferenceAt)) {
        setSearchParams({ mode: "al", dataset_id: String(selectedDatasetId) }, { replace: true });
      }
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    if (parsed !== (selectedDatasetId === null ? null : Number(selectedDatasetId))) {
      dispatch(setSelectedDataset(parsed));
    }
  }, [dispatch, searchParams, mode, selectedDatasetId, predictions.length, lastInferenceAt, setSearchParams]);

  useEffect(() => {
    const family = searchParams.get("model_family");
    if (family) setLocalFamily(family);
  }, [searchParams]);

  // ── AL inference modal state ───────────────────────────────────────────────
  const [alConfigOpen, setAlConfigOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<PAMCheckpoint[]>([]);
  const [snippetSets, setSnippetSets] = useState<SnippetSet[]>([]);
  const [localCkpt, setLocalCkpt] = useState<number | null>(modelCheckpointId);
  const [localFamily, setLocalFamily] = useState<string | null>(modelFamilyName);
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);
  const [localK, setLocalK] = useState<number>(inferenceK);
  const [localTopKOnly, setLocalTopKOnly] = useState<boolean>(true);
  const [hasGroundTruthMetadata, setHasGroundTruthMetadata] = useState<boolean>(false);
  const [trainEmbeddingModelId, setTrainEmbeddingModelId] = useState<number>(1);
  const [trainMetadataPath, setTrainMetadataPath] = useState<string>("");
  const [trainLabelConfigPath, setTrainLabelConfigPath] = useState<string>("");
  const [trainDevice, setTrainDevice] = useState<"cpu" | "cuda">("cpu");
  const [trainRunInference, setTrainRunInference] = useState<boolean>(false);

  useEffect(() => {
    if (selectedDatasetId === null) return;
    alApi.getCheckpoints(selectedDatasetId).then(setCheckpoints).catch(() => {});
    embeddingApi.allSnippetSets(selectedDatasetId).then(setSnippetSets).catch(() => {});
  }, [selectedDatasetId]);

  useEffect(() => {
    if (checkpoints.length === 0) {
      if (!localFamily) setLocalFamily(modelFamilyName ?? "default");
      setLocalCkpt(null);
      return;
    }
    if (localCkpt !== null) {
      const fam = checkpoints.find((c) => c.id === localCkpt)?.model_family_name ?? null;
      if (fam && fam !== localFamily) setLocalFamily(fam);
      return;
    }
    const first = checkpoints[0];
    if (first) {
      setLocalCkpt(first.id);
      setLocalFamily(first.model_family_name ?? null);
    }
  }, [checkpoints]);

  const handleDatasetChange = useCallback(
    (value: number) => {
      dispatch(setSelectedDataset(value));
      setSearchParams({ mode: "al", dataset_id: String(value) });
    },
    [dispatch, setSearchParams],
  );

  const handleRunInference = () => {
    if (selectedDatasetId === null || localSS === null) return;
    const family =
      (localFamily ?? "").trim() ||
      (localCkpt !== null ? checkpoints.find((c) => c.id === localCkpt)?.model_family_name ?? "" : "");
    if (!family) return;
    const embeddingModelId =
      snippetSets.find((s) => s.id === localSS)?.embedding_model_id ??
      embeddingMethods?.[0]?.id ?? 1;
    const suggestionParams = buildInferenceSuggestionParams(phase, localTopKOnly, localK, samplingMethod);
    const k = suggestionParams.k ?? localK;
    dispatch(setInferenceConfig({ modelCheckpointId: localCkpt, modelFamilyName: family, snippetSetId: localSS, embeddingModelId, k }));
    dispatch(runInference({ model_family_name: family, dataset_id: selectedDatasetId, snippet_set_id: localSS, ...suggestionParams }));
    dispatch(fetchFeedbackCount({ dataset_id: selectedDatasetId, model_family_name: family }));
    setAlConfigOpen(false);
  };

  const handleOpenALSession = async () => {
    if (checkpoints.length > 0) { handleRunInference(); return; }
    if (selectedDatasetId === null || localSS === null) return;
    const family = (localFamily ?? "").trim() || "default";
    if (!hasGroundTruthMetadata) { handleRunInference(); return; }
    if (!trainEmbeddingModelId || !Number.isFinite(trainEmbeddingModelId)) return;
    if (!trainMetadataPath.trim() || !trainLabelConfigPath.trim()) return;
    const result = await dispatch(
      trainFromScratch({
        dataset_id: selectedDatasetId,
        model_family_name: family,
        snippet_set_id: localSS ?? undefined,
        embedding_model_id: trainEmbeddingModelId,
        metadata_path: trainMetadataPath.trim(),
        label_config_path: trainLabelConfigPath.trim(),
        device: trainDevice,
        run_inference: trainRunInference,
      }),
    );
    if (!trainFromScratch.fulfilled.match(result)) { message.error("Failed to dispatch training job"); return; }
    message.success(`Training job ${result.payload.job_id} dispatched`);
    setAlConfigOpen(false);
  };

  // Retrain job polling
  const lastNotifiedJobIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedDatasetId) return;
    const stableDatasetId: number = selectedDatasetId;
    const jobId = lastRetrainDispatch?.job_id;
    if (jobId === undefined || jobId === null) return;
    const stableJobId: number = jobId;
    let cancelled = false;
    let timer: number | null = null;
    async function tick() {
      if (cancelled) return;
      const r = await dispatch(pollRetrainJob(stableJobId));
      if (!pollRetrainJob.fulfilled.match(r)) {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          message.warning("Could not poll retrain job — loading current predictions");
        }
        if (modelFamilyName !== null && snippetSetId !== null && selectedDatasetId !== null) {
          dispatch(runInference({ model_family_name: modelFamilyName, dataset_id: selectedDatasetId, snippet_set_id: snippetSetId, force_refresh: false, ...buildInferenceSuggestionParams(phase, isSuggestionsMode(modelInfo), inferenceK, samplingMethod) }));
        }
        return;
      }
      const status = r.payload.status;
      if (status === "COMPLETED" || status === "FAILED") {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          if (status === "COMPLETED") message.success("Training completed — checkpoint is ready");
          else message.error("Training failed — loading current predictions");
        }
        if (modelFamilyName !== null && snippetSetId !== null && selectedDatasetId !== null) {
          dispatch(runInference({ model_family_name: modelFamilyName, dataset_id: selectedDatasetId, snippet_set_id: snippetSetId, force_refresh: status === "COMPLETED", ...buildInferenceSuggestionParams(phase, isSuggestionsMode(modelInfo), inferenceK, samplingMethod) }));
        }
        try { const updated = await alApi.getCheckpoints(stableDatasetId); setCheckpoints(updated); } catch {}
        return;
      }
      timer = window.setTimeout(tick, 2000);
    }
    tick();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [dispatch, lastRetrainDispatch, selectedDatasetId, modelFamilyName, snippetSetId, samplingMethod, inferenceK, phase, modelInfo]);

  const retrainTag = lastRetrainJob ? (
    <Tag
      color={{ PENDING: "default", RUNNING: "processing", COMPLETED: "success", FAILED: "error" }[lastRetrainJob.status]}
      className="text-xs"
    >
      Model: {lastRetrainJob.status}
    </Tag>
  ) : null;

  const isRestoredFeed = lastInferenceAt !== null && predictions.length > 0;
  const savedFeedLabel = isRestoredFeed
    ? new Date(lastInferenceAt!).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  // ── Classic feed config modal state ───────────────────────────────────────
  const [classicConfigOpen, setClassicConfigOpen] = useState(false);
  const [serverHydrateBusy, setServerHydrateBusy] = useState(false);
  const [feedLimit, setFeedLimit] = useState(50);
  const [similarityState, setSimilarityState] = useState<{
    audioFile: File | null; startSec: number; endSec: number;
  }>({ audioFile: null, startSec: 0, endSec: 3 });

  const handleSimilarityChange = useCallback(
    (value: { audioFile: File | null; startSec: number; endSec: number }) => {
      setSimilarityState(value);
    },
    [],
  );

  const classicDatasetId = searchParams.get("dataset_id");
  const classicFeedCacheUserId = useAppSelector((s) => s.snippet.classicFeedCacheUserId);

  const prevClassicRef = useRef<{ datasetId: string; mode: "random" | "similarity" } | null>(null);
  const serverHydrateTriedRef = useRef<string | null>(null);

  useEffect(() => {
    if (mode !== "random" && mode !== "similarity") {
      prevClassicRef.current = null;
      return;
    }
    if (!classicDatasetId) {
      prevClassicRef.current = null;
      return;
    }
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    const prev = prevClassicRef.current;
    if (prev) {
      const prevDs = Number(prev.datasetId);
      const datasetChanged = prev.datasetId !== classicDatasetId;
      const modeChanged = prev.mode !== mode;
      if (!Number.isNaN(prevDs) && (datasetChanged || modeChanged)) {
        dispatch(saveClassicFeedSlot({ datasetId: prevDs, kind: prev.mode }));
      }
    }

    dispatch(restoreClassicFeedSlot({ datasetId: ds, kind: mode }));
    prevClassicRef.current = { datasetId: classicDatasetId, mode };
  }, [mode, classicDatasetId, classicFeedCacheUserId, dispatch]);

  // Classic annotation workflow — always active so per-mode slots restore correctly.
  const { snippets } = useAnnotationWorkflow({
    datasetId: classicDatasetId,
    enabled: mode !== "al",
    skipFeedHistoryAutoLoad: true,
  });

  // When localStorage has no slot, restore the latest server-stored feed for this user+dataset+mode (cross-device).
  useEffect(() => {
    if (mode !== "random" && mode !== "similarity") return;
    if (!classicDatasetId || classicFeedCacheUserId == null) return;
    const ds = Number(classicDatasetId);
    if (Number.isNaN(ds)) return;

    const snippetLen = store.getState().snippet.snippets.length;
    if (snippetLen > 0) {
      serverHydrateTriedRef.current = null;
      return;
    }

    const tryKey = `${classicFeedCacheUserId}-${classicDatasetId}-${mode}`;
    if (serverHydrateTriedRef.current === tryKey) return;

    let cancelled = false;
    setServerHydrateBusy(true);
    void (async () => {
      try {
        const result = await dispatch(
          getFeedHistory({ method: mode, dataset_id: ds }),
        );
        if (cancelled) return;
        serverHydrateTriedRef.current = tryKey;
        if (!getFeedHistory.fulfilled.match(result)) return;
        const match = pickLatestServerClassicFeed(result.payload, ds, mode);
        if (!match?.response?.length) return;
        dispatch(loadSnippets({ id: match.id, response: match.response }));
        dispatch(saveClassicFeedSlot({ datasetId: ds, kind: mode }));
      } finally {
        if (!cancelled) setServerHydrateBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, classicDatasetId, classicFeedCacheUserId, snippets.length, dispatch]);

  // Mirror classic snippets into alSlice so PredictionFeed matches Active Learning UI.
  useEffect(() => {
    if (mode === "al" || !classicDatasetId) return;
    const datasetId = Number(classicDatasetId);
    if (Number.isNaN(datasetId)) return;

    if (snippets.length === 0) {
      dispatch(clearClassicAnnotationFeed());
      return;
    }

    dispatch(setClassicAnnotationFeed({ snippets, datasetId }));

    let cancelled = false;
    (async () => {
      try {
        const rows = await Promise.all(
          snippets.map((s) =>
            annotationApi.getAll({ snippet_id: s.id }).catch(() => []),
          ),
        );
        if (cancelled) return;
        dispatch(
          hydrateClassicFeedbacks(annotationsToClassicFeedbacks(snippets, rows)),
        );
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, snippets, classicDatasetId, dispatch]);

  // Load embeddings for classic modes (used by similarity feed generation).
  useEffect(() => {
    if (!classicDatasetId || mode === "al") return;
    dispatch(getAllDatasetEmbeddings(Number(classicDatasetId)));
  }, [classicDatasetId, mode, dispatch]);

  const { snippetsLoading, snippets: snippetList } = useAppSelector((state) => state.snippet);
  const hasClassicFeed = snippetList.length > 0;

  // Navigate to classic workspace after feed is loaded.
  useEffect(() => {
    if (snippets.length > 0 && classicConfigOpen) {
      setClassicConfigOpen(false);
    }
  }, [snippets.length]);

  const classicCanGenerate = mode === "random"
    ? !!classicDatasetId
    : !!classicDatasetId && !!similarityState.audioFile;

  const handleGenerateFeed = () => {
    if (!classicDatasetId) return;
    const dsId = Number(classicDatasetId);
    if (mode === "random") {
      dispatch(fetchSnippetFeed({ dataset_id: dsId, limit: feedLimit, method: "random" }));
    } else {
      const { audioFile, startSec, endSec } = similarityState;
      if (!audioFile) return;
      const payload: FeedSimilarityCreate = {
        audio_file: audioFile,
        dataset_id: dsId,
        start_time: startSec,
        end_time: endSec,
        limit: feedLimit,
      };
      dispatch(fetchSimilaritySnippetFeed(payload));
    }
  };

  // ── Classic empty / loading (per dataset + mode slot) ─────────────────────
  const isClassicMode = mode === "random" || mode === "similarity";
  const showClassicSpinner =
    isClassicMode &&
    !!classicDatasetId &&
    snippets.length === 0 &&
    (snippetsLoading || serverHydrateBusy);
  const showClassicEmpty =
    isClassicMode &&
    (!classicDatasetId ||
      (snippets.length === 0 && !snippetsLoading && !serverHydrateBusy));
  const generateFeedLabel = hasClassicFeed ? "Generate new feed" : "Generate feed";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
      <NavigationBar />

      {/* ── Unified toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">

        {/* Mode tabs */}
        <Segmented
          value={mode}
          onChange={(v) => setMode(v as AnnotateMode)}
          options={[
            { label: <span className="font-ibm-sans text-xs px-1">Random</span>, value: "random", icon: <UnorderedListOutlined /> },
            { label: <span className="font-ibm-sans text-xs px-1">Similarity</span>, value: "similarity", icon: <AudioOutlined /> },
            { label: <span className="font-ibm-sans text-xs px-1">Active Learning</span>, value: "al", icon: <ThunderboltOutlined /> },
          ]}
          className="flex-shrink-0"
        />

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        {/* Dataset selector — for AL mode only (drives inference state) */}
        {mode === "al" && (
          <div className="flex items-center gap-2">
            <DatabaseOutlined className="text-gray-400" />
            <Select
              placeholder="Select dataset"
              value={selectedDatasetId ?? undefined}
              onChange={handleDatasetChange}
              style={{ width: 200 }}
              showSearch
              optionFilterProp="children"
            >
              {allDatasets.map((d) => (
                <Option key={d.id} value={d.id}>{d.name}</Option>
              ))}
            </Select>
          </div>
        )}

        {/* Dataset selector — for classic modes (informational + sets URL param) */}
        {mode !== "al" && (
          <div className="flex items-center gap-2">
            <DatabaseOutlined className="text-gray-400" />
            <Select
              placeholder="Select dataset"
              value={classicDatasetId ? Number(classicDatasetId) : undefined}
              onChange={(v: number) => {
                setSearchParams({ mode, dataset_id: String(v) });
              }}
              style={{ width: 200 }}
              showSearch
              optionFilterProp="children"
            >
              {allDatasets.map((d) => (
                <Option key={d.id} value={d.id}>{d.name}</Option>
              ))}
            </Select>
          </div>
        )}

        {/* Phase tag (AL only) */}
        {mode === "al" && (
          <Tooltip title={`Active study phase: ${phase.label}`}>
            <Tag color="purple" className="text-xs">{phase.id}</Tag>
          </Tooltip>
        )}

        {/* Action buttons */}
        {mode === "al" && selectedDatasetId !== null && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={inferenceLoading}
            onClick={() => {
              setLocalCkpt(modelCheckpointId);
              setLocalFamily(modelFamilyName);
              setLocalSS(snippetSetId);
              setLocalK(inferenceK);
              setLocalTopKOnly(predictions.length === 0 || isSuggestionsMode(modelInfo));
              setHasGroundTruthMetadata(false);
              setTrainEmbeddingModelId(embeddingMethods?.[0]?.id ?? 1);
              setTrainMetadataPath("");
              setTrainLabelConfigPath("");
              setTrainDevice("cpu");
              setTrainRunInference(false);
              setAlConfigOpen(true);
            }}
            style={{ backgroundColor: "#1e40af", color: "#fff" }}
          >
            Start Inference
          </Button>
        )}

        {mode !== "al" && classicDatasetId && (
          <Button
            type="primary"
            icon={<SettingOutlined />}
            onClick={() => setClassicConfigOpen(true)}
            loading={(snippetsLoading || serverHydrateBusy) && !hasClassicFeed}
          >
            {generateFeedLabel}
          </Button>
        )}

        {/* AL stats */}
        {mode === "al" && predictions.length > 0 && (
          <div className="flex items-center gap-3 text-xs font-ibm-sans text-gray-500">
            <Tooltip title="Total predictions">
              <span className="flex items-center gap-1">
                <BulbOutlined className="text-blue-400" />
                {predictions.length} predictions
              </span>
            </Tooltip>
            <Tooltip title="Feedbacks since last retrain">
              <span className="flex items-center gap-1">
                <CheckCircleOutlined className="text-green-500" />
                {feedbackCountDisplay.shown}/{retrainThreshold}
                {feedbackCountDisplay.pending && (
                  <Tag color="gold" className="ml-1">Training…</Tag>
                )}
              </span>
            </Tooltip>
            {retrainTag}
            {isRestoredFeed && (
              <Tooltip title="Showing saved feed from a previous session. Click to clear.">
                <Tag
                  icon={<HistoryOutlined />}
                  color="blue"
                  closable
                  onClose={() => dispatch(clearSavedFeed())}
                  className="cursor-pointer"
                >
                  Saved · {savedFeedLabel}
                </Tag>
              </Tooltip>
            )}
          </div>
        )}

        {mode === "al" && inferenceLoading && <Spin size="small" />}
      </div>

      {/* ── Saved-feed banner (AL — no dataset but feed restored) ────────── */}
      {mode === "al" && !selectedDatasetId && isRestoredFeed && (
        <Alert
          type="info"
          showIcon
          icon={<HistoryOutlined />}
          className="mx-6 mt-3 rounded-lg"
          message={
            <span className="text-sm font-ibm-sans">
              Showing saved feed from <strong>{savedFeedLabel}</strong> — select the original dataset to run new inference or give feedback.
            </span>
          }
          action={
            <Button size="small" icon={<DeleteOutlined />} onClick={() => dispatch(clearSavedFeed())} danger>
              Clear
            </Button>
          }
        />
      )}

      {/* ── Main workspace ───────────────────────────────────────────────── */}

      {/* AL mode */}
      {mode === "al" && (
        !selectedDatasetId && !isRestoredFeed ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-3 text-gray-400">
            <DatabaseOutlined style={{ fontSize: 48 }} />
            <p className="text-lg font-ibm-sans">Select a dataset to start Active Learning</p>
            <p className="text-sm font-ibm-sans">Then click "Start Inference" to load predictions.</p>
          </div>
        ) : (
          <PhaseLayout />
        )
      )}

      {/* Classic modes — empty state */}
      {isClassicMode && showClassicSpinner && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Spin size="large" />
          <p className="text-sm text-gray-500 font-ibm-sans">Loading feed…</p>
        </div>
      )}

      {isClassicMode && showClassicEmpty && !showClassicSpinner && (
        <div className="flex flex-1 items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-center">
                <p className="text-lg font-semibold font-ibm-mono mb-1">No feed for this {mode} mode</p>
                <p className="text-gray-500 text-sm font-ibm-sans mb-4">
                  {!classicDatasetId
                    ? "Select a dataset above, then generate a feed to start annotating."
                    : mode === "similarity"
                      ? "No saved similarity feed for this dataset yet. Generate one with a reference audio sample."
                      : "No saved random feed for this dataset yet. Generate one to start annotating."}
                </p>
                {classicDatasetId && (
                  <Button type="primary" onClick={() => setClassicConfigOpen(true)}>
                    {generateFeedLabel}
                  </Button>
                )}
                {!classicDatasetId && (
                  <Button onClick={() => navigate("/datasets")}>Browse Datasets</Button>
                )}
              </div>
            }
          />
        </div>
      )}

      {/* Classic modes — workspace */}
      {isClassicMode && !showClassicEmpty && !showClassicSpinner && (
        <ClassicWorkspace />
      )}

      {/* ── AL Inference config modal ──────────────────────────────────── */}
      <Modal
        title={checkpoints.length > 0 ? "Resume labeling" : "Start labeling"}
        open={alConfigOpen}
        onCancel={() => setAlConfigOpen(false)}
        onOk={handleOpenALSession}
        okText={checkpoints.length > 0 ? "Resume" : hasGroundTruthMetadata ? "Start training" : "Start annotating"}
        okButtonProps={{
          disabled:
            !localSS ||
            (checkpoints.length === 0
              ? !(localFamily && localFamily.trim().length > 0) ||
                (hasGroundTruthMetadata &&
                  (!Number.isFinite(trainEmbeddingModelId) || !trainMetadataPath.trim() || !trainLabelConfigPath.trim()))
              : !localCkpt),
          style: { backgroundColor: "#1e40af", color: "#fff" },
        }}
      >
        <Form layout="vertical" className="mt-4">
          {checkpoints.length > 0 ? (
            <Form.Item label="Model Checkpoint" required>
              <Select
                placeholder="Select checkpoint"
                value={localCkpt ?? undefined}
                onChange={(id: number) => {
                  setLocalCkpt(id);
                  const fam = checkpoints.find((c) => c.id === id)?.model_family_name ?? null;
                  setLocalFamily(fam);
                }}
                style={{ width: "100%" }}
              >
                {checkpoints.map((c) => (
                  <Option key={c.id} value={c.id}>
                    {c.model_family_name} — {c.version} {c.is_base ? "(base)" : ""}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          ) : (
            <>
              <Alert
                type="info"
                showIcon
                message="No model checkpoint found yet"
                description="Cold-start from ground-truth metadata or bootstrap with random samples."
                className="mb-3"
              />
              <Form.Item label="Model family name" required>
                <Input
                  placeholder="e.g. birdnet, yamnet, default"
                  value={localFamily ?? ""}
                  onChange={(e) => setLocalFamily(e.target.value)}
                />
              </Form.Item>
              <Form.Item label="Do you have ground-truth metadata?">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-gray-600">Train from metadata (cold start)</div>
                  <Switch
                    checked={hasGroundTruthMetadata}
                    onChange={(v) => { setHasGroundTruthMetadata(v); if (v) dispatch(getAllEmbeddingMethods()); }}
                  />
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  If disabled, the session starts in bootstrap mode (random samples).
                </div>
              </Form.Item>
              {hasGroundTruthMetadata && (
                <>
                  <Form.Item label="Embedding model" required>
                    <Select
                      placeholder={embeddingMethodsLoading ? "Loading…" : "Select embedding model"}
                      loading={embeddingMethodsLoading}
                      value={trainEmbeddingModelId}
                      onChange={(v: number) => setTrainEmbeddingModelId(v)}
                      style={{ width: "100%" }}
                      showSearch
                      optionFilterProp="children"
                    >
                      {(embeddingMethods ?? []).map((m) => (
                        <Option key={m.id} value={m.id}>{m.name} — {m.version}</Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item label="Metadata path (ground truth)" required>
                    <Input placeholder='e.g. "pam/FNJV/metadata.csv"' value={trainMetadataPath} onChange={(e) => setTrainMetadataPath(e.target.value)} />
                  </Form.Item>
                  <Form.Item label="Label config path" required>
                    <Input placeholder='e.g. "pam/FNJV/labels.json"' value={trainLabelConfigPath} onChange={(e) => setTrainLabelConfigPath(e.target.value)} />
                  </Form.Item>
                  <Form.Item label="Device">
                    <Select value={trainDevice} onChange={(v) => setTrainDevice(v)} style={{ width: "100%" }}>
                      <Option value="cpu">cpu</Option>
                      <Option value="cuda">cuda</Option>
                    </Select>
                  </Form.Item>
                  <Form.Item label="Run inference automatically after training">
                    <Switch checked={trainRunInference} onChange={setTrainRunInference} />
                  </Form.Item>
                </>
              )}
            </>
          )}
          <Form.Item label="Snippet Set" required>
            <Select
              placeholder="Select snippet set"
              value={localSS ?? undefined}
              onChange={setLocalSS}
              style={{ width: "100%" }}
            >
              {snippetSets.map((s) => (
                <Option key={s.id} value={s.id}>Set #{s.id} — {s.status}</Option>
              ))}
            </Select>
            {snippetSets.length === 0 && (
              <p className="text-xs text-amber-500 mt-1">No snippet sets found. Generate embeddings first.</p>
            )}
          </Form.Item>
          <Form.Item label="Top-K predictions">
            <InputNumber
              min={1} max={500} value={localK}
              onChange={(v) => setLocalK(v ?? 20)}
              style={{ width: "100%" }}
              disabled={!localTopKOnly || (checkpoints.length === 0 && hasGroundTruthMetadata)}
            />
          </Form.Item>
          <Form.Item label="Mode">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">Return only Top‑K suggestions</div>
              <Switch
                checked={localTopKOnly}
                onChange={setLocalTopKOnly}
                disabled={checkpoints.length === 0 && hasGroundTruthMetadata}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              When disabled, returns all predictions for the selected snippet set.
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Classic feed config modal ─────────────────────────────────────── */}
      <Modal
        title={
          mode === "similarity"
            ? "New similarity feed"
            : "New random feed"
        }
        open={classicConfigOpen}
        onCancel={() => setClassicConfigOpen(false)}
        onOk={handleGenerateFeed}
        okText={generateFeedLabel}
        okButtonProps={{
          disabled: !classicCanGenerate || snippetsLoading || serverHydrateBusy,
          loading: snippetsLoading || serverHydrateBusy,
          style: { backgroundColor: "#1e40af", color: "#fff" },
        }}
      >
        <Form layout="vertical" className="mt-4">
          {mode === "similarity" && (
            <UploadSampleAudio onChange={handleSimilarityChange} />
          )}
          <Form.Item
            label="Feed limit"
            tooltip="Maximum number of snippets to include in the feed"
          >
            <InputNumber
              min={1}
              max={1000}
              value={feedLimit}
              onChange={(v) => setFeedLimit(v ?? 50)}
              style={{ width: "100%" }}
            />
          </Form.Item>
          {mode === "similarity" && !similarityState.audioFile && (
            <p className="text-xs text-amber-500">Upload a reference audio file to enable generation.</p>
          )}
        </Form>
      </Modal>
    </div>
  );
};
