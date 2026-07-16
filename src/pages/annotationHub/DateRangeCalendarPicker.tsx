import React from "react";
import { DatePicker } from "antd";
import type { Dayjs } from "dayjs";
import { epochDayToDayjs, dayjsToEpochDay } from "./dateTimeFilterHelpers";

const { RangePicker } = DatePicker;

interface DateRangeCalendarPickerProps {
  /** [min, max] epoch day across all recorded dates in the current feed. */
  domain: [number, number];
  /** Current filter selection in epoch days, or null when unfiltered (full domain). */
  range: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
  disabled?: boolean;
}

/**
 * Calendar-based start/end date selection, shown above the histogram slider
 * so users can jump straight to a specific date range instead of dragging
 * across the full spread of dates. Shares the same epoch-day range state as
 * the slider below it — either control can drive the filter, and both stay
 * in sync through the same `range`/`onChange` props.
 */
export const DateRangeCalendarPicker: React.FC<DateRangeCalendarPickerProps> = ({
  domain,
  range,
  onChange,
  disabled = false,
}) => {
  const [domainMin, domainMax] = domain;
  // Default to the full available date span ("whole year based on the
  // results") whenever no explicit filter is active, rather than showing an
  // empty/unset picker.
  const effective = range ?? domain;
  const value: [Dayjs, Dayjs] = [epochDayToDayjs(effective[0]), epochDayToDayjs(effective[1])];

  const handleChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (!dates || !dates[0] || !dates[1]) {
      onChange(null);
      return;
    }
    const lo = Math.max(domainMin, dayjsToEpochDay(dates[0]));
    const hi = Math.min(domainMax, dayjsToEpochDay(dates[1]));
    const isFullRange = lo <= domainMin && hi >= domainMax;
    onChange(isFullRange ? null : [lo, hi]);
  };

  return (
    <RangePicker
      size="small"
      value={value}
      onChange={handleChange}
      disabled={disabled}
      minDate={epochDayToDayjs(domainMin)}
      maxDate={epochDayToDayjs(domainMax)}
      format="MMM D, YYYY"
      allowClear
      className="w-full"
    />
  );
};

DateRangeCalendarPicker.displayName = "DateRangeCalendarPicker";
