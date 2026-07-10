import React, { useMemo } from "react";
import { Tooltip } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { HistogramSlider } from "../../components/al/HistogramSlider";

interface DateTimeRangeFilterProps {
  icon: React.ReactNode;
  title: string;
  /** Raw values in domain units (epoch days for Date range, seconds for Time of day) — one per visible prediction with a parseable value. */
  values: number[];
  domain: [number, number];
  /**
   * Optional fixed display window to bin/show against instead of the full
   * `domain` — set externally (e.g. by a calendar picker), not by this
   * component. Unlike `range`, it does NOT change as the slider handles are
   * dragged, so the backdrop (bars + axis) stays put while the user narrows
   * their selection within it. Falls back to `domain` when omitted/null.
   */
  zoomDomain?: [number, number] | null;
  binCount?: number;
  /** Current selection in domain units, or null when no filter is active (full domain). */
  range: [number, number] | null;
  onChange: (range: [number, number] | null) => void;
  /** Called by the header's reset button instead of onChange(null), when provided — e.g. to also clear zoomDomain. */
  onReset?: () => void;
  formatValue: (v: number) => string;
}

/**
 * One bar-histogram + range-slider filter, parameterized over its domain.
 * HistogramSlider itself works in normalised [0,1] fractions (see its own
 * docstring) — this component owns the conversion to/from actual domain
 * values so callers (and the filter props threaded further up the tree)
 * only ever deal in real epoch-day / seconds-since-midnight numbers.
 *
 * When `zoomDomain` is supplied (Date range only, set by the calendar
 * picker), the histogram bins/displays against that fixed window instead of
 * the full domain — narrowing to e.g. a 10-day window out of a whole year
 * shows the actual distribution within those 10 days. The slider handles
 * then only narrow the *selection* within that fixed window; they never
 * change the window itself, so dragging feels like a normal range slider
 * bounded to whatever's currently zoomed in, not a moving target.
 */
export const DateTimeRangeFilter: React.FC<DateTimeRangeFilterProps> = ({
  icon,
  title,
  values,
  domain,
  zoomDomain,
  binCount,
  range,
  onChange,
  onReset,
  formatValue,
}) => {
  const [domainMin, domainMax] = domain;
  const [dispMin, dispMax] = zoomDomain ?? domain;
  const span = dispMax - dispMin || 1;

  // Points outside the zoom window are dropped (not clamped) so they don't
  // pile into the edge bins and distort the histogram once zoomed in.
  const scopedValues = useMemo(
    () => (zoomDomain ? values.filter((v) => v >= dispMin && v <= dispMax) : values),
    [values, zoomDomain, dispMin, dispMax],
  );

  const normalized: [number, number] = range
    ? [(range[0] - dispMin) / span, (range[1] - dispMin) / span]
    : [0, 1];

  const handleSliderChange = (norm: [number, number]) => {
    const lo = dispMin + norm[0] * span;
    const hi = dispMin + norm[1] * span;
    // Epsilon rather than exact 0/1 equality — HistogramSlider's drag handlers
    // happen to hard-clamp to exact literals today, but this shouldn't rely
    // on that staying true forever.
    const FULL_RANGE_EPSILON = 1e-9;
    const isFullWidthDrag = norm[0] <= FULL_RANGE_EPSILON && norm[1] >= 1 - FULL_RANGE_EPSILON;
    // Only collapse to "no filter" when the displayed window IS the true
    // full domain — otherwise (zoomed into a calendar-set window) a
    // full-width drag just re-selects that whole window, rather than
    // silently expanding the filter back out to the entire dataset.
    const isTrueFullDomain = dispMin <= domainMin + FULL_RANGE_EPSILON && dispMax >= domainMax - FULL_RANGE_EPSILON;
    onChange(isFullWidthDrag && isTrueFullDomain ? null : [lo, hi]);
  };

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 font-ibm-sans">
        {icon} {title}
        {range && (
          <Tooltip title={`Reset ${title.toLowerCase()}`}>
            <button
              type="button"
              onClick={() => (onReset ? onReset() : onChange(null))}
              aria-label={`Reset ${title}`}
              className="ml-auto flex h-4 w-4 items-center justify-center text-gray-400 transition-colors hover:text-red-500"
            >
              <ReloadOutlined className="text-[10px]" />
            </button>
          </Tooltip>
        )}
      </p>
      <HistogramSlider
        values={scopedValues}
        min={dispMin}
        max={dispMax}
        binCount={binCount}
        mode="range"
        range={normalized}
        onChange={handleSliderChange}
        barHeight={18}
        formatValue={formatValue}
        label={range ? `${formatValue(range[0])} – ${formatValue(range[1])}` : undefined}
      />
    </div>
  );
};

DateTimeRangeFilter.displayName = "DateTimeRangeFilter";
