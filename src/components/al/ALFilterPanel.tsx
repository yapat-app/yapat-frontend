/**
 * ALFilterPanel
 *
 * Phase-aware filter controls. Driven by `phaseVisibilityMode` and
 * `phaseColorMode` from the active study phase:
 *
 *   • visibility "disabled" → filter UI hidden
 *   • visibility "single"   → existing single-property select + range slider
 *   • visibility "multi"    → multi-select + one slider per chosen property
 *                             (AND-combined by the consumer)
 *
 *   • color "disabled"      → color filter hidden
 *   • color "single"        → existing single-property color select + legend
 *
 * Each select is restricted to `allowedVisibilityProperties` /
 * `allowedColorProperties` so phases can curate the property surface area.
 */

import React, { useEffect, useMemo } from "react";
import { Select, Slider, Tooltip, Tag } from "antd";
import { HistogramSlider } from "./HistogramSlider";
import { EyeOutlined, BgColorsOutlined } from "@ant-design/icons";
import {
  AL_PROPERTIES,
  visibilityProperties,
  colorProperties,
  getPropertyByKey,
} from "../../constants/alProperties";
import type {
  ALFilterState,
  PropertyDefinition,
} from "../../types/al";
import {
  continuousGradient,
  buildLegend,
} from "../../utils/alColors";
import type { FilterMode, AllowedProperty } from "../../studyPhases";

const { Option, OptGroup } = Select;

const NONE = "__none__";

// ── Gradient CSS string for the continuous legend bar ────────────────────────
const GRADIENT_BAR = (() => {
  const stops = Array.from({ length: 10 }, (_, i) => {
    const t = i / 9;
    return `${continuousGradient(t)} ${Math.round(t * 100)}%`;
  });
  return `linear-gradient(to right, ${stops.join(", ")})`;
})();

// ── Component ─────────────────────────────────────────────────────────────────

interface ALFilterPanelProps {
  filters: ALFilterState;

  /** Phase-driven mode for the visibility filter. Default "single" preserves backwards behaviour. */
  phaseVisibilityMode?: FilterMode;
  /** Phase-driven mode for the color filter. */
  phaseColorMode?: FilterMode;

  /** Allowed properties per phase. Empty array = "no restriction". */
  allowedVisibilityProperties?: AllowedProperty[];
  allowedColorProperties?: AllowedProperty[];

  /** Optional default key for single-mode visibility filter. */
  defaultVisibilityKey?: AllowedProperty | null;
  /** Single-mode slider style. */
  visibilitySliderStyle?: "range" | "threshold";
  /** Raw score values for the active visibility property — used to draw the histogram. */
  visibilityScoreValues?: number[];

  /** Single-mode visibility callbacks (legacy / phase 2.2). */
  onVisibilityKeyChange: (key: string | null) => void;
  onVisibilityRangeChange: (range: [number, number]) => void;
  onResetVisibility?: () => void;

  /** Multi-mode visibility callbacks (phase 3.2). */
  onMultiVisibilityChange?: (keys: string[]) => void;
  onMultiVisibilityRangeChange?: (key: string, range: [number, number]) => void;

  /** Color callbacks. */
  onColorKeyChange: (key: string | null) => void;

  allCategoricalValues?: Record<string, string[]>;
  visibilityRangeOverride?: { min: number; max: number; step: number };
}

