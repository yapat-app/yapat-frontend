import { useMemo } from "react";
import { useRecordingMetadata } from "./useRecordingMetadata";

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
 * Maps recording_id -> location for every recording in a dataset. Projects
 * off the shared useRecordingMetadata scan (also used by
 * useRecordingDateTimes) rather than running its own — see that module's
 * docstring for why they're consolidated into one scan.
 */
export function useRecordingLocations(datasetId: number | null): RecordingLocations {
  const { byRecordingId, loading } = useRecordingMetadata(datasetId);

  const locationByRecordingId = useMemo(() => {
    const map = new Map<number, string>();
    for (const [id, meta] of byRecordingId) {
      if (meta.location !== undefined) map.set(id, meta.location);
    }
    return map;
  }, [byRecordingId]);

  return { locationByRecordingId, loading };
}
