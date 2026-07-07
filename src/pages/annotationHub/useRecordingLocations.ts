import { useEffect, useState } from "react";
import { recordingApi } from "../../services/api";

const PAGE_SIZE = 1000;
// Safety valve against a misbehaving backend — no real dataset has anywhere
// near this many recordings (recordings are files, snippets are excerpts of
// them; a dataset with 30k+ snippets typically has a few hundred recordings).
const MAX_PAGES = 50;

export interface RecordingLocations {
  locationByRecordingId: Map<number, string>;
  /**
   * True while the map is being (re)built for the current dataset. Callers
   * that hide items with an unresolved location should treat "loading" as
   * "don't hide yet" — see the equivalent flag on useSnippetRecordingIds.
   */
  loading: boolean;
}

/**
 * Maps recording_id -> location for every recording in a dataset, fetched
 * once per dataset (not per prediction — recordings are far fewer than
 * snippets, so this is cheap even for large feeds). Location comes from
 * Recording.extra_metadata.location, populated server-side from the
 * recording's filename.
 */
export function useRecordingLocations(datasetId: number | null): RecordingLocations {
  const [locationByRecordingId, setLocationByRecordingId] = useState<Map<number, string>>(
    () => new Map(),
  );
  // The dataset the map above was last resolved for. Deriving `loading` from
  // this comparison (instead of a dedicated state flag) avoids any
  // synchronous setState call in the effect body below.
  const [resolvedDatasetId, setResolvedDatasetId] = useState(datasetId);
  const loading = datasetId !== null && datasetId !== resolvedDatasetId;

  useEffect(() => {
    if (datasetId === null) return;

    let cancelled = false;

    async function fetchAll() {
      const map = new Map<number, string>();
      let skip = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await recordingApi.getAll({
          dataset_id: datasetId as number,
          skip,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        for (const rec of batch) {
          const location = rec.extra_metadata?.location;
          if (typeof location === "string" && location) {
            map.set(rec.id, location);
          }
        }
        if (batch.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
      }
      if (!cancelled) {
        setLocationByRecordingId(map);
        setResolvedDatasetId(datasetId);
      }
    }

    void fetchAll().catch(() => {
      if (!cancelled) {
        setLocationByRecordingId(new Map());
        setResolvedDatasetId(datasetId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  return { locationByRecordingId, loading };
}
