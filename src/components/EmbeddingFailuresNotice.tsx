import { useEffect, useState } from "react";
import { Button, Checkbox, Modal, Popconfirm, Table, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { WarningOutlined } from "@ant-design/icons";
import type {
  Dataset,
  EmbeddingFailure,
  EmbeddingFailureCounts,
  EmbeddingFailuresPage,
  IngestJob,
} from "../types";
import { addRecordingsErrorMessage, datasetApi, getErrorMessage } from "../services/api";

const fullNumber = new Intl.NumberFormat();
const PAGE_SIZE = 50;

const plural = (n: number, one: string, many: string) =>
  `${fullNumber.format(n)} ${n === 1 ? one : many}`;

type Props = {
  dataset: Dataset;
  counts: EmbeddingFailureCounts;
  /** Admin / team owner: may retry or dismiss (backend answers 403 otherwise). */
  canManage: boolean;
  /** An ingest job is running: retry and dismiss wait for it. */
  busy: boolean;
  onRetryStarted: (job: IngestJob, attached: boolean) => void;
  onDismissed: () => void;
};

/**
 * Amber strip on the dataset card while recordings have unembedded snippets
 * (`dataset.embedding_failures`, so it survives a refresh). Their snippets are
 * not in the Annotation Hub. Offers the per-file details, a retry of only those
 * recordings (a normal ingest job with mode "retry_failed"), or dismissing them.
 */
export const EmbeddingFailuresNotice: React.FC<Props> = ({
  dataset,
  counts,
  canManage,
  busy,
  onRetryStarted,
  onDismissed,
}) => {
  const datasetId = Number(dataset.id);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const { job, attached } = await datasetApi.retryFailedRecordings(datasetId);
      setDetailsOpen(false);
      onRetryStarted(job, attached);
    } catch (err) {
      message.error(addRecordingsErrorMessage(err));
    } finally {
      setRetrying(false);
    }
  };

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const { dismissed } = await datasetApi.dismissEmbeddingFailures(datasetId);
      message.success(`Continuing without ${plural(dismissed, "recording", "recordings")}`);
      setDetailsOpen(false);
      onDismissed();
    } catch (err) {
      message.error(
        (err as { response?: { status?: number } })?.response?.status === 403
          ? "Only admins and the dataset's team owner can do this."
          : getErrorMessage(err),
      );
    } finally {
      setDismissing(false);
    }
  };

  const summary = `${plural(counts.recordings, "recording", "recordings")} (${plural(
    counts.snippets,
    "snippet",
    "snippets",
  )}) could not be embedded`;

  const actions = canManage && (
    <>
      <Tooltip title={busy ? "Wait for the running job to finish" : "Embed only these recordings again"}>
        <Button
          size="small"
          loading={retrying}
          disabled={busy || dismissing}
          onClick={() => void handleRetry()}
        >
          Retry failed
        </Button>
      </Tooltip>
      <Popconfirm
        title="Continue without these recordings?"
        description={
          <div className="max-w-xs">
            Their snippets stay out of the Annotation Hub and later runs stop retrying them.
            You can still retry them explicitly.
          </div>
        }
        okText="Continue without them"
        onConfirm={() => void handleDismiss()}
        disabled={busy || retrying}
      >
        <Button size="small" type="text" loading={dismissing} disabled={busy || retrying}>
          Continue without
        </Button>
      </Popconfirm>
    </>
  );

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2"
        role="status"
      >
        <div className="flex min-w-0 items-center gap-2">
          <WarningOutlined className="text-amber-600" />
          <span className="text-sm text-gray-800">
            {summary}. <span className="text-gray-500">Their snippets are not in the Annotation Hub.</span>
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="small" onClick={() => setDetailsOpen(true)}>
            See details
          </Button>
          {actions}
        </div>
      </div>

      <EmbeddingFailuresModal
        datasetId={datasetId}
        datasetName={dataset.name}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        footerActions={actions || null}
      />
    </>
  );
};

