import { useState, useEffect } from "react";
import type { Dataset } from "../types";
import { useAppDispatch, useAppSelector } from "../hooks";
import { Select, Modal, Button, Tag, Form, message, Tooltip } from "antd";
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
};

export const GenerateEmbeddings: React.FC<DatasetEmbeddingProps> = ({
  dataset,
}) => {
  const dispatch = useAppDispatch();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    embeddingMethods,
    selectedEmbeddedMethodId,
    embeddingCreated,
    embeddingLoading,
  } = useAppSelector((state) => state.embedding);
  const { selectedDatasetId } = useAppSelector((state) => state.dataset);
  const { user } = useAppSelector((state) => state.auth);

  const showModal = async () => {
    setIsModalOpen(true);
    dispatch(getAllEmbeddingMethods());
    dispatch(selectDataset(dataset.id ? Number(dataset.id) : null));
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };

  useEffect(() => {
    if (embeddingCreated && dataset.id === selectedDatasetId) {
      message.info(
        `Generating embeddings for dataset ${selectedDatasetId}`,
        undefined, // Optional: duration (defaults to 1.5s if omitted)
        () => {
          dispatch(clearEmbedding());
          dispatch(fetchAllDatasets());
        },
      );
      handleCancel();
    }
  }, [embeddingCreated]);

  return (
    <div>
      {dataset.is_ready_for_feed && user && user.role === "admin" ? (
        <Tag key={"green"} color={"green"} variant={"filled"}>
          ✓ Embeddings Generated
        </Tag>
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
