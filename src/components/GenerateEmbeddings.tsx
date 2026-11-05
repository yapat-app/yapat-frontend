import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "../types";
import { useAppDispatch, useAppSelector } from "../hooks";
import { useEmbeddingOptions } from "../hooks/useEmbeddingOptions";
import { Alert, Select, Modal, Button, Form, message, Tooltip, Tag } from "antd";
import { ApartmentOutlined, LoadingOutlined } from "@ant-design/icons";
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
import {
  embeddingMethodBlockedReason,
  embeddingStartNote,
  noEmbeddingModelsLeft,
} from "../utils/embeddingOptions";
import { DISABLED_ACTION_CLASS } from "../utils/datasetStatus";

type DatasetEmbeddingProps = {
  dataset: Dataset;
  /** An embedding job is in flight (progress is shown by the card's panel). */
  running?: boolean;
  /** Called with the new job id right after a job is created. */
  onStarted?: (jobId: number) => void;
  /** A scan is queued or running (progress is shown by the card's panel). */
  scanning?: boolean;
  /** The latest scan failed. */
  scanFailed?: boolean;
  /** Size of the "Generate Embeddings" button, so it can match its neighbours. */
  size?: "small" | "middle" | "large";
};

export const GenerateEmbeddings: React.FC<DatasetEmbeddingProps> = ({
  dataset,
  running = false,
  onStarted,
  scanning = false,
  scanFailed = false,
  size,
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

  // Only admins get the button that depends on these.
  const isAdmin = user?.role === "admin";
  const options = useEmbeddingOptions(
    isAdmin ? datasetIdNumber : undefined,
    `${isModalOpen}-${running}`,
  );
  const hasEmbeddingMethods = embeddingMethods !== null;
  useEffect(() => {
    if (isAdmin && !hasEmbeddingMethods) void dispatch(getAllEmbeddingMethods());
  }, [dispatch, isAdmin, hasEmbeddingMethods]);
  const nothingLeftToGenerate =
    !!dataset.is_ready_for_feed && noEmbeddingModelsLeft(embeddingMethods ?? [], options);

  // Every model stays listed, so the list also shows what this dataset already
  // has. The backend refuses a second job for a model, even a failed one.
  const methodOptions = useMemo(
    () =>
      (embeddingMethods ?? [])
        .map((m) => {
          const blockedReason = embeddingMethodBlockedReason(m, options);
          return {
            value: m.id,
            label: `${m.name} ${m.version} · ${m.window_size} s`,
            disabled: blockedReason !== null,
            blockedReason,
          };
        })
        // Models that can still be started come first.
        .sort((a, b) => Number(a.disabled) - Number(b.disabled)),
    [embeddingMethods, options],
  );

  const selectedMethod = embeddingMethods?.find(
    (m) => m.id === selectedEmbeddedMethodId,
  );
  const startNote = selectedMethod ? embeddingStartNote(selectedMethod, options) : null;

  const showModal = async () => {
    setIsModalOpen(true);
    // Don't carry a choice over from another dataset's modal.
    dispatch(clearEmbedding());
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
      {scanning ? (
        // Embedding now would miss the files the scan has not saved yet.
        <Button
          className={DISABLED_ACTION_CLASS}
          size={size}
          disabled
          icon={<LoadingOutlined />}
          title="Waiting for the scan to finish"
        >
          Scanning files…
        </Button>
      ) : scanFailed && !isDatasetReady ? (
        <Button
          className={DISABLED_ACTION_CLASS}
          size={size}
          disabled
          title="The scan failed; see the message on this card"
        >
          Scan failed
        </Button>
      ) : !isDatasetReady ? (
        <Button
          className={DISABLED_ACTION_CLASS}
          size={size}
          disabled
          title="Waiting for dataset scan/discovery to finish (recordings not available yet)"
        >
          Processing dataset…
        </Button>
      ) : running ? (
        <Button className={DISABLED_ACTION_CLASS} size={size} disabled icon={<LoadingOutlined />}>
          Generating embeddings…
        </Button>
      ) : dataset.is_ready_for_feed && user?.role !== "admin" ? (
        <Button className={DISABLED_ACTION_CLASS} size={size} disabled>
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
                        required
                        tooltip="Choose which embedding method to use"
                      >
                        <Select
                          placeholder="Select a method"
                          style={{ width: "100%" }}
                          value={selectedEmbeddedMethodId ?? undefined}
                          options={methodOptions}
                          optionRender={({ data }) => (
                            <div>
                              <div className="truncate">{data.label}</div>
                              {data.blockedReason && (
                                <div className="text-xs text-gray-500">{data.blockedReason}</div>
                              )}
                            </div>
                          )}
                          onChange={(value: number) => {
                            dispatch(selectEmbedding(value)); // value is the id
                          }}
                        />
                      </Form.Item>
                    </Form>
                    {startNote && (
                      <Alert type="info" showIcon message={startNote} className="mb-2" />
                    )}
                    <div className="py-2 w-full ">
                      <Button
                        loading={embeddingLoading}
                        type="primary"
                        disabled={!selectedEmbeddedMethodId}
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
              {/* Navy only while it is the dataset's next step. */}
              <Button
                type={dataset.is_ready_for_feed ? "default" : "primary"}
                style={
                  dataset.is_ready_for_feed
                    ? undefined
                    : { backgroundColor: "#1e40af", borderColor: "#1e40af", color: "#fff" }
                }
                className={DISABLED_ACTION_CLASS}
                size={size}
                icon={<ApartmentOutlined />}
                disabled={nothingLeftToGenerate}
                title={nothingLeftToGenerate ? "No other models can be generated" : undefined}
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
