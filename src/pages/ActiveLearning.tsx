/**
 * Active Learning page.
 *
 * Loads predictions via the PAM active learning inference API.
 */

import React, { useEffect, useCallback, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Select, Spin, Tag, Tooltip, Button, InputNumber, Modal, Form, Alert, Input, Switch, message } from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { NavigationBar } from "../components/NavigationBar";
import { ProjectionView } from "../components/al/ProjectionView";
import { PredictionFeed } from "../components/al/PredictionFeed";
import { ResizableSplit } from "../components/layout/ResizableSplit";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  setSelectedDataset,
  setInferenceConfig,
  runInference,
  fetchFeedbackCount,
  clearSavedFeed,
  pollRetrainJob,
  trainFromScratch,
} from "../redux/features/alSlice";
import { getAllEmbeddingMethods } from "../redux/features/embeddingSlice";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../redux/features/datasetSlice";
import { embeddingApi } from "../services/api";
import { alApi } from "../services/alApi";
import type { PAMCheckpoint, PAMRunInferenceRequest, PAMSuggestionMode } from "../types/al";
import type { SnippetSet } from "../types";
import { usePhaseConfig } from "../studyPhases";
import type { PhaseConfig } from "../studyPhases/types";

const { Option } = Select;

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

export const ActiveLearning: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const phase = usePhaseConfig();

  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  const { embeddingMethods, loading: embeddingMethodsLoading } = useAppSelector((state) => state.embedding);
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

  // Backend is the source of truth for retrain state.
  const feedbackCountDisplay = useMemo(() => {
    if (!Number.isFinite(retrainThreshold) || retrainThreshold <= 0) {
      return { shown: feedbackCount, pending: retrainPending };
    }
    return {
      shown: retrainPending ? 0 : Math.min(feedbackCount, retrainThreshold),
      pending: retrainPending,
    };
  }, [feedbackCount, retrainThreshold, retrainPending]);

  // Refresh backend feedback counter after loading predictions.
  useEffect(() => {
    if (selectedDatasetId === null) return;
    if (!modelFamilyName) return;
    if (predictions.length === 0) return;
    dispatch(fetchFeedbackCount({ dataset_id: selectedDatasetId, model_family_name: modelFamilyName }));
  }, [dispatch, selectedDatasetId, modelFamilyName, predictions.length]);

  // Ensure full prediction set is available for whole-dataset/inspect flows.
  useEffect(() => {
    const needsFullSet =
      phase.feed.mode === "single_card_on_select" ||
      phase.visualization.mode === "whole_dataset";
    const isSuggestionsMode = (modelInfo as any)?.mode === "suggestions";

    if (
      needsFullSet &&
      isSuggestionsMode &&
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
    selectedDatasetId,
    snippetSetId,
    modelFamilyName,
    inferenceLoading,
    dispatch,
  ]);

  // Local state for the “Open session” modal.
  const [configOpen, setConfigOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<PAMCheckpoint[]>([]);
  const [snippetSets, setSnippetSets] = useState<SnippetSet[]>([]);
  const [localCkpt, setLocalCkpt] = useState<number | null>(modelCheckpointId);
  const [localFamily, setLocalFamily] = useState<string | null>(modelFamilyName);
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);
  const [localK, setLocalK] = useState<number>(inferenceK);
  const [localTopKOnly, setLocalTopKOnly] = useState<boolean>(true);

  // Bootstrap/cold-start chooser (only when no checkpoints exist).
  const [hasGroundTruthMetadata, setHasGroundTruthMetadata] = useState<boolean>(false);

  // Cold-start training form fields (only when metadata-based training is enabled).
  const [trainEmbeddingModelId, setTrainEmbeddingModelId] = useState<number>(1);
  const [trainMetadataPath, setTrainMetadataPath] = useState<string>("");
  const [trainLabelConfigPath, setTrainLabelConfigPath] = useState<string>("");
  const [trainDevice, setTrainDevice] = useState<"cpu" | "cuda">("cpu");
  const [trainRunInference, setTrainRunInference] = useState<boolean>(false);

  // Load datasets.
  useEffect(() => {
    if (user?.role === "admin") dispatch(fetchAllDatasets());
    else if (user?.role === "team_owner") dispatch(fetchAllTeamDatasets());
  }, [user]);

  // Sync dataset_id from URL.
  useEffect(() => {
    const raw = searchParams.get("dataset_id");
    if (!raw) return;

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;

    if (parsed !== selectedDatasetId) {
      dispatch(setSelectedDataset(parsed));
    }
  }, [dispatch, searchParams, selectedDatasetId]);

  useEffect(() => {
    const family = searchParams.get("model_family");
    if (family) {
      setLocalFamily(family);
    }
  }, [searchParams]);

  // Load checkpoints and snippet sets for the selected dataset.
  useEffect(() => {
    if (selectedDatasetId === null) return;
    alApi.getCheckpoints(selectedDatasetId).then(setCheckpoints).catch(() => {});
    embeddingApi.allSnippetSets(selectedDatasetId).then(setSnippetSets).catch(() => {});
  }, [selectedDatasetId]);

  // Keep modal selections consistent with loaded checkpoints.
  useEffect(() => {
  // Bootstrap mode: no checkpoints; ensure a model family name is set.
    if (checkpoints.length === 0) {
      if (!localFamily) setLocalFamily(modelFamilyName ?? "default");
      setLocalCkpt(null);
      return;
    }

  // Normal mode: keep family in sync with selected checkpoint, or preselect the newest.
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
      setSearchParams({ dataset_id: String(value) });
    },
    [dispatch, setSearchParams],
  );

  const handleRunInference = () => {
    if (selectedDatasetId === null || localSS === null) return;

    const family = (localFamily ?? "").trim() ||
      (localCkpt !== null ? checkpoints.find((c) => c.id === localCkpt)?.model_family_name ?? "" : "");
    if (!family) return;

    const embeddingModelId =
      snippetSets.find((s) => s.id === localSS)?.embedding_model_id ??
      embeddingMethods?.[0]?.id ??
      1;

    const suggestionParams = buildInferenceSuggestionParams(
      phase,
      localTopKOnly,
      localK,
      samplingMethod,
    );
    const k = suggestionParams.k ?? localK;

    dispatch(
      setInferenceConfig({
        modelCheckpointId: localCkpt,
        modelFamilyName: family,
        snippetSetId: localSS,
        embeddingModelId,
        k,
      }),
    );
    dispatch(
      runInference({
        model_family_name: family,
        dataset_id: selectedDatasetId,
        snippet_set_id: localSS,
        ...suggestionParams,
      }),
    );
  // Refresh feedback counter for the active model family.
    dispatch(fetchFeedbackCount({ dataset_id: selectedDatasetId, model_family_name: family }));
    setConfigOpen(false);
  };

  const handleOpenSession = async () => {
  // With checkpoints, opening a session runs inference.
    if (checkpoints.length > 0) {
      handleRunInference();
      return;
    }

  // Without checkpoints, either train from metadata or bootstrap with random suggestions.
    if (selectedDatasetId === null || localSS === null) return;

    const family = (localFamily ?? "").trim() || "default";
    if (!family) return;

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
        snippet_set_id: localSS ?? undefined,
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

    const jobId = result.payload.job_id;
    message.success(`Training job ${jobId} dispatched`);
    setConfigOpen(false);
  };

  // Poll retrain job status and keep the UI in sync.
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

  // If polling fails (e.g. job missing), fall back to loading current predictions.
      if (!pollRetrainJob.fulfilled.match(r)) {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          message.warning("Could not poll retrain job — loading current predictions");
        }
        if (modelFamilyName !== null && snippetSetId !== null && selectedDatasetId !== null) {
          dispatch(
            runInference({
              model_family_name: modelFamilyName,
              dataset_id: selectedDatasetId,
              snippet_set_id: snippetSetId,
              force_refresh: false,
              ...buildInferenceSuggestionParams(
                phase,
                isSuggestionsMode(modelInfo),
                inferenceK,
                samplingMethod,
              ),
            }),
          );
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
  // Refresh predictions after terminal job state.
        if (modelFamilyName !== null && snippetSetId !== null && selectedDatasetId !== null) {
          dispatch(
            runInference({
              model_family_name: modelFamilyName,
              dataset_id: selectedDatasetId,
              snippet_set_id: snippetSetId,
              force_refresh: status === "COMPLETED",
              ...buildInferenceSuggestionParams(
                phase,
                isSuggestionsMode(modelInfo),
                inferenceK,
                samplingMethod,
              ),
            }),
          );
        }
        try {
          const updated = await alApi.getCheckpoints(stableDatasetId);
          setCheckpoints(updated);
        } catch {}
        return;
      }

      timer = window.setTimeout(tick, 2000);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [dispatch, lastRetrainDispatch, selectedDatasetId, modelFamilyName, snippetSetId, samplingMethod, inferenceK, phase, modelInfo]);

  const retrainTag = lastRetrainJob ? (
    <Tag
      color={{ PENDING: "default", RUNNING: "processing", COMPLETED: "success", FAILED: "error" }[lastRetrainJob.status]}
      className="text-xs"
    >
      Model: {lastRetrainJob.status}
    </Tag>
  ) : null;

  // True when rendering a restored (cached) feed.
  const isRestoredFeed = lastInferenceAt !== null && predictions.length > 0;

  const savedFeedLabel = isRestoredFeed
    ? new Date(lastInferenceAt!).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f7fafc]">
      <NavigationBar />

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-6 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <DatabaseOutlined className="text-gray-400" />
          <Select
            placeholder="Select a PAM dataset"
            value={selectedDatasetId ?? undefined}
            onChange={handleDatasetChange}
            style={{ width: 220 }}
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

    {/* Study-phase selector. */}
        <div className="flex items-center gap-2">
          <Tooltip title={`Active study phase: ${phase.label}`}>
            <Tag color="purple" className="text-xs">{phase.id}</Tag>
          </Tooltip>
        </div>

        {selectedDatasetId !== null && (
          <div className="flex items-center gap-2">
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
                setConfigOpen(true);
              }}
              style={{ backgroundColor: "#1e40af", color: "#fff" }}
            >
              Start Inference
            </Button>
          </div>
        )}

        {predictions.length > 0 && (
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
                {feedbackCountDisplay.shown}
                /{retrainThreshold}
                {feedbackCountDisplay.pending && (
                  <Tag color="gold" className="ml-2">
                    Training…
                  </Tag>
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

        {inferenceLoading && <Spin size="small" />}
      </div>

      {/* ── Saved-feed banner (when no dataset selected but feed restored) ── */}
      {!selectedDatasetId && isRestoredFeed && (
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
            <Button
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => dispatch(clearSavedFeed())}
              danger
            >
              Clear
            </Button>
          }
        />
      )}

      {/* ── Phase-aware layout ─────────────────────────────────────────── */}
      {!selectedDatasetId && !isRestoredFeed ? (
        <div className="flex flex-1 items-center justify-center flex-col gap-3 text-gray-400">
          <DatabaseOutlined style={{ fontSize: 48 }} />
          <p className="text-lg font-ibm-sans">Select a dataset to start Active Learning</p>
          <p className="text-sm">Then click "Start labeling" to load predictions.</p>
        </div>
      ) : (
        <PhaseLayout />
      )}

      {/* ── Start Labeling Modal ───────────────────────────────────────── */}
      <Modal
        title={checkpoints.length > 0 ? "Resume labeling" : "Start labeling"}
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        onOk={handleOpenSession}
        okText={checkpoints.length > 0 ? "Resume" : hasGroundTruthMetadata ? "Start training" : "Start annotating"}
        okButtonProps={{
          disabled:
            !localSS ||
            (checkpoints.length === 0
              ? !(localFamily && localFamily.trim().length > 0) ||
                (hasGroundTruthMetadata &&
                  (!Number.isFinite(trainEmbeddingModelId) ||
                    !trainMetadataPath.trim() ||
                    !trainLabelConfigPath.trim()))
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
                description="You can either cold-start from ground-truth metadata (train first checkpoint) or start annotating with random samples to bootstrap a model."
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
                    onChange={(v) => {
                      setHasGroundTruthMetadata(v);
                      if (v) dispatch(getAllEmbeddingMethods());
                    }}
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
                      placeholder={embeddingMethodsLoading ? "Loading embedding models…" : "Select embedding model"}
                      loading={embeddingMethodsLoading}
                      value={trainEmbeddingModelId}
                      onChange={(v: number) => setTrainEmbeddingModelId(v)}
                      style={{ width: "100%" }}
                      optionFilterProp="children"
                      showSearch
                    >
                      {(embeddingMethods ?? []).map((m) => (
                        <Option key={m.id} value={m.id}>
                          {m.name} — {m.version}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="Metadata path (ground truth)" required>
                    <Input
                      placeholder='e.g. "pam/FNJV/metadata.csv"'
                      value={trainMetadataPath}
                      onChange={(e) => setTrainMetadataPath(e.target.value)}
                    />
                  </Form.Item>

                  <Form.Item label="Label config path" required>
                    <Input
                      placeholder='e.g. "pam/FNJV/labels.json"'
                      value={trainLabelConfigPath}
                      onChange={(e) => setTrainLabelConfigPath(e.target.value)}
                    />
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
                <Option key={s.id} value={s.id}>
                  Set #{s.id} — {s.status}
                </Option>
              ))}
            </Select>
            {snippetSets.length === 0 && (
              <p className="text-xs text-amber-500 mt-1">
                No snippet sets found. Generate embeddings first.
              </p>
            )}
          </Form.Item>

          <Form.Item label="Top-K predictions">
            <InputNumber
              min={1}
              max={500}
              value={localK}
              onChange={(v) => setLocalK(v ?? 20)}
              style={{ width: "100%" }}
              disabled={!localTopKOnly || (checkpoints.length === 0 && hasGroundTruthMetadata)}
            />
          </Form.Item>

          <Form.Item label="Mode">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                Return only Top‑K suggestions
              </div>
              <Switch
                checked={localTopKOnly}
                onChange={setLocalTopKOnly}
                disabled={checkpoints.length === 0 && hasGroundTruthMetadata}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              When disabled, the system returns all predictions for the selected snippet set.
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

/**
 * Layout chosen from `(phase.feed.mode, phase.visualization.mode)`:
 *   • feed=scrollable + vis=hidden            → full-width feed (Phase 1.1)
 *   • feed=scrollable + vis=*                 → 50/50 split    (Phase 1.2)
 *   • feed=single_card + vis=whole_dataset    → vis dominant + side panel (Phase 2/3)
 *   • feed=hidden                             → vis only
 */
const PhaseLayout: React.FC = () => {
  const phase = usePhaseConfig();
  const feedMode = phase.feed.mode;
  const visMode = phase.visualization.mode;

  const showVis = visMode !== "hidden";
  const showFeed = feedMode !== "hidden";

  // Phase 1.1: feed only
  if (showFeed && !showVis) {
    const isBlind = phase.ui.labelingMode === "blind";
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {isBlind ? <BlindAnnotationHeader /> : (
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Annotation Feed</h2>
              <p className="text-xs text-gray-400 font-ibm-sans">
                Accept, reject, or modify each prediction
              </p>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <PredictionFeed />
          </div>
        </div>
      </div>
    );
  }

  // Phase 1.2: 50/50 split (feed + limited vis)
  if (showFeed && feedMode === "scrollable_topk" && showVis) {
    const isBlind = phase.ui.labelingMode === "blind";
    return (
      <ResizableSplit
        mode="ratio"
        initialRatio={0.5}
        minLeftPx={360}
        minRightPx={420}
        left={
          <div className="flex flex-col h-full border-r border-gray-200 overflow-hidden">
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Feature Projection</h2>
              <p className="text-xs text-gray-400 font-ibm-sans">Click a point to jump to its card</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectionView />
            </div>
          </div>
        }
        right={
          <div className="flex flex-col h-full overflow-hidden">
            {isBlind ? <BlindAnnotationHeader /> : (
              <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
                <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Annotation Feed</h2>
                <p className="text-xs text-gray-400 font-ibm-sans">Accept, reject, or modify each prediction</p>
              </div>
            )}
            <div className="flex-1 overflow-hidden">
              <PredictionFeed />
            </div>
          </div>
        }
      />
    );
  }

  // Phase 2.x / 3.x: vis dominant; single-card panel slides in on selection
  if (showVis && feedMode === "single_card_on_select") {
    return (
      <ResizableSplit
        mode="right_px"
        initialRightPx={560}
        minRightPanelPx={420}
        maxRightPanelPx={900}
        left={
          <div className="flex flex-col h-full border-r border-gray-200 overflow-hidden">
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Feature Projection</h2>
              <p className="text-xs text-gray-400 font-ibm-sans">Click a point to inspect that snippet</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectionView />
            </div>
          </div>
        }
        right={
          <div className="h-full flex flex-col overflow-hidden bg-[#f7fafc]">
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Selected Snippet</h2>
              <p className="text-xs text-gray-400 font-ibm-sans">Click a point on the projection</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <PredictionFeed />
            </div>
          </div>
        }
      />
    );
  }

  // Vis-only fallback
  if (showVis && !showFeed) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Feature Projection</h2>
          </div>
          <div className="flex-1 overflow-hidden">
            <ProjectionView />
          </div>
        </div>
      </div>
    );
  }

  // No-op fallback
  return null;
};

const BlindAnnotationHeader: React.FC = () => {
  // Blind mode header intentionally keeps the UI minimal.

  return (
    <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="min-w-0 flex-shrink-0 max-w-[360px]">
          <div className="text-sm font-semibold font-ibm-mono text-gray-700 leading-5">
            Annotation Feed
          </div>
          <div className="text-[11px] text-gray-400 font-ibm-sans truncate">
            Listen to each snippet and add one or more species labels
          </div>
        </div>

      </div>
    </div>
  );
};
