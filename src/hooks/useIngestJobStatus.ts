import { useEffect, useRef, useState } from "react";
import { datasetApi } from "../services/api";
import type { IngestJob } from "../types";

/**
 * Live state of one "add recordings" job
 * (GET /api/datasets/{id}/add-recordings/{job_id}; Redis counters, cheap).
 *
 * The job id comes from `dataset.active_ingest_job` (GET /datasets), which is
 * how a page refresh rediscovers a running job, or from the POST response
 * right after starting one.
 *
 * Polling policy:
 * - every 2 s (or `pollIntervalMs`) while the job is pending/running;
 * - every 30 s once the backend reports the job as stalled;
 * - backs off (up to 30 s) on request errors;
 * - paused while the tab is hidden, with one immediate poll when it's visible again;
 * - stops at completed/failed and calls `onFinished` once.
 *
 * The last state stays available after the job finishes, so the caller can
 * show the summary or the error.
 */

const POLL_INTERVAL_MS = 2_000;
const STALLED_INTERVAL_MS = 30_000;
const MAX_ERROR_INTERVAL_MS = 30_000;
const BACKOFF = 2;

const isTerminal = (j: IngestJob) =>
  j.status === "completed" || j.status === "failed";

export function useIngestJobStatus(
  datasetId: number,
  jobId: number | null,
  /** Called once when the job reaches completed/failed (e.g. to refetch datasets). */
  onFinished?: (job: IngestJob) => void,
  /** Poll interval while running (default 2 s; the hub uses a slower one). */
  pollIntervalMs: number = POLL_INTERVAL_MS,
): IngestJob | null {
  const [job, setJob] = useState<IngestJob | null>(null);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (jobId == null) return;

    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;
    let intervalMs = pollIntervalMs;
    let finished = false;

    const clear = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clear();
      if (!cancelled && !finished && !document.hidden) {
        timer = window.setTimeout(() => void poll(), intervalMs);
      }
    };

    const poll = async () => {
      if (cancelled || finished || inFlight) return;
      inFlight = true;
      try {
        const j = await datasetApi.getAddRecordingsJob(datasetId, jobId);
        if (cancelled) return;
        setJob(j);
        if (isTerminal(j)) {
          finished = true;
          onFinishedRef.current?.(j);
          return;
        }
        intervalMs = j.stalled ? STALLED_INTERVAL_MS : pollIntervalMs;
      } catch {
        intervalMs = Math.min(intervalMs * BACKOFF, MAX_ERROR_INTERVAL_MS);
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (document.hidden) clear();
      else void poll();
    };

    document.addEventListener("visibilitychange", onVisibility);
    void poll();

    return () => {
      cancelled = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [datasetId, jobId, pollIntervalMs]);

  // Never surface a previous job's numbers while a new job id's first poll is in flight.
  return job && job.job_id === jobId && job.dataset_id === datasetId ? job : null;
}
