import { useEffect, useRef, useState } from "react";
import { datasetApi } from "../services/api";
import type { ScanProgress } from "../types";

/**
 * Live progress for a dataset scan (finding, reading and saving audio files).
 *
 * The backend keeps one small Redis hash per dataset, so
 * GET /api/datasets/{id}/scan-progress is a single Redis read regardless of
 * dataset size. Scans have no database row, so the dataset id (not a job id)
 * identifies the scan; `dataset.active_scan` from GET /datasets is how a page
 * refresh finds a running scan again.
 *
 * Polling policy (keeps load negligible):
 * - only while a dataset id is given and the scan hasn't finished;
 * - every 5 s while the numbers move, backing off to 30 s when they don't,
 *   and 60 s once the backend reports the scan as stalled;
 * - paused while the tab is hidden, with one immediate poll when it's visible again.
 *
 * Scans are usually minutes, not hours, hence a shorter first interval than the
 * embedding hook. Also returns a rough ETA from the rate observed in this session.
 */

const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 30_000;
const STALLED_INTERVAL_MS = 60_000;
const BACKOFF = 1.5;

// "idle" means the backend no longer knows the scan (its record expired or Redis
// was reset); there is nothing left to wait for, so treat it like a finish.
const isTerminal = (p: ScanProgress) =>
  p.stage === "completed" || p.stage === "failed" || p.stage === "idle";

export interface ScanState {
  progress: ScanProgress | null;
  /** Estimated seconds left, once two polls have shown movement; else null. */
  etaSeconds: number | null;
}

export function useScanStatus(
  datasetId: number | null,
  /** Called once when the scan finishes (e.g. to refetch datasets). */
  onFinished?: (progress: ScanProgress) => void,
): ScanState {
  const [state, setState] = useState<ScanState>({
    progress: null,
    etaSeconds: null,
  });
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (datasetId == null) return;

    let cancelled = false;
    let timer: number | null = null;
    let inFlight = false;
    let intervalMs = MIN_INTERVAL_MS;
    let lastKey: string | null = null;
    let finished = false;
    // First sample with a known percent; the ETA uses the average rate since then.
    let firstSample: { t: number; percent: number } | null = null;

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
        const p = await datasetApi.getScanProgress(datasetId);
        if (cancelled) return;
        let etaSeconds: number | null = null;
        if ((p.stage === "reading" || p.stage === "saving") && p.percent != null) {
          const now = Date.now();
          if (!firstSample) firstSample = { t: now, percent: p.percent };
          const rate = (p.percent - firstSample.percent) / ((now - firstSample.t) / 1000);
          if (rate > 0) etaSeconds = (100 - p.percent) / rate;
        }
        setState({ progress: p, etaSeconds });
        if (isTerminal(p)) {
          finished = true;
          onFinishedRef.current?.(p);
          return;
        }
        // Stage and count together, so moving from reading to saving counts as progress.
        const key = `${p.stage}:${p.done ?? ""}`;
        if (p.stalled) intervalMs = STALLED_INTERVAL_MS;
        else if (key !== lastKey) intervalMs = MIN_INTERVAL_MS;
        else intervalMs = Math.min(intervalMs * BACKOFF, MAX_INTERVAL_MS);
        lastKey = key;
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
  }, [datasetId]);

  // Never surface another dataset's numbers while a new id's first poll is in flight.
  return state.progress && state.progress.dataset_id === datasetId
    ? state
    : { progress: null, etaSeconds: null };
}
