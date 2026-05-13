import { useEffect, useRef, useState } from "react";
import { Form, Select, Slider, InputNumber, Button, Collapse, message } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { setTraining } from "../redux/features/wssedSlice";
import { wssedApi } from "../services/api";

const { Option } = Select;
const { Panel } = Collapse;

const POLL_INTERVAL_MS = 5000;

const embeddingModelList = [
  { name: "BirdNET", value: "birdnet" },
  { name: "Baseline", value: "baseline" },
  { name: "CNN-BiGRU", value: "CNN-BiGRU" },
  { name: "CNN-Transformer", value: "CNN-Transformer" },
  { name: "CDur", value: "CDur" },
  { name: "TALNet", value: "TALNet" },
];

interface WSLModelTrainingProps {
  stopTraining: () => void;
}

export const WSLModelTraining = ({ stopTraining }: WSLModelTrainingProps) => {
  const { modelTraining } = useAppSelector((state) => state.wssed);
  const dispatch = useAppDispatch();

  const datasetId = useAppSelector(
    (state) => state.dataset.datasetDirectories?.dataset_id,
  );

  const [formData, setFormData] = useState({
    model: "CDur",
    pooling: "mean",
    epochs: 20,
    learning_rate: 0.0003,
    threshold: 0.5,
    sample_rate: 22000,
    n_mels: 64,
    bag_seconds: 3,
    hop_seconds: 1,
  });

  const [statusText, setStatusText] = useState<string>("");
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

  const startPolling = (jobId: number) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await wssedApi.getTrainingJobStatus(jobId);

        if (status.progress) {
          const p = status.progress as Record<string, unknown>;
          const cur = p["current_epoch"];
          const tot = p["total_epochs"];
          if (cur !== undefined && tot !== undefined) {
            setStatusText(`Epoch ${cur} / ${tot}`);
          } else {
            setStatusText(`Status: ${status.status}`);
          }
        } else {
          setStatusText(`Status: ${status.status}`);
        }

        if (status.status === "COMPLETED") {
          stopPolling();
          dispatch(setTraining(false));
          stopTraining();
          message.success("Model training completed!");
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
      bag_seconds: formData.bag_seconds,
      hop_seconds: formData.hop_seconds,
    };

    try {
      const result = await wssedApi.createTrainingJob({
        dataset_id: Number(datasetId),
        model_name: formData.model,
        hyperparameters,
      });

      jobIdRef.current = result.job_id;
      setStatusText(`Job ${result.job_id} started — waiting for GPU server…`);
      startPolling(result.job_id);
    } catch (err: unknown) {
      dispatch(setTraining(false));
      const msg =
        err instanceof Error ? err.message : "Failed to start training job";
      message.error(msg);
      setStatusText("");
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const buttonText = modelTraining ? "Training…" : "Start Training";

  return (
    <div>
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        <Form
          layout="vertical"
          className="flex flex-col gap-3 max-h-[60vh] overflow-auto"
        >
          <Collapse className="mt-4 font-ibm-sans">
            <Panel header="Training Settings" key="1">
              <Form.Item label="Model" required>
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
              >
                <Select
                  value={formData.pooling}
                  onChange={(value) => handleChange("pooling", value)}
                  disabled={modelTraining}
                >
                  <Option value="mean">mean</Option>
                  <Option value="max">max</Option>
                  <Option value="linear">linear</Option>
                  <Option value="exp">exp</Option>
                  <Option value="att">att</Option>
                  <Option value="auto">auto</Option>
                  <Option value="power">power</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Training Epochs"
                tooltip="Number of times the model trains on the full dataset"
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
              >
                <Slider
                  min={0}
                  max={1.0}
                  step={0.1}
                  value={formData.threshold}
                  onChange={(value) => handleChange("threshold", value)}
                  disabled={modelTraining}
                />
              </Form.Item>
            </Panel>
          </Collapse>

          <Collapse className="mt-4">
            <Panel header="Audio Processing & Hyperparameters" key="2">
              <Form.Item
                label="Sample Rate"
                tooltip="Number of audio samples per second"
              >
                <div className="flex gap-2 items-center">
                  <InputNumber
                    disabled={modelTraining || formData.model === "birdnet"}
                    style={{ width: "100%" }}
                    value={formData.sample_rate}
                    onChange={(value) => handleChange("sample_rate", value)}
                  />
                  Hz
                </div>
              </Form.Item>

              {formData.model !== "birdnet" && (
                <Form.Item
                  label="Mel Bands"
                  tooltip="Controls how detailed the frequency representation is"
                >
                  <InputNumber
                    style={{ width: "100%" }}
                    value={formData.n_mels}
                    onChange={(value) => handleChange("n_mels", value)}
                    disabled={modelTraining}
                  />
                </Form.Item>
              )}

              <Form.Item
                label={
                  <div className="flex items-center gap-1">
                    <span>
                      {formData.model === "birdnet"
                        ? "Window Size"
                        : "Bag Length"}
                    </span>
                    <span className="text-gray-400 text-sm">(seconds)</span>
                  </div>
                }
                tooltip="Audio duration used for each training bag"
              >
                <InputNumber
                  disabled={modelTraining || formData.model === "birdnet"}
                  style={{ width: "100%" }}
                  value={formData.bag_seconds}
                  onChange={(value) => handleChange("bag_seconds", value)}
                />
              </Form.Item>

              <Form.Item
                label={
                  <div className="flex items-center gap-1">
                    <span>Hop Length</span>
                    <span className="text-gray-400 text-sm">(seconds)</span>
                  </div>
                }
                tooltip="Step size between training bags"
              >
                <InputNumber
                  style={{ width: "100%" }}
                  value={formData.hop_seconds}
                  onChange={(value) => handleChange("hop_seconds", value)}
                  disabled={modelTraining}
                />
              </Form.Item>
            </Panel>
          </Collapse>
        </Form>

        <Button
          type="primary"
          block
          className="mt-4 font-ibm-sans!"
          onClick={handleSubmit}
          disabled={modelTraining}
          loading={modelTraining}
        >
          {buttonText}
        </Button>

        {statusText && (
          <div className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2 font-mono">
            {statusText}
          </div>
        )}
      </div>
    </div>
  );
};
