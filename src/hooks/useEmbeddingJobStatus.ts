import { useCallback, useEffect, useState } from "react";
import { embeddingApi, taskApi } from "../services/api";
import type { EmbeddingJob } from "../types";

/**
 * Live status for a dataset's embedding generation.
 *
 * Embedding generation is a long-running backend job. Coarse state lives on the
 * `EmbeddingJob` (`status`), but the *granular current step* is reported by the
 * underlying Celery task's `meta` (via GET /api/tasks/status/{task_id}). This
 * hook finds the dataset's active job, then polls that task so the UI can show
 * exactly what's executing right now, falling back to the coarse job status
 * when a task id / meta isn't available yet.
 */

export type EmbeddingPhase =
  | "checking" // initial list fetch in flight
  | "idle" // no embeddings and none running — offer to generate
  | "running" // a job is in progress
  | "complete" // embeddings exist
  | "failed"; // the most recent job failed

export interface EmbeddingJobStatus {
  phase: EmbeddingPhase;
  /** Coarse status string of the active/most-recent job (tooltip / fallback). */
  status: string | null;
  /** Granular current step from the Celery task's meta, when available. */
  detail: string | null;
  /** Progress percent (0–100) if the task reports it, else null. */
  percent: number | null;
  /** Re-fetch the job list (call right after creating a new embedding job). */
  refresh: () => void;
}

const SUCCESS_STATUSES = new Set([
  "SUCCESS",
  "COMPLETE",
  "COMPLETED",
  "DONE",
  "READY",
]);
const FAILURE_STATUSES = new Set(["FAILURE", "FAILED", "ERROR"]);

const MIN_INTERVAL_MS = 4_000;
const MAX_INTERVAL_MS = 30_000;
const BACKOFF = 1.5;

function statusUpper(job: EmbeddingJob): string {
  return (job.status ?? "").toString().toUpperCase();
}
function isFailure(job: EmbeddingJob): boolean {
  return FAILURE_STATUSES.has(statusUpper(job));
}
function isSuccess(job: EmbeddingJob): boolean {
  if (isFailure(job)) return false;
  return SUCCESS_STATUSES.has(statusUpper(job)) || Boolean(job.completed_at);
}
function isTerminal(job: EmbeddingJob): boolean {
  return isSuccess(job) || isFailure(job);
}
/** Newest-first ordering key. */
function timeOf(job: EmbeddingJob): number {
  return (
    Date.parse(job.created_at ?? "") || Date.parse(job.started_at ?? "") || 0
  );
}

/** Pull a human-readable step + progress out of a Celery task's `meta` blob. */
function extractStepInfo(meta: unknown): {
  detail: string | null;
  percent: number | null;
} {
  if (meta == null) return { detail: null, percent: null };
  if (typeof meta === "string")
    return { detail: meta.trim() || null, percent: null };
  if (typeof meta !== "object") return { detail: null, percent: null };
  const m = meta as Record<string, unknown>;

  let detail: string | null = null;
  for (const k of [
    "step",
    "stage",
    "status",
    "message",
    "description",
    "state",
    "current_step",
    "phase",
    "detail",
  ]) {
    const v = m[k];
    if (typeof v === "string" && v.trim()) {
      detail = v.trim();
      break;
    }
  }

  let percent: number | null = null;
  for (const k of ["percent", "percentage", "progress"]) {
    const v = m[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      percent = v <= 1 ? v * 100 : v;
      break;
    }
  }
  if (
    percent == null &&
    typeof m.current === "number" &&
    typeof m.total === "number" &&
    m.total > 0
  ) {
    percent = (m.current / m.total) * 100;
  }
  if (percent != null)
    percent = Math.max(0, Math.min(100, Math.round(percent)));

  return { detail, percent };
}

