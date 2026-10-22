/**
 * DatasetJobsProvider — keeps scan / embedding job polling alive for every
 * dataset in the list, whether or not it is selected or filtered out.
 *
 * The polling hooks, toasts and refetches are the ones DatasetCard used to run
 * per card; they now live in one invisible watcher per dataset so a job on a
 * dataset that is not on screen still finishes with its toast and refetch.
 * The list items and the detail panel read the shared progress through
 * `useDatasetJobs`.
 */

import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { message } from "antd";
import { useAppDispatch } from "../../hooks";
import {
  fetchAllDatasets,
  fetchReferenceDatasets,
} from "../../redux/features/datasetSlice";
import { useEmbeddingJobStatus } from "../../hooks/useEmbeddingJobStatus";
import { useScanStatus } from "../../hooks/useScanStatus";
import {
  JobsContext,
  resolveActiveJobId,
  type JobSnapshot,
} from "./datasetJobsContext";
import type {
  Dataset,
  EmbeddingJobProgress,
  ScanProgress,
} from "../../types";

const DatasetJobWatcher = ({ dataset }: { dataset: Dataset }) => {
  const dispatch = useAppDispatch();
  const ctx = useContext(JobsContext)!;
  const id = Number(dataset.id);
  // Reference datasets live in their own list, so refresh the one this
  // dataset is in.
  const isReference = !!dataset.is_reference;
  const { setStarted, publish } = ctx;

  // Embedding job tracking. The running job comes from GET /datasets
  // (`active_embedding_job`), which is how a refresh rediscovers it;
  // the started id covers the gap between creating a job and that refetch.
  const activeJobId = resolveActiveJobId(dataset, ctx.started[id] ?? null);
  const onJobFinished = useCallback(
    (p: EmbeddingJobProgress) => {
      setStarted(id, null);
      if (p.status === "completed") {
        message.success(`Embeddings ready for ${dataset.name}`);
      } else {
        message.error(
          `Embedding generation failed for ${dataset.name}${p.error_message ? `: ${p.error_message}` : ""}`,
        );
      }
      dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
    },
    [dataset.name, dispatch, id, isReference, setStarted],
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
    activeScan && activeScan.stage !== "failed" ? id : null;
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

  useEffect(() => {
    publish(id, { embeddingProgress, etaSeconds, polledScan, scanEtaSeconds });
  }, [id, publish, embeddingProgress, etaSeconds, polledScan, scanEtaSeconds]);

  return null;
};

export const DatasetJobsProvider = ({
  datasets,
  children,
}: {
  /** Every dataset in the list (not just the filtered ones). */
  datasets: Dataset[];
  children: ReactNode;
}) => {
  const [started, setStartedState] = useState<Record<number, number | null>>({});
  const [snapshots, setSnapshots] = useState<Record<number, JobSnapshot>>({});

  const setStarted = useCallback((datasetId: number, jobId: number | null) => {
    setStartedState((prev) =>
      prev[datasetId] === jobId ? prev : { ...prev, [datasetId]: jobId },
    );
  }, []);

  const publish = useCallback((datasetId: number, next: JobSnapshot) => {
    setSnapshots((prev) => {
      const cur = prev[datasetId];
      if (
        cur &&
        cur.embeddingProgress === next.embeddingProgress &&
        cur.etaSeconds === next.etaSeconds &&
        cur.polledScan === next.polledScan &&
        cur.scanEtaSeconds === next.scanEtaSeconds
      ) {
        return prev;
      }
      return { ...prev, [datasetId]: next };
    });
  }, []);

  const value = useMemo(
    () => ({ started, snapshots, setStarted, publish }),
    [started, snapshots, setStarted, publish],
  );

  return (
    <JobsContext.Provider value={value}>
      {datasets.map((d) => (
        <DatasetJobWatcher key={d.id} dataset={d} />
      ))}
      {children}
    </JobsContext.Provider>
  );
};
