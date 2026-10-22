/**
 * DatasetJobsProvider — keeps scan / embedding / add-recordings job polling alive for every
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
import { getAllDatasetAnnotationStats } from "../../redux/features/annotationSlice";
import { useEmbeddingJobStatus } from "../../hooks/useEmbeddingJobStatus";
import { useScanStatus } from "../../hooks/useScanStatus";
import { useIngestJobStatus } from "../../hooks/useIngestJobStatus";
import { notifyDatasetDataChanged } from "../../explore/datasetRefresh";
import {
  JobsContext,
  resolveActiveIngestJobId,
  resolveActiveJobId,
  type JobSnapshot,
} from "./datasetJobsContext";
import type {
  Dataset,
  EmbeddingJobProgress,
  IngestJob,
  ScanProgress,
} from "../../types";

const DatasetJobWatcher = ({ dataset }: { dataset: Dataset }) => {
  const dispatch = useAppDispatch();
  const ctx = useContext(JobsContext)!;
  const id = Number(dataset.id);
  // Reference datasets live in their own list, so refresh the one this
  // dataset is in.
  const isReference = !!dataset.is_reference;
  const { setStarted, setStartedIngest, setFinishedIngest, publish } = ctx;

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

  // "Add recordings" job tracking, same pattern as embeddings: the running job
  // comes from `active_ingest_job`; the started id covers the gap until the
  // refetch.
  const activeIngestJobId = resolveActiveIngestJobId(
    dataset,
    ctx.startedIngest[id] ?? null,
  );
  const onIngestFinished = useCallback(
    (job: IngestJob) => {
      setStartedIngest(id, null);
      setFinishedIngest(id, job);
      if (job.status === "completed") {
        if (job.summary.scoring_skipped_reason === "scoring_failed") {
          message.warning(`Recordings added to ${dataset.name}, but scoring failed`);
        } else {
          message.success(`Finished adding recordings to ${dataset.name}`);
        }
        // The backend already republished the explore layers: a normal
        // refetch in any open hub for this dataset (here or in another tab).
        // A run without new files can still score snippets left from an earlier run.
        // A retry adds no recordings but puts newly embedded snippets in the hub.
        if (
          job.summary.recordings_new > 0 ||
          job.summary.snippets_embedded > 0 ||
          job.summary.snippets_scored > 0
        ) {
          notifyDatasetDataChanged(id);
        }
      } else {
        message.error(`Adding recordings to ${dataset.name} failed`);
      }
      // Recording count lives on the dataset, snippet counts in the stats.
      dispatch(isReference ? fetchReferenceDatasets() : fetchAllDatasets());
      dispatch(getAllDatasetAnnotationStats());
    },
    [dataset.name, dispatch, id, isReference, setFinishedIngest, setStartedIngest],
  );
  const ingestJob = useIngestJobStatus(id, activeIngestJobId, onIngestFinished);

  useEffect(() => {
    publish(id, {
      embeddingProgress,
      etaSeconds,
      polledScan,
      scanEtaSeconds,
      ingestJob,
    });
  }, [id, publish, embeddingProgress, etaSeconds, polledScan, scanEtaSeconds, ingestJob]);

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
  const [startedIngest, setStartedIngestState] = useState<
    Record<number, number | null>
  >({});
  const [finishedIngest, setFinishedIngestState] = useState<
    Record<number, IngestJob | null>
  >({});

  const setStarted = useCallback((datasetId: number, jobId: number | null) => {
    setStartedState((prev) =>
      prev[datasetId] === jobId ? prev : { ...prev, [datasetId]: jobId },
    );
  }, []);

  const setStartedIngest = useCallback(
    (datasetId: number, jobId: number | null) => {
      setStartedIngestState((prev) =>
        prev[datasetId] === jobId ? prev : { ...prev, [datasetId]: jobId },
      );
    },
    [],
  );

  const setFinishedIngest = useCallback(
    (datasetId: number, job: IngestJob | null) => {
      setFinishedIngestState((prev) =>
        prev[datasetId] === job ? prev : { ...prev, [datasetId]: job },
      );
    },
    [],
  );

  const publish = useCallback((datasetId: number, next: JobSnapshot) => {
    setSnapshots((prev) => {
      const cur = prev[datasetId];
      if (
        cur &&
        cur.embeddingProgress === next.embeddingProgress &&
        cur.etaSeconds === next.etaSeconds &&
        cur.polledScan === next.polledScan &&
        cur.scanEtaSeconds === next.scanEtaSeconds &&
        cur.ingestJob === next.ingestJob
      ) {
        return prev;
      }
      return { ...prev, [datasetId]: next };
    });
  }, []);

  const value = useMemo(
    () => ({
      started,
      snapshots,
      setStarted,
      startedIngest,
      finishedIngest,
      setStartedIngest,
      setFinishedIngest,
      publish,
    }),
    [
      started,
      snapshots,
      setStarted,
      startedIngest,
      finishedIngest,
      setStartedIngest,
      setFinishedIngest,
      publish,
    ],
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