export const ALFilterPanel: React.FC<ALFilterPanelProps> = ({
  filters,
  phaseVisibilityMode = "single",
  phaseColorMode = "single",
  allowedVisibilityProperties,
  allowedColorProperties,
  defaultVisibilityKey = null,
  visibilitySliderStyle = "range",
  visibilityScoreValues = [],
  onVisibilityKeyChange,
  onVisibilityRangeChange,
  onResetVisibility,
  onMultiVisibilityChange,
  onMultiVisibilityRangeChange,
  onColorKeyChange,
  allCategoricalValues = {},
  visibilityRangeOverride,
}) => {
  // ── Helpers ──────────────────────────────────────────────────────────────
  const filterProps = (
    base: PropertyDefinition[],
    allowed?: AllowedProperty[],
  ): PropertyDefinition[] => {
    if (!allowed || allowed.length === 0) return base;
    const allowedSet = new Set<string>(allowed);
    return base.filter((p) => allowedSet.has(p.key));
  };

  const visibilityList = useMemo(
    () => filterProps(visibilityProperties(), allowedVisibilityProperties),
    [allowedVisibilityProperties],
  );
  const colorList = useMemo(
    () => filterProps(colorProperties(), allowedColorProperties),
    [allowedColorProperties],
  );

  const colorProp = filters.color.propertyKey
    ? getPropertyByKey(filters.color.propertyKey)
    : null;

  // ── Single-property visibility setup (existing behaviour) ────────────────
  const visProp = filters.visibility.propertyKey
    ? getPropertyByKey(filters.visibility.propertyKey)
    : null;

  /** Composite is always interpreted on [0, 1] with higher values more informative. */
  const compositeDomainLock = filters.visibility.propertyKey === "composite";
  const effectivePropMin = compositeDomainLock
    ? 0
    : visibilityRangeOverride?.min ?? visProp?.range?.[0];
  const effectivePropMax = compositeDomainLock
    ? 1
    : visibilityRangeOverride?.max ?? visProp?.range?.[1];
  const effectivePropStep = compositeDomainLock ? 0.01 : visibilityRangeOverride?.step;

  const sliderConfig = useMemo(() => {
    if (!visProp || effectivePropMin === undefined || effectivePropMax === undefined) return null;
    const [propMin, propMax] = [effectivePropMin, effectivePropMax];
    const span = propMax - propMin;

    const domainLo = propMin + filters.visibility.range[0] * span;
    const domainHi = propMin + filters.visibility.range[1] * span;

    if (visProp.filterMode === "stepped") {
      const step = span / ((visProp.steps ?? 1) - 1);
      return {
        min: propMin,
        max: propMax,
        step,
        value: [domainLo, domainHi] as [number, number],
        marks: (visProp.steps ?? 0) > 12
          ? visProp.stepLabels?.reduce<Record<number, string>>((acc, _label, i) => {
              acc[propMin + i * step] = "";
              return acc;
            }, {})
          : visProp.stepLabels?.reduce<Record<number, string>>((acc, label, i) => {
              acc[propMin + i * step] = label;
              return acc;
            }, {}),
        tipFormatter: (v?: number) => {
          if (v === undefined) return "";
          const idx = Math.round((v - propMin) / step);
          return visProp.stepLabels?.[idx] ?? v.toString();
        },
      };
    }

    return {
      min: propMin,
      max: propMax,
      step: effectivePropStep ?? 0.01,
      value: [domainLo, domainHi] as [number, number],
      marks: { [propMin]: propMin.toFixed(1), [propMax]: propMax.toFixed(1) },
      tipFormatter: (v?: number) => (v !== undefined ? v.toFixed(2) : ""),
    };
  }, [visProp, filters.visibility.range, effectivePropMin, effectivePropMax, effectivePropStep]);

  const handleSliderChange = (vals: number[]) => {
    if (effectivePropMin === undefined || effectivePropMax === undefined) return;
    const span = effectivePropMax - effectivePropMin;
    onVisibilityRangeChange([
      (vals[0] - effectivePropMin) / span,
      (vals[1] - effectivePropMin) / span,
    ]);
  };

  const handleThresholdChange = (val: number) => {
    if (effectivePropMin === undefined || effectivePropMax === undefined) return;
    const span = effectivePropMax - effectivePropMin;
    // Snap to the configured slider step so users pick discrete values
    // (e.g. 0.0, 0.1, 0.2 …) rather than an arbitrary range.
    const step = sliderConfig?.step ?? effectivePropStep ?? 0.01;
    const snapped = step > 0 ? Math.round(val / step) * step : val;
    const norm = span === 0 ? 0 : (snapped - effectivePropMin) / span;
    // Store as [min, 1] so existing consumers treat it as a visible range.
    onVisibilityRangeChange([Math.max(0, Math.min(1, norm)), 1]);
  };

  const legendEntries = useMemo(() => {
    if (!colorProp) return [];
    return buildLegend(colorProp.key, allCategoricalValues[colorProp.key]);
  }, [colorProp, allCategoricalValues]);

  // ── Select option groups (shared helper) ─────────────────────────────────
  const makeOptions = (props: PropertyDefinition[], includeNone: boolean) => {
    const samplers = props.filter((p) => p.category === "sampler");
    const meta = props.filter((p) => p.category === "metadata");
    return (
      <>
        {includeNone && (
          <Option value={NONE}>
            <span className="italic text-gray-400">None</span>
          </Option>
        )}
        {samplers.length > 0 && (
          <OptGroup label="Sampler Suite">
            {samplers.map((p) => (
              <Option key={p.key} value={p.key}>
                {p.label}
              </Option>
            ))}
          </OptGroup>
        )}
        {meta.length > 0 && (
          <OptGroup label="Metadata">
            {meta.map((p) => (
              <Option key={p.key} value={p.key}>
                {p.label}
              </Option>
            ))}
          </OptGroup>
        )}
      </>
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────
  const showVisibility = phaseVisibilityMode !== "disabled";
  const showColor = phaseColorMode !== "disabled";

  if (!showVisibility && !showColor) return null;

  // Special case: single visibility filter with only one available property.
  // Auto-select and optionally render a threshold slider (no dropdown).
  const isFixedVisibility = phaseVisibilityMode === "fixed";
  const effectiveDefaultKey = useMemo(() => {
    if (phaseVisibilityMode !== "single" && !isFixedVisibility) return null;
    if (defaultVisibilityKey && visibilityList.some((p) => p.key === defaultVisibilityKey)) return defaultVisibilityKey;
    if (visibilityList.length === 1) return visibilityList[0].key;
    return null;
  }, [phaseVisibilityMode, isFixedVisibility, defaultVisibilityKey, visibilityList]);

  // Hide dropdown when there is only one option, or the filter is fixed.
  const hideVisibilityDropdown =
    isFixedVisibility || (phaseVisibilityMode === "single" && visibilityList.length === 1);
  const useThresholdSlider = isFixedVisibility || visibilitySliderStyle === "threshold";

  // Normalise sliderConfig domain values → [0,1] fractions for HistogramSlider.
  // sliderConfig.value is in domain units (e.g. 0.0–1.0 for composite, 1–12 for year_cycle).
  const histRange = useMemo<[number, number]>(() => {
    if (!sliderConfig) return [0, 1];
    const { min, max } = sliderConfig;
    const span = max - min || 1;
    if (useThresholdSlider) {
      return [Math.max(0, Math.min(1, (sliderConfig.value[0] - min) / span)), 1];
    }
    return [
      Math.max(0, Math.min(1, (sliderConfig.value[0] - min) / span)),
      Math.max(0, Math.min(1, (sliderConfig.value[1] - min) / span)),
    ];
  }, [sliderConfig, useThresholdSlider]);

  useEffect(() => {
    if (phaseVisibilityMode !== "single") return;
    const target = effectiveDefaultKey;
    if (!target) return;
    if (filters.visibility.propertyKey !== target) {
      onVisibilityKeyChange(target);
    }
  }, [phaseVisibilityMode, effectiveDefaultKey, filters.visibility.propertyKey, onVisibilityKeyChange]);

  return (
    <div className="flex flex-col gap-4 px-4 py-3 border-b border-gray-100 bg-white">
      <div className="flex flex-wrap gap-6 items-start">
        {showVisibility && (
          <div className="flex flex-col gap-2 min-w-[200px] flex-1">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5">
                <EyeOutlined className="text-gray-400 text-xs" />
                <span className="text-xs font-semibold text-gray-600 font-ibm-sans tracking-wide uppercase">
                  Visibility Filter {phaseVisibilityMode === "multi" ? "(combine)" : ""}
                </span>
              </div>
              {!isFixedVisibility && onResetVisibility && (filters.visibility.range?.[0] ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={onResetVisibility}
                  className="text-[11px] text-blue-500 hover:text-blue-700 font-ibm-sans underline"
                >
                  Reset
                </button>
              )}
            </div>

            {(phaseVisibilityMode === "single" || isFixedVisibility) ? (
              <>
                {!hideVisibilityDropdown && (
                  <Select
                    size="small"
                    value={filters.visibility.propertyKey ?? NONE}
                    onChange={(v: string) => onVisibilityKeyChange(v === NONE ? null : v)}
                    style={{ width: "100%" }}
                  >
                    {makeOptions(visibilityList, true)}
                  </Select>
                )}

                {visProp && sliderConfig && (
                  <div className="px-1 pt-1">
                    {visibilityScoreValues.length > 0 ? (
                      <HistogramSlider
                        values={visibilityScoreValues}
                        min={sliderConfig.min}
                        max={sliderConfig.max}
                        mode={useThresholdSlider ? "threshold" : "range"}
                        range={histRange}
                        disabled={isFixedVisibility}
                        label={
                          useThresholdSlider
                            ? `threshold: ${sliderConfig.value[0].toFixed(2)}`
                            : `${sliderConfig.value[0].toFixed(2)} – ${sliderConfig.value[1].toFixed(2)}`
                        }
                        onChange={(newNormRange) => {
                          const span = sliderConfig.max - sliderConfig.min;
                          if (useThresholdSlider) {
                            handleThresholdChange(sliderConfig.min + newNormRange[0] * span);
                          } else {
                            handleSliderChange([
                              sliderConfig.min + newNormRange[0] * span,
                              sliderConfig.min + newNormRange[1] * span,
                            ]);
                          }
                        }}
                      />
                    ) : useThresholdSlider ? (
                      <Slider
                        min={sliderConfig.min}
                        max={sliderConfig.max}
                        step={sliderConfig.step}
                        value={sliderConfig.value[0]}
                        marks={sliderConfig.marks}
                        onChange={(v) => handleThresholdChange(v as number)}
                        tooltip={{ formatter: sliderConfig.tipFormatter }}
                        included={false}
                        disabled={isFixedVisibility}
                        styles={{
                          track: { backgroundColor: "#3b82f6" },
                          handle: { borderColor: "#3b82f6" },
                        }}
                      />
                    ) : (
                      <Slider
                        range
                        min={sliderConfig.min}
                        max={sliderConfig.max}
                        step={sliderConfig.step}
                        value={sliderConfig.value}
                        marks={sliderConfig.marks}
                        onChange={handleSliderChange}
                        tooltip={{ formatter: sliderConfig.tipFormatter }}
                        styles={{
                          track: { backgroundColor: "#3b82f6" },
                          handle: { borderColor: "#3b82f6" },
                        }}
                      />
                    )}
                  </div>
                )}
              </>
            ) : (
              <MultiVisibilityControls
                filters={filters}
                visibilityList={visibilityList}
                onMultiVisibilityChange={onMultiVisibilityChange}
                onMultiVisibilityRangeChange={onMultiVisibilityRangeChange}
              />
            )}
          </div>
        )}

        {showVisibility && showColor && (
          <div className="hidden sm:block w-px bg-gray-100 self-stretch" />
        )}

        {showColor && (
          <div className="flex flex-col gap-2 min-w-[200px] flex-1">
            <div className="flex items-center gap-1.5">
              <BgColorsOutlined className="text-gray-400 text-xs" />
              <span className="text-xs font-semibold text-gray-600 font-ibm-sans tracking-wide uppercase">
                Color Filter
              </span>
            </div>

            <Select
              size="small"
              value={filters.color.propertyKey ?? NONE}
              onChange={(v: string) => onColorKeyChange(v === NONE ? null : v)}
              style={{ width: "100%" }}
            >
              {makeOptions(colorList, true)}
            </Select>

            {colorProp && legendEntries.length > 0 && (
              <div className="mt-1">
                {colorProp.filterMode === "continuous" ? (
                  <ContinuousLegendBar
                    minLabel={legendEntries[0].label}
                    maxLabel={legendEntries[legendEntries.length - 1].label}
                  />
                ) : (
                  <DiscreteLegendChips entries={legendEntries} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Multi-property visibility sub-component ──────────────────────────────────

interface MultiVisibilityControlsProps {
  filters: ALFilterState;
  visibilityList: PropertyDefinition[];
  onMultiVisibilityChange?: (keys: string[]) => void;
  onMultiVisibilityRangeChange?: (key: string, range: [number, number]) => void;
}

const MultiVisibilityControls: React.FC<MultiVisibilityControlsProps> = ({
  filters,
  visibilityList,
  onMultiVisibilityChange,
  onMultiVisibilityRangeChange,
}) => {
  const selectedKeys = filters.visibility.propertyKeys ?? [];
  const ranges = filters.visibility.ranges ?? {};

  return (
    <>
      <Select
        size="small"
        mode="multiple"
        allowClear
        placeholder="Select one or more properties"
        value={selectedKeys}
        onChange={(v: string[]) => onMultiVisibilityChange?.(v)}
        style={{ width: "100%" }}
      >
        {visibilityList.map((p) => (
          <Option key={p.key} value={p.key}>
            {p.label}
          </Option>
        ))}
      </Select>

      <div className="flex flex-col gap-3 mt-2">
        {selectedKeys.map((key) => {
          const prop = getPropertyByKey(key);
          if (!prop || !prop.range) return null;
          const [pMin, pMax] = prop.range;
          const span = pMax - pMin;
          const [normLo, normHi] = ranges[key] ?? [0, 1];
          const domainLo = pMin + normLo * span;
          const domainHi = pMin + normHi * span;
          return (
            <div key={key} className="px-1">
              <div className="flex justify-between mb-0.5">
                <span className="text-[10px] text-gray-500 font-ibm-mono">{prop.label}</span>
                <span className="text-[10px] text-gray-400 font-ibm-mono">
                  {domainLo.toFixed(2)} – {domainHi.toFixed(2)}
                </span>
              </div>
              <Slider
                range
                min={pMin}
                max={pMax}
                step={(span) / 100}
                value={[domainLo, domainHi]}
                onChange={(vals: number[]) => {
                  if (span === 0) return;
                  onMultiVisibilityRangeChange?.(key, [
                    (vals[0] - pMin) / span,
                    (vals[1] - pMin) / span,
                  ]);
                }}
                tooltip={{ formatter: (v?: number) => (v !== undefined ? v.toFixed(2) : "") }}
                styles={{
                  track: { backgroundColor: "#3b82f6" },
                  handle: { borderColor: "#3b82f6" },
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── Legend sub-components ─────────────────────────────────────────────────────

const ContinuousLegendBar: React.FC<{ minLabel: string; maxLabel: string }> = ({
  minLabel,
  maxLabel,
}) => (
  <div>
    <div
      className="h-2.5 rounded"
      style={{ background: GRADIENT_BAR }}
    />
    <div className="flex justify-between mt-0.5">
      <span className="text-[10px] text-gray-400 font-ibm-mono">{minLabel}</span>
      <span className="text-[10px] text-gray-400 font-ibm-mono">{maxLabel}</span>
    </div>
  </div>
);

interface LegendEntry {
  label: string;
  color: string;
}

const DiscreteLegendChips: React.FC<{ entries: LegendEntry[] }> = ({ entries }) => (
  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
    {entries.map((e) => (
      <Tooltip key={e.label} title={e.label} mouseEnterDelay={0.5}>
        <Tag
          style={{
            backgroundColor: e.color,
            color: "#fff",
            borderColor: "transparent",
            fontSize: 10,
            padding: "0 6px",
            lineHeight: "18px",
            fontFamily: "IBM Plex Mono, monospace",
            maxWidth: 80,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {e.label}
        </Tag>
      </Tooltip>
    ))}
  </div>
);

// (Suppress unused import warning for AL_PROPERTIES — kept for future refactors)
void AL_PROPERTIES;
