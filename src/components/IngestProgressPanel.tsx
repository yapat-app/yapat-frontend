import { Button, Progress, Tooltip } from "antd";
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { IngestJob, IngestJobStage } from "../types";

const fullNumber = new Intl.NumberFormat();

// Pipeline order: scanning → segmenting → embedding → finalizing → scoring.
const STAGES: { stage: IngestJobStage; label: string; unit: string }[] = [
  { stage: "scanning", label: "Scanning for new files", unit: "files" },
  { stage: "segmenting", label: "Cutting new recordings into snippets", unit: "recordings" },
  { stage: "embedding", label: "Computing BirdNET embeddings", unit: "snippets" },
  { stage: "finalizing", label: "Updating views", unit: "" },
  { stage: "scoring", label: "Scoring new snippets", unit: "snippets" },
];

/** Quiet close icon in the corner of a finished job's banner. */
const DismissButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Tooltip title="Dismiss">
    <Button
      size="small"
      type="text"
      icon={<CloseOutlined />}
      onClick={onClick}
      aria-label="Dismiss"
      className="-mr-2 -mt-1 text-gray-400! hover:text-gray-700!"
    />
  </Tooltip>
);

type Props = {
  /** Null while the first poll is in flight. */
  job: IngestJob | null;
  /** Shown once the job completed and added recordings (non-reference datasets). */
  onUploadMetadata?: () => void;
  /** Hides the panel after the job finished. */
  onDismiss?: () => void;
};

/**
 * Status strip on a dataset card for an "add recordings" job. Driven by
 * useIngestJobStatus (GET /datasets/{id}/add-recordings/{job_id}). Keeps the
 * look of EmbeddingProgressPanel; after the job ends it shows the summary or
 * the error until dismissed.
 */
