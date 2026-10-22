import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { fetchAllDatasets } from "../../redux/features/datasetSlice";
import { datasetApi } from "../../services/api";
import { useEmbeddingJobStatus } from "../../hooks/useEmbeddingJobStatus";
import { useIngestJobStatus } from "../../hooks/useIngestJobStatus";
import { notifyDatasetDataChanged } from "../../explore/datasetRefresh";
import type { Dataset, EmbeddingJobProgress, IngestJob } from "../../types";

/**
 * What is happening to the hub's dataset in the background, for every user
 * (not only the admin/team owner who started it):
 *
 * - "scanning":     registered, no recordings yet (initial folder scan);
 * - "embedding":    embeddings are being generated (no feed possible yet);
 * - "not_embedded": recordings exist but no embeddings and no job running;
 * - "ingesting":    recordings are being added (the dataset stays usable);
 * - "idle":         nothing to show.
 *
 * Keeps requests low: job progress polls slowly (embedding 10–60 s via
 * useEmbeddingJobStatus, ingest every 10 s), the dataset itself is re-read
 * every 20 s only while it isn't ready and every 60 s otherwise (to notice an
 * add-recordings run), and everything pauses while the tab is hidden. When the
 * work finishes it signals datasetRefresh, which makes the hub reload its
 * snippet sets / explore data on its own.
 */

export type DatasetActivityKind = "idle" | "scanning" | "embedding" | "not_embedded" | "ingesting";

export interface DatasetActivity {
  kind: DatasetActivityKind;
  /** Blocks the workspace: there is no feed until this finishes. */
  blocking: boolean;
  embeddingProgress: EmbeddingJobProgress | null;
  ingestJob: IngestJob | null;
  /** The last embedding run failed (shown while kind is "not_embedded"). */
  embeddingFailed: boolean;
}

const NOT_READY_POLL_MS = 20_000;
const READY_POLL_MS = 60_000;
const HUB_INGEST_POLL_MS = 10_000;

export function useDatasetActivity(
  datasetId: number | null,
  /** An add-recordings job known from elsewhere (e.g. a retrain waiting for
   *  it), so its progress shows before the next dataset re-read. */
  ingestJobHint: number | null = null,
): DatasetActivity {
  const dispatch = useAppDispatch();
  const listDataset = useAppSelector((s) =>
    datasetId == null
      ? undefined
      : s.dataset.allDatasets.find((d: Dataset) => Number(d.id) === datasetId),
  );
  const [detail, setDetail] = useState<{ id: number; data: Dataset } | null>(null);
  /** Dataset whose last embedding run (seen here) failed. */
  const [embeddingFailedFor, setEmbeddingFailedFor] = useState<number | null>(null);

  // The freshest view: the polled detail, falling back to the list entry for
  // fields the detail endpoint doesn't return (yet).
  const dataset = useMemo<Dataset | undefined>(() => {
    const d = detail && detail.id === datasetId ? detail.data : undefined;
    if (!d) return listDataset;
    return {
      ...listDataset,
      ...d,
      active_embedding_job:
        "active_embedding_job" in d ? d.active_embedding_job : listDataset?.active_embedding_job,
    };
  }, [detail, datasetId, listDataset]);

  const ready = Boolean(dataset?.is_ready_for_feed);
  const embeddingJobId = !ready ? (dataset?.active_embedding_job?.id ?? null) : null;
  const ingestJobId = dataset?.active_ingest_job?.id ?? ingestJobHint;

  const refresh = useCallback(async () => {
    if (datasetId == null) return;
    try {
      const data = await datasetApi.getById(datasetId);
      setDetail({ id: datasetId, data });
      // Until the detail endpoint carries active_embedding_job, a not-ready
      // dataset needs the list to notice a newly started embedding job.
      if (!data.is_ready_for_feed && !("active_embedding_job" in data)) {
        void dispatch(fetchAllDatasets());
      }
    } catch {
      /* transient; the next tick retries */
    }
  }, [datasetId, dispatch]);

  // Re-read the dataset slowly; pause while hidden.
  const pollMs = ready ? READY_POLL_MS : NOT_READY_POLL_MS;
  useEffect(() => {
    if (datasetId == null) return;
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = document.hidden ? null : window.setTimeout(tick, pollMs);
    };
    const tick = () => {
      void refresh().finally(schedule);
    };
    const onVisibility = () => {
      if (document.hidden) {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
      } else {
        tick();
      }
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [datasetId, pollMs, refresh]);

  // Not ready → ready (by any route): let the hub reload snippet sets and data.
  const wasReadyRef = useRef<{ id: number | null; ready: boolean }>({ id: null, ready: false });
  useEffect(() => {
    if (datasetId == null || !dataset) return;
    const prev = wasReadyRef.current;
    if (prev.id === datasetId && !prev.ready && ready) {
      notifyDatasetDataChanged(datasetId);
    }
    wasReadyRef.current = { id: datasetId, ready };
  }, [datasetId, dataset, ready]);

  const onEmbeddingFinished = useCallback(
    (p: EmbeddingJobProgress) => {
      setEmbeddingFailedFor(p.status === "failed" ? p.dataset_id : null);
      void refresh();
      void dispatch(fetchAllDatasets());
    },
    [refresh, dispatch],
  );
  const { progress: embeddingProgress } = useEmbeddingJobStatus(
    embeddingJobId,
    onEmbeddingFinished,
  );

  const onIngestFinished = useCallback(
    (job: IngestJob) => {
      if (
        datasetId != null &&
        job.status === "completed" &&
        (job.summary.recordings_new > 0 ||
          job.summary.snippets_embedded > 0 ||
          job.summary.snippets_scored > 0)
      ) {
        notifyDatasetDataChanged(datasetId);
      }
      void refresh();
    },
    [datasetId, refresh],
  );
  const ingestJob = useIngestJobStatus(
    datasetId ?? -1,
    datasetId == null ? null : ingestJobId,
    onIngestFinished,
    HUB_INGEST_POLL_MS,
  );
  const ingestRunning =
    ingestJobId != null &&
    !(ingestJob && (ingestJob.status === "completed" || ingestJob.status === "failed"));

  let kind: DatasetActivityKind = "idle";
  if (datasetId != null && dataset) {
    if (embeddingJobId != null && embeddingProgress?.status !== "failed") kind = "embedding";
    else if (!ready && (dataset.recording_count ?? 0) === 0) kind = "scanning";
    else if (!ready) kind = "not_embedded";
    else if (ingestRunning) kind = "ingesting";
  }

  return {
    kind,
    blocking: kind === "embedding" || kind === "scanning" || kind === "not_embedded",
    embeddingProgress: kind === "embedding" ? embeddingProgress : null,
    ingestJob: kind === "ingesting" ? ingestJob : null,
    embeddingFailed: kind === "not_embedded" && embeddingFailedFor === datasetId,
  };
}
