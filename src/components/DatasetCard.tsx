import { useCallback, useEffect, useState } from "react";
import type {
  Dataset,
  EmbeddingJobProgress,
  IngestJob,
  QuickLabel,
  ScanProgress,
} from "../types";
import { ExportAnnotationButton } from "./ExportAnnotation";
import { useAppDispatch, useAppSelector } from "../hooks";
import { GenerateEmbeddings } from "./GenerateEmbeddings";
import { EmbeddingProgressPanel } from "./EmbeddingProgressPanel";
import { useEmbeddingJobStatus } from "../hooks/useEmbeddingJobStatus";
import { ScanProgressPanel } from "./ScanProgressPanel";
import { useScanStatus } from "../hooks/useScanStatus";
import { useIngestJobStatus } from "../hooks/useIngestJobStatus";
import { IngestProgressPanel } from "./IngestProgressPanel";
import { AddRecordingsModal } from "./AddRecordingsModal";
import { EmbeddingFailuresNotice } from "./EmbeddingFailuresNotice";
import {
  fetchAllDatasets,
  fetchReferenceDatasets,
} from "../redux/features/datasetSlice";
import { getAllDatasetAnnotationStats } from "../redux/features/annotationSlice";
import { notifyDatasetDataChanged } from "../explore/datasetRefresh";
import { DatasetReferencePools } from "./DatasetReferencePools";
import { Button, Progress, Tag, Tooltip, message } from "antd";
import {
  ThunderboltOutlined,
  TableOutlined,
  FolderAddOutlined,
  LoadingOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { DatasetSpectrogramSettings } from "./DatasetSpectrogramSettings";
import { usePhaseConfig } from "../studyPhases";
import { DatasetQuickLabelsModal } from "./DatasetQuickLabelsModal";
import { DatasetMetadataModal } from "./DatasetMetadataModal";
import { datasetApi } from "../services/api";

type DatasetCardProps = {
  dataset: Dataset;
};

export const DatasetCard: React.FC<DatasetCardProps> = ({ dataset }) => {
  const { datasetAnnotations } = useAppSelector(
    (state: any) => state.annotation,
  );
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const phase = usePhaseConfig();
  const { user } = useAppSelector((state) => state.auth);
  const isAdmin = user?.role === "admin";
  // Reference pools are training data only: no annotation entry points.
  const isReference = !!dataset.is_reference;

  // Embedding job tracking. The running job comes from GET /datasets
  // (`active_embedding_job`), which is how a refresh rediscovers it;
  // `startedJobId` covers the gap between creating a job and that refetch.
  const [startedJobId, setStartedJobId] = useState<number | null>(null);
  const activeJobId = dataset.is_ready_for_feed
    ? null
    : (dataset.active_embedding_job?.id ?? startedJobId);
  const onJobFinished = useCallback(
    (p: EmbeddingJobProgress) => {
      setStartedJobId(null);
      if (p.status === "completed") {
        message.success(`Embeddings ready for ${dataset.name}`);
      } else {
        message.error(
          `Embedding generation failed for ${dataset.name}${p.error_message ? `: ${p.error_message}` : ""}`,
        );
      }
      // Reference datasets live in their own list, so refresh the one this card is in.
      dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
    },
    [dataset.name, dispatch, isReference],
  );
  const { progress: embeddingProgress, etaSeconds } = useEmbeddingJobStatus(
    activeJobId,
    onJobFinished,
  );

  // Scan tracking. `active_scan` (GET /datasets) is set while a scan is queued or
  // running, and after one failed; it is how a refresh finds the scan again. Only
  // unfinished scans are polled: a failed one just shows its error.
  const activeScan = dataset.active_scan ?? null;
  const scanPollId =
    activeScan && activeScan.stage !== "failed" ? Number(dataset.id) : null;
  const onScanFinished = useCallback(
    (p: ScanProgress) => {
      if (p.stage === "completed") {
        const created = p.recordings_created ?? 0;
        message.success(
          `Scan finished: ${created.toLocaleString()} recording${created === 1 ? "" : "s"} added to ${dataset.name}`,
        );
      } else if (p.stage === "failed") {
        message.error(
          `Scan failed for ${dataset.name}${p.error_message ? `: ${p.error_message}` : ""}`,
        );
      }
      // Picks up the new recording count and clears (or keeps, if failed) active_scan.
      dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
    },
    [dataset.name, dispatch, isReference],
  );
  const { progress: polledScan, etaSeconds: scanEtaSeconds } = useScanStatus(
    scanPollId,
    onScanFinished,
  );
  // The list's snapshot fills the gap until the first poll returns.
  const scanProgress = polledScan ?? activeScan;
  const scanFailed = scanProgress?.stage === "failed";
  const scanning = activeScan != null && !scanFailed;

  // "Add recordings" job tracking, same pattern as embeddings: the running job
  // comes from `active_ingest_job`; `startedIngestJobId` covers the gap until
  // the refetch. A finished job is kept to show its summary or error until
  // dismissed, because the refetch clears `active_ingest_job`.
  const canManage = isAdmin || user?.role === "team_owner";
  const [addingRecordings, setAddingRecordings] = useState(false);
  const [startedIngestJobId, setStartedIngestJobId] = useState<number | null>(null);
  const [finishedIngestJob, setFinishedIngestJob] = useState<IngestJob | null>(null);
  // A job just started here wins over the dataset's (possibly stale) active
  // job: starting again over a stalled job makes the backend replace it.
  const activeIngestJobId =
    startedIngestJobId ?? dataset.active_ingest_job?.id ?? null;
  const onIngestFinished = useCallback(
    (job: IngestJob) => {
      setStartedIngestJobId(null);
      setFinishedIngestJob(job);
      if (job.status === "completed") {
        if (job.summary.scoring_skipped_reason === "scoring_failed") {
          message.warning(`Recordings added to ${dataset.name}, but scoring failed`);
        } else {
          message.success(`Finished adding recordings to ${dataset.name}`);
        }
        // The backend already republished the explore layers: a normal
        // refetch in any open hub for this dataset (here or in another tab).
        // A run without new files can still score snippets left from an earlier run.
        // A retry adds no recordings but puts newly embedded snippets in the hub.
        if (
          job.summary.recordings_new > 0 ||
          job.summary.snippets_embedded > 0 ||
          job.summary.snippets_scored > 0
        ) {
          notifyDatasetDataChanged(Number(dataset.id));
        }
      } else {
        message.error(`Adding recordings to ${dataset.name} failed`);
      }
      // Recording count lives on the dataset, snippet counts in the stats.
      dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
      dispatch(getAllDatasetAnnotationStats());
    },
    [dataset.id, dataset.name, dispatch, isReference],
  );
  const ingestJob = useIngestJobStatus(
    Number(dataset.id),
    activeIngestJobId,
    onIngestFinished,
  );
  const ingestRunning =
    activeIngestJobId != null &&
    !(ingestJob && (ingestJob.status === "completed" || ingestJob.status === "failed"));
  const shownIngestJob = ingestRunning ? ingestJob : finishedIngestJob;
  // The backend replaces a stalled job when a new one is started, so allow it.
  const ingestStalled = ingestRunning && Boolean(ingestJob?.stalled);
  const handleIngestStarted = (job: IngestJob, attached: boolean) => {
    setFinishedIngestJob(null);
    setStartedIngestJobId(job.job_id);
    if (attached) {
      message.info(`A job is already running for ${dataset.name}; showing it`);
    } else if (job.mode === "retry_failed") {
      message.info(`Retrying failed recordings for ${dataset.name}`);
    } else {
      message.info(`Adding recordings to ${dataset.name}`);
    }
    // Picks up `active_ingest_job`, so the progress survives a refresh.
    dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
  };

  const [quickLabels, setQuickLabels] = useState<QuickLabel[]>([]);
  const [managingLabels, setManagingLabels] = useState(false);
  const [managingMetadata, setManagingMetadata] = useState(false);

  useEffect(() => {
    datasetApi
      .getQuickLabels(Number(dataset.id))
      .then(setQuickLabels)
      .catch(() => setQuickLabels([]));
  }, [dataset.id]);

  const handleStartAL = () => {
    navigate(`/annotate?dataset_id=${dataset.id}&phase=${phase.id}`);
  };

  const datasetTypeLabel = (dataset.dataset_type ?? "PAM").replaceAll("_", " ");

  // Recordings with location + date + time: a ring on the Metadata button, numbers on hover. Hidden
  // when the backend didn't compute it (null) or there are no recordings.
  const metadataCoverage = (() => {
    const total = dataset.recording_count ?? 0;
    const withMeta = dataset.recordings_with_metadata;
    if (withMeta == null || total <= 0) return null;
    const complete = withMeta >= total;
    // Floor so a partial dataset never reads as 100%.
    const percent = complete ? 100 : Math.floor((withMeta / total) * 100);
    const fmt = new Intl.NumberFormat();
    return {
      complete,
      percent,
      label: `${fmt.format(withMeta)} of ${fmt.format(total)}`,
    };
  })();

  const stats = datasetAnnotations.datasets?.find(
    (d: any) => Number(d.dataset_id) === Number(dataset.id),
  );
  const statsReady = stats != null;

  const statPlaceholder = (
    <span className="inline-block h-6 w-16 animate-pulse rounded bg-gray-200 align-middle" />
  );

  return (
    <div className="rounded-lg border border-amber-50 bg-white shadow-sm p-4 flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="sub_head_text">{dataset.name}</h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {datasetTypeLabel}
              </span>
              {isReference && (
                <Tooltip title="Reference pool: labelled training data for linked datasets. Not annotated directly.">
                  <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                    Reference
                  </span>
                </Tooltip>
              )}
            </div>
            <p className="sub_base_text">
              {dataset.description?.trim() ? dataset.description : "—"}
            </p>
            <div className="mt-2">
              <DatasetSpectrogramSettings dataset={dataset} />
            </div>

            {isReference && (
              <p className="mt-2 text-xs text-gray-500">
                Label file:{" "}
                <code className="text-gray-700">
                  {dataset.reference_metadata_path ||
                    `${dataset.source_uri}/pam_metadata.csv`}
                </code>
              </p>
            )}

            {/* Quick Labels strip */}
            {!isReference && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 4,
                  marginTop: 8,
                }}
              >
                <span
                  style={{
                    fontSize: "var(--text-fs-11)",
                    color: "#888",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    marginRight: 4,
                  }}
                >
                  ⚡ Quick Labels
                </span>
                {quickLabels.slice(0, 5).map((l) => (
                  <Tag key={l.taxon_id} style={{ fontSize: "var(--text-fs-11)", margin: 0 }}>
                    {l.display_name}
                  </Tag>
                ))}
                {quickLabels.length > 5 && (
                  <Tooltip
                    title={quickLabels
                      .slice(5)
                      .map((l) => l.display_name)
                      .join(", ")}
                  >
                    <Tag style={{ fontSize: "var(--text-fs-11)", margin: 0, color: "#888" }}>
                      +{quickLabels.length - 5} more
                    </Tag>
                  </Tooltip>
                )}
                <Tag
                  style={{
                    fontSize: "var(--text-fs-11)",
                    margin: 0,
                    cursor: "pointer",
                    color: "#1890ff",
                    borderColor: "#1890ff",
                    borderStyle: "dashed",
                  }}
                  onClick={() => setManagingLabels(true)}
                >
                  Manage
                </Tag>
              </div>
            )}

            {!isReference && isAdmin && <DatasetReferencePools dataset={dataset} />}
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            {!isReference && (
              <>
                <ExportAnnotationButton
                  datasetId={dataset.id}
                  disabled={!statsReady || stats.annotated_snippets < 1}
                />
                <Tooltip
                  title={
                    metadataCoverage ? (
                      <>
                        <div className="font-medium">
                          Metadata coverage: {metadataCoverage.percent}%
                        </div>
                        <div>
                          {metadataCoverage.label} recordings have location, date and time.
                        </div>
                        <div className="mt-1 opacity-80">
                          {metadataCoverage.complete
                            ? "Download the template or re-upload metadata."
                            : "Upload a metadata CSV to fill in the rest."}
                        </div>
                      </>
                    ) : (
                      "Download the metadata template or upload metadata for this dataset's recordings"
                    )
                  }
                >
                  <Button
                    icon={<TableOutlined />}
                    onClick={() => setManagingMetadata(true)}
                    aria-label={
                      metadataCoverage
                        ? `Metadata, ${metadataCoverage.percent}% of recordings covered`
                        : "Metadata"
                    }
                  >
                    Metadata
                    {metadataCoverage && (
                      <Progress
                        type="circle"
                        size={16}
                        percent={metadataCoverage.percent}
                        showInfo={false}
                        strokeWidth={14}
                        strokeColor={metadataCoverage.complete ? "#059669" : "#d97706"}
                        className="ml-0.5"
                      />
                    )}
                  </Button>
                </Tooltip>
              </>
            )}
            {canManage && dataset.is_ready_for_feed && (
              <Button
                icon={
                  ingestRunning && !ingestStalled ? <LoadingOutlined /> : <FolderAddOutlined />
                }
                disabled={(ingestRunning && !ingestStalled) || activeJobId != null || scanning}
                onClick={() => setAddingRecordings(true)}
                title={
                  ingestStalled
                    ? "The current job looks stuck; starting again replaces it"
                    : "Add new audio files from the server folder to this dataset"
                }
              >
                {ingestStalled
                  ? "Restart adding recordings"
                  : ingestRunning
                    ? "Adding recordings…"
                    : "Add recordings"}
              </Button>
            )}
            <GenerateEmbeddings
              dataset={dataset}
              running={activeJobId != null}
              onStarted={setStartedJobId}
              scanning={scanning}
              scanFailed={scanFailed}
            />
            {!isReference && (
              <>
                {/* Classic "Generate Feed" (GenerateFeedModal) hidden for now. */}
                <Button
                  icon={<ThunderboltOutlined />}
                  size="small"
                  type="primary"
                  style={{
                    backgroundColor: "#1e40af",
                    borderColor: "#1e40af",
                    color: "#fff",
                  }}
                  onClick={handleStartAL}
                  title="Start PAM Active Learning"
                >
                  Active Learning
                </Button>
              </>
            )}
          </div>
        </div>

        {activeScan != null && (
          <div className="mb-3">
            <ScanProgressPanel
              progress={scanProgress}
              etaSeconds={scanEtaSeconds}
              isRescan={(dataset.recording_count ?? 0) > 0}
            />
          </div>
        )}

        {activeJobId != null && (
          <div className="mb-3">
            <EmbeddingProgressPanel
              progress={embeddingProgress}
              etaSeconds={etaSeconds}
              recordingCount={dataset.recording_count}
            />
          </div>
        )}

        {(ingestRunning || finishedIngestJob) && (
          <div className="mb-3">
            <IngestProgressPanel
              job={shownIngestJob}
              onUploadMetadata={isReference ? undefined : () => setManagingMetadata(true)}
              onDismiss={ingestRunning ? undefined : () => setFinishedIngestJob(null)}
            />
          </div>
        )}

        {/* From the dataset itself, so it survives a refresh; hidden while a job runs. */}
        {!ingestRunning && (dataset.embedding_failures?.recordings ?? 0) > 0 && (
          <div className="mb-3">
            <EmbeddingFailuresNotice
              dataset={dataset}
              counts={dataset.embedding_failures!}
              canManage={canManage}
              busy={ingestRunning}
              onRetryStarted={handleIngestStarted}
              onDismissed={() =>
                dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets())
              }
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <Tooltip title="Tap to view files">
            <div
              onClick={() => navigate(`/datasets/${dataset.id}/files`)}
              className="rounded-md bg-gray-50 px-3 py-2 cursor-pointer transition-colors hover:bg-gray-100"
            >
              <p className="text-xs text-gray-500">Audio files</p>
              <p className="text-lg font-semibold text-gray-600">
                {dataset.recording_count}
              </p>
            </div>
          </Tooltip>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Total snippets</p>
            <p className="text-lg font-semibold text-gray-700">
              {statsReady ? stats.total_snippets : statPlaceholder}
            </p>
          </div>
          <div className="rounded-md bg-gray-50 px-3 py-2">
            <p className="text-xs text-gray-500">Annotated snippets</p>
            <p className="text-lg font-semibold text-emerald-700">
              {statsReady
                ? `${stats.annotated_snippets} / ${stats.total_snippets}`
                : statPlaceholder}
            </p>
          </div>
        </div>
      </div>

      <DatasetQuickLabelsModal
        dataset={dataset}
        open={managingLabels}
        onClose={() => setManagingLabels(false)}
        onSaved={(saved) => setQuickLabels(saved)}
      />

      <DatasetMetadataModal
        dataset={dataset}
        open={managingMetadata}
        onClose={() => setManagingMetadata(false)}
        // Refreshes `recordings_with_metadata` for the coverage badge.
        onImported={() => dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets())}
      />

      {canManage && (
        <AddRecordingsModal
          dataset={dataset}
          open={addingRecordings}
          onClose={() => setAddingRecordings(false)}
          onStarted={handleIngestStarted}
        />
      )}
    </div>
  );
};
