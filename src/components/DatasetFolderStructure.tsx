import { Collapse, Tooltip, Modal, Button, Select, message } from "antd";
import {
  FolderOpenOutlined,
  AudioOutlined,
  UploadOutlined,
  DatabaseOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useAppSelector, useAppDispatch } from "../hooks";
import {
  exploreDatasetDirectory,
  fetchAllDatasets,
  fetchAllTeamDatasets,
  clearDatasetDirectory,
} from "../redux/features/datasetSlice";
import { getAllDatasetSnippetSets } from "../redux/features/embeddingSlice";
import { filterFocalRecordingsDatasets } from "../utils/wssedAccess";

const { Panel } = Collapse;
const WSSED_SELECTED_DATASET_STORAGE_KEY = "wssed:selectedDatasetId";

export const DatasetFolderStructure: React.FC = () => {
  const dispatch = useAppDispatch();

  const { user } = useAppSelector((state) => state.auth);
  const { allDatasets, datasetDirectories } = useAppSelector(
    (state) => state.dataset,
  );

  const [openUploadModal, setOpenUploadModal] = useState(false);
  const [openChooseModal, setOpenChooseModal] = useState(false);

  // UI only (for choosing dataset in modal)
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(
    null,
  );
  const [selectingDataset, setSelectingDataset] = useState(false);
  const [restoringDataset, setRestoringDataset] = useState(false);

  useEffect(() => {
    if (!user) return;

    if (user.role === "admin" || user.role === "user") {
      dispatch(fetchAllDatasets());
    } else if (user.role === "team_owner") {
      dispatch(fetchAllTeamDatasets());
    }
  }, [user, dispatch]);

  useEffect(() => {
    if (datasetDirectories || restoringDataset) return;

    const storedId = Number(
      localStorage.getItem(WSSED_SELECTED_DATASET_STORAGE_KEY),
    );
    if (!storedId || Number.isNaN(storedId)) return;

    setRestoringDataset(true);
    setSelectedDatasetId(storedId);
    dispatch(exploreDatasetDirectory({ datasetId: storedId }))
      .unwrap()
      .then(() => {
        dispatch(getAllDatasetSnippetSets(storedId));
      })
      .catch(() => {
        localStorage.removeItem(WSSED_SELECTED_DATASET_STORAGE_KEY);
      })
      .finally(() => {
        setRestoringDataset(false);
      });
  }, [datasetDirectories, dispatch, restoringDataset]);

  const datasetOptions = useMemo(() => {
    return filterFocalRecordingsDatasets(allDatasets).map((d) => ({
      value: d.id,
      label: `${d.name}`,
    }));
  }, [allDatasets]);

  const hasDirectory = !!datasetDirectories?.species?.length;

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
      localStorage.setItem(
        WSSED_SELECTED_DATASET_STORAGE_KEY,
        String(selectedDatasetId),
      );

      setOpenChooseModal(false);
    } catch (err: any) {
      message.error(err?.message || "Failed to load dataset directory");
    } finally {
      setSelectingDataset(false);
    }
  };

  const handleChangeDataset = () => {
    localStorage.removeItem(WSSED_SELECTED_DATASET_STORAGE_KEY);
    dispatch(clearDatasetDirectory());
    setOpenChooseModal(true);
  };

  return (
    <div className="h-full">
      {/* Header actions */}
      {!datasetDirectories && !restoringDataset && (
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
      {!datasetDirectories && restoringDataset && (
        <div className="flex h-[90%] items-center justify-center p-4 text-xs text-gray-500">
          Restoring selected dataset…
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
          <div className="text-sm text-gray-600">
            Select a focal recordings dataset
          </div>

          <Select
            showSearch
            placeholder="Select a focal recordings dataset"
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
            notFoundContent="No focal recordings datasets available"
          />
        </div>
      </Modal>

      {/* Content area: 90% height, scrolls */}
      <div className="overflow-y-auto p-2">
        {!hasDirectory ? (
          datasetDirectories ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  No audio files found
                </div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  The selected dataset did not expose species folders or root-level audio files.
                </div>
                <div className="mt-1 truncate text-[11px] text-slate-400">
                  {datasetDirectories.source_uri}
                </div>
              </div>
              <Button
                size="small"
                type="primary"
                icon={<DatabaseOutlined />}
                onClick={handleChangeDataset}
              >
                Choose another dataset
              </Button>
            </div>
          ) : null
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
                      className="flex items-center gap-2 text-sm font-medium"
                    >
                      <FolderOpenOutlined className="text-blue-500" />
                      <span className="truncate rounded-lg font-ibm-mono transition-all duration-200 cursor-pointer font-normal">
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
