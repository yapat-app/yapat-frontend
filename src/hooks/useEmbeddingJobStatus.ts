import { useEffect, useRef, useState } from "react";
import { embeddingApi } from "../services/api";
import type { EmbeddingJobProgress } from "../types";

/**
 * Live progress for one embedding job.
 *
 * The backend keeps a Redis counter per job (one INCRBY per embedded recording),
 * so GET /api/embeddings/{id}/progress is two Redis reads regardless of dataset
 * size. The job id comes from `dataset.active_embedding_job` (GET /datasets), which
 * is how a page refresh rediscovers a running job.
 *
 * Polling policy (keeps load negligible):
 * - only while a job id is given and the job isn't completed/failed;
 * - every 10 s while the number moves, backing off to 30 s when it doesn't,
 *   and 60 s once the backend reports the job as stalled;
 * - paused while the tab is hidden, with one immediate poll when it's visible again.
 *
 * Also returns a rough ETA from the rate observed between polls in this session.
 */

const MIN_INTERVAL_MS = 10_000;
const MAX_INTERVAL_MS = 30_000;
const STALLED_INTERVAL_MS = 60_000;
const BACKOFF = 1.5;

const isTerminal = (p: EmbeddingJobProgress) =>
  p.status === "completed" || p.status === "failed";

export interface EmbeddingJobState {
  progress: EmbeddingJobProgress | null;
  /** Estimated seconds left, once two polls have shown movement; else null. */
  etaSeconds: number | null;
}

export function useEmbeddingJobStatus(
  jobId: number | null,
  /** Called once when the job reaches completed/failed (e.g. to refetch datasets). */
  onFinished?: (progress: EmbeddingJobProgress) => void,
): EmbeddingJobState {
  const [state, setState] = useState<EmbeddingJobState>({
    progress: null,
    etaSeconds: null,
  });
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (jobId == null) return;

    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;
    let intervalMs = MIN_INTERVAL_MS;
    let lastDone: number | null = null;
    let finished = false;
    // First sample with a known count; the ETA uses the average rate since then.
    let firstSample: { t: number; done: number } | null = null;

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
        const p = await embeddingApi.getJobProgress(jobId);
        if (cancelled) return;
        let etaSeconds: number | null = null;
        if (p.stage === "embedding" && p.done != null && p.total) {
          const now = Date.now();
          if (!firstSample) firstSample = { t: now, done: p.done };
          const rate = (p.done - firstSample.done) / ((now - firstSample.t) / 1000);
          if (rate > 0) etaSeconds = (p.total - p.done) / rate;
        }
        setState({ progress: p, etaSeconds });
        if (isTerminal(p)) {
          finished = true;
          onFinishedRef.current?.(p);
          return;
        }
        if (p.stalled) intervalMs = STALLED_INTERVAL_MS;
        else if (p.done !== lastDone) intervalMs = MIN_INTERVAL_MS;
        else intervalMs = Math.min(intervalMs * BACKOFF, MAX_INTERVAL_MS);
        lastDone = p.done;
      } catch {
        intervalMs = Math.min(intervalMs * BACKOFF, STALLED_INTERVAL_MS);
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
  }, [jobId]);

  // Never surface a previous job's numbers while a new job id's first poll is in flight.
  return state.progress && state.progress.embedding_job_id === jobId
    ? state
    : { progress: null, etaSeconds: null };
}