export const IngestProgressPanel: React.FC<Props> = ({
  job,
  onUploadMetadata,
  onDismiss,
}) => {
  if (job?.status === "completed") {
    const s = job.summary;
    const isRetry = job.mode === "retry_failed";
    // A retry registers no recordings; it only re-embeds failed ones.
    const nothingNew = !isRetry && s.recordings_new === 0;
    // Scoring errors don't fail the run: recordings and embeddings are stored.
    const scoringFailed = s.scoring_skipped_reason === "scoring_failed";
    const failures = s.embedding_failures;
    // Actions for failures live in the card's EmbeddingFailuresNotice.
    const failuresText =
      failures && failures.recordings > 0
        ? `${fullNumber.format(failures.recordings)} recording${failures.recordings === 1 ? "" : "s"} (${fullNumber.format(failures.snippets)} snippets) could not be embedded`
        : !failures && s.snippets_failed > 0
          ? `${fullNumber.format(s.snippets_failed)} snippets without embeddings`
          : null;
    const details = [
      isRetry && `${fullNumber.format(s.snippets_embedded)} snippets embedded`,
      !isRetry && !nothingNew && `${fullNumber.format(s.recordings_new)} new recordings`,
      !isRetry && !nothingNew && `${fullNumber.format(s.snippets_new)} new snippets`,
      s.files_unreadable > 0 &&
        `${fullNumber.format(s.files_unreadable)} unreadable files skipped`,
      failuresText,
      s.scoring_skipped_reason === "no_active_checkpoint"
        ? !nothingNew && "not scored (no trained model yet)"
        : s.snippets_scored > 0 && `${fullNumber.format(s.snippets_scored)} snippets scored`,
    ].filter(Boolean);

    const title = isRetry
      ? scoringFailed
        ? "Retry finished, but scoring failed"
        : failures && failures.recordings > 0
          ? "Retry finished, some recordings still failed"
          : "Failed recordings embedded"
      : scoringFailed
        ? nothingNew
          ? "Scoring failed"
          : "Recordings added, but scoring failed"
        : nothingNew
          ? "No new recordings found"
          : "Recordings added";
    const body = [
      nothingNew &&
        `All ${fullNumber.format(s.files_found)} files in the folder were already part of this dataset.`,
      details.length > 0 && `${details.join(" · ")}.`,
      scoringFailed && `${job.error || "Scoring stopped without an error message."}`,
      !nothingNew &&
        (scoringFailed
          ? "New snippets are in the Annotation Hub without scores."
          : "New snippets are now in the Annotation Hub."),
    ]
      .filter(Boolean)
      .join(" ");
    const tone = scoringFailed
      ? { box: "border-amber-200 bg-amber-50", icon: "text-amber-600" }
      : { box: "border-emerald-200 bg-emerald-50", icon: "text-emerald-600" };

    // Older jobs have no count: unknown, so keep offering the upload.
    const missingMeta = s.recordings_missing_metadata;
    const offerMetadata =
      !isRetry &&
      !nothingNew &&
      onUploadMetadata != null &&
      (missingMeta == null || missingMeta > 0);
    const metadataNote = nothingNew || isRetry
      ? null
      : missingMeta == null
        ? null
        : missingMeta > 0
          ? `${fullNumber.format(missingMeta)} new recording${missingMeta === 1 ? " is" : "s are"} missing metadata (location, date or time).`
          : "Metadata extracted from file names.";

    return (
      <div className={`rounded-md border px-4 py-3 ${tone.box}`} role="status">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className={`mt-0.5 text-lg leading-none ${tone.icon}`}>
              {scoringFailed ? <WarningOutlined /> : <CheckCircleOutlined />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">{title}</p>
              <p className="text-xs text-gray-600 break-words">{body}</p>
              {metadataNote && (
                <p
                  className={`mt-0.5 text-xs ${missingMeta ? "text-amber-700" : "text-gray-500"}`}
                >
                  {metadataNote}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {offerMetadata && (
              <Button size="small" onClick={onUploadMetadata}>
                Upload metadata for new files
              </Button>
            )}
            {onDismiss && <DismissButton onClick={onDismiss} />}
          </div>
        </div>
      </div>
    );
  }

  if (job?.status === "failed") {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3" role="alert">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="mt-0.5 text-lg leading-none text-red-600">
              <CloseCircleOutlined />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800">
                {job.mode === "retry_failed"
                  ? "Retrying failed recordings failed"
                  : "Adding recordings failed"}
              </p>
              <p className="text-xs text-gray-600 break-words">
                {job.error || "The job stopped without an error message."} Existing
                recordings, labels and the model are unchanged.
              </p>
            </div>
          </div>
          {onDismiss && <DismissButton onClick={onDismiss} />}
        </div>
      </div>
    );
  }

  const stalled = Boolean(job?.stalled);
  const isRetry = job?.mode === "retry_failed";
  // A retry skips the folder scan and goes straight to embedding.
  const retryStages = STAGES.filter((s) => s.stage !== "scanning" && s.stage !== "segmenting");
  const stages =
    isRetry && retryStages.some((s) => s.stage === job?.stage) ? retryStages : STAGES;
  const stageIdx = job ? stages.findIndex((s) => s.stage === job.stage) : -1;
  const stageInfo = stageIdx >= 0 ? stages[stageIdx] : null;
  const counting = stageInfo != null && job != null && job.total > 0;
  const percent = job?.percent ?? 0;

  const step = !job
    ? "Checking progress…"
    : stageInfo
      ? `Step ${stageIdx + 1} of ${stages.length} · ${stageInfo.label}`
      : "Queued, waiting for a worker";
  const footer = stalled
    ? job?.status === "pending"
      ? "Not started after 10 minutes. No Celery worker picked it up; restart the workers, then use \"Restart adding recordings\"."
      : "No progress for over 10 minutes. The worker may have stopped; check the Celery worker logs, or use \"Restart adding recordings\"."
    : "Existing recordings and labels stay usable. New snippets appear in the Annotation Hub when this finishes. You can leave or refresh this page.";

  const tone = stalled
    ? { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", stroke: "#d97706" }
    : { box: "border-blue-100 bg-blue-50/60", icon: "text-blue-600", stroke: "#1e40af" };

  return (
    <div className={`rounded-md border px-4 py-3 ${tone.box}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`mt-0.5 text-lg leading-none ${tone.icon}`}>
            {stalled ? <WarningOutlined /> : <LoadingOutlined spin />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800">
              {isRetry
                ? stalled
                  ? "Retrying failed recordings stalled"
                  : "Retrying failed recordings"
                : stalled
                  ? "Adding recordings stalled"
                  : "Adding recordings"}
            </p>
            <p className="text-xs text-gray-500">{step}</p>
          </div>
        </div>
        {counting && (
          <div className="text-right shrink-0">
            <p className="text-lg font-semibold leading-tight text-gray-800 tabular-nums">
              {Math.floor(percent)}%
            </p>
            <p className="text-xs text-gray-500 tabular-nums">
              {fullNumber.format(job!.done)} of {fullNumber.format(job!.total)}{" "}
              {stageInfo!.unit}
            </p>
          </div>
        )}
      </div>

      <Progress
        className="mb-0! mt-2"
        percent={counting ? percent : 100}
        showInfo={false}
        size="small"
        strokeColor={counting ? tone.stroke : "#bfdbfe"}
        status={stalled ? "normal" : "active"}
      />

      <p className="mt-1 text-xs text-gray-500">{footer}</p>
    </div>
  );
};
