import { useMemo } from "react";
import { useAppSelector } from "../../hooks";
import { useRecordingDateTimes, type RecordingDateTime } from "./useRecordingDateTimes";
import { dateStringToEpochDay } from "./dateTimeFilterHelpers";

export const TIME_OF_DAY_DOMAIN: [number, number] = [0, 86400];

export interface DateTimeFilterData {
  recordingDateTimeById: Map<number, RecordingDateTime>;
  /** Each visible prediction's recorded date, as epoch day — one entry per prediction with a parseable date. */
  dateValues: number[];
  /** [min, max] epoch day across dateValues, or [0, 1] when there are none. */
  dateDomain: [number, number];
  /** Each visible prediction's recorded time, in seconds since midnight. */
  timeValues: number[];
  /** True when this dataset has at least one recording with a parseable date/time — gates whether the sidebar shows these sections at all. */
  hasAnyDateTime: boolean;
}

export function useDateTimeFilterData(): DateTimeFilterData {
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const predictions = useAppSelector((s) => s.al.predictions);
  const recordingDateTimeById = useRecordingDateTimes(selectedDatasetId);

  return useMemo(() => {
    const dateValues: number[] = [];
    const timeValues: number[] = [];
    for (const p of predictions) {
      if (typeof p.recording_id !== "number") continue;
      const dt = recordingDateTimeById.get(p.recording_id);
      if (!dt) continue;
      dateValues.push(dateStringToEpochDay(dt.date));
      timeValues.push(dt.timeSeconds);
    }
    const dateDomain: [number, number] =
      dateValues.length > 0
        ? [Math.min(...dateValues), Math.max(...dateValues)]
        : [0, 1];
    return {
      recordingDateTimeById,
      dateValues,
      dateDomain,
      timeValues,
      hasAnyDateTime: recordingDateTimeById.size > 0,
    };
  }, [predictions, recordingDateTimeById]);
}
