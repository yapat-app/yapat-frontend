import { Progress } from "antd";
import { LoadingOutlined, WarningOutlined } from "@ant-design/icons";
import type { EmbeddingJobProgress } from "../types";

const fullNumber = new Intl.NumberFormat();

function formatDuration(seconds: number): string {
  if (seconds < 90) return "less than 2 min";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type Props = {
  progress: EmbeddingJobProgress | null;
  etaSeconds: number | null;

  recordingCount?: number;
};

/**
 * Full-width status strip shown on a dataset card while its embeddings are being
 * generated. Driven by useEmbeddingJobStatus (GET /embeddings/{id}/progress).
 */
export const EmbeddingProgressPanel: React.FC<Props> = ({
  progress,
  etaSeconds,
  recordingCount,
}) => {
  const stalled = Boolean(progress?.stalled);
  const counting =
    progress != null &&
    progress.total != null &&
    (progress.stage === "embedding" || progress.stage === "completed");
  const percent =
    progress?.status === "completed" ? 100 : (progress?.percent ?? 0);

  const step = !progress
    ? "Checking progress…"
    : counting
      ? "Step 2 of 2 · Computing BirdNET embeddings"
      : `Step 1 of 2 · Cutting ${
          recordingCount
            ? `${fullNumber.format(recordingCount)} recordings`
            : "recordings"
        } into snippets`;
  const footer = stalled
    ? "No progress for over 10 minutes. The embedding worker may have stopped; check the Celery worker logs."
    : [
        counting &&
          etaSeconds != null &&
          `About ${formatDuration(etaSeconds)} left`,
        "Runs in the background, so you can leave or refresh this page",
      ]
        .filter(Boolean)
        .join(" · ");

  const tone = stalled
    ? {
        box: "border-amber-200 bg-amber-50",
        icon: "text-amber-600",
        stroke: "#d97706",
      }
    : {
        box: "border-blue-100 bg-blue-50/60",
        icon: "text-blue-600",
        stroke: "#1e40af",
      };

  return (
    <div
      className={`rounded-md border px-4 py-3 ${tone.box}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`mt-0.5 text-lg leading-none ${tone.icon}`}>
            {stalled ? <WarningOutlined /> : <LoadingOutlined spin />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800">
              {stalled
                ? "Embedding generation stalled"
                : "Generating embeddings"}
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
              {fullNumber.format(progress!.done ?? 0)} of{" "}
              {fullNumber.format(progress!.total!)} snippets
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
