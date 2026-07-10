/**
 * ScoreHistogramPanel — Standalone faceted-filter histograms for Phase 3.
 *
 * P3.1 (visibilityMode "single"):
 *   Exclusive pill tabs — one property active at a time.
 *   One compact histogram + threshold slider. Switching tabs switches the
 *   active filter property (dispatches onVisibilityKeyChange).
 *
 * P3.2 (visibilityMode "multi"):
 *   Toggleable pill tabs — any combination of properties can be active.
 *   One COMPACT histogram row per active property, each with its own
 *   colour-coded threshold slider directly beneath it (faceted-filter pattern).
 *   In every row the coloured bars = samples passing ALL active filters,
 *   grey cap = samples removed by at least one filter — so the combined
 *   result is visible in each distribution.
 */

import React, { useCallback, useEffect, useMemo } from "react";
import { Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { HistogramSlider } from "./HistogramSlider";
import type { ALFilterState, SampleScores } from "../../types/al";
import type { FilterMode, AllowedProperty } from "../../studyPhases";
import { getPropertyByKey, propertyColor } from "../../constants/alProperties";

interface FilteredPoint {
  p: { snippet_id: number; scores?: SampleScores };
  visible: boolean;
}

interface ScoreHistogramPanelProps {
  enrichedPlotPoints: FilteredPoint["p"][];
  filtered: FilteredPoint[];
  allowedProperties: AllowedProperty[];
  visibilityMode: FilterMode;
  alFilters: ALFilterState;
  onVisibilityKeyChange: (key: string | null) => void;
  onVisibilityRangeChange: (range: [number, number]) => void;
  onMultiVisibilityChange?: (keys: string[]) => void;
  onMultiVisibilityRangeChange?: (key: string, range: [number, number]) => void;
  onReset?: () => void;
  sliderMode?: "range" | "threshold";
  compact?: boolean;
}

const SCORE_MIN = 0;
const SCORE_MAX = 1;

/** Extract numeric score values for a given key from a list of points. */
function extractValues(points: FilteredPoint["p"][], key: string): number[] {
  const out: number[] = [];
  for (const p of points) {
    const v = p.scores?.[key as keyof SampleScores];
    if (typeof v === "number" && Number.isFinite(v)) out.push(v);
  }
  return out;
}

// ── Compact faceted histogram row ─────────────────────────────────────────────

interface PropertyRowProps {
  label: string;
  color: string;
  allValues: number[];
  visibleValues: number[];
  normRange: [number, number];
  onSliderChange: (newNorm: [number, number]) => void;
  mode?: "range" | "threshold";
  hideLabel?: boolean;
  compact?: boolean;
}

const PropertyRow: React.FC<PropertyRowProps> = ({
  label,
  color,
  allValues,
  visibleValues,
  normRange,
  onSliderChange,
  mode = "threshold",
  hideLabel = false,
  compact = false,
}) => (
  <div className="flex flex-col gap-0.5">
    <div
      className={`flex items-center text-[11px] font-ibm-sans ${hideLabel ? "justify-end" : "justify-between"}`}
    >
      {!hideLabel && (
        <span
          className="font-semibold uppercase tracking-wide"
          style={{ color }}
        >
          {label}
        </span>
      )}
      <span className="text-gray-400">
        {mode === "range" ? (
          <>
            <strong style={{ color }}>{normRange[0].toFixed(2)}</strong>
            {" – "}
            <strong style={{ color }}>{normRange[1].toFixed(2)}</strong>
          </>
        ) : (
          <>
            ≥ <strong style={{ color }}>{normRange[0].toFixed(2)}</strong>
          </>
        )}
      </span>
    </div>
    <HistogramSlider
      values={visibleValues}
      totalValues={allValues}
      min={SCORE_MIN}
      max={SCORE_MAX}
      mode={mode}
      range={normRange}
      onChange={onSliderChange}
      barHeight={compact ? 26 : 40}
      hideAxis={compact}
      accentColor={color}
    />
  </div>
);

// ── Main panel ────────────────────────────────────────────────────────────────

export const ScoreHistogramPanel: React.FC<ScoreHistogramPanelProps> = ({
  enrichedPlotPoints,
  filtered,
  allowedProperties,
  visibilityMode,
  alFilters,
  onVisibilityKeyChange,
  onVisibilityRangeChange,
  onMultiVisibilityChange,
  onMultiVisibilityRangeChange,
  onReset,
  sliderMode = "threshold",
  compact = false,
}) => {
  const isMulti = visibilityMode === "multi";

  // ── P3.1: active key from Redux ──────────────────────────────────────────
  const singleActiveKey: string =
    alFilters.visibility.propertyKey ??
    (allowedProperties[0] as string) ??
    "uncertainty";

  // ── P3.2: active keys from Redux (propertyKeys array) ───────────────────
  const multiActiveKeys: string[] = useMemo(
    () => alFilters.visibility.propertyKeys ?? [],
    [alFilters.visibility.propertyKeys],
  );

  // P3.1: set the first allowed property active in Redux on mount when none set.
  useEffect(() => {
    if (isMulti) return;
    if (!alFilters.visibility.propertyKey && allowedProperties.length > 0) {
      onVisibilityKeyChange(allowedProperties[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMulti]);

  // P3.2: initialise with all allowed properties active on mount.
  useEffect(() => {
    if (!isMulti || !onMultiVisibilityChange) return;
    if (multiActiveKeys.length === 0) {
      onMultiVisibilityChange(allowedProperties as string[]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMulti]);

  // Visible points (pass ALL active filters).
  const visiblePoints = useMemo(
    () => filtered.filter((f) => f.visible).map((f) => f.p),
    [filtered],
  );
  const visibleCount = visiblePoints.length;

  // ── P3.1 handlers ────────────────────────────────────────────────────────
  const handleSingleTabChange = useCallback(
    (key: string) => onVisibilityKeyChange(key),
    [onVisibilityKeyChange],
  );
  const handleSingleSlider = useCallback(
    (newNorm: [number, number]) =>
      onVisibilityRangeChange(
        sliderMode === "range" ? newNorm : [newNorm[0], 1],
      ),
    [onVisibilityRangeChange, sliderMode],
  );
  const singleNormRange = useMemo<[number, number]>(
    () => [
      alFilters.visibility.range?.[0] ?? 0,
      sliderMode === "range" ? (alFilters.visibility.range?.[1] ?? 1) : 1,
    ],
    [alFilters.visibility.range, sliderMode],
  );

  // ── P3.2 handlers ────────────────────────────────────────────────────────
  const handleMultiToggle = useCallback(
    (key: string) => {
      if (!onMultiVisibilityChange) return;
      const current = multiActiveKeys;
      if (current.includes(key)) {
        if (current.length <= 1) return; // keep at least one active
        onMultiVisibilityChange(current.filter((k) => k !== key));
      } else {
        onMultiVisibilityChange([...current, key]);
      }
    },
    [multiActiveKeys, onMultiVisibilityChange],
  );
  const handleMultiSlider = useCallback(
    (key: string, newNorm: [number, number]) =>
      onMultiVisibilityRangeChange?.(key, newNorm),
    [onMultiVisibilityRangeChange],
  );

  // ── Derived data ─────────────────────────────────────────────────────────
  const singleAllValues = useMemo(
    () => extractValues(enrichedPlotPoints, singleActiveKey),
    [enrichedPlotPoints, singleActiveKey],
  );
  const singleVisibleValues = useMemo(
    () => extractValues(visiblePoints, singleActiveKey),
    [visiblePoints, singleActiveKey],
  );

  // True when any active filter has a threshold above 0.
  const isFiltered = useMemo(() => {
    if (!isMulti) return (alFilters.visibility.range?.[0] ?? 0) > 0;
    return multiActiveKeys.some(
      (k) => (alFilters.visibility.ranges?.[k]?.[0] ?? 0) > 0,
    );
  }, [
    isMulti,
    alFilters.visibility.range,
    alFilters.visibility.ranges,
    multiActiveKeys,
  ]);

  // One entry per active property (preserve allowedProperties ordering).
  const multiData = useMemo(() => {
    return (allowedProperties as string[])
      .filter((key) => multiActiveKeys.includes(key))
      .map((key) => ({
        key,
        label: getPropertyByKey(key)?.label ?? key,
        color: propertyColor(key),
        allValues: extractValues(enrichedPlotPoints, key),
        visibleValues: extractValues(visiblePoints, key),
        normRange: (alFilters.visibility.ranges?.[key] ?? [0, 1]) as [
          number,
          number,
        ],
      }));
  }, [
    allowedProperties,
    multiActiveKeys,
    enrichedPlotPoints,
    visiblePoints,
    alFilters.visibility.ranges,
  ]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      data-tour="score-histogram"
      className={[
        "flex flex-col gap-2.5 bg-white",
        compact ? "" : "px-4 py-3 border-b border-gray-100",
      ].join(" ")}
    >
      {!compact ? (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs font-semibold text-gray-600 font-ibm-sans tracking-wide uppercase">
            Score Distribution
          </span>
          <div className="flex items-center gap-2">
            {isFiltered && onReset && (
              <button
                type="button"
                onClick={onReset}
                className="text-[11px] text-blue-500 hover:text-blue-700 font-ibm-sans underline"
              >
                Reset
              </button>
            )}
            <span className="text-[11px] text-gray-500 font-ibm-sans">
              <strong className="text-gray-700">
                {visibleCount.toLocaleString()}
              </strong>
              {" / "}
              <strong className="text-gray-700">
                {enrichedPlotPoints.length.toLocaleString()}
              </strong>
              {" visible"}
            </span>
          </div>
        </div>
      ) : (
        isFiltered && (
          <div className="flex items-center justify-between text-[11px] font-ibm-sans">
            <span className="text-gray-500">
              <strong className="text-gray-700">
                {visibleCount.toLocaleString()}
              </strong>
              {" / "}
              {enrichedPlotPoints.length.toLocaleString()}
              {" visible"}
            </span>
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="text-blue-500 hover:text-blue-700 underline"
              >
                Reset
              </button>
            )}
          </div>
        )
      )}

      {/* ── P3.1: exclusive tabs + one histogram ─────────────────────── */}
      {!isMulti && (
        <>
          {!compact && (
            <div className="flex gap-2 flex-wrap">
              {allowedProperties.map((prop) => {
                const def = getPropertyByKey(prop);
                const isActive = prop === singleActiveKey;
                const color = propertyColor(prop);
                return (
                  <button
                    key={prop}
                    type="button"
                    onClick={() => handleSingleTabChange(prop)}
                    className={[
                      "px-3 py-1 rounded-full border text-xs font-medium transition-all",
                      isActive
                        ? "text-white font-semibold shadow-sm"
                        : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700",
                    ].join(" ")}
                    style={
                      isActive
                        ? { backgroundColor: color, borderColor: color }
                        : undefined
                    }
                  >
                    {def?.label ?? prop}
                  </button>
                );
              })}
            </div>
          )}

          {singleAllValues.length > 0 ? (
            <PropertyRow
              label={
                getPropertyByKey(singleActiveKey)?.label ?? singleActiveKey
              }
              color={propertyColor(singleActiveKey)}
              allValues={singleAllValues}
              visibleValues={singleVisibleValues}
              normRange={singleNormRange}
              onSliderChange={handleSingleSlider}
              mode={sliderMode}
              hideLabel={compact}
              compact={compact}
            />
          ) : (
            <EmptyState />
          )}
        </>
      )}

      {/* ── P3.2 (compact): unified rows — header doubles as toggle ────── */}
      {isMulti && compact && (
        <div className="flex flex-col gap-1.5">
          {(allowedProperties as string[]).map((prop) => {
            const def = getPropertyByKey(prop);
            const label = def?.label ?? prop;
            const color = propertyColor(prop);
            const isActive = multiActiveKeys.includes(prop);
            const isLastActive = isActive && multiActiveKeys.length === 1;
            const row = multiData.find((r) => r.key === prop);

            return (
              <div
                key={prop}
                className={[
                  "rounded-lg border transition-colors",
                  isActive
                    ? "border-gray-200 px-2.5 py-1.5"
                    : "border-dashed border-gray-200 px-2.5 py-1",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => handleMultiToggle(prop)}
                  disabled={isLastActive}
                  title={
                    isLastActive
                      ? "At least one filter must stay active"
                      : undefined
                  }
                  className={[
                    "flex w-full items-center justify-between gap-2 text-left",
                    isLastActive ? "cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex items-center gap-1.5 text-[11px] font-ibm-sans font-semibold",
                      isActive ? "text-gray-800" : "text-gray-400",
                    ].join(" ")}
                  >
                    <span
                      className="h-1.75 w-1.75 shrink-0 rounded-full"
                      style={{ backgroundColor: isActive ? color : "#d1d5db" }}
                    />
                    {label}
                    {def?.description && (
                      <Tooltip title={def.description}>
                        <InfoCircleOutlined
                          className="text-gray-300 hover:text-gray-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Tooltip>
                    )}
                  </span>
                  {isActive && row ? (
                    <span className="text-[11px] font-ibm-sans text-gray-400">
                      {sliderMode === "range" ? (
                        <>
                          <strong style={{ color }}>
                            {row.normRange[0].toFixed(2)}
                          </strong>
                          {" – "}
                          <strong style={{ color }}>
                            {row.normRange[1].toFixed(2)}
                          </strong>
                        </>
                      ) : (
                        <>
                          ≥{" "}
                          <strong style={{ color }}>
                            {row.normRange[0].toFixed(2)}
                          </strong>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="text-[11px] font-ibm-sans text-gray-300">
                      +
                    </span>
                  )}
                </button>

                {isActive &&
                  row &&
                  (row.allValues.length === 0 ? (
                    <p className="mt-1 text-[11px] text-gray-300 font-ibm-sans">
                      No score data for this property
                    </p>
                  ) : (
                    <div className="mt-1">
                      <HistogramSlider
                        values={row.visibleValues}
                        totalValues={row.allValues}
                        min={SCORE_MIN}
                        max={SCORE_MAX}
                        mode={sliderMode}
                        range={row.normRange}
                        onChange={(newNorm) =>
                          handleMultiSlider(
                            row.key,
                            sliderMode === "range" ? newNorm : [newNorm[0], 1],
                          )
                        }
                        barHeight={18}
                        hideAxis
                        accentColor={color}
                      />
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ── P3.2 (standalone): toggle pills + one row per active property ── */}
      {isMulti && !compact && (
        <>
          <div className="flex gap-2 flex-wrap">
            {allowedProperties.map((prop) => {
              const def = getPropertyByKey(prop);
              const isActive = multiActiveKeys.includes(prop);
              const isLastActive = isActive && multiActiveKeys.length === 1;
              const color = propertyColor(prop);
              return (
                <button
                  key={prop}
                  type="button"
                  onClick={() => handleMultiToggle(prop)}
                  className={[
                    "px-3 py-1 rounded-full border text-xs font-medium transition-all",
                    isActive
                      ? "text-white font-semibold shadow-sm"
                      : "bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700",
                    isLastActive ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  style={
                    isActive
                      ? { backgroundColor: color, borderColor: color }
                      : undefined
                  }
                  title={
                    isLastActive
                      ? "At least one filter must stay active"
                      : undefined
                  }
                >
                  {def?.label ?? prop}
                </button>
              );
            })}
          </div>

          {multiData.length > 0 ? (
            <div className="flex flex-row gap-6">
              {multiData.map((row) => (
                <div key={row.key} className="flex-1 min-w-0">
                  <PropertyRow
                    label={row.label}
                    color={row.color}
                    allValues={row.allValues}
                    visibleValues={row.visibleValues}
                    normRange={row.normRange}
                    onSliderChange={(newNorm) =>
                      handleMultiSlider(
                        row.key,
                        sliderMode === "range" ? newNorm : [newNorm[0], 1],
                      )
                    }
                    mode={sliderMode}
                    compact={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </>
      )}
    </div>
  );
};

const EmptyState: React.FC = () => (
  <div className="text-[12px] text-gray-400 font-ibm-sans py-4 text-center">
    Run inference to see score distributions
  </div>
);
