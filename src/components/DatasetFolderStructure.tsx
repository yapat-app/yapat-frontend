import { Collapse, Tooltip, Modal, Button, Select, message } from "antd";
import {
  FolderOpenOutlined,
  AudioOutlined,
  UploadOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState, useRef } from "react";
import { useAppSelector, useAppDispatch } from "../hooks";
import {
  exploreDatasetDirectory,
  fetchAllDatasets,
  fetchAllTeamDatasets,
} from "../redux/features/datasetSlice";
import {
  fetchActiveLearningSuggestions,
  selectSpecies,
} from "../redux/features/wssedSlice";
import { getAllDatasetSnippetSets } from "../redux/features/embeddingSlice";

const { Panel } = Collapse;

export const DatasetFolderStructure: React.FC = () => {
  const dispatch = useAppDispatch();

  const { user } = useAppSelector((state) => state.auth);
  const { allDatasets, datasetDirectories } = useAppSelector(
    (state) => state.dataset,
  );

  const { snippetSets } = useAppSelector((state) => state.embedding);

  const { selectedSpecies, modelTraining } = useAppSelector(
    (state) => state.wssed,
  );

  const [openUploadModal, setOpenUploadModal] = useState(false);
  const [openChooseModal, setOpenChooseModal] = useState(false);

  // UI only (for choosing dataset in modal)
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(
    null,
  );
  const [selectingDataset, setSelectingDataset] = useState(false);

  const prevModelTrainingRef = useRef<boolean>(modelTraining);

  useEffect(() => {
    if (user?.role === "admin") {
      dispatch(fetchAllDatasets());
    } else if (user?.role === "team_owner") {
      dispatch(fetchAllTeamDatasets());
    }
  }, [user, dispatch]);

  const datasetOptions = useMemo(() => {
    return (allDatasets ?? []).map((d: any) => ({
      value: d.id,
      label: `${d.name}`,
    }));
  }, [allDatasets]);

  const hasDirectory = !!datasetDirectories?.species?.length;

  const datasetIdFromDirectory = datasetDirectories?.dataset_id ?? null;

  const handleConfirmSelectDataset = async () => {
    if (!selectedDatasetId) {
      message.warning("Please select a dataset first");
      return;
    }

    try {
      setSelectingDataset(true);

      // Load directory (this sets datasetDirectories in redux)
      await dispatch(
        exploreDatasetDirectory({ datasetId: selectedDatasetId }),
      ).unwrap();

      setOpenChooseModal(false);
    } catch (err: any) {
      message.error(err?.message || "Failed to load dataset directory");
    } finally {
      setSelectingDataset(false);
    }
  };

  const speciesHandler = (speciesName: string) => {
    const datasetId = datasetIdFromDirectory ?? selectedDatasetId;

    if (!datasetId) {
      message.warning("Dataset not selected yet");
      return;
    }

    const snippetSetId = snippetSets?.[0]?.id ?? null;

    dispatch(selectSpecies(speciesName));

    dispatch(
      fetchActiveLearningSuggestions({
        species_name:
          speciesName.charAt(0).toUpperCase() + speciesName.slice(1),
        snippet_set_id: snippetSetId,
        dataset_id: Number(datasetId),
        strategy: "uncertainty",
        k: 20,
        device: "cpu",
        seed: 0,
      }),
    );
  };

  useEffect(() => {
    if (!hasDirectory) return;

    const first = datasetDirectories?.species?.[0]?.name;
    if (!selectedSpecies && first) {
      speciesHandler(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDirectory, datasetDirectories]);

  // When model training finishes, automatically fetch new suggestions
  useEffect(() => {
    const wasTraining = prevModelTrainingRef.current;
    const isTraining = modelTraining;

    // update ref for next render
    prevModelTrainingRef.current = isTraining;

    // only run when training finishes (true -> false)
    if (wasTraining && !isTraining) {
      const datasetId = datasetIdFromDirectory ?? selectedDatasetId;
      const snippetSetId = snippetSets?.[0]?.id ?? null;

      if (!datasetId || !snippetSetId || !selectedSpecies) return;

      dispatch(
        fetchActiveLearningSuggestions({
          species_name:
            selectedSpecies.charAt(0).toUpperCase() + selectedSpecies.slice(1),
          snippet_set_id: snippetSetId,
          dataset_id: Number(datasetId),
          strategy: "uncertainty",
          k: 20,
          device: "cpu",
          seed: 0,
        }),
      );
    }
  }, [
    modelTraining,
    dispatch,
    selectedSpecies,
    datasetIdFromDirectory,
    selectedDatasetId,
    snippetSets,
  ]);

  return (
    <div className="h-full">
      {/* Header actions */}
      {!datasetDirectories && (
        <div className="flex flex-col items-center justify-center gap-2 p-2  h-[90%]">
          <Button
            className="font-ibm-mono! min-w-fit w-full! mx-8! py-4"
            icon={<UploadOutlined />}
            onClick={() => setOpenUploadModal(true)}
          >
            Upload Dataset
          </Button>

          <Button
            type="primary"
            className="font-ibm-mono! min-w-fit py-4 w-full! mx-8!"
            icon={<DatabaseOutlined />}
            onClick={() => setOpenChooseModal(true)}
          >
            Choose Existing Dataset
          </Button>
        </div>
      )}

      {/* Upload Dataset Modal */}
      <Modal
        title="Upload Dataset"
        centered
        open={openUploadModal}
        onCancel={() => setOpenUploadModal(false)}
        footer={[
          <Button key="close" onClick={() => setOpenUploadModal(false)}>
            Close
          </Button>,
        ]}
      >
        <div className="text-sm text-gray-600">
          Add your upload form here (name, description, file input, submit).
        </div>
      </Modal>

      {/* Choose Existing Dataset Modal */}
      <Modal
        centered
        title="Choose Existing Dataset"
        open={openChooseModal}
        onCancel={() => setOpenChooseModal(false)}
        okText="Select"
        onOk={handleConfirmSelectDataset}
        confirmLoading={selectingDataset}
        okButtonProps={{ disabled: !selectedDatasetId }}
      >
        <div className="flex flex-col gap-2">
          <div className="text-sm text-gray-600">Select a dataset</div>

          <Select
            showSearch
            placeholder="Select a dataset"
            options={datasetOptions}
            value={selectedDatasetId ?? undefined}
            onChange={(val) => {
              setSelectedDatasetId(val);
              dispatch(getAllDatasetSnippetSets(val));
            }}
            filterOption={(input, option) =>
              (option?.label ?? "")
                .toString()
                .toLowerCase()
                .includes(input.toLowerCase())
            }
          />
        </div>
      </Modal>

      {/* Content area: 90% height, scrolls */}
      <div className="overflow-y-auto p-2">
        {!hasDirectory ? (
          <div />
        ) : (
          <div className="h-[90%] overflow-y-auto p-2">
            <Collapse
              accordion
              ghost
              expandIconPosition="end"
              className="bg-transparent"
            >
              {datasetDirectories.species.map((sp: any, index: number) => (
                <Panel
                  key={sp.name ?? index}
                  header={
                    <div
                      onClick={() => speciesHandler(sp.name)}
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <FolderOpenOutlined className="text-blue-500" />
                      <span
                        className={`truncate rounded-lg font-ibm-mono transition-all duration-200 cursor-pointer ${
                          selectedSpecies === sp.name
                            ? "font-semibold text-blue-900"
                            : "font-normal"
                        }`}
                      >
                        {sp.name}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">
                        {sp.file_count ?? sp.files?.length ?? 0}
                      </span>
                    </div>
                  }
                >
                  {/* File list scroll */}
                  <div className="pl-2 pr-1 max-h-[55vh] overflow-y-auto space-y-1">
                    {(sp.files || []).map((file: any, i: number) => (
                      <Tooltip title={file.file_path} key={i}>
                        <div className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer">
                          <AudioOutlined className="text-green-600 text-xs" />
                          <span className="text-xs text-gray-700 truncate">
                            {file.filename}
                          </span>
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </Panel>
              ))}
            </Collapse>
          </div>
        )}
      </div>
    </div>
  );
};
