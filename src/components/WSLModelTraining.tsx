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

interface WSLModelTrainingProps {
  trainingHandler: () => void;
}

export const WSLModelTraining = ({
  trainingHandler,
}: WSLModelTrainingProps) => {
  return (
    <div>
      {/* Header */}

      {/* Scrollable Form */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
        <Form
          layout="vertical"
          className="flex flex-col gap-3 max-h-[60vh] overflow-auto"
        >
          <Collapse className="mt-4">
            <Panel header="Training Settings" key="1">
              <Form.Item
                label="Model"
                name="model"
                rules={[{ required: true, message: "Please select a model" }]}
              >
                <Select placeholder="Select a model">
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
              >
                <InputNumber min={1} max={500} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item
                label="Learning Rate"
                name="learning_rate"
                initialValue={0.0003}
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
              >
                <Slider min={0.1} max={1.0} step={0.05} />
              </Form.Item>
            </Panel>
          </Collapse>
          <Collapse className="mt-4">
            <Panel header="Audio Processing & Hyperparameters" key="2">
              <Form.Item
                label="Sample Rate"
                name="sample_rate"
                initialValue={16000}
              >
                <Select>
                  <Option value={8000}>8000 Hz</Option>
                  <Option value={16000}>16000 Hz</Option>
                  <Option value={32000}>32000 Hz</Option>
                  <Option value={44100}>44100 Hz</Option>
                </Select>
              </Form.Item>

              <Form.Item label="Mel Bands" name="n_mels" initialValue={128}>
                <InputNumber min={32} max={512} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item
                label="FFT Window Size"
                name="n_fft"
                initialValue={1024}
              >
                <Select>
                  <Option value={512}>512</Option>
                  <Option value={1024}>1024</Option>
                  <Option value={2048}>2048</Option>
                  <Option value={4096}>4096</Option>
                </Select>
              </Form.Item>

              <Form.Item
                label="Hop Length"
                name="hop_length"
                initialValue={320}
              >
                <InputNumber min={64} max={2048} style={{ width: "100%" }} />
              </Form.Item>

              <Form.Item
                label="Normalize Embeddings"
                name="normalize"
                valuePropName="checked"
                initialValue={true}
              >
                <Switch />
              </Form.Item>
            </Panel>
          </Collapse>
        </Form>
        <Button type="primary" block className="mt-4" onClick={trainingHandler}>
          Start Training
        </Button>
      </div>
    </div>
  );
};
