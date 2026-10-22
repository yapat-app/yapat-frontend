import { Button, Progress, Tooltip } from "antd";
import {
  ClockCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { DatasetActivity } from "./useDatasetActivity";
import type { IngestJobStage } from "../../types";

const fullNumber = new Intl.NumberFormat();

const INGEST_STAGES: { stage: IngestJobStage; label: string; short: string }[] = [
  { stage: "scanning", label: "Looking for new files", short: "Scanning" },
  { stage: "segmenting", label: "Cutting new recordings into snippets", short: "Segmenting" },
  { stage: "embedding", label: "Computing embeddings", short: "Embedding" },
  { stage: "finalizing", label: "Updating views", short: "Updating views" },
  { stage: "scoring", label: "Scoring new snippets", short: "Scoring" },
];

type Props = {
  activity: DatasetActivity;
  /** Admin / team owner: sees operational hints (workers, where to act). */
  isManager: boolean;
  /** A retrain is held until this run ends (backend defers it). */
  retrainWaiting?: boolean;
  /** The held job is the first model (cold start), not a retrain. */
  firstModelWaiting?: boolean;
};

/**
 * Replaces the workspace while the hub's dataset can't be annotated yet
 * (scanning, embeddings being generated, or never embedded), so every user
 * sees what is happening instead of an empty feed. Driven by useDatasetActivity.
 */
export const HubDatasetActivityPanel: React.FC<Props> = ({ activity, isManager }) => {
  const navigate = useNavigate();
  const { kind, embeddingProgress: p } = activity;

  let icon = <LoadingOutlined spin />;
  let title = "";
  let step: string | null = null;
  let percent: number | null = null;
  let counts: string | null = null;
  let note: string;
  let stalled = false;

  if (kind === "scanning") {
    title = "Preparing this dataset";
    step = "Scanning the dataset folder for recordings…";
    note = "This page updates on its own when the dataset is ready.";
  } else if (kind === "embedding") {
    stalled = Boolean(p?.stalled);
    title = stalled ? "Preparing this dataset is taking longer than usual" : "Preparing this dataset";
    const embedding = p != null && p.total != null && p.stage === "embedding";
    step = !p
      ? "Checking progress…"
      : embedding
        ? "Step 2 of 2 · Computing embeddings"
        : "Step 1 of 2 · Cutting recordings into snippets";
    if (embedding) {
      percent = Math.floor(p!.percent ?? 0);
      counts = `${fullNumber.format(p!.done ?? 0)} of ${fullNumber.format(p!.total!)} snippets`;
    }
    note = stalled
      ? isManager
        ? "No progress for over 10 minutes. The embedding worker may have stopped; check the Celery worker logs."
        : "No progress for a while. If this doesn't change, let your admin or team owner know."
      : "The feed opens here automatically when it's ready. You can leave this page and come back.";
    if (stalled) icon = <WarningOutlined />;
  } else {
    // not_embedded
    icon = activity.embeddingFailed ? <WarningOutlined /> : <ClockCircleOutlined />;
    title = activity.embeddingFailed
      ? "Preparing this dataset failed"
      : "This dataset isn't ready for annotation yet";
    note = isManager
      ? activity.embeddingFailed
        ? "Embedding generation failed. Check the error on the Datasets page and run Generate Embeddings again."
        : "Embeddings haven't been generated yet. Run Generate Embeddings on the Datasets page."
      : "An admin or team owner needs to prepare it. This page updates on its own once they do.";
  }

  const tone =
    stalled || activity.embeddingFailed
      ? { icon: "text-amber-600", stroke: "#d97706" }
      : { icon: "text-blue-600", stroke: "#1e40af" };

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 text-xl leading-none ${tone.icon}`}>{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800 font-ibm-sans">{title}</p>
            {step && <p className="mt-0.5 text-xs text-gray-500">{step}</p>}
          </div>
          {percent != null && (
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold leading-tight text-gray-800 tabular-nums">
                {percent}%
              </p>
              {counts && <p className="text-xs text-gray-500 tabular-nums">{counts}</p>}
            </div>
          )}
        </div>

        {kind !== "not_embedded" && (
          <Progress
            className="mb-0! mt-3"
            percent={percent ?? 100}
            showInfo={false}
            size="small"
            strokeColor={percent != null ? tone.stroke : "#bfdbfe"}
            status={stalled ? "normal" : "active"}
          />
        )}

        <p className="mt-2 text-xs text-gray-500">{note}</p>

        {isManager && kind === "not_embedded" && (
          <Button size="small" className="mt-3" onClick={() => navigate("/datasets")}>
            Open Datasets
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Slim strip above the workspace while recordings are being added. The dataset
 * stays usable, so this only informs; new snippets load on their own at the end.
 */
export const HubIngestBanner: React.FC<Props> = ({
  activity,
  isManager,
  retrainWaiting,
  firstModelWaiting,
}) => {
  const job = activity.ingestJob;
  const stalled = Boolean(job?.stalled);
  const stages =
    job?.mode === "retry_failed"
      ? INGEST_STAGES.filter((s) => s.stage !== "scanning" && s.stage !== "segmenting")
      : INGEST_STAGES;
  const idx = job ? stages.findIndex((s) => s.stage === job.stage) : -1;
  const percent = job && job.total > 0 && job.percent != null ? Math.floor(job.percent) : null;

  const what = job?.mode === "retry_failed" ? "Re-processing recordings" : "Adding new recordings";
  const stage = !job ? "Starting" : idx >= 0 ? stages[idx].short : "Queued";
  const help = [
    `${idx >= 0 ? `Step ${idx + 1} of ${stages.length}: ${stages[idx].label}.` : ""}`,
    stalled
      ? isManager
        ? "No progress for over 10 minutes; check the Celery workers."
        : "Taking longer than usual."
      : "You can keep annotating; new snippets appear when this finishes.",
    retrainWaiting &&
      (firstModelWaiting
        ? "Training the first model starts when this finishes."
        : "Your labels are saved. Retraining starts when this finishes."),
  ]
    .filter(Boolean)
    .join(" ");
  const accent = stalled ? "text-amber-600" : "text-blue-600";

  return (
    <Tooltip title={help} placement="bottomLeft">
      <div
        className="flex h-7 shrink-0 items-center gap-2 overflow-hidden border-b border-gray-100 bg-white px-5 text-xs whitespace-nowrap"
        role="status"
        aria-live="polite"
        aria-label={`${what}: ${help}`}
      >
        <span className={accent}>
          {stalled ? <WarningOutlined /> : <LoadingOutlined spin />}
        </span>
        <span className="font-medium text-gray-700">{what}</span>
        <span className="text-gray-400">·</span>
        <span className="truncate text-gray-500">{stalled ? "Taking longer than usual" : stage}</span>
        {percent != null && (
          <>
            <span
              className="h-1 w-20 shrink-0 overflow-hidden rounded-full bg-gray-100"
              aria-hidden
            >
              <span
                className={`block h-full rounded-full transition-[width] duration-500 ${
                  stalled ? "bg-amber-500" : "bg-blue-700"
                }`}
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="tabular-nums text-gray-500">{percent}%</span>
          </>
        )}
        {retrainWaiting && (
          <>
            <span className="text-gray-400">·</span>
            <span className="text-gray-500">Retrain queued</span>
          </>
        )}
      </div>
    </Tooltip>
  );
};
