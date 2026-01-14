import React, { useEffect, useState, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  fetchAllDatasets,
  selectDataset,
} from "../redux/features/datasetSlice";
import { createFeed, createSimilarityFeed } from "../redux/features/feedSlice";
import { useNavigate, useLocation } from "react-router-dom";
import { Select, Modal, Button, Form } from "antd";
const { Option } = Select;
import {
  createEmbedding,
  getAllEmbeddingMethods,
  selectEmbedding,
} from "../redux/features/embeddingSlice";
import type { EmbeddingMethod, FeedSimilarityCreate } from "../types";
import { UploadSampleAudio } from "./UploadingAudio";

export const GenerateFeedModal = ({
  datasetId,
}: {
  datasetId: number | null;
}) => {
  const navigator = useNavigate();
  const hasNavigatedRef = useRef(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { selectedDatasetId } = useAppSelector((state) => state.dataset);
  const { feed } = useAppSelector((state) => state.feed);
  const [feedMethod, setFeedMethod] = useState<string | null>(null);
  const [similarityState, setSimilarityState] = useState<{
    audioFile: File | null;
    startSec: number;
    endSec: number;
  }>({
    audioFile: null,
    startSec: 0,
    endSec: 3,
  });

  const handleSimilarityChange = (value: {
    audioFile: File | null;
    startSec: number;
    endSec: number;
  }) => {
    setSimilarityState(value);
  };

  const { embeddingMethods, selectedEmbeddedMethodId, embeddingCreated } =
    useAppSelector((state) => state.embedding);
  const dispatch = useAppDispatch();

  const showModal = async () => {
    setIsModalOpen(true);
    dispatch(selectDataset(datasetId));
    dispatch(getAllEmbeddingMethods());
  };

  const handleSubmit = () => {
    // create random feed
    if (feedMethod === "random") {
      selectedEmbeddedMethodId &&
        dispatch(createFeed({ dataset_id: selectedDatasetId }));
    }
    // create similarity feed
    else if (feedMethod === "similarity") {
      const { audioFile, startSec, endSec } = similarityState;
      if (!audioFile) return;

      const payload: FeedSimilarityCreate = {
        audio_file: audioFile,
        dataset_id: selectedDatasetId,
        start_time: startSec,
        end_time: endSec,
      };
      console.log("payload before similarity", payload);
      dispatch(createSimilarityFeed(payload));
    }
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
                tooltip="Choose which feed method to use"
              >
                <Select
                  onChange={(value: string) => {
                    setFeedMethod(value);
                  }}
                  placeholder="Select a method"
                  style={{ width: "100%" }}
                >
                  {[
                    {
                      name: "random",
                    },
                    {
                      name: "similarity",
                    },
                  ].map((method: any) => (
                    <Option key={method.name} value={method.name}>
                      {method.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
              {feedMethod === "similarity" && (
                <UploadSampleAudio onChange={handleSimilarityChange} />
              )}
            </Form>
            <div className="py-2">
              <Button type="primary" onClick={handleSubmit} className="!w-full">
                Generate Feed
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
