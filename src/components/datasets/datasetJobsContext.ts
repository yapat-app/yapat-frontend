/**
 * Context, state shapes and hooks behind DatasetJobsProvider. Kept apart from
 * the provider component so that file only exports a component.
 */

import { createContext, useCallback, useContext } from "react";
import type { Dataset, EmbeddingJobProgress, ScanProgress } from "../../types";
import { getDatasetStatus, type DatasetStatus } from "../../utils/datasetStatus";

export type JobSnapshot = {
  embeddingProgress: EmbeddingJobProgress | null;
  etaSeconds: number | null;
  polledScan: ScanProgress | null;
  scanEtaSeconds: number | null;
};

export type JobsContextValue = {
  /** Job id returned by "Generate Embeddings", until the list refetch finds it. */
  started: Record<number, number | null>;
  snapshots: Record<number, JobSnapshot>;
  setStarted: (datasetId: number, jobId: number | null) => void;
  publish: (datasetId: number, snapshot: JobSnapshot) => void;
};

export const JobsContext = createContext<JobsContextValue | null>(null);

export type DatasetJobs = {
  activeJobId: number | null;
  running: boolean;
  embeddingProgress: EmbeddingJobProgress | null;
  etaSeconds: number | null;
  activeScan: ScanProgress | null;
  scanProgress: ScanProgress | null;
  scanEtaSeconds: number | null;
  scanning: boolean;
  scanFailed: boolean;
  setStartedJobId: (jobId: number) => void;
};

/** The running embedding job id: from GET /datasets, else the one just started. */
export function resolveActiveJobId(
  dataset: Dataset,
  startedJobId: number | null,
): number | null {
  return dataset.is_ready_for_feed
    ? null
    : (dataset.active_embedding_job?.id ?? startedJobId);
}


/** Job / scan state of one dataset, as the old DatasetCard computed it. */
function deriveJobs(
  ctx: JobsContextValue,
  dataset: Dataset,
): Omit<DatasetJobs, "setStartedJobId"> {
  const id = Number(dataset.id);
  const activeJobId = resolveActiveJobId(dataset, ctx.started[id] ?? null);
  const snap = ctx.snapshots[id];
  const activeScan = dataset.active_scan ?? null;
  // The list's snapshot fills the gap until the first poll returns.
  const scanProgress = snap?.polledScan ?? activeScan;
  const scanFailed = scanProgress?.stage === "failed";
  const scanning = activeScan != null && !scanFailed;
  return {
    activeJobId,
    running: activeJobId != null,
    embeddingProgress: snap?.embeddingProgress ?? null,
    etaSeconds: snap?.etaSeconds ?? null,
    activeScan,
    scanProgress,
    scanEtaSeconds: snap?.scanEtaSeconds ?? null,
    scanning,
    scanFailed,
  };
}

export function useDatasetJobs(dataset: Dataset): DatasetJobs {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useDatasetJobs needs a DatasetJobsProvider");
  const id = Number(dataset.id);
  const { setStarted } = ctx;
  const setStartedJobId = useCallback(
    (jobId: number) => setStarted(id, jobId),
    [id, setStarted],
  );
  return { ...deriveJobs(ctx, dataset), setStartedJobId };
}

/** Status of any dataset, for places that render many (list items, legend). */
export function useDatasetStatusLookup(): (dataset: Dataset) => DatasetStatus {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useDatasetStatusLookup needs a DatasetJobsProvider");
  return useCallback(
    (dataset: Dataset) => getDatasetStatus(dataset, deriveJobs(ctx, dataset)),
    [ctx],
  );
}
