import { useMemo } from "react";
import { useRecordingMetadata } from "./useRecordingMetadata";

export interface RecordingDateTime {
  date: string;
  timeSeconds: number;
}

export interface RecordingDateTimes {
  dateTimeByRecordingId: Map<number, RecordingDateTime>;
  /**
   * True while the map is being (re)built for the current dataset. Callers
   * that hide items with an unresolved date/time should treat "loading" as
   * "don't hide yet" — see the equivalent flag on useRecordingLocations.
   */
  loading: boolean;
}

/**
 * Maps recording_id -> { date, timeSeconds } for every recording in a
 * dataset. Projects off the shared useRecordingMetadata scan (also used by
 * useRecordingLocations) rather than running its own — see that module's
 * docstring for why they're consolidated into one scan. Values come from
 * Recording.extra_metadata.recorded_date / .recorded_time, populated
 * server-side from the recording's filename (PAM convention only;
 * recordings using other conventions are simply absent from the returned
 * map).
 */
export function useRecordingDateTimes(datasetId: number | null): RecordingDateTimes {
  const { byRecordingId, loading } = useRecordingMetadata(datasetId);

  const dateTimeByRecordingId = useMemo(() => {
    const map = new Map<number, RecordingDateTime>();
    for (const [id, meta] of byRecordingId) {
      if (meta.date !== undefined && meta.timeSeconds !== undefined) {
        map.set(id, { date: meta.date, timeSeconds: meta.timeSeconds });
      }
    }
    return map;
  }, [byRecordingId]);

  return { dateTimeByRecordingId, loading };
}
