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
  /**
   * When true and `range` is null, show an empty "Any date" placeholder
   * instead of filling in the full domain span. Normally the picker shows
   * the domain span when unset (useful context: "recordings span this
   * period"), but once another filter (Month) has taken over responsibility
   * for narrowing dates, showing concrete-looking dates here reads as "a
   * range is applied" even though it isn't — misleading in that context.
   */
  placeholderWhenUnset?: boolean;
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
  placeholderWhenUnset = false,
}) => {
  const [domainMin, domainMax] = domain;
  // Default to the full available date span ("whole year based on the
  // results") whenever no explicit filter is active, rather than showing an
  // empty/unset picker — unless placeholderWhenUnset says another filter is
  // now responsible for narrowing dates, in which case stay empty instead.
  const effective = range ?? (placeholderWhenUnset ? null : domain);
  const value: [Dayjs, Dayjs] | null = effective
    ? [epochDayToDayjs(effective[0]), epochDayToDayjs(effective[1])]
    : null;

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
      placeholder={["Any date", "Any date"]}
      allowClear
      className="w-full"
    />
  );
};

DateRangeCalendarPicker.displayName = "DateRangeCalendarPicker";
