/**
 * HistogramSlider — Airbnb-style histogram with an overlaid range/threshold slider.
 *
 * Props:
 *   values        - raw numeric score values (0–1 expected; clamped internally)
 *   min / max     - domain bounds (default 0 / 1)
 *   binCount      - number of histogram bars (default 28)
 *   mode          - "range" (two handles) | "threshold" (single handle, show right side)
 *   range         - current slider value(s) as normalised [0,1] fractions:
 *                     range mode   → [lo, hi]
 *                     threshold    → [lo, 1]  (hi ignored)
 *   disabled      - when true, bars render but handles are not interactive
 *   label         - optional string rendered below the slider (e.g. "threshold: 0.50")
 *   onChange      - called with new [lo, hi] normalised range
 *   accentColor   - active bar colour (default #3b82f6)
 *   barHeight     - height of bar area in px (default 72)
 */

import React, { useCallback, useMemo, useRef } from "react";

interface HistogramSliderProps {
  values: number[];
  /** When true, only the bar area is rendered — no track, no handles, no label. */
  hideSlider?: boolean;
  /**
   * When provided, sets the global Y-axis scale and enables stacked bars:
   *   - Bar total height ∝ totalValues bin count
   *   - Blue base  = values count (visible samples)
   *   - Grey cap   = totalValues − values (filtered-out samples)
   * When omitted, bars are coloured by the slider range as before.
   */
  totalValues?: number[];
  min?: number;
  max?: number;
  binCount?: number;
  mode?: "range" | "threshold";
  range: [number, number];
  disabled?: boolean;
  label?: string;
  onChange?: (range: [number, number]) => void;
  accentColor?: string;
  barHeight?: number;
}

function computeBins(values: number[], binCount: number, min: number, max: number): number[] {
  const bins = new Array<number>(binCount).fill(0);
  const span = max - min || 1;
  for (const v of values) {
    const clamped = Math.max(min, Math.min(max, v));
    const idx = Math.min(binCount - 1, Math.floor(((clamped - min) / span) * binCount));
    bins[idx]++;
  }
  return bins;
}

