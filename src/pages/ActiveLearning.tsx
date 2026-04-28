/**
 * ActiveLearning Page
 * Uses /api/pam-al/inference to load predictions.
 */

import React, { useEffect, useCallback, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Select, Spin, Tag, Tooltip, Button, InputNumber, Modal, Form, Alert, Input, Switch, message } from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  HistoryOutlined,
  DeleteOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { NavigationBar } from "../components/NavigationBar";
import { ProjectionView } from "../components/al/ProjectionView";
import { PredictionFeed } from "../components/al/PredictionFeed";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  setSelectedDataset,
  setInferenceConfig,
  runInference,
  clearSavedFeed,
  trainFromScratch,
  pollRetrainJob,
} from "../redux/features/alSlice";
import { getAllEmbeddingMethods } from "../redux/features/embeddingSlice";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../redux/features/datasetSlice";
import { embeddingApi } from "../services/api";
import { alApi } from "../services/alApi";
import type { PAMCheckpoint } from "../types/al";
import type { SnippetSet } from "../types";
import { usePhaseConfig } from "../studyPhases";

const { Option } = Select;

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
    lastRetrainJob,
    lastInferenceAt,
    lastRetrainDispatch,
  } = useAppSelector((state) => state.al);

  // If we enter a whole-dataset / click-to-inspect phase while the store still
  // contains only top-K "suggestions", ensure we have the full prediction set
  // so any clicked point can render its card on the right.
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

  // Local config state for the "Run Inference" modal
  const [configOpen, setConfigOpen] = useState(false);
  const [trainOpen, setTrainOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<PAMCheckpoint[]>([]);
  const [snippetSets, setSnippetSets] = useState<SnippetSet[]>([]);
  const [localCkpt, setLocalCkpt] = useState<number | null>(modelCheckpointId);
  const [localFamily, setLocalFamily] = useState<string | null>(modelFamilyName);
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);
  const [localK, setLocalK] = useState<number>(inferenceK);
  const [localTopKOnly, setLocalTopKOnly] = useState<boolean>(true);

  // Local state for Train-from-scratch (cold-start) modal
  const [trainFamily, setTrainFamily] = useState<string>(modelFamilyName ?? "cold_start_base");
  const [trainSS, setTrainSS] = useState<number | null>(snippetSetId);
  const [trainEmbeddingModelId, setTrainEmbeddingModelId] = useState<number>(1);
  const [trainMetadataPath, setTrainMetadataPath] = useState<string>("");
  const [trainLabelConfigPath, setTrainLabelConfigPath] = useState<string>("");
  const [trainDevice, setTrainDevice] = useState<"cpu" | "cuda">("cpu");
  const [trainRunInference, setTrainRunInference] = useState<boolean>(false);

  // Load datasets
  useEffect(() => {
    if (user?.role === "admin") dispatch(fetchAllDatasets());
    else if (user?.role === "team_owner") dispatch(fetchAllTeamDatasets());
  }, [user]);

  // Sync dataset_id from URL
  useEffect(() => {
    const raw = searchParams.get("dataset_id");
    if (!raw) return;

    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;

    if (parsed !== selectedDatasetId) {
      dispatch(setSelectedDataset(parsed));
    }
  }, [dispatch, searchParams, selectedDatasetId]);

  // When dataset changes, load checkpoints + snippet sets
  useEffect(() => {
    if (selectedDatasetId === null) return;
    alApi.getCheckpoints(selectedDatasetId).then(setCheckpoints).catch(() => {});
    embeddingApi.allSnippetSets(selectedDatasetId).then(setSnippetSets).catch(() => {});
  }, [selectedDatasetId]);

  // When checkpoints load, ensure local selection is consistent
  useEffect(() => {
    // Bootstrap mode: no checkpoints => ensure we have a family name for the backend
    if (checkpoints.length === 0) {
      if (!localFamily) setLocalFamily(modelFamilyName ?? "default");
      setLocalCkpt(null);
      return;
    }

    // Normal mode: if a checkpoint is selected, keep family in sync; otherwise preselect the newest
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

    // Phase-driven inference shape:
    //   - feed.mode = scrollable_topk → ask for ranked top-K (cheap, exactly what feed needs)
    //   - everything else             → ask for the full prediction set (whole-dataset color)
    const phaseRequiresTopK = phase.feed.mode === "scrollable_topk";
    const useTopK = phaseRequiresTopK ? true : localTopKOnly && phase.feed.mode !== "single_card_on_select" && phase.feed.mode !== "hidden";
    const k = phaseRequiresTopK ? (phase.feed.topK ?? localK) : localK;
    const strategy = phase.feed.samplingStrategy ?? samplingMethod;

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
        ...(useTopK
          ? { sample_suggestion: true, suggestion_strategy: strategy, k }
          : { sample_suggestion: false }),
      }),
    );
    setConfigOpen(false);
  };

  const handleTrainFromScratch = async () => {
    if (selectedDatasetId === null) return;
    const fam = trainFamily.trim();
    if (!fam) return;
    if (!trainEmbeddingModelId || !Number.isFinite(trainEmbeddingModelId)) return;
    if (!trainMetadataPath.trim() || !trainLabelConfigPath.trim()) return;

    const result = await dispatch(
      trainFromScratch({
        dataset_id: selectedDatasetId,
        model_family_name: fam,
        snippet_set_id: trainSS ?? undefined,
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
    setTrainOpen(false);
  };

  // Background polling + persistent UI indication for training/retrain jobs.
  // This ensures users can see status even after closing the modal.
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
      if (!pollRetrainJob.fulfilled.match(r)) return;

      const status = r.payload.status;
      if (status === "COMPLETED" || status === "FAILED") {
        if (lastNotifiedJobIdRef.current !== stableJobId) {
          lastNotifiedJobIdRef.current = stableJobId;
          if (status === "COMPLETED") message.success("Training completed — checkpoint is ready");
          else message.error("Training failed — check backend logs");
        }
        // After a successful retrain, refresh inference so the UI immediately shows the new model output.
        // We keep the response small (Top‑K suggestions) as the default feed mode.
        if (
          status === "COMPLETED" &&
          modelFamilyName !== null &&
          snippetSetId !== null &&
          selectedDatasetId !== null
        ) {
          const phaseRequiresTopK = phase.feed.mode === "scrollable_topk";
          dispatch(
            runInference({
              model_family_name: modelFamilyName,
              dataset_id: selectedDatasetId,
              snippet_set_id: snippetSetId,
              force_refresh: true,
              ...(phaseRequiresTopK
                ? {
                    sample_suggestion: true,
                    suggestion_strategy: phase.feed.samplingStrategy ?? samplingMethod,
                    k: phase.feed.topK ?? inferenceK,
                  }
                : { sample_suggestion: false }),
            }),
          );
        }
        try {
          const updated = await alApi.getCheckpoints(stableDatasetId);
          setCheckpoints(updated);
        } catch {
          // ignore
        }
        return;
      }

      timer = window.setTimeout(tick, 2000);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [dispatch, lastRetrainDispatch, selectedDatasetId, modelFamilyName, snippetSetId, samplingMethod, inferenceK, phase]);

  const retrainTag = lastRetrainJob ? (
    <Tag
      color={{ PENDING: "default", RUNNING: "processing", COMPLETED: "success", FAILED: "error" }[lastRetrainJob.status]}
      className="text-xs"
    >
      Model: {lastRetrainJob.status}
    </Tag>
  ) : null;

  // True if we are showing a saved (cached) feed rather than a freshly-run one
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

        {/* Study-phase selector — power user / facilitator switch.
            For participant flows just hand them a `?phase=P2.1` URL. */}
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
                setLocalTopKOnly(true);
                setConfigOpen(true);
              }}
              style={{ backgroundColor: "#1e40af", color: "#fff" }}
            >
              Run Inference
            </Button>
            <Button
              icon={<ExperimentOutlined />}
              onClick={() => {
                dispatch(getAllEmbeddingMethods());
                setTrainFamily(modelFamilyName ?? "cold_start_base");
                setTrainSS(snippetSetId);
                setTrainEmbeddingModelId(embeddingMethods?.[0]?.id ?? 1);
                setTrainMetadataPath("");
                setTrainLabelConfigPath("");
                setTrainDevice("cpu");
                setTrainRunInference(false);
                setTrainOpen(true);
              }}
            >
              Train from scratch
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
                {feedbackCount}/{retrainThreshold}
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
          <p className="text-sm">Then click "Run Inference" to load predictions.</p>
        </div>
      ) : (
        <PhaseLayout />
      )}

      {/* ── Run Inference Modal ─────────────────────────────────────────── */}
      <Modal
        title="Configure & Run Inference"
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        onOk={handleRunInference}
        okText="Run Inference"
        okButtonProps={{
          disabled:
            !localSS ||
            (checkpoints.length === 0 ? !(localFamily && localFamily.trim().length > 0) : !localCkpt),
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
                message="No checkpoints found — using bootstrap mode"
                description="Inference will return random snippet suggestions until a checkpoint is trained/registered. Choose a model family name to namespace future checkpoints for this dataset."
                className="mb-3"
              />
              <Form.Item label="Model family name" required>
                <Input
                  placeholder="e.g. birdnet, yamnet, default"
                  value={localFamily ?? ""}
                  onChange={(e) => setLocalFamily(e.target.value)}
                />
              </Form.Item>
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
              disabled={!localTopKOnly}
            />
          </Form.Item>

          <Form.Item label="Mode">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-600">
                Return only Top‑K suggestions
              </div>
              <Switch checked={localTopKOnly} onChange={setLocalTopKOnly} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              When disabled, the system returns all predictions for the selected snippet set.
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Train From Scratch Modal ───────────────────────────────────── */}
      <Modal
        title="Train from scratch (cold start)"
        open={trainOpen}
        onCancel={() => setTrainOpen(false)}
        onOk={handleTrainFromScratch}
        okText="Start training"
        okButtonProps={{
          disabled:
            selectedDatasetId === null ||
            !trainFamily.trim() ||
            !Number.isFinite(trainEmbeddingModelId) ||
            !trainMetadataPath.trim() ||
            !trainLabelConfigPath.trim(),
          style: { backgroundColor: "#1e40af", color: "#fff" },
        }}
      >
        <Form layout="vertical" className="mt-4">
          <Alert
            type="info"
            showIcon
            className="mb-3"
            message="This creates the first checkpoint for a model family."
            description="Provide ground-truth metadata and a label config. The job runs asynchronously; you can keep using the UI and come back later."
          />

          <Form.Item label="Model family name" required>
            <Input value={trainFamily} onChange={(e) => setTrainFamily(e.target.value)} />
          </Form.Item>

          <Form.Item label="Snippet set (optional)">
            <Select
              placeholder="Use dataset default snippet set"
              allowClear
              value={trainSS ?? undefined}
              onChange={(v) => setTrainSS(v ?? null)}
              style={{ width: "100%" }}
            >
              {snippetSets.map((s) => (
                <Option key={s.id} value={s.id}>
                  Set #{s.id} — {s.status}
                </Option>
              ))}
            </Select>
          </Form.Item>

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
            {!embeddingMethodsLoading && (!embeddingMethods || embeddingMethods.length === 0) && (
              <div className="text-xs text-amber-500 mt-1">
                No embedding models found.
              </div>
            )}
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
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Prediction Feed</h2>
            <p className="text-xs text-gray-400 font-ibm-sans">Accept, reject, or modify each prediction</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <PredictionFeed />
          </div>
        </div>
      </div>
    );
  }

  // Phase 1.2: 50/50 split (feed + limited vis)
  if (showFeed && feedMode === "scrollable_topk" && showVis) {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 flex flex-col border-r border-gray-200 overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Feature Projection</h2>
            <p className="text-xs text-gray-400 font-ibm-sans">Click a point to jump to its card</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ProjectionView />
          </div>
        </div>
        <div className="w-1/2 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Prediction Feed</h2>
            <p className="text-xs text-gray-400 font-ibm-sans">Accept, reject, or modify each prediction</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <PredictionFeed />
          </div>
        </div>
      </div>
    );
  }

  // Phase 2.x / 3.x: vis dominant; single-card panel slides in on selection
  if (showVis && feedMode === "single_card_on_select") {
    return (
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col border-r border-gray-200 overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Feature Projection</h2>
            <p className="text-xs text-gray-400 font-ibm-sans">Click a point to inspect that snippet</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ProjectionView />
          </div>
        </div>
        <div className="w-[420px] flex flex-col overflow-hidden bg-[#f7fafc]">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Selected Snippet</h2>
            <p className="text-xs text-gray-400 font-ibm-sans">Click a point on the projection</p>
          </div>
          <div className="flex-1 overflow-hidden">
            <PredictionFeed />
          </div>
        </div>
      </div>
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
