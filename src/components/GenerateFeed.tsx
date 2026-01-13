import React, { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchAllDatasets,
  selectDataset,
} from "../redux/features/datasetSlice";
import { createFeed } from "../redux/features/feedSlice";
import { useNavigate, useLocation } from "react-router-dom";
import { Select, Modal, Button, Form } from "antd";
const { Option } = Select;
import {
  createEmbedding,
  getAllEmbeddingMethods,
  selectEmbedding,
} from "../redux/features/embeddingSlice";
import type { EmbeddingMethod } from "../types";

export const GenerateFeedModal = ({
  datasetId,
}: {
  datasetId: number | null;
}) => {
  const navigator = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { selectedDatasetId } = useAppSelector((state) => state.dataset);
  const { feed } = useAppSelector((state) => state.feed);
  const { embeddingMethods, selectedEmbeddedMethodId, embeddingCreated } =
    useAppSelector((state) => state.embedding);
  const dispatch = useAppDispatch();

  const showModal = async () => {
    setIsModalOpen(true);
    dispatch(selectDataset(datasetId));
    dispatch(getAllEmbeddingMethods());
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  useEffect(() => {
    if (feed) {
      navigator(`/annotate?dataset_id=${selectedDatasetId}`);
    }
  }, [embeddingCreated, feed]);

  return (
    <div>
      <div>
        <div className="flex gap-3">
          <Button onClick={showModal}>Generate Feed</Button>
        </div>
      </div>
      <Modal
        centered
        title="Generate Feed"
        closable={{ "aria-label": "Custom Close Button" }}
        open={isModalOpen}
        onOk={handleCancel}
        // loading={invitationLoading}
        okText="Create Invitation Link"
        onCancel={handleCancel}
        footer={null}
      >
        {embeddingMethods && !embeddingCreated && (
          <div>
            <Form layout="vertical">
              <Form.Item
                label="Embedding method"
                name="embeddingMethodId"
                rules={[{ required: true, message: "Please select a method" }]}
                tooltip="Choose which embedding method to use"
              >
                <Select
                  placeholder="Select a method"
                  style={{ width: "100%" }}
                  onChange={(value: number) => {
                    dispatch(selectEmbedding(value)); // value is the id
                  }}
                >
                  {embeddingMethods.map((method: EmbeddingMethod) => (
                    <Option key={method.id} value={method.id}>
                      {method.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Form>
            <div className="py-2 w-full ">
              <Button
                type="primary"
                onClick={() =>
                  selectedEmbeddedMethodId &&
                  dispatch(
                    createEmbedding({
                      datasetId: selectedDatasetId,
                      body: {
                        embedding_model_id: selectedEmbeddedMethodId,
                        window_size: 0,
                        step_size: 0,
                        overlap: 0,
                      },
                    })
                  )
                }
                className="!w-full"
              >
                Generate Embeddings
              </Button>
              <p className="sub_description_text">
                Embeddings need to be created for the dataset before you can
                create the feed.
              </p>
            </div>
          </div>
        )}
        {embeddingCreated && (
          <div>
            <Form layout="vertical">
              <Form.Item
                label="Feed method"
                name="feedMethod"
                rules={[{ required: true, message: "Please select a method" }]}
                tooltip="Choose which embedding method to use"
              >
                <Select placeholder="Select a method" style={{ width: "100%" }}>
                  {[
                    {
                      name: "random",
                    },
                  ].map((method: any) => (
                    <Option key={method.name} value={method.name}>
                      {method.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Form>
            <div className="py-2">
              <Button
                type="primary"
                onClick={() =>
                  selectedEmbeddedMethodId &&
                  dispatch(createFeed({ dataset_id: selectedDatasetId }))
                }
                className="!w-full"
              >
                Generate Feed
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
