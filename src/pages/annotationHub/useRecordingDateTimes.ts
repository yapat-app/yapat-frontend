import { useEffect, useState } from "react";
import { recordingApi } from "../../services/api";

const PAGE_SIZE = 1000;
// Safety valve against a misbehaving backend — no real dataset has anywhere
// near this many recordings (recordings are files, snippets are excerpts of
// them; a dataset with 30k+ snippets typically has a few hundred recordings).
const MAX_PAGES = 50;

export interface RecordingDateTime {
  date: string;
  timeSeconds: number;
}

/**
 * Maps recording_id -> { date, timeSeconds } for every recording in a
 * dataset, fetched once per dataset. Structurally identical to
 * useRecordingLocations (same pagination, same per-dataset cache lifetime) —
 * values come from Recording.extra_metadata.recorded_date /
 * .recorded_time, populated server-side from the recording's filename
 * (PAM convention only; recordings using other conventions are simply
 * absent from the returned map).
 */
export function useRecordingDateTimes(
  datasetId: number | null,
): Map<number, RecordingDateTime> {
  const [dateTimeByRecordingId, setDateTimeByRecordingId] = useState<
    Map<number, RecordingDateTime>
  >(() => new Map());
  const [cachedDatasetId, setCachedDatasetId] = useState(datasetId);
  if (datasetId !== cachedDatasetId) {
    setCachedDatasetId(datasetId);
    setDateTimeByRecordingId(new Map());
  }

  useEffect(() => {
    if (datasetId === null) return;

    let cancelled = false;

    async function fetchAll() {
      const map = new Map<number, RecordingDateTime>();
      let skip = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await recordingApi.getAll({
          dataset_id: datasetId as number,
          skip,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        for (const rec of batch) {
          const date = rec.extra_metadata?.recorded_date;
          const timeSeconds = rec.extra_metadata?.recorded_time;
          if (typeof date === "string" && date && typeof timeSeconds === "number") {
            map.set(rec.id, { date, timeSeconds });
          }
        }
        if (batch.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
      }
      if (!cancelled) setDateTimeByRecordingId(map);
    }

    void fetchAll().catch(() => {
      if (!cancelled) setDateTimeByRecordingId(new Map());
    });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  return dateTimeByRecordingId;
}
