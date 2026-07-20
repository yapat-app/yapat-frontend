import { useMemo } from "react";
import { useAppSelector } from "../../hooks";
import {
  useRecordingDateTimes,
  type RecordingDateTime,
} from "./useRecordingDateTimes";
import { dateStringToEpochDay } from "./dateTimeFilterHelpers";

export const TIME_OF_DAY_DOMAIN: [number, number] = [0, 86400];

export interface DateTimeFilterData {
  recordingDateTimeById: Map<number, RecordingDateTime>;
  /** Each dataset recording's date, as epoch day — spans the whole dataset, not just the current feed subset. */
  dateValues: number[];
  /** [min, max] epoch day across every recording in the dataset (not just the current feed subset), or [0, 1] when there are none. */
  dateDomain: [number, number];
  /** Each dataset recording's time, in seconds since midnight — spans the whole dataset, not just the current feed subset. */
  timeValues: number[];
  /** True when this dataset has at least one recording with a parseable date/time — gates whether the sidebar shows these sections at all. */
  hasAnyDateTime: boolean;
  /** True while recordingDateTimeById is still being (re)built for the current dataset. */
  dateTimeLoading: boolean;
}

export function useDateTimeFilterData(): DateTimeFilterData {
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const inferenceLoading = useAppSelector((s) => s.al.inferenceLoading);
  const {
    dateTimeByRecordingId: recordingDateTimeById,
    loading: recordingLoading,
  } = useRecordingDateTimes(selectedDatasetId);
  const dateTimeLoading = recordingLoading || inferenceLoading;

  return useMemo(() => {
    const dateValues: number[] = [];
    const timeValues: number[] = [];
    let domainMin = Infinity;
    let domainMax = -Infinity;
    for (const dt of recordingDateTimeById.values()) {
      const day = dateStringToEpochDay(dt.date);
      dateValues.push(day);
      timeValues.push(dt.timeSeconds);
      if (day < domainMin) domainMin = day;
      if (day > domainMax) domainMax = day;
    }
    const dateDomain: [number, number] =
      domainMin <= domainMax ? [domainMin, domainMax] : [0, 1];
    return {
      recordingDateTimeById,
      dateValues,
      dateDomain,
      timeValues,
      hasAnyDateTime: recordingDateTimeById.size > 0,
      dateTimeLoading,
    };
  }, [recordingDateTimeById, dateTimeLoading]);
}
