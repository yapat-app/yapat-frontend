import { useState } from "react";
import type { Dataset } from "../types";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Select, Modal, Button, Form, message, Tooltip, Tag } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import {
  getAllEmbeddingMethods,
  createEmbedding,
  selectEmbedding,
  clearEmbedding,
} from "../redux/features/embeddingSlice";
import {
  fetchAllDatasets,
  selectDataset,
} from "../redux/features/datasetSlice";
import type { EmbeddingMethod } from "../types";
const { Option } = Select;

type DatasetEmbeddingProps = {
  dataset: Dataset;
  /** An embedding job is in flight (progress is shown by the card's panel). */
  running?: boolean;
  /** Called with the new job id right after a job is created. */
  onStarted?: (jobId: number) => void;
};

export const GenerateEmbeddings: React.FC<DatasetEmbeddingProps> = ({
  dataset,
  running = false,
  onStarted,
}) => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    embeddingMethods,
    selectedEmbeddedMethodId,
    embeddingLoading,
  } = useAppSelector((state) => state.embedding);
  const { selectedDatasetId } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);

  const datasetIdNumber =
    typeof dataset.id === "string" ? Number(dataset.id) : dataset.id;

  const showModal = async () => {
    setIsModalOpen(true);
    dispatch(getAllEmbeddingMethods());
    dispatch(selectDataset(Number.isFinite(datasetIdNumber) ? datasetIdNumber : null));
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  const handleGenerate = async () => {
    if (!selectedEmbeddedMethodId) return;
    try {
      const created = await dispatch(
        createEmbedding({
          datasetId: selectedDatasetId,
          body: {
            embedding_model_id: selectedEmbeddedMethodId,
            window_size: 0,
            step_size: 0,
            overlap: 0,
          },
        }),
      ).unwrap();
      onStarted?.(created.embedding_job_id);
      message.info(`Generating embeddings for ${dataset.name}`);
      dispatch(clearEmbedding());
      // Picks up `active_embedding_job`, so the progress survives a refresh.
      dispatch(fetchAllDatasets());
      handleCancel();
    } catch (err) {
      message.error(
        typeof err === "string" ? err : "Could not start embedding generation",
      );
    }
  };

  // "Ready for embeddings" is different from "ready for feed":
  // - embeddings are the step that creates snippet_sets/snippets (and later makes is_ready_for_feed true)
  // - so here we only require that dataset processing/discovery has produced recordings
  const isDatasetReady = Boolean((dataset.recording_count ?? 0) > 0);

  return (
    <div>
      {!isDatasetReady ? (
        <Button
          color="default"
          variant="filled"
          disabled
          title="Waiting for dataset scan/discovery to finish (recordings not available yet)"
        >
          Processing dataset…
        </Button>
      ) : running ? (
        <Button color="default" variant="filled" disabled icon={<LoadingOutlined />}>
          Generating embeddings…
        </Button>
      ) : dataset.is_ready_for_feed ? (
        <Button color="default" variant="filled" disabled>
          Embeddings ready
        </Button>
      ) : (
        <div>
          {user && user.role === "admin" && (
            <>
              <Modal
                centered
                title="Generate Embeddings"
                closable={{ "aria-label": "Custom Close Button" }}
                open={isModalOpen}
                onOk={handleCancel}
                // loading={invitationLoading}
                okText="Create Invitation Link"
                onCancel={handleCancel}
                footer={null}
              >
                {embeddingMethods && (
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
                        onClick={() => void handleGenerate()}
                        className="w-full!"
                      >
                        {embeddingLoading
                          ? "Generating Embeddings"
                          : "Generate Embeddings"}
                      </Button>
                    </div>
                  </div>
                )}
              </Modal>
              <Button
                color="danger"
                variant="filled"
                disabled={dataset.is_ready_for_feed}
                onClick={showModal}
              >
                Generate Embeddings
              </Button>
            </>
          )}
          {user &&
            user.role === "user" &&
            (dataset.is_ready_for_feed ? (
              <Tag key={"green"} color={"green"} variant={"filled"}>
                ✓ Embeddings Generated
              </Tag>
            ) : (
              <Tooltip title="Please ask Admin / Team owner to generate embeddings for the dataset.">
                <Tag key={"green"} color={"red"} variant={"filled"}>
                  Embeddings Not Found
                </Tag>
              </Tooltip>
            ))}
        </div>
      )}
    </div>
  );
};
