import React from "react";
import { Tooltip } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { HistogramSlider } from "../../components/al/HistogramSlider";

interface DateTimeRangeFilterProps {
  icon: React.ReactNode;
  title: string;
  /** Raw values in domain units (epoch days for Date range, seconds for Time of day) — one per visible prediction with a parseable value. */
  values: number[];
  domain: [number, number];
  binCount?: number;
  /** Current selection in domain units, or null when no filter is active (full domain). */
  range: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
  formatValue: (v: number) => string;
}

/**
 * One bar-histogram + range-slider filter, parameterized over its domain.
 * HistogramSlider itself works in normalised [0,1] fractions (see its own
 * docstring) — this component owns the conversion to/from actual domain
 * values so callers (and the filter props threaded further up the tree)
 * only ever deal in real epoch-day / seconds-since-midnight numbers.
 */
export const DateTimeRangeFilter: React.FC<DateTimeRangeFilterProps> = ({
  icon,
  title,
  values,
  domain,
  binCount,
  range,
  onChange,
  formatValue,
}) => {
  const [domainMin, domainMax] = domain;
  const span = domainMax - domainMin || 1;
  const normalized: [number, number] = range
    ? [(range[0] - domainMin) / span, (range[1] - domainMin) / span]
    : [0, 1];

  const handleSliderChange = (norm: [number, number]) => {
    const lo = domainMin + norm[0] * span;
    const hi = domainMin + norm[1] * span;
    // Epsilon rather than exact 0/1 equality — HistogramSlider's drag handlers
    // happen to hard-clamp to exact literals today, but this shouldn't rely
    // on that staying true forever.
    const FULL_RANGE_EPSILON = 1e-9;
    const isFullRange = norm[0] <= FULL_RANGE_EPSILON && norm[1] >= 1 - FULL_RANGE_EPSILON;
    onChange(isFullRange ? null : [lo, hi]);
  };

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 font-ibm-sans">
        {icon} {title}
        {range && (
          <Tooltip title={`Reset ${title.toLowerCase()}`}>
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Reset ${title}`}
              className="ml-auto flex h-4 w-4 items-center justify-center text-gray-400 transition-colors hover:text-red-500"
            >
              <ReloadOutlined className="text-[10px]" />
            </button>
          </Tooltip>
        )}
      </p>
      <HistogramSlider
        values={values}
        min={domainMin}
        max={domainMax}
        binCount={binCount}
        mode="range"
        range={normalized}
        onChange={handleSliderChange}
        barHeight={26}
        formatValue={formatValue}
        label={range ? `${formatValue(range[0])} – ${formatValue(range[1])}` : undefined}
      />
    </div>
  );
};

DateTimeRangeFilter.displayName = "DateTimeRangeFilter";