export function useEmbeddingJobStatus(
  datasetId: number | null,
  enabled: boolean,
  /**
   * The dataset is already known to have embeddings (e.g. `is_ready_for_feed`).
   * When true we skip all polling entirely — a finished dataset makes zero API
   * calls, which is most of the All Datasets screen.
   */
  alreadyComplete = false,
): EmbeddingJobStatus {
  const [phase, setPhase] = useState<EmbeddingPhase>(
    alreadyComplete ? "complete" : "checking",
  );
  const [status, setStatus] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const refresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  useEffect(() => {
    // No synchronous setState here — the react-hooks rules forbid it, and it
    // avoids a flash when the effect re-runs. All updates happen after an await
    // or inside the poll timer callback.
    // Skip the network entirely for finished datasets (and disabled cards).
    if (alreadyComplete) return;
    if (!enabled || datasetId == null || !Number.isFinite(datasetId)) return;

    let cancelled = false;
    let timer: number | null = null;
    let intervalMs = MIN_INTERVAL_MS;
    let lastKey: string | null = null;
    let jobId: number | null = null;
    let celeryTaskId: string | null = null;

    const schedule = (fn: () => void) => {
      timer = window.setTimeout(fn, intervalMs);
    };
    // Reset the interval on a step change (poll fast), else back off.
    const bumpInterval = (key: string) => {
      intervalMs =
        key !== lastKey
          ? MIN_INTERVAL_MS
          : Math.min(intervalMs * BACKOFF, MAX_INTERVAL_MS);
      lastKey = key;
    };

    const pollOnce = async () => {
      if (cancelled) return;
      try {
        if (celeryTaskId) {
          // Granular path: the Celery task's meta tells us the current step.
          const task = await taskApi.getStatus(celeryTaskId);
          if (cancelled) return;
          const info = extractStepInfo(task.meta);
          setStatus(task.status ?? null);
          setDetail(info.detail);
          setPercent(info.percent);
          if (task.failed || task.status === "FAILURE") {
            setPhase("failed");
            return;
          }
          if (task.successful || task.status === "SUCCESS") {
            setPhase("complete");
            return;
          }
          setPhase("running");
          bumpInterval(info.detail ?? task.status ?? "");
          schedule(() => void pollOnce());
        } else if (jobId != null) {
          // Fallback: no task id yet — re-fetch the dataset job list and keep
          // tracking the most recent matching job until it exposes a task id.
          const jobs = await embeddingApi.allDatasetEmbeddingList(datasetId);
          const job = [...(jobs ?? [])].sort((a, b) => timeOf(b) - timeOf(a))[0] ?? null;
          if (cancelled) return;
          if (!job) {
            setStatus(null);
            setDetail(null);
            setPercent(null);
            setPhase("idle");
            return;
          }
          celeryTaskId = job.celery_task_id || null;
          setStatus(job.status ?? null);
          setDetail(null);
          setPercent(null);
          if (isFailure(job)) {
            setPhase("failed");
            return;
          }
          if (isSuccess(job)) {
            setPhase("complete");
            return;
          }
          setPhase("running");
          bumpInterval(statusUpper(job));
          schedule(() => void pollOnce());
        }
      } catch {
        if (cancelled) return;
        intervalMs = Math.min(intervalMs * BACKOFF, MAX_INTERVAL_MS);
        schedule(() => void pollOnce());
      }
    };

    void (async () => {
      try {
        const jobs = await embeddingApi.allDatasetEmbeddingList(datasetId);
        if (cancelled) return;
        const sorted = [...(jobs ?? [])].sort((a, b) => timeOf(b) - timeOf(a));
        const active = sorted.find((j) => !isTerminal(j));
        if (active) {
          jobId = active.id;
          celeryTaskId = active.celery_task_id || null;
          lastKey = statusUpper(active);
          setStatus(active.status ?? null);
          setPhase("running");
          schedule(() => void pollOnce());
        } else if (sorted.some(isSuccess)) {
          setStatus(null);
          setDetail(null);
          setPercent(null);
          setPhase("complete");
        } else if (sorted[0] && isFailure(sorted[0])) {
          setStatus(sorted[0].status ?? null);
          setPhase("failed");
        } else {
          setStatus(null);
          setDetail(null);
          setPercent(null);
          setPhase("idle");
        }
      } catch {
        if (!cancelled) {
          setStatus(null);
          setPhase("idle");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [datasetId, enabled, alreadyComplete, refreshTick]);

  return { phase, status, detail, percent, refresh };
}
