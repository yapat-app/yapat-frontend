import { useMemo } from "react";
import { useAppSelector } from "../../hooks";
import {
  useRecordingDateTimes,
  type RecordingDateTime,
} from "./useRecordingDateTimes";
import { dateStringToEpochDay, dateStringToMonth } from "./dateTimeFilterHelpers";

export const TIME_OF_DAY_DOMAIN: [number, number] = [0, 86400];

export interface DateTimeFilterData {
  recordingDateTimeById: Map<number, RecordingDateTime>;
  /**
   * Each dataset recording's date, as epoch day — spans the whole dataset,
   * not just the current feed subset. When `filterMonths` is non-empty, only
   * dates falling in those months are included, so the "Date range"
   * histogram visually reflects the month filter (spikes where the selected
   * months occurred across every year, gaps elsewhere).
   */
  dateValues: number[];
  /**
   * [min, max] epoch day across every recording in the dataset (not just the
   * current feed subset, and NOT narrowed by filterMonths — the calendar
   * stays navigable across the full timeline), or [0, 1] when there are none.
   */
  dateDomain: [number, number];
  /** Each dataset recording's time, in seconds since midnight — spans the whole dataset, not just the current feed subset. */
  timeValues: number[];
  /** True when this dataset has at least one recording with a parseable date/time — gates whether the sidebar shows these sections at all. */
  hasAnyDateTime: boolean;
  /** True while recordingDateTimeById is still being (re)built for the current dataset. */
  dateTimeLoading: boolean;
}

/** @param filterMonths Month-of-year filter (1-12) — narrows dateValues (histogram bars) only, not dateDomain. */
export function useDateTimeFilterData(
  filterMonths: number[] = [],
): DateTimeFilterData {
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const inferenceLoading = useAppSelector((s) => s.al.inferenceLoading);
  const {
    dateTimeByRecordingId: recordingDateTimeById,
    loading: recordingLoading,
  } = useRecordingDateTimes(selectedDatasetId);
  const dateTimeLoading = recordingLoading || inferenceLoading;
  const monthsKey = filterMonths.join(",");

  return useMemo(() => {
    const monthSet = filterMonths.length > 0 ? new Set(filterMonths) : null;
    const dateValues: number[] = [];
    const timeValues: number[] = [];
    let domainMin = Infinity;
    let domainMax = -Infinity;
    for (const dt of recordingDateTimeById.values()) {
      const day = dateStringToEpochDay(dt.date);
      if (!monthSet || monthSet.has(dateStringToMonth(dt.date))) {
        dateValues.push(day);
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingDateTimeById, dateTimeLoading, monthsKey]);
}
