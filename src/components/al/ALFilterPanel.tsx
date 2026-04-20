/**
 * ALFilterPanel
 *
 * Two independent filter controls that sit above the scatter plot:
 *
 *   • Visibility Filter — range slider (continuous / stepped) to hide points
 *                         outside the chosen window. Categorical properties are
 *                         excluded here (range-filtering doesn't apply).
 *
 *   • Color Filter — maps any property (including categorical) to a colour.
 *
 * Both selects offer "None" as the first option to disable that filter.
 */

import React, { useMemo } from "react";
import { Select, Slider, Tooltip, Tag } from "antd";
import { EyeOutlined, BgColorsOutlined } from "@ant-design/icons";
import {
  AL_PROPERTIES,
  visibilityProperties,
  colorProperties,
  getPropertyByKey,
} from "../../constants/alProperties";
import type { ALFilterState } from "../../types/al";
import {
  continuousGradient,
  buildLegend,
} from "../../utils/alColors";

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
  /** Called when visibility property changes */
  onVisibilityKeyChange: (key: string | null) => void;
  /** Called when visibility range changes (normalised [0,1]) */
  onVisibilityRangeChange: (range: [number, number]) => void;
  /** Called when color property changes */
  onColorKeyChange: (key: string | null) => void;
  /** All categorical values per property key — needed for dynamic legends */
  allCategoricalValues?: Record<string, string[]>;
  /** Real min/max/step fetched from backend — overrides the static property definition */
  visibilityRangeOverride?: { min: number; max: number; step: number };
}

export const ALFilterPanel: React.FC<ALFilterPanelProps> = ({
  filters,
  onVisibilityKeyChange,
  onVisibilityRangeChange,
  onColorKeyChange,
  allCategoricalValues = {},
  visibilityRangeOverride,
}) => {
  const visProp = filters.visibility.propertyKey
    ? getPropertyByKey(filters.visibility.propertyKey)
    : null;

  const colorProp = filters.color.propertyKey
    ? getPropertyByKey(filters.color.propertyKey)
    : null;

  // Prefer the API-fetched range; fall back to the static property definition.
  const effectivePropMin = visibilityRangeOverride?.min ?? visProp?.range?.[0];
  const effectivePropMax = visibilityRangeOverride?.max ?? visProp?.range?.[1];
  const effectivePropStep = visibilityRangeOverride?.step;

  // ── Slider configuration ──────────────────────────────────────────────────
  const sliderConfig = useMemo(() => {
    if (!visProp || effectivePropMin === undefined || effectivePropMax === undefined) return null;
    const [propMin, propMax] = [effectivePropMin, effectivePropMax];
    const span = propMax - propMin;

    // Convert normalised [0,1] back to domain values for the slider
    const domainLo = propMin + filters.visibility.range[0] * span;
    const domainHi = propMin + filters.visibility.range[1] * span;

    if (visProp.filterMode === "stepped") {
      const step = span / ((visProp.steps ?? 1) - 1);
      return {
        min: propMin,
        max: propMax,
        step,
        value: [domainLo, domainHi] as [number, number],
        // For dense stepped properties (>12 steps) suppress all mark labels to
        // avoid overlap — the tooltip + min/max extremes below the slider are enough.
        marks: (visProp.steps ?? 0) > 12
          ? visProp.stepLabels?.reduce<Record<number, string>>((acc, _label, i) => {
              acc[propMin + i * step] = ""; // dot only, no text
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

    // Continuous
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

  // ── Legend entries ────────────────────────────────────────────────────────
  const legendEntries = useMemo(() => {
    if (!colorProp) return [];
    return buildLegend(colorProp.key, allCategoricalValues[colorProp.key]);
  }, [colorProp, allCategoricalValues]);

  // ── Select option groups (shared helper) ─────────────────────────────────
  const makeOptions = (props: typeof AL_PROPERTIES) => {
    const samplers = props.filter((p) => p.category === "sampler");
    const meta = props.filter((p) => p.category === "metadata");
    return (
      <>
        <Option value={NONE}>
          <span className="italic text-gray-400">None</span>
        </Option>
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

  return (
    <div className="flex flex-col gap-4 px-4 py-3 border-b border-gray-100 bg-white">
      <div className="flex flex-wrap gap-6 items-start">

        {/* ── Visibility Filter ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 min-w-[200px] flex-1">
          <div className="flex items-center gap-1.5">
            <EyeOutlined className="text-gray-400 text-xs" />
            <span className="text-xs font-semibold text-gray-600 font-ibm-sans tracking-wide uppercase">
              Visibility Filter
            </span>
          </div>

          <Select
            size="small"
            value={filters.visibility.propertyKey ?? NONE}
            onChange={(v: string) => onVisibilityKeyChange(v === NONE ? null : v)}
            style={{ width: "100%" }}
          >
            {makeOptions(visibilityProperties())}
          </Select>

          {/* Range slider — shown only when a property is selected */}
          {visProp && sliderConfig && (
            <div className="px-1 pt-1">
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
              {/* Extreme labels only — no hardcoded property names */}
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400 font-ibm-mono">
                  {sliderConfig.tipFormatter(sliderConfig.min)}
                </span>
                <span className="text-[10px] text-gray-400 font-ibm-mono">
                  {sliderConfig.tipFormatter(sliderConfig.max)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-gray-100 self-stretch" />

        {/* ── Color Filter ──────────────────────────────────────────────── */}
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
            {makeOptions(colorProperties())}
          </Select>

          {/* Legend */}
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

      </div>
    </div>
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