const columns: ColumnsType<EmbeddingFailure> = [
  {
    title: "File",
    dataIndex: "file_name",
    render: (name: string, row) => (
      <Tooltip title={row.file_path}>
        <span className="font-mono text-xs">{name}</span>
        {row.dismissed && (
          <span className="ml-2 rounded bg-gray-100 px-1.5 py-px text-xs text-gray-500">
            dismissed
          </span>
        )}
      </Tooltip>
    ),
  },
  {
    title: "Snippets missing",
    dataIndex: "snippets_missing",
    align: "right",
    width: 130,
    render: (n: number) => <span className="tabular-nums">{fullNumber.format(n)}</span>,
  },
  {
    title: "Reason",
    dataIndex: "reason",
    ellipsis: { showTitle: false },
    render: (reason: string) => (
      <Tooltip title={reason} placement="topLeft">
        <span className="text-xs">{reason}</span>
      </Tooltip>
    ),
  },
  {
    title: "Last attempt",
    dataIndex: "last_attempt_at",
    width: 170,
    render: (at: string) => (
      <span className="text-xs text-gray-600">{at ? new Date(at).toLocaleString() : "—"}</span>
    ),
  },
];

const EmbeddingFailuresModal: React.FC<{
  datasetId: number;
  datasetName: string;
  open: boolean;
  onClose: () => void;
  footerActions: React.ReactNode;
}> = ({ datasetId, datasetName, open, onClose, footerActions }) => {
  const [page, setPage] = useState(1);
  const [includeDismissed, setIncludeDismissed] = useState(false);
  // The request the shown result answers; `loading` is derived from it, so the
  // effect never sets state synchronously. The previous page stays shown meanwhile.
  const requestKey = open ? `${datasetId}|${page}|${includeDismissed}` : null;
  const [result, setResult] = useState<{
    key: string | null;
    data: EmbeddingFailuresPage | null;
    error: string | null;
  }>({ key: null, data: null, error: null });
  const data = result.data;
  const error = result.key === requestKey ? result.error : null;
  const loading = requestKey !== null && result.key !== requestKey;

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    datasetApi
      .getEmbeddingFailures(datasetId, {
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        include_dismissed: includeDismissed,
      })
      .then((res) => {
        if (!cancelled) setResult({ key: requestKey, data: res, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setResult((prev) => ({ key: requestKey, data: prev.data, error: getErrorMessage(err) }));
        }
      });
    return () => {
      cancelled = true;
    };
    // requestKey encodes datasetId, page and includeDismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const total = data
    ? data.recordings + (includeDismissed ? data.dismissed_recordings : 0)
    : 0;

  return (
    <Modal
      centered
      width={900}
      title={`Recordings that could not be embedded · ${datasetName}`}
      open={open}
      onCancel={onClose}
      footer={
        <div className="flex items-center justify-between gap-2">
          <Checkbox
            checked={includeDismissed}
            disabled={!data?.dismissed_recordings}
            onChange={(e) => {
              setIncludeDismissed(e.target.checked);
              setPage(1);
            }}
          >
            Show dismissed{data?.dismissed_recordings ? ` (${fullNumber.format(data.dismissed_recordings)})` : ""}
          </Checkbox>
          <div className="flex items-center gap-2">
            {footerActions}
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      }
      destroyOnHidden
    >
      {data && (
        <p className="mb-3 text-sm text-gray-600">
          {plural(data.recordings, "recording", "recordings")} with{" "}
          {plural(data.snippets, "snippet", "snippets")} missing. Those snippets are not listed in
          the Annotation Hub until they are embedded.
        </p>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <Table<EmbeddingFailure>
        size="small"
        rowKey="recording_id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showSizeChanger: false,
          onChange: setPage,
          hideOnSinglePage: true,
        }}
        scroll={{ y: 420 }}
      />
    </Modal>
  );
};
