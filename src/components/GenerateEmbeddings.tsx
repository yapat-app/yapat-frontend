import { useState, useEffect } from "react";
import type { Dataset } from "../types";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Select, Modal, Button, Form, message } from "antd";
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
import { embeddingApi } from "../services/api";
const { Option } = Select;

type DatasetEmbeddingProps = {
  dataset: Dataset;
};

export const GenerateEmbeddings: React.FC<DatasetEmbeddingProps> = ({
  dataset,
}) => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hasExistingEmbeddings, setHasExistingEmbeddings] = useState(false);
  const [embeddingStatusLoading, setEmbeddingStatusLoading] = useState(false);
  const {
    embeddingMethods,
    selectedEmbeddedMethodId,
    embeddingCreated,
    embeddingLoading,
  } = useAppSelector((state) => state.embedding);
  const { selectedDatasetId } = useAppSelector((state) => state.dataset);

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

  useEffect(() => {
    if (embeddingCreated && dataset.id === selectedDatasetId) {
      message.success(
        `Embeddings Generated for dataset ${selectedDatasetId}`,
        undefined, // Optional: duration (defaults to 1.5s if omitted)
        () => {
          dispatch(clearEmbedding());
          dispatch(fetchAllDatasets());
        },
      );
      handleCancel();
    }
  }, [embeddingCreated]);

  // "Ready for embeddings" is different from "ready for feed":
  // - embeddings are the step that creates snippet_sets/snippets (and later makes is_ready_for_feed true)
  // - so here we only require that dataset processing/discovery has produced recordings
  const isDatasetReady = Boolean((dataset.recording_count ?? 0) > 0);

  useEffect(() => {
    if (!isDatasetReady) {
      setHasExistingEmbeddings(false);
      setEmbeddingStatusLoading(false);
      return;
    }
    if (!Number.isFinite(datasetIdNumber)) return;

    const abortController = new AbortController();
    setEmbeddingStatusLoading(true);

    (async () => {
      try {
        const jobs = await embeddingApi.allDatasetEmbeddingList(datasetIdNumber);
        const exists = (jobs ?? []).some((job) => {
          const status = (job.status ?? "").toString().toUpperCase();
          return (
            Boolean(job.completed_at) ||
            status === "SUCCESS" ||
            status === "COMPLETED" ||
            status === "DONE" ||
            status === "READY"
          );
        });
        if (!abortController.signal.aborted) setHasExistingEmbeddings(exists);
      } catch {
        // If we can't fetch status (auth/network), fall back to showing the action.
        if (!abortController.signal.aborted) setHasExistingEmbeddings(false);
      } finally {
        if (!abortController.signal.aborted) setEmbeddingStatusLoading(false);
      }
    })();

    return () => abortController.abort();
  }, [isDatasetReady, datasetIdNumber]);

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
      ) : embeddingStatusLoading ? (
        <Button color="default" variant="filled" disabled>
          Checking embeddings…
        </Button>
      ) : hasExistingEmbeddings ? (
        <Button color="default" variant="filled" disabled>
          Embeddings ready
        </Button>
      ) : (
        <div>
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
                    onClick={() =>
                      // console.log({
                      //   datasetId: selectedDatasetId,
                      //   body: {
                      //     embedding_model_id: selectedEmbeddedMethodId,
                      //     window_size: 0,
                      //     step_size: 0,
                      //     overlap: 0,
                      //   },
                      // })
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
          </Modal>
          <Button
            color="danger"
            variant="filled"
            disabled={!isDatasetReady}
            onClick={showModal}
          >
            Generate Embeddings
          </Button>
        </div>
      )}
    </div>
  );
};
