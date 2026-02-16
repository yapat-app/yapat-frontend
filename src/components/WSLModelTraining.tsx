import { useEffect, useRef, useState } from "react";
import { Form, Select, Slider, InputNumber, Button, Collapse } from "antd";
import { useAppDispatch, useAppSelector } from "../hooks";
import { setTraining } from "../redux/features/wssedSlice";

const { Option } = Select;
const { Panel } = Collapse;

const embeddingModelList = [
  { name: "birdnet", value: "birdnet" },
  { name: "baseline", value: "baseline" },
  { name: "CNN-biGRU,", value: "CNN-biGRU," },
  { name: "CNN-Transformer", value: "CNN-Transformer" },
  { name: "CDur", value: "CDur" },
  { name: "TALNet", value: "TALNet" },
];

// Sample epoch logs (first 100). We'll show up to user-selected epochs.
const EPOCH_LOGS: string[] = [
  "Epoch 1: train loss=0.1798, micro-F1=0.8972, macro-F1=0.6787, ER=0.1028",
  "Epoch 2: train loss=0.1317, micro-F1=0.9317, macro-F1=0.8428, ER=0.0683",
  "Epoch 3: train loss=0.1080, micro-F1=0.9519, macro-F1=0.8888, ER=0.0481",
  "Epoch 4: train loss=0.0941, micro-F1=0.9548, macro-F1=0.9074, ER=0.0452",
  "Epoch 5: train loss=0.0849, micro-F1=0.9597, macro-F1=0.9178, ER=0.0403",
  "Epoch 6: train loss=0.0745, micro-F1=0.9624, macro-F1=0.9223, ER=0.0376",
  "Epoch 7: train loss=0.0676, micro-F1=0.9624, macro-F1=0.9200, ER=0.0376",
  "Epoch 8: train loss=0.0612, micro-F1=0.9728, macro-F1=0.9509, ER=0.0272",
  "Epoch 9: train loss=0.0583, micro-F1=0.9682, macro-F1=0.9286, ER=0.0318",
  "Epoch 10: train loss=0.0517, micro-F1=0.9829, macro-F1=0.9698, ER=0.0171",
  "Epoch 11: train loss=0.0476, micro-F1=0.9847, macro-F1=0.9738, ER=0.0153",
  "Epoch 12: train loss=0.0445, micro-F1=0.9856, macro-F1=0.9747, ER=0.0144",
  "Epoch 13: train loss=0.0417, micro-F1=0.9847, macro-F1=0.9711, ER=0.0153",
  "Epoch 14: train loss=0.0392, micro-F1=0.9892, macro-F1=0.9848, ER=0.0108",
  "Epoch 15: train loss=0.0366, micro-F1=0.9883, macro-F1=0.9802, ER=0.0117",
  "Epoch 16: train loss=0.0344, micro-F1=0.9910, macro-F1=0.9857, ER=0.0090",
  "Epoch 17: train loss=0.0328, micro-F1=0.9901, macro-F1=0.9852, ER=0.0099",
  "Epoch 18: train loss=0.0315, micro-F1=0.9919, macro-F1=0.9890, ER=0.0081",
  "Epoch 19: train loss=0.0294, micro-F1=0.9928, macro-F1=0.9894, ER=0.0072",
  "Epoch 20: train loss=0.0279, micro-F1=0.9928, macro-F1=0.9894, ER=0.0072",
  "Epoch 21: train loss=0.0264, micro-F1=0.9937, macro-F1=0.9926, ER=0.0063",
  "Epoch 22: train loss=0.0256, micro-F1=0.9928, macro-F1=0.9892, ER=0.0072",
  "Epoch 23: train loss=0.0241, micro-F1=0.9946, macro-F1=0.9930, ER=0.0054",
  "Epoch 24: train loss=0.0231, micro-F1=0.9946, macro-F1=0.9942, ER=0.0054",
  "Epoch 25: train loss=0.0226, micro-F1=0.9946, macro-F1=0.9930, ER=0.0054",
  "Epoch 26: train loss=0.0211, micro-F1=0.9937, macro-F1=0.9926, ER=0.0063",
  "Epoch 27: train loss=0.0204, micro-F1=0.9955, macro-F1=0.9946, ER=0.0045",
  "Epoch 28: train loss=0.0195, micro-F1=0.9964, macro-F1=0.9979, ER=0.0036",
  "Epoch 29: train loss=0.0187, micro-F1=0.9955, macro-F1=0.9946, ER=0.0045",
  "Epoch 30: train loss=0.0179, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 31: train loss=0.0176, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 32: train loss=0.0167, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 33: train loss=0.0161, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 34: train loss=0.0157, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 35: train loss=0.0151, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 36: train loss=0.0145, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 37: train loss=0.0140, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 38: train loss=0.0138, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 39: train loss=0.0135, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 40: train loss=0.0130, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 41: train loss=0.0124, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 42: train loss=0.0122, micro-F1=0.9973, macro-F1=0.9983, ER=0.0027",
  "Epoch 43: train loss=0.0116, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 44: train loss=0.0113, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 45: train loss=0.0111, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 46: train loss=0.0108, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 47: train loss=0.0103, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 48: train loss=0.0102, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 49: train loss=0.0099, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 50: train loss=0.0096, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 51: train loss=0.0093, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 52: train loss=0.0092, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 53: train loss=0.0092, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 54: train loss=0.0088, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 55: train loss=0.0084, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 56: train loss=0.0084, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 57: train loss=0.0081, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 58: train loss=0.0079, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 59: train loss=0.0077, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 60: train loss=0.0077, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 61: train loss=0.0074, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 62: train loss=0.0074, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 63: train loss=0.0072, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 64: train loss=0.0072, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 65: train loss=0.0069, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 66: train loss=0.0067, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 67: train loss=0.0067, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 68: train loss=0.0065, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 69: train loss=0.0064, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 70: train loss=0.0063, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 71: train loss=0.0062, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 72: train loss=0.0061, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 73: train loss=0.0060, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 74: train loss=0.0059, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 75: train loss=0.0058, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 76: train loss=0.0056, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 77: train loss=0.0056, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 78: train loss=0.0055, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 79: train loss=0.0054, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 80: train loss=0.0053, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 81: train loss=0.0052, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 82: train loss=0.0051, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 83: train loss=0.0051, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 84: train loss=0.0050, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 85: train loss=0.0049, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 86: train loss=0.0051, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 87: train loss=0.0051, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 88: train loss=0.0047, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 89: train loss=0.0047, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 90: train loss=0.0046, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 91: train loss=0.0045, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 92: train loss=0.0045, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 93: train loss=0.0044, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 94: train loss=0.0045, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 95: train loss=0.0044, micro-F1=0.9982, macro-F1=0.9987, ER=0.0018",
  "Epoch 96: train loss=0.0043, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 97: train loss=0.0042, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 98: train loss=0.0042, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 99: train loss=0.0041, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
  "Epoch 100: train loss=0.0041, micro-F1=0.9991, macro-F1=0.9991, ER=0.0009",
];

