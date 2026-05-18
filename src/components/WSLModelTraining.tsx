import { useEffect, useRef, useState } from "react";
import {
  Form,
  Select,
  Slider,
  InputNumber,
  Button,
  Collapse,
  message,
  Alert,
} from "antd";
import { CheckCircleOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "../hooks";
import { setTraining } from "../redux/features/wssedSlice";
import { wssedApi } from "../services/api";
import {
  readWssedTrainingJobId,
  storeWssedTrainingJobId,
} from "../utils/wssedTrainingStorage";

const { Option } = Select;
const { Panel } = Collapse;

const POLL_INTERVAL_MS = 5000;

const embeddingModelList = [
  { name: "BirdNET", value: "birdnet" },
  { name: "CDur", value: "CDur" },
  { name: "TALNet", value: "TALNet" },
];

type TrainingProgress = {
  phase?: string;
  current_epoch?: number | null;
  total_epochs?: number | null;
  model_name?: string;
  dataset_path?: string;
  embeddings_path?: string;
  output_dir?: string;
  embeddings_complete?: boolean;
  embeddings_status?: string;
  skip_extraction?: boolean;
  skip_training?: boolean;
  bag_seconds?: string | number;
  hop_seconds?: string | number;
  learning_rate?: number;
  threshold?: number;
  training_log?: string;
  updated_at?: string;
};

type DatasetArtifacts = {
  dataset_path: string;
  embeddings_path: string;
  embeddings_complete: boolean;
  embeddings_status: string;
  checkpoint_exists: boolean;
  checkpoint_path: string | null;
  output_dir: string;
  audio_count: number;
  npz_count: number;
};

interface WSLModelTrainingProps {
  datasetId: number | null;
  stopTraining: () => void;
}

export const WSLModelTraining = ({
  datasetId,
  stopTraining,
}: WSLModelTrainingProps) => {
  const { modelTraining } = useAppSelector((state) => state.wssed);
  const dispatch = useAppDispatch();

  const [formData, setFormData] = useState({
    model: "birdnet",
    pooling: "mean",
    epochs: 50,
    learning_rate: 0.0003,
    threshold: 0.5,
    sample_rate: 22000,
    n_mels: 64,
    bag_seconds: "full",
    hop_seconds: 1,
  });

  const [statusText, setStatusText] = useState<string>("");
  const [trainingProgress, setTrainingProgress] =
    useState<TrainingProgress | null>(null);
  const [datasetArtifacts, setDatasetArtifacts] =
    useState<DatasetArtifacts | null>(null);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [lastCompletedJob, setLastCompletedJob] = useState<{
    job_id: number;
    model_path: string | null;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobIdRef = useRef<number | null>(null);

  const handleChange = (name: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const stopPolling = () => {
    if (pollRef.current != null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (jobId: number, options?: { silentComplete?: boolean }) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await wssedApi.getTrainingJobStatus(jobId);

        const progress = (status.progress ?? null) as TrainingProgress | null;
        setTrainingProgress(progress);

        if (progress?.current_epoch != null && progress?.total_epochs != null) {
          setStatusText(`Epoch ${progress.current_epoch} / ${progress.total_epochs}`);
        } else if (progress?.phase) {
          setStatusText(`${status.status} · ${progress.phase}`);
        } else {
          setStatusText(`Status: ${status.status}`);
        }

        if (status.status === "COMPLETED") {
          stopPolling();
          dispatch(setTraining(false));
          stopTraining();
          if (!options?.silentComplete) {
            message.success(
              "Model training completed. Predictions are being prepared for the feed.",
            );
          }
        } else if (status.status === "FAILED") {
          stopPolling();
          dispatch(setTraining(false));
          stopTraining();
          message.error(`Training failed: ${status.error ?? "unknown error"}`);
        }
      } catch {
        // keep polling on transient network errors
      }
    }, POLL_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    if (modelTraining) return;
    if (!datasetId) {
      message.warning("No dataset selected. Please select a dataset first.");
      return;
    }

    dispatch(setTraining(true));
    setStatusText("Dispatching training job…");
    setTrainingProgress(null);

    const hyperparameters: Record<string, unknown> = {
      model_name: formData.model,
      pooling: formData.pooling,
      epochs: formData.epochs,
      learning_rate: formData.learning_rate,
      threshold: formData.threshold,
      sample_rate: formData.sample_rate,
      n_mels: formData.n_mels,
      n_fft: 1100,
      hop_length: 550,
    };
    if (formData.model !== "birdnet") {
      hyperparameters.bag_seconds = formData.bag_seconds;
      hyperparameters.hop_seconds = formData.hop_seconds;
    }

    try {
      const result = await wssedApi.createTrainingJob({
        dataset_id: Number(datasetId),
        model_name: formData.model,
        hyperparameters,
      });

      jobIdRef.current = result.job_id;
      if (datasetId) {
        storeWssedTrainingJobId(datasetId, result.job_id);
      }
      setStatusText(`Job ${result.job_id} started — waiting for GPU server…`);
      startPolling(result.job_id);
    } catch (err: unknown) {
      dispatch(setTraining(false));
      const msg =
        err instanceof Error ? err.message : "Failed to start training job";
      message.error(msg);
      setStatusText("");
      setTrainingProgress(null);
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  /** Resume polling after page refresh when a job is still running. */
  useEffect(() => {
    if (!datasetId || pollRef.current != null) return;

    let cancelled = false;

    (async () => {
      try {
        const storedId = readWssedTrainingJobId(datasetId);
        let jobId = storedId;
        let status = jobId
          ? await wssedApi.getTrainingJobStatus(jobId)
          : null;

        if (!status) {
          status = await wssedApi.getLatestTrainingJobStatus(datasetId);
          jobId = status.job_id;
        }

        if (cancelled || !jobId || !status) return;

        jobIdRef.current = jobId;
        storeWssedTrainingJobId(datasetId, jobId);

        if (status.status === "TRAINING") {
          dispatch(setTraining(true));
          const progress = (status.progress ?? null) as TrainingProgress | null;
          setTrainingProgress(progress);
          setStatusText(`Resuming job ${jobId}…`);
          startPolling(jobId);
        } else if (status.status === "COMPLETED") {
          const progress = (status.progress ?? null) as TrainingProgress | null;
          setTrainingProgress(progress);
          setStatusText(`Job ${jobId} completed`);
          setLastCompletedJob({
            job_id: jobId,
            model_path: status.model_path,
          });
        }
      } catch {
        // no job to resume
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resume once per dataset
  }, [datasetId]);

  /** Show whether embeddings / checkpoint already exist on the GPU server. */
  useEffect(() => {
    if (!datasetId || formData.model !== "birdnet") {
      setDatasetArtifacts(null);
      return;
    }

    let cancelled = false;
    setArtifactsLoading(true);

    (async () => {
      try {
        const artifacts = await wssedApi.getDatasetArtifacts(datasetId);
        if (!cancelled) {
          setDatasetArtifacts(artifacts);
        }
      } catch {
        if (!cancelled) {
          setDatasetArtifacts(null);
        }
      } finally {
        if (!cancelled) {
          setArtifactsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [datasetId, formData.model]);

  const buttonText = modelTraining ? "Training…" : "Start Training";
  const selectedModelLabel =
    embeddingModelList.find((model) => model.value === formData.model)?.name ??
    formData.model;
  const hasExistingOutputs =
    datasetArtifacts != null &&
    (datasetArtifacts.embeddings_complete ||
      datasetArtifacts.checkpoint_exists ||
      datasetArtifacts.npz_count > 0);

  const showArtifactsPanel =
    formData.model === "birdnet" &&
    (artifactsLoading || datasetArtifacts != null);

  const progressPercent =
    trainingProgress?.current_epoch != null &&
    trainingProgress?.total_epochs != null &&
    trainingProgress.total_epochs > 0
      ? Math.min(
          100,
          Math.round(
            (trainingProgress.current_epoch / trainingProgress.total_epochs) * 100,
          ),
        )
      : null;

  return (
    <div className="h-full max-h-full min-h-0 overflow-hidden bg-slate-50/60">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                WSSED Training
              </p>
              <h3 className="mt-1 text-sm font-semibold text-slate-900">
                Train Event Detector
              </h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Configure a GPU-backed training job for the selected dataset.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                modelTraining
                  ? "bg-blue-50 text-blue-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {modelTraining ? "Running" : selectedModelLabel}
            </span>
          </div>
        </div>

        {showArtifactsPanel && (
          <Alert
            type={hasExistingOutputs ? "success" : "info"}
            showIcon
            icon={
              hasExistingOutputs ? (
                <CheckCircleOutlined />
              ) : (
                <InfoCircleOutlined />
              )
            }
            className="rounded-xl text-xs"
            message={
              artifactsLoading
                ? "Checking for existing BirdNET outputs…"
                : "Existing outputs on GPU server"
            }
            description={
              artifactsLoading ? undefined : (
                <ul className="mt-1 list-none space-y-1.5 pl-0 text-[11px] leading-5">
                  <li>
                    <span className="font-semibold">Embeddings: </span>
                    {datasetArtifacts?.embeddings_complete ? (
                      <span className="text-emerald-800">
                        ready ({datasetArtifacts.npz_count}/
                        {datasetArtifacts.audio_count})
                      </span>
                    ) : (
                      <span className="text-amber-800">
                        {datasetArtifacts?.embeddings_status ?? "not ready"}
                      </span>
                    )}
                    {datasetArtifacts?.embeddings_path && (
                      <div className="mt-0.5 truncate font-mono text-slate-600">
                        {datasetArtifacts.embeddings_path}
                      </div>
                    )}
                  </li>
                  <li>
                    <span className="font-semibold">Checkpoint: </span>
                    {datasetArtifacts?.checkpoint_exists ? (
                      <span className="text-emerald-800">available</span>
                    ) : (
                      <span className="text-slate-600">not found yet</span>
                    )}
                    {datasetArtifacts?.checkpoint_path && (
                      <div className="mt-0.5 truncate font-mono text-slate-600">
                        {datasetArtifacts.checkpoint_path}
                      </div>
                    )}
                    {!datasetArtifacts?.checkpoint_exists &&
                      datasetArtifacts?.output_dir && (
                        <div className="mt-0.5 truncate font-mono text-slate-500">
                          expected: {datasetArtifacts.output_dir}
                        </div>
                      )}
                  </li>
                  {hasExistingOutputs && (
                    <li className="border-t border-emerald-200/80 pt-1.5 text-emerald-900">
                      A new training run will reuse these files and skip finished
                      steps automatically. Use hyperparameters{" "}
                      <code className="rounded bg-emerald-100 px-1">
                        force_reextract
                      </code>{" "}
                      /{" "}
                      <code className="rounded bg-emerald-100 px-1">
                        force_retrain
                      </code>{" "}
                      to run again from scratch.
                    </li>
                  )}
                </ul>
              )
            }
          />
        )}

        {lastCompletedJob?.model_path && (
          <Alert
            type="info"
            showIcon
            className="rounded-xl text-xs"
            message={`Last completed job #${lastCompletedJob.job_id}`}
            description={
              <span className="font-mono text-[11px] break-all">
                {lastCompletedJob.model_path}
              </span>
            }
          />
        )}

        <Form
          layout="vertical"
          className="flex flex-col gap-3"
        >
          <Collapse
            expandIconPosition="end"
            className="rounded-xl border border-slate-200 bg-white font-ibm-sans shadow-sm"
          >
            <Panel
              header={
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Training Settings
                  </div>
                  <div className="text-xs font-normal text-slate-500">
                    Model, pooling, epochs and threshold
                  </div>
                </div>
              }
              key="1"
            >
              <Form.Item label="Model" required className="mb-3">
                <Select
                  placeholder="Select a model"
                  value={formData.model}
                  onChange={(value) => handleChange("model", value)}
                  disabled={modelTraining}
                >
                  {embeddingModelList.map((model) => (
                    <Option key={model.value} value={model.value}>
                      {model.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Pooling Method"
                tooltip="Determines how features are summarized"
                className="mb-3"
              >
                <Select
                  value={formData.pooling}
                  onChange={(value) => handleChange("pooling", value)}
                  disabled={modelTraining}
                >
                  <Option value="mean">mean</Option>
                  <Option value="max">max</Option>
                  <Option value="linear">linear</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Training Epochs"
                tooltip="Number of times the model trains on the full dataset"
                className="mb-3"
              >
                <InputNumber
                  min={1}
                  max={500}
                  style={{ width: "100%" }}
                  value={formData.epochs}
                  onChange={(value) => handleChange("epochs", value)}
                  disabled={modelTraining}
                />
              </Form.Item>

              <Form.Item
                label="Learning Rate"
                tooltip="Controls how much the model updates its weights during training"
                className="mb-3"
              >
                <InputNumber
                  min={0.000001}
                  max={0.1}
                  step={0.0001}
                  style={{ width: "100%" }}
                  value={formData.learning_rate}
                  onChange={(value) => handleChange("learning_rate", value)}
                  disabled={modelTraining}
                />
              </Form.Item>

              <Form.Item
                label="Detection Threshold"
                tooltip="Minimum confidence required to trigger a detection"
                className="mb-1"
              >
                <Slider
                  min={0}
                  max={1.0}
                  step={0.1}
                  marks={{ 0: "0", 0.5: "0.5", 1: "1" }}
                  value={formData.threshold}
                  onChange={(value) => handleChange("threshold", value)}
                  disabled={modelTraining}
                />
              </Form.Item>
            </Panel>
          </Collapse>

          <Collapse
            expandIconPosition="end"
            className="rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            <Panel
              header={
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    Audio & Windowing
                  </div>
                  <div className="text-xs font-normal text-slate-500">
                    Sample rate, mel bands and model window settings
                  </div>
                </div>
              }
              key="2"
            >
              <Form.Item
                label="Sample Rate"
                tooltip="Number of audio samples per second"
                className="mb-3"
              >
                <div className="flex gap-2 items-center">
                  <InputNumber
                    disabled={modelTraining || formData.model === "birdnet"}
                    style={{ width: "100%" }}
                    value={formData.sample_rate}
                    onChange={(value) => handleChange("sample_rate", value)}
                  />
                  <span className="text-xs font-medium text-slate-500">Hz</span>
                </div>
              </Form.Item>

              {formData.model !== "birdnet" && (
                <Form.Item
                  label="Mel Bands"
                  tooltip="Controls how detailed the frequency representation is"
                  className="mb-3"
                >
                  <InputNumber
                    style={{ width: "100%" }}
                    value={formData.n_mels}
                    onChange={(value) => handleChange("n_mels", value)}
                    disabled={
                      modelTraining ||
                      formData.model === "TALNet" ||
                      formData.model === "CDur"
                    }
                  />
                  {(formData.model === "TALNet" || formData.model === "CDur") && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Fixed to the model default for {selectedModelLabel}.
                    </p>
                  )}
                </Form.Item>
              )}

              {formData.model !== "birdnet" && (
                <>
                  <Form.Item
                    label="Bag Length"
                    tooltip="Audio duration used for each training bag"
                    className="mb-3"
                  >
                    <Select
                      disabled={modelTraining}
                      value={formData.bag_seconds}
                      onChange={(value) => handleChange("bag_seconds", value)}
                    >
                      <Option value="full">Full recording</Option>
                      <Option value={3}>3 seconds</Option>
                      <Option value={5}>5 seconds</Option>
                      <Option value={10}>10 seconds</Option>
                      <Option value={30}>30 seconds</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    label={
                      <div className="flex items-center gap-1">
                        <span>Hop Length</span>
                        <span className="text-gray-400 text-sm">(seconds)</span>
                      </div>
                    }
                    tooltip="Step size between training bags"
                    className="mb-1"
                  >
                    <InputNumber
                      min={1}
                      style={{ width: "100%" }}
                      value={formData.hop_seconds}
                      onChange={(value) => handleChange("hop_seconds", value)}
                      disabled={modelTraining || formData.bag_seconds === "full"}
                    />
                    {formData.bag_seconds === "full" && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Not used when training on full recordings.
                      </p>
                    )}
                  </Form.Item>
                </>
              )}
            </Panel>
          </Collapse>
        </Form>

          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]">
          <Button
            type="primary"
            block
            size="large"
            className="h-10 rounded-lg font-ibm-sans! font-semibold shadow-sm"
            onClick={handleSubmit}
            disabled={modelTraining}
            loading={modelTraining}
          >
            {buttonText}
          </Button>

          {statusText && (
            <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">Training status</div>
                {progressPercent != null && (
                  <div className="font-mono text-[11px]">{progressPercent}%</div>
                )}
              </div>
              <div className="mt-1 font-mono">{statusText}</div>

              {progressPercent != null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}

              {trainingProgress && (
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-blue-700">
                  {trainingProgress.phase && (
                    <div>
                      <span className="font-semibold">Phase:</span>{" "}
                      {trainingProgress.phase}
                    </div>
                  )}
                  {trainingProgress.model_name && (
                    <div>
                      <span className="font-semibold">Model:</span>{" "}
                      {trainingProgress.model_name}
                    </div>
                  )}
                  {trainingProgress.bag_seconds !== undefined && (
                    <div>
                      <span className="font-semibold">Bag:</span>{" "}
                      {String(trainingProgress.bag_seconds)}
                    </div>
                  )}
                  {trainingProgress.learning_rate !== undefined && (
                    <div>
                      <span className="font-semibold">LR:</span>{" "}
                      {trainingProgress.learning_rate}
                    </div>
                  )}
                  {trainingProgress.dataset_path && (
                    <div className="col-span-2 truncate">
                      <span className="font-semibold">Dataset:</span>{" "}
                      {trainingProgress.dataset_path}
                    </div>
                  )}
                  {trainingProgress.embeddings_status && (
                    <div className="col-span-2">
                      <span className="font-semibold">Embeddings:</span>{" "}
                      {trainingProgress.embeddings_status}
                    </div>
                  )}
                  {(trainingProgress.skip_extraction ||
                    trainingProgress.skip_training) && (
                    <div className="col-span-2 text-emerald-800">
                      {trainingProgress.skip_extraction && (
                        <span className="mr-2">skipped extraction</span>
                      )}
                      {trainingProgress.skip_training && (
                        <span>skipped training</span>
                      )}
                    </div>
                  )}
                  {trainingProgress.training_log && (
                    <div className="col-span-2 truncate">
                      <span className="font-semibold">Log:</span>{" "}
                      {trainingProgress.training_log}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