export const HistogramSlider: React.FC<HistogramSliderProps> = ({
  values,
  hideSlider = false,
  totalValues,
  min = 0,
  max = 1,
  binCount = 28,
  mode = "threshold",
  range,
  disabled = false,
  label,
  onChange,
  accentColor = "#3b82f6",
  barHeight = 72,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [lo, hi] = range;

  // bins  = highlighted (blue) counts
  const bins = useMemo(
    () => computeBins(values, binCount, min, max),
    [values, binCount, min, max],
  );
  // totalBins = scale-setting counts (when stacked mode is active)
  const totalBins = useMemo(
    () => (totalValues ? computeBins(totalValues, binCount, min, max) : null),
    [totalValues, binCount, min, max],
  );
  // Y-axis scale is driven by whichever dataset is larger
  const maxBin = useMemo(
    () => Math.max(1, ...(totalBins ?? bins)),
    [bins, totalBins],
  );

  // Returns normalised [0,1] x position from a mouse event relative to the track.
  const toNorm = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const startDrag = useCallback(
    (handle: "lo" | "hi") => (e: React.MouseEvent) => {
      if (disabled || !onChange) return;
      e.preventDefault();
      const onMove = (ev: MouseEvent) => {
        const x = toNorm(ev.clientX);
        if (handle === "lo") {
          const newLo = mode === "range" ? Math.min(x, hi - 0.02) : x;
          onChange([Math.max(0, newLo), hi]);
        } else {
          onChange([lo, Math.max(lo + 0.02, Math.min(1, x))]);
        }
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [disabled, onChange, toNorm, mode, lo, hi],
  );

  const fillLeft = lo * 100;
  const fillWidth = mode === "threshold" ? (1 - lo) * 100 : (hi - lo) * 100;

  return (
    <div className="w-full select-none">
      {/* Bar area */}
      <div
        className="flex items-end gap-[2px] w-full"
        style={{ height: barHeight }}
        aria-hidden="true"
      >
        {bins.map((blueCount, i) => {
          const totalCount = totalBins ? totalBins[i] : blueCount;
          const heightPct = Math.max(4, (totalCount / maxBin) * 100);

          if (totalBins) {
            // Stacked mode: blue base (visible) + grey cap (filtered out)
            const bluePct = totalCount > 0 ? (blueCount / totalCount) * 100 : 0;
            const greyPct = 100 - bluePct;
            const tipTotal = totalCount;
            const tipVisible = blueCount;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col rounded-t-[2px] overflow-hidden cursor-default"
                style={{ height: `${heightPct}%` }}
                title={`${tipVisible} visible / ${tipTotal} total`}
              >
                {/* Grey cap — filtered-out samples */}
                <div
                  style={{ height: `${greyPct}%`, backgroundColor: "#d1d5db", opacity: 0.45 }}
                />
                {/* Blue base — visible samples */}
                <div
                  style={{ height: `${bluePct}%`, backgroundColor: accentColor }}
                />
              </div>
            );
          }

          // Original mode: colour by slider range
          const t = i / (binCount - 1);
          const inRange = mode === "threshold" ? t >= lo : t >= lo && t <= hi;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-[2px] transition-colors duration-100 cursor-default"
              style={{
                height: `${heightPct}%`,
                backgroundColor: inRange ? accentColor : "#d1d5db",
                opacity: inRange ? 1 : 0.4,
              }}
              title={`${blueCount} sample${blueCount !== 1 ? "s" : ""}`}
            />
          );
        })}
      </div>

      {/* Slider track + handles (hidden when hideSlider is true) */}
      {!hideSlider && (
        <>
          <div className="relative h-5 mt-1">
            {/* Track background */}
            <div
              ref={trackRef}
              className="absolute top-1/2 left-0 right-0 h-[4px] bg-gray-200 rounded-full -translate-y-1/2"
            >
              {/* Filled portion */}
              <div
                className="absolute top-0 bottom-0 rounded-full"
                style={{
                  left: `${fillLeft}%`,
                  width: `${fillWidth}%`,
                  backgroundColor: accentColor,
                }}
              />
            </div>

            {/* Lo handle */}
            <div
              className={[
                "absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
                "w-[18px] h-[18px] rounded-full bg-white border-2 shadow-md",
                "transition-shadow duration-100",
                disabled
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-grab hover:shadow-[0_0_0_6px_rgba(59,130,246,0.15)] active:cursor-grabbing",
              ].join(" ")}
              style={{ left: `${lo * 100}%`, borderColor: accentColor }}
              onMouseDown={startDrag("lo")}
            />

            {/* Hi handle (range mode only) */}
            {mode === "range" && (
              <div
                className={[
                  "absolute top-1/2 -translate-x-1/2 -translate-y-1/2",
                  "w-[18px] h-[18px] rounded-full bg-white border-2 shadow-md",
                  "transition-shadow duration-100",
                  disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-grab hover:shadow-[0_0_0_6px_rgba(59,130,246,0.15)] active:cursor-grabbing",
                ].join(" ")}
                style={{ left: `${hi * 100}%`, borderColor: accentColor }}
                onMouseDown={startDrag("hi")}
              />
            )}
          </div>

          {/* Axis tick labels */}
          <div className="relative mt-0.5 h-3">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const val = min + t * (max - min);
              return (
                <span
                  key={t}
                  className="absolute text-[10px] text-gray-400 font-ibm-sans -translate-x-1/2"
                  style={{ left: `${t * 100}%` }}
                >
                  {val.toFixed(2)}
                </span>
              );
            })}
          </div>

          {/* Label row */}
          {label && (
            <div className="mt-1 text-center text-[11px] text-gray-500 font-ibm-sans">
              {label}
            </div>
          )}
        </>
      )}
    </div>
  );
};
