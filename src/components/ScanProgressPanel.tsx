import { Progress } from "antd";
import {
  CloseCircleOutlined,
  LoadingOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import type { ScanProgress } from "../types";
import { scanProgressView } from "../utils/jobProgress";

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
  progress: ScanProgress | null;
  etaSeconds: number | null;
  /** True when the dataset already has recordings, i.e. new files are being added. */
  isRescan?: boolean;
};

/**
 * Full-width status strip shown on a dataset card while its audio files are
 * being scanned, or after a scan failed. Driven by useScanStatus
 * (GET /datasets/{id}/scan-progress); mirrors EmbeddingProgressPanel.
 */
export const ScanProgressPanel: React.FC<Props> = ({
  progress,
  etaSeconds,
  isRescan = false,
}) => {
  const failed = progress?.stage === "failed";
  const stalled = Boolean(progress?.stalled);
  const { counting, percent } = scanProgressView(progress);
  const files = isRescan ? "new files" : "files";

  const title = failed
    ? "Scan failed"
    : stalled
      ? "Scan stalled"
      : isRescan
        ? "Scanning new audio files"
        : "Scanning audio files";

  const step = !progress
    ? "Checking progress…"
    : failed
      ? progress.error_message || "The scan stopped with an error."
      : progress.stage === "queued"
        ? "Waiting for a free worker"
        : progress.stage === "listing"
          ? "Step 1 of 3 · Finding audio files"
          : progress.stage === "reading"
            ? "Step 2 of 3 · Reading and checking files"
            : progress.stage === "saving"
              ? "Step 3 of 3 · Saving recordings"
              : "Finishing…";

  const footer = failed
    ? "Check the dataset folder and the Celery worker logs."
    : stalled
      ? "No progress for over 10 minutes. The scan worker may have stopped; check the Celery worker logs."
      : [
          counting &&
            etaSeconds != null &&
            `About ${formatDuration(etaSeconds)} left`,
          "Runs in the background, so you can leave or refresh this page",
        ]
          .filter(Boolean)
          .join(" · ");

  const tone = failed
    ? { box: "border-red-200 bg-red-50", icon: "text-red-600", stroke: "#dc2626" }
    : stalled
      ? { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", stroke: "#d97706" }
      : { box: "border-blue-100 bg-blue-50/60", icon: "text-blue-600", stroke: "#1e40af" };

  return (
    <div
      className={`rounded-md border px-4 py-3 ${tone.box}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className={`mt-0.5 text-lg leading-none ${tone.icon}`}>
            {failed ? (
              <CloseCircleOutlined />
            ) : stalled ? (
              <WarningOutlined />
            ) : (
              <LoadingOutlined spin />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800">{title}</p>
            <p className="text-xs text-gray-500 break-words">{step}</p>
          </div>
        </div>
        {counting && !failed && (
          <div className="text-right shrink-0">
            <p className="text-lg font-semibold leading-tight text-gray-800 tabular-nums">
              {Math.floor(percent)}%
            </p>
            <p className="text-xs text-gray-500 tabular-nums">
              {fullNumber.format(progress!.done ?? 0)} of{" "}
              {fullNumber.format(progress!.total!)} {files}
            </p>
          </div>
        )}
      </div>

      {!failed && (
        <Progress
          className="mb-0! mt-2"
          percent={counting ? percent : 0}
          showInfo={false}
          size="small"
          strokeColor={tone.stroke}
          status={stalled ? "normal" : "active"}
        />
      )}

      <p className="mt-1 text-xs text-gray-500">{footer}</p>
    </div>
  );
};
