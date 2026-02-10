import React, {
  useEffect,
  useState,
  useCallback,
  // useMemo
} from "react";
import {
  Form,
  Select,
  Slider,
  InputNumber,
  Switch,
  Button,
  Modal,
  Collapse,
  Input,
} from "antd";
const { Option } = Select;
const { Panel } = Collapse;
import { useAppDispatch, useAppSelector } from "../hooks";
import { useNavigate } from "react-router-dom";

const embeddingModelList = [
  {
    name: "birdnet",
    value: "birdnet",
  },
];

export const GenerateWssed = () => {
  const dispatch = useAppDispatch();
  const navigator = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [model, setModel] = useState("embedding");

  const showModal = async () => {
    setIsModalOpen(true);
  };

  const startTraining = () => {
    navigator("/wssed");
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  return (
    <div>
      <Button type="primary" onClick={showModal}>
        WSSED
      </Button>
      <Modal
        centered
        title="Weakly Supervised Sound Event Detection"
        closable={{ "aria-label": "Custom Close Button" }}
        open={isModalOpen}
        onOk={startTraining}
        // loading={invitationLoading}
        okText="Start Training"
        onCancel={handleCancel}
        // footer={null}
      >
        <Form layout="vertical" className="max-h-[65vh] overflow-y-auto">
          <h3 className="text-lg font-semibold mb-2">Training Settings</h3>
          <Form.Item
            label="Model"
            name="model"
            rules={[{ required: true, message: "Please select a model" }]}
            tooltip="Select the base embedding model used for training and inference"
          >
            <Select
              placeholder="Select a model"
              onChange={(value: string) => setModel(value)}
            >
              {embeddingModelList.map((model) => (
                <Option key={model.name} value={model.name}>
                  {model.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Pooling Method"
            name="pooling"
            initialValue="mean"
            tooltip="Determines how frame-level features are summarized"
          >
            <Select>
              <Option value="mean">Mean</Option>
              <Option value="cls">CLS Token</Option>
              <Option value="max">Max</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Training Epochs"
            name="epochs"
            initialValue={20}
            tooltip="Number of full passes over the training dataset"
          >
            <InputNumber min={1} max={500} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item
            label="Learning Rate"
            name="learning_rate"
            initialValue={0.0003}
            tooltip="Controls how much the model updates its weights during training"
          >
            <InputNumber
              min={0.000001}
              max={0.1}
              step={0.0001}
              style={{ width: "100%" }}
            />
          </Form.Item>

          <Form.Item
            label="Detection Threshold"
            name="threshold"
            initialValue={0.75}
            tooltip="Minimum confidence required to trigger a detection"
          >
            <Slider min={0.1} max={1.0} step={0.05} />
          </Form.Item>

          <Collapse className="mt-4">
            <Panel header="Audio Processing & Hyperparameters" key="1">
              <h4 className="font-medium mb-2">Audio Processing Parameters</h4>

              <Form.Item
                label="Sample Rate (Hz)"
                name="sample_rate"
                initialValue={16000}
                tooltip="Number of audio samples per second"
              >
                <Select>
                  <Option value={8000}>8000 Hz</Option>
                  <Option value={16000}>16000 Hz</Option>
                  <Option value={32000}>32000 Hz</Option>
                  <Option value={44100}>44100 Hz</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Frequency Resolution (Mel Bands)"
                name="n_mels"
                initialValue={128}
                tooltip="Controls how detailed the frequency representation is"
              >
                <InputNumber min={32} max={512} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item
                label="FFT Window Size"
                name="n_fft"
                initialValue={1024}
                tooltip="Number of samples used in each frequency analysis window"
              >
                <Select>
                  <Option value={512}>512</Option>
                  <Option value={1024}>1024</Option>
                  <Option value={2048}>2048</Option>
                  <Option value={4096}>4096</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Hop Length (Time Step)"
                name="hop_length"
                initialValue={320}
                tooltip="Step size between FFT windows"
              >
                <InputNumber min={64} max={2048} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item
                label="Normalize Embeddings"
                name="normalize"
                valuePropName="checked"
                initialValue={true}
                tooltip="Applies L2 normalization to embedding vectors"
              >
                <Switch />
              </Form.Item>
            </Panel>
          </Collapse>
        </Form>
      </Modal>
    </div>
  );
};
