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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { HistogramSlider } from "./HistogramSlider";
import type { ALFilterState, SampleScores } from "../../types/al";
import type { FilterMode, AllowedProperty } from "../../studyPhases";
import { getPropertyByKey } from "../../constants/alProperties";

// ── Per-property colours ──────────────────────────────────────────────────────
const PROPERTY_COLORS: Record<string, string> = {
  uncertainty: "#3b82f6", // blue
  diversity:   "#10b981", // emerald
  density:     "#f59e0b", // amber
};
function propertyColor(key: string): string {
  return PROPERTY_COLORS[key] ?? "#3b82f6";
}

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
}

const PropertyRow: React.FC<PropertyRowProps> = ({
  label,
  color,
  allValues,
  visibleValues,
  normRange,
  onSliderChange,
}) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center justify-between text-[11px] font-ibm-sans">
      <span
        className="font-semibold uppercase tracking-wide"
        style={{ color }}
      >
        {label}
      </span>
      <span className="text-gray-400">
        ≥ <strong style={{ color }}>{normRange[0].toFixed(2)}</strong>
      </span>
    </div>
    <HistogramSlider
      values={visibleValues}
      totalValues={allValues}
      min={SCORE_MIN}
      max={SCORE_MAX}
      mode="threshold"
      range={normRange}
      onChange={onSliderChange}
      barHeight={40}
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
    (newNorm: [number, number]) => onVisibilityRangeChange([newNorm[0], 1]),
    [onVisibilityRangeChange],
  );
  const singleNormRange = useMemo<[number, number]>(
    () => [alFilters.visibility.range?.[0] ?? 0, 1],
    [alFilters.visibility.range],
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
        normRange: (alFilters.visibility.ranges?.[key] ?? [0, 1]) as [number, number],
      }));
  }, [allowedProperties, multiActiveKeys, enrichedPlotPoints, visiblePoints, alFilters.visibility.ranges]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3 border-b border-gray-100 bg-white">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold text-gray-600 font-ibm-sans tracking-wide uppercase">
          Score Distribution
        </span>
        <span className="text-[11px] text-gray-500 font-ibm-sans">
          <strong className="text-gray-700">{visibleCount.toLocaleString()}</strong>
          {" / "}
          <strong className="text-gray-700">{enrichedPlotPoints.length.toLocaleString()}</strong>
          {" visible"}
        </span>
      </div>

      {/* ── P3.1: exclusive tabs + one histogram ─────────────────────── */}
      {!isMulti && (
        <>
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
                  style={isActive ? { backgroundColor: color, borderColor: color } : undefined}
                >
                  {def?.label ?? prop}
                </button>
              );
            })}
          </div>

          {singleAllValues.length > 0 ? (
            <PropertyRow
              label={getPropertyByKey(singleActiveKey)?.label ?? singleActiveKey}
              color={propertyColor(singleActiveKey)}
              allValues={singleAllValues}
              visibleValues={singleVisibleValues}
              normRange={singleNormRange}
              onSliderChange={handleSingleSlider}
            />
          ) : (
            <EmptyState />
          )}
        </>
      )}

      {/* ── P3.2: toggle pills + one compact row per active property ──── */}
      {isMulti && (
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
                    isLastActive ? "At least one filter must stay active" : undefined
                  }
                >
                  {def?.label ?? prop}
                  {isActive && <span className="ml-1 opacity-80">✓</span>}
                </button>
              );
            })}
          </div>

          {multiData.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {multiData.map((row) => (
                <PropertyRow
                  key={row.key}
                  label={row.label}
                  color={row.color}
                  allValues={row.allValues}
                  visibleValues={row.visibleValues}
                  normRange={row.normRange}
                  onSliderChange={(newNorm) => handleMultiSlider(row.key, [newNorm[0], 1])}
                />
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
