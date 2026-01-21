import React, {
  useEffect,
  useState,
  useCallback,
  // useMemo
} from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { selectDataset } from "../redux/features/datasetSlice";
import {
  fetchSimilaritySnippetFeed,
  fetchSnippetFeed,
} from "../redux/features/snippetSlice";
import { useNavigate } from "react-router-dom";
import {
  Select,
  Modal,
  Button,
  Form,
  Input,
  //  message, Steps
} from "antd";
const { Option } = Select;
import {
  clearEmbedding,
  createEmbedding,
  // getAllEmbeddingMethods,
  selectEmbedding,
} from "../redux/features/embeddingSlice";
import type { EmbeddingMethod, FeedSimilarityCreate } from "../types";
import { UploadSampleAudio } from "./UploadingAudio";
import { getAllDatasetEmbeddings } from "../redux/features/embeddingSlice";
import type { Dataset } from "../types";

export const GenerateFeedModal = ({
  datasetId,
  dataset,
}: {
  datasetId: number | null | string;
  dataset: Dataset;
}) => {
  const dispatch = useAppDispatch();
  const navigator = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { selectedDatasetId } = useAppSelector((state) => state.dataset);
  const { snippetsLoading } = useAppSelector((state) => state.snippet);
  const { feed } = useAppSelector((state) => state.feed);
  const [disableFeedGeneration, setDisableFeedGeneration] = useState(true);
  const [feedMethod, setFeedMethod] = useState<string | null>(null);
  // const [stepCount, setStepCount] = useState<number>(0);
  const {
    embeddingMethods,
    selectedEmbeddedMethodId,
    embeddingCreated,
    embeddingLoading,
    datasetEmbeddings,
  } = useAppSelector((state) => state.embedding);
  const [feedParams, setFeedParams] = useState({ limit: 50 });
  const { snippets } = useAppSelector((state) => state.snippet);
  const [similarityState, setSimilarityState] = useState<{
    audioFile: File | null;
    startSec: number;
    endSec: number;
  }>({
    audioFile: null,
    startSec: 0,
    endSec: 3,
  });
  // const canGenerateFeed =
  //   embeddingCreated && datasetEmbeddings && datasetEmbeddings.length > 0;

  useEffect(() => {
    if (feedMethod === "similarity" && similarityState.audioFile) {
      setDisableFeedGeneration(false);
    } else if (feedMethod === "random") {
      setDisableFeedGeneration(false);
    }
  }, [similarityState, feedMethod]);

  useEffect(() => {
    if (feed || (snippets.length > 0 && isModalOpen)) {
      navigator(`/annotate?dataset_id=${selectedDatasetId}`);
    }
  }, [embeddingCreated, feed, snippets]);

  // useEffect(() => {
  //   if (embeddingCreated) {
  // message.success(`Embeddings Generated for dataset ${selectedDatasetId}`);
  // increase step count for stepper
  // setStepCount(1);
  //   }
  // }, [embeddingCreated]);

  useEffect(() => {
    console.log();
    if (selectedDatasetId) {
      dispatch(getAllDatasetEmbeddings(selectedDatasetId));
    }
  }, [selectedDatasetId, embeddingCreated]);

  useEffect(() => {
    if (datasetEmbeddings && datasetEmbeddings.length > 0) {
      console.log("all dataset embeddings", datasetEmbeddings);
      // setStepCount(1);
    }
  }, [datasetEmbeddings]);

  // const steps = useMemo(() => {
  //   var baseSteps = [
  //     {
  //       title: "Generate Feed",
  //       content: "Feed Generation",
  //     },
  //   ];

  //   return baseSteps;
  // }, [feedMethod, embeddingCreated]);

  //Memoize the result for changing the states inside the child component
  const handleSimilarityChange = useCallback(
    (value: { audioFile: File | null; startSec: number; endSec: number }) => {
      setSimilarityState(value);
    },
    [],
  );

  const onChangeFeedParams = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFeedParams((prev: any) => {
      const updated = { ...prev, [name]: value };
      return updated;
    });
  };

  const showModal = async () => {
    setIsModalOpen(true);
    dispatch(selectDataset(datasetId ? Number(datasetId) : null));
    // dispatch(getAllEmbeddingMethods());
  };

  const handleSubmit = () => {
    // create random feed
    console.log(selectedEmbeddedMethodId);
    if (feedMethod === "random") {
      // selectedEmbeddedMethodId &&
      dispatch(
        fetchSnippetFeed({
          dataset_id: selectedDatasetId,
          limit: feedParams.limit,
          method: feedMethod,
        }),
      );
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
        limit: feedParams.limit,
      };
      console.log("payload before similarity", payload);
      dispatch(fetchSimilaritySnippetFeed(payload));
    }
  };

  const handleCancel = () => {
    setIsModalOpen(false);
    dispatch(clearEmbedding());
  };

  return (
    <div>
      <div>
        {dataset && (
          <div className="flex gap-3">
            <Button
              type="primary"
              onClick={showModal}
              disabled={!dataset.is_ready_for_feed}
            >
              Generate Feed
            </Button>
          </div>
        )}
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
        {/* <>
          <Steps current={stepCount} titlePlacement="vertical" items={steps} />
          <br />
        </> */}

        <div>
          {embeddingCreated ||
          (datasetEmbeddings && datasetEmbeddings.length > 0) ? (
            <Form layout="vertical">
              <Form.Item
                label="Feed method"
                name="feedMethod"
                rules={[{ required: true, message: "Please select a method" }]}
                tooltip="Choose which feed method to use"
              >
                <Select
                  onChange={(value: string) => setFeedMethod(value)}
                  placeholder="Select a method"
                  style={{ width: "100%" }}
                >
                  {[{ name: "random" }, { name: "similarity" }].map(
                    (method) => (
                      <Option key={method.name} value={method.name}>
                        {method.name}
                      </Option>
                    ),
                  )}
                </Select>
              </Form.Item>
              {feedMethod && (
                <Form.Item
                  label="Limit"
                  name="feedlimit"
                  tooltip="Maximum number of snippets to return"
                >
                  <Input
                    onChange={onChangeFeedParams}
                    name="limit"
                    defaultValue={feedParams.limit}
                    type="number"
                  />
                </Form.Item>
              )}
              {feedMethod === "similarity" &&
                datasetEmbeddings &&
                datasetEmbeddings.length > 0 && (
                  <UploadSampleAudio onChange={handleSimilarityChange} />
                )}
            </Form>
          ) : null}

          {/* {canGenerateFeed && ( */}
          {datasetEmbeddings && datasetEmbeddings.length > 0 && (
            <div className="py-2">
              <Button
                disabled={disableFeedGeneration}
                loading={snippetsLoading}
                type="primary"
                onClick={handleSubmit}
                className="w-full!"
              >
                {snippetsLoading ? "...Generating Feed" : "Generate Feed"}
              </Button>
            </div>
          )}
          {/* )} */}

          {embeddingMethods &&
            datasetEmbeddings &&
            datasetEmbeddings.length === 0 &&
            !embeddingCreated && (
              // !embeddingCreated &&
              // feedMethod === "similarity" &&
              <div>
                <Form layout="vertical">
                  <Form.Item
                    label="Embedding method"
                    name="embeddingMethodId"
                    rules={[
                      { required: true, message: "Please select a method" },
                    ]}
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
                    loading={embeddingLoading}
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
                        }),
                      )
                    }
                    className="w-full!"
                  >
                    {embeddingLoading
                      ? "Generating Embeddings"
                      : "Generate Embeddings"}
                  </Button>
                </div>
              </div>
            )}
        </div>
      </Modal>
    </div>
  );
};
