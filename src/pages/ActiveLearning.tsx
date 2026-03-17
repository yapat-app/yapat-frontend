/**
 * ActiveLearning Page
 * Uses /api/pam-al/inference to load predictions.
 */

import React, { useEffect, useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Select, Spin, Tag, Tooltip, Button, InputNumber, Modal, Form, Alert } from "antd";
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
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  setSelectedDataset,
  setInferenceConfig,
  runInference,
  clearSavedFeed,
} from "../redux/features/alSlice";
import { fetchAllDatasets, fetchAllTeamDatasets } from "../redux/features/datasetSlice";
import { embeddingApi } from "../services/api";
import { alApi } from "../services/alApi";
import { useAutoRetrain } from "../hooks/useAutoRetrain";
import type { PAMCheckpoint } from "../types/al";
import type { SnippetSet } from "../types";

const { Option } = Select;

export const ActiveLearning: React.FC = () => {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();

  const { allDatasets } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);
  const {
    selectedDatasetId,
    modelCheckpointId,
    snippetSetId,
    inferenceK,
    predictions,
    inferenceLoading,
    feedbackCount,
    retrainThreshold,
    lastRetrainJob,
    lastInferenceAt,
  } = useAppSelector((state) => state.al);

  useAutoRetrain();

  // Local config state for the "Run Inference" modal
  const [configOpen, setConfigOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<PAMCheckpoint[]>([]);
  const [snippetSets, setSnippetSets] = useState<SnippetSet[]>([]);
  const [localCkpt, setLocalCkpt] = useState<number | null>(modelCheckpointId);
  const [localSS, setLocalSS] = useState<number | null>(snippetSetId);
  const [localK, setLocalK] = useState<number>(inferenceK);

  // Load datasets
  useEffect(() => {
    if (user?.role === "admin") dispatch(fetchAllDatasets());
    else if (user?.role === "team_owner") dispatch(fetchAllTeamDatasets());
  }, [user]);

  // Sync dataset_id from URL
  useEffect(() => {
    const urlId = searchParams.get("dataset_id");
    if (urlId && !selectedDatasetId) {
      dispatch(setSelectedDataset(parseInt(urlId, 10)));
    }
  }, [searchParams]);

  // When dataset changes, load checkpoints + snippet sets
  useEffect(() => {
    if (selectedDatasetId === null) return;
    alApi.getCheckpoints(selectedDatasetId).then(setCheckpoints).catch(() => {});
    embeddingApi.allSnippetSets(selectedDatasetId).then(setSnippetSets).catch(() => {});
  }, [selectedDatasetId]);

  const handleDatasetChange = useCallback(
    (value: number) => {
      dispatch(setSelectedDataset(value));
      setSearchParams({ dataset_id: String(value) });
    },
    [dispatch, setSearchParams],
  );

  const handleRunInference = () => {
    if (localCkpt === null || localSS === null) return;
    dispatch(setInferenceConfig({ modelCheckpointId: localCkpt, snippetSetId: localSS, k: localK }));
    dispatch(runInference({ model_checkpoint_id: localCkpt, snippet_set_id: localSS, k: localK }));
    setConfigOpen(false);
  };

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

        {selectedDatasetId !== null && (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={inferenceLoading}
            onClick={() => {
              setLocalCkpt(modelCheckpointId);
              setLocalSS(snippetSetId);
              setLocalK(inferenceK);
              setConfigOpen(true);
            }}
            style={{ backgroundColor: "#1e40af" }}
          >
            Run Inference
          </Button>
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

      {/* ── Split layout ───────────────────────────────────────────────── */}
      {!selectedDatasetId && !isRestoredFeed ? (
        <div className="flex flex-1 items-center justify-center flex-col gap-3 text-gray-400">
          <DatabaseOutlined style={{ fontSize: 48 }} />
          <p className="text-lg font-ibm-sans">Select a dataset to start Active Learning</p>
          <p className="text-sm">Then click "Run Inference" to load predictions.</p>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Projection */}
          <div className="w-1/2 flex flex-col border-r border-gray-200 overflow-hidden">
            <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
              <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">Feature Projection</h2>
              <p className="text-xs text-gray-400 font-ibm-sans">Click a point to jump to its card</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <ProjectionView />
            </div>
          </div>

          {/* Right: Feed */}
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
      )}

      {/* ── Run Inference Modal ─────────────────────────────────────────── */}
      <Modal
        title="Configure & Run Inference"
        open={configOpen}
        onCancel={() => setConfigOpen(false)}
        onOk={handleRunInference}
        okText="Run Inference"
        okButtonProps={{ disabled: !localCkpt || !localSS, style: { backgroundColor: "#1e40af" } }}
      >
        <Form layout="vertical" className="mt-4">
          <Form.Item label="Model Checkpoint" required>
            <Select
              placeholder="Select checkpoint"
              value={localCkpt ?? undefined}
              onChange={setLocalCkpt}
              style={{ width: "100%" }}
            >
              {checkpoints.map((c) => (
                <Option key={c.id} value={c.id}>
                  {c.name} — v{c.version} {c.is_base ? "(base)" : ""}
                </Option>
              ))}
            </Select>
            {checkpoints.length === 0 && (
              <p className="text-xs text-amber-500 mt-1">
                No checkpoints found. Register one via POST /api/pam-al/checkpoints.
              </p>
            )}
          </Form.Item>

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
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