interface WSLModelTrainingProps {
  stopTraining: () => void;
}

export const WSLModelTraining = ({ stopTraining }: WSLModelTrainingProps) => {
  const { modelTraining } = useAppSelector((state) => state.wssed);
  // const [modelTraining, setmodelTraining] = useState(false);
  const dispatch = useAppDispatch();

  // Config state
  const [formData, setFormData] = useState({
    model: "birdnet",
    pooling: "mean",
    epochs: 20,
    learning_rate: 0.0003,
    threshold: 0.5,
    sample_rate: 48000,
    n_mels: 128,
    n_fft: 3,
    hop_length: 1,
    normalize: true,
  });

  // Current epoch output shown under the button
  const [epochText, setEpochText] = useState<string>("");

  // Keep interval references for cleanup
  const intervalRef = useRef<number | null>(null);
  const currentEpochRef = useRef<number>(0);

  const handleChange = (name: string, value: any) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // Stop any running simulation
  const stopSimulation = () => {
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    // stopTraining();
  };

  const handleSubmit = () => {
    if (modelTraining) return;

    // setmodelTraining(true);
    // trainingHandler(formData);
    dispatch(setTraining(true));

    // Start from epoch 1
    currentEpochRef.current = 0;

    const totalEpochs = Math.max(1, Number(formData.epochs || 1));
    const maxAvailable = EPOCH_LOGS.length;
    const epochsToShow = Math.min(totalEpochs, maxAvailable);

    // Show first epoch immediately
    setEpochText(EPOCH_LOGS[0]);

    stopSimulation();

    // Change output every 800ms (adjust if you want slower/faster)
    intervalRef.current = window.setInterval(() => {
      currentEpochRef.current += 1;

      // If finished, keep last epoch text and enable button
      if (currentEpochRef.current >= epochsToShow) {
        stopSimulation();
        stopTraining();
        // setmodelTraining(false);
        dispatch(setTraining(false));
        setEpochText(EPOCH_LOGS[epochsToShow - 1]);
        return;
      }

      setEpochText(EPOCH_LOGS[currentEpochRef.current]);
    }, 1800);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopSimulation();
  }, []);

  const buttonText = modelTraining ? "Model Training ..." : "Start Training";

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
                tooltip="Number of times the model trains on the full dataset. More epochs can improve accuracy but may cause overfitting"
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
                tooltip="Controls how much the model updates its weights during training. Too high may cause instability, too low may slow learning"
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
                tooltip="Number of audio samples per second. Higher values mean better quality but slower processing"
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
                  tooltip="Controls how detailed the frequency representation of the audio is"
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
                        : "FFT Window Size"}
                    </span>
                    <span className="text-gray-400 text-sm">(seconds)</span>
                  </div>
                }
                tooltip="Number of samples used in each frequency analysis window"
              >
                <InputNumber
                  disabled={modelTraining || formData.model === "birdnet"}
                  style={{ width: "100%" }}
                  value={formData.n_fft}
                  onChange={(value) => handleChange("n_fft", value)}
                />
              </Form.Item>

              <Form.Item
                label={
                  <div className="flex items-center gap-1">
                    <span>Hop Length</span>
                    <span className="text-gray-400 text-sm">(seconds)</span>
                  </div>
                }
                tooltip="Step size between analysis windows. Smaller values give smoother results but increase processing time"
              >
                <InputNumber
                  style={{ width: "100%" }}
                  value={formData.hop_length}
                  onChange={(value) => handleChange("hop_length", value)}
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
        >
          {buttonText}
        </Button>

        {/* Epoch output */}
        {epochText && (
          <div className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded p-2">
            {epochText}
          </div>
        )}
      </div>
    </div>
  );
};
