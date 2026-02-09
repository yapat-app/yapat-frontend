import React, {
  useEffect,
  useState,
  useCallback,
  // useMemo
} from "react";
import {
  Select,
  Modal,
  Button,
  Form,
  Input,
  InputNumber,
  Slider,
  Switch,
  //  message, Steps
} from "antd";
const { Option } = Select;
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
        onOk={handleCancel}
        // loading={invitationLoading}
        okText="Create Invitation Link"
        onCancel={handleCancel}
        footer={null}
      >
        <Form layout="vertical">
          <Form.Item
            label="Choose model"
            name="model"
            rules={[{ required: true, message: "Please select a model" }]}
            tooltip="Choose which model to use"
          >
            <Select
              onChange={(value: string) => setModel(value)}
              placeholder="Select a model"
              style={{ width: "100%" }}
            >
              {embeddingModelList.map((method) => (
                <Option key={method.name} value={method.name}>
                  {method.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Pooling Function"
            name="poolingFunction"
            initialValue="mean"
          >
            <Select style={{ width: "100%" }}>
              <Select.Option value="mean">Mean</Select.Option>
              <Select.Option value="cls">CLS</Select.Option>
              <Select.Option value="max">Max</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Threshold Value"
            name="thresholdValue"
            initialValue={0.75}
          >
            <Slider min={0.1} max={1.0} step={0.05} />
          </Form.Item>

          <Form.Item
            label="Embedding Dimension"
            name="embeddingDimension"
            initialValue={384}
          >
            <InputNumber style={{ width: "100%" }} disabled />
          </Form.Item>

          <Form.Item
            label="Normalize Embeddings"
            name="normalizeEmbeddings"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
          <div className="py-2">
            <Button
              type="primary"
              onClick={() => navigator("/wssed")}
              className="w-full!"
            >
              Generate
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
