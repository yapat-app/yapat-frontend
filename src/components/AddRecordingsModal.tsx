import { useMemo, useState } from "react";
import { Alert, Modal, Radio } from "antd";
import { FolderOutlined } from "@ant-design/icons";
import type { Dataset, IngestJob } from "../types";
import { addRecordingsErrorMessage, datasetApi } from "../services/api";

type Props = {
  dataset: Dataset;
  open: boolean;
  onClose: () => void;
  /** Called with the job that now runs; `attached` when it was already running. */
  onStarted: (job: IngestJob, attached: boolean) => void;
};

/**
 * Folders the dataset can grow into: its current folder (plain rescan) and each
 * parent up to, but not including, DATA_ROOT. The backend only accepts a
 * `source_uri` that contains the current folder, so listing the parents means
 * every option is valid.
 */
function candidateFolders(sourceUri: string | undefined): string[] {
  if (!sourceUri) return [];
  const leadingSlash = sourceUri.startsWith("/") ? "/" : "";
  const parts = sourceUri.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = parts.length; i >= 1; i--) {
    out.push(leadingSlash + parts.slice(0, i).join("/"));
  }
  return out;
}

export const AddRecordingsModal: React.FC<Props> = ({
  dataset,
  open,
  onClose,
  onStarted,
}) => {
  const folders = useMemo(() => candidateFolders(dataset.source_uri), [dataset.source_uri]);
  const current = folders[0];
  const [selected, setSelected] = useState<string | undefined>(current);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (visible: boolean) => {
    if (visible) {
      setSelected(current);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { job, attached } = await datasetApi.startAddRecordings(
        Number(dataset.id),
        selected && selected !== current ? selected : undefined,
      );
      onStarted(job, attached);
      onClose();
    } catch (err) {
      setError(addRecordingsErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      centered
      title={`Add recordings to ${dataset.name}`}
      open={open}
      onCancel={onClose}
      onOk={() => void handleSubmit()}
      okText="Add recordings"
      confirmLoading={submitting}
      afterOpenChange={handleOpenChange}
      destroyOnHidden
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">
          Copy the new audio files into the dataset's folder (or a new subfolder of a
          parent folder) on the server first, then pick where to look for them.
        </p>

        <Radio.Group
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="flex! flex-col gap-2"
        >
          {folders.map((folder, i) => (
            <Radio key={folder} value={folder}>
              <span className="flex flex-col">
                <span className="text-sm">
                  {i === 0 ? "Re-scan the current folder" : "Use a larger folder"}
                </span>
                <span className="text-xs text-gray-500">
                  <FolderOutlined className="mr-1" />
                  <code>{folder}</code>
                  {i > 0 && " (dataset folder becomes this)"}
                </span>
              </span>
            </Radio>
          ))}
        </Radio.Group>

        <Alert
          type="info"
          showIcon
          title="Only new files are added. Existing recordings, snippets, labels and the model are kept, and the dataset stays usable while the job runs."
        />

        {error && <Alert type="error" showIcon title={error} />}
      </div>
    </Modal>
  );
};
