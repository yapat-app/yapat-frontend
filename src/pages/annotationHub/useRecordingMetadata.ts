import { useEffect, useState } from "react";
import { recordingApi } from "../../services/api";

const PAGE_SIZE = 1000;
// Safety valve against a misbehaving backend — no real dataset has anywhere
// near this many recordings (recordings are files, snippets are excerpts of
// them; a dataset with 30k+ snippets typically has a few hundred recordings).
const MAX_PAGES = 50;
// Fetch this many pages concurrently per round instead of one at a time —
// roughly matches the per-origin connection limit browsers already impose.
const CONCURRENCY = 6;

export interface RecordingMetadata {
  location?: string;
  date?: string;
  timeSeconds?: number;
}

export interface RecordingMetadataResult {
  byRecordingId: Map<number, RecordingMetadata>;
  /** True while the map is being (re)built for the current dataset. */
  loading: boolean;
}

/**
 * Shared across every useRecordingMetadata call for the same dataset, keyed
 * by dataset id. useRecordingLocations and useRecordingDateTimes both read
 * from this same underlying scan instead of each running their own —
 * previously, touching the location filter and the date/time filter (or the
 * sidebar's own always-on date/time load) triggered two independent full
 * scans of the same recordings table, each fetching the *entire* Recording
 * row (file_path, audio_sha256, duration, sample_rate, ...) just to read one
 * or two fields out of extra_metadata. Consolidating means at most one scan
 * per dataset regardless of how many callers need location and/or
 * date/time data, and a side effect worth knowing: since the sidebar's date
 * range filter data loads eagerly (unconditionally, as soon as a dataset is
 * selected — see useDateTimeFilterData), it now also pre-warms the
 * location data for the projection/feed panels' lazy location filter, and
 * vice versa, rather than each filter's first use paying its own full wait.
 */
const scanCache = new Map<number, Promise<Map<number, RecordingMetadata>>>();

function scanRecordingMetadata(datasetId: number): Promise<Map<number, RecordingMetadata>> {
  const cached = scanCache.get(datasetId);
  if (cached) return cached;

  const promise = (async () => {
    const map = new Map<number, RecordingMetadata>();
    let page = 0;
    // Fetch in rounds of CONCURRENCY pages at once rather than one page at a
    // time — we don't know the total recording count up front, so each
    // round fires a batch, waits for all of it, and only starts the next
    // round if none of those pages came back short (i.e. we haven't
    // reached the end yet).
    while (page < MAX_PAGES) {
      const pagesThisRound = Math.min(CONCURRENCY, MAX_PAGES - page);
      const results = await Promise.all(
        Array.from({ length: pagesThisRound }, (_, i) =>
          recordingApi.getAll({
            dataset_id: datasetId,
            skip: (page + i) * PAGE_SIZE,
            limit: PAGE_SIZE,
          }),
        ),
      );
      let reachedEnd = false;
      for (const batch of results) {
        for (const rec of batch) {
          const location = rec.extra_metadata?.location;
          const date = rec.extra_metadata?.recorded_date;
          const timeSeconds = rec.extra_metadata?.recorded_time;
          const meta: RecordingMetadata = {};
          if (typeof location === "string" && location) meta.location = location;
          if (typeof date === "string" && date) meta.date = date;
          if (typeof timeSeconds === "number") meta.timeSeconds = timeSeconds;
          if (meta.location !== undefined || meta.date !== undefined || meta.timeSeconds !== undefined) {
            map.set(rec.id, meta);
          }
        }
        if (batch.length < PAGE_SIZE) reachedEnd = true;
      }
      page += pagesThisRound;
      if (reachedEnd) break;
    }
    return map;
  })();

  scanCache.set(datasetId, promise);
  // If the scan fails, drop it so a later call can retry instead of every
  // future caller inheriting the same rejection forever.
  promise.catch(() => scanCache.delete(datasetId));
  return promise;
}

export function useRecordingMetadata(datasetId: number | null): RecordingMetadataResult {
  const [byRecordingId, setByRecordingId] = useState<Map<number, RecordingMetadata>>(
    () => new Map(),
  );
  // The dataset the map above was last resolved for. Deriving `loading` from
  // this comparison (instead of a dedicated state flag) avoids any
  // synchronous setState call in the effect body below. Starts at a sentinel
  // that can never equal a real dataset id, so `loading` is correctly true
  // on the very first render too — not just on later dataset switches.
  const [resolvedDatasetId, setResolvedDatasetId] = useState<number | null>(null);
  const loading = datasetId !== null && datasetId !== resolvedDatasetId;

  useEffect(() => {
    if (datasetId === null) return;

    let cancelled = false;
    let retryTimer: number | null = null;

    // scanRecordingMetadata evicts its own cache entry on rejection (see that
    // module), so calling it again after a failure is a genuine retry, not a
    // repeat of the same rejected promise. One retry covers a transient
    // network/backend hiccup; a failure that persists past that is left as
    // `loading` (never marked resolved-with-empty) so a later dataset
    // switch back to this id, or a manual retry hook-up, can still recover
    // without needing a full page reload.
    function attempt(isRetry: boolean) {
      scanRecordingMetadata(datasetId as number)
        .then((map) => {
          if (!cancelled) {
            setByRecordingId(map);
            setResolvedDatasetId(datasetId);
          }
        })
        .catch((e) => {
          console.error(
            `Failed to load recording metadata for dataset ${datasetId}` +
              (isRetry ? " (retry failed)" : ", retrying"),
            e,
          );
          if (cancelled) return;
          if (!isRetry) {
            retryTimer = window.setTimeout(() => attempt(true), 1500);
          }
          // On a second failure, stay in `loading` rather than caching an
          // empty result as if it were a real answer.
        });
    }

    attempt(false);

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [datasetId]);

  return { byRecordingId, loading };
}
