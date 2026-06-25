import React from "react";
import { Select, InputNumber, Badge, Tooltip, Button, Popover } from "antd";
import {
  UnorderedListOutlined,
  AudioOutlined,
  ThunderboltOutlined,
  DotChartOutlined,
  SafetyOutlined,
  InfoCircleOutlined,
  FilterOutlined,
  ReloadOutlined,
  AimOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DownOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import type { AnnotateMode } from "../annotationHub/types";
import type { LabelScopeOption } from "../annotationHub/useHubALSession";
import { ScoreHistogramPanel } from "../../components/al/ScoreHistogramPanel";
import { useAppDispatch } from "../../hooks";
import {
  setVisibilityFilter,
  setVisibilityKeys,
  setVisibilityRangeFor,
  resetVisibilityFilter,
} from "../../redux/features/alSlice";
import { useScoreHistogramData } from "./useScoreHistogramData";
import type { AllowedProperty } from "../../studyPhases";

// Phase 3.1 visibility config — hardcoded for V2 AI mode
const P3_VISIBILITY_MODE = "single" as const;
const P3_SLIDER_STYLE = "threshold" as const;
const P3_ALLOWED_PROPERTIES: AllowedProperty[] = [
  "uncertainty",
  "diversity",
  "density",
  "confidence",
];

const METRIC_SORT_OPTIONS: {
  value: AllowedProperty;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "uncertainty", label: "Uncertainty", icon: <ThunderboltOutlined /> },
  { value: "diversity", label: "Diversity", icon: <DotChartOutlined /> },
  { value: "density", label: "Density", icon: <AimOutlined /> },
  { value: "confidence", label: "Confidence", icon: <SafetyOutlined /> },
];

export type V2SidebarProps = {
  mode: AnnotateMode;
  setMode: (m: AnnotateMode) => void;
  filterAnnotationStatus: "any" | "annotated" | "unannotated";
  onFilterAnnotationStatusChange: (v: "any" | "annotated" | "unannotated") => void;
  filterLocations: string[];
  onFilterLocationsChange: (v: string[]) => void;
  recordingLocations: string[];
  locationsLoading: boolean;
  localLabelScope: string[];
  setLocalLabelScope: (v: string[]) => void;
  localMinConfidence: number | null;
  setLocalMinConfidence: (v: number | null) => void;
  labelScopeOptions: LabelScopeOption[];
  labelScopeLoading: boolean;
  onResetFilters: () => void;
};

export const V2AnnotationHubSidebar: React.FC<V2SidebarProps> = ({
  mode,
  setMode,
  filterAnnotationStatus,
  onFilterAnnotationStatusChange,
  filterLocations,
  onFilterLocationsChange,
  recordingLocations,
  locationsLoading,
  localLabelScope,
  setLocalLabelScope,
  localMinConfidence,
  setLocalMinConfidence,
  labelScopeOptions,
  labelScopeLoading,
  onResetFilters,
}) => {
  const dispatch = useAppDispatch();

  const { enrichedPlotPoints, filtered, alFilters } = useScoreHistogramData(
    P3_VISIBILITY_MODE,
    P3_SLIDER_STYLE,
  );

  const activeFilterCount = [
    filterAnnotationStatus !== "any" ? 1 : 0,
    filterLocations.length > 0 ? 1 : 0,
    localLabelScope.length > 0 ? 1 : 0,
    localMinConfidence !== null ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const hasActiveFilters = activeFilterCount > 0;
  const activeMetric =
    alFilters.visibility.propertyKey ?? P3_ALLOWED_PROPERTIES[0];
  const selectedSortLabel =
    mode === "random"
      ? "Shuffle"
      : METRIC_SORT_OPTIONS.find((opt) => opt.value === activeMetric)?.label ?? "Uncertainty";
  const setScoreMetric = (metric: AllowedProperty) => {
    setMode("al");
    dispatch(
      setVisibilityFilter({
        propertyKey: metric,
        range: alFilters.visibility.range ?? [0, 1],
      }),
    );
  };
  const sortMenu = (
    <div className="w-56 py-1 font-ibm-sans">
      <button
        type="button"
        onClick={() => setMode("random")}
        className={[
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
          mode === "random"
            ? "bg-blue-50 text-blue-700"
            : "text-gray-700 hover:bg-gray-50",
        ].join(" ")}
      >
        <UnorderedListOutlined className="text-gray-400" />
        <span className="flex-1">Shuffle</span>
        {mode === "random" && <CheckOutlined className="text-blue-500" />}
      </button>
      <div className="my-1 border-t border-gray-100" />
      {METRIC_SORT_OPTIONS.map((opt) => {
        const isActive =
          mode !== "random" &&
          mode !== "similarity" &&
          activeMetric === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setScoreMetric(opt.value)}
            className={[
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
              isActive ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50",
            ].join(" ")}
          >
            <span className={isActive ? "text-blue-500" : "text-gray-400"}>
              {opt.icon}
            </span>
            <span className="flex-1">{opt.label}</span>
            {isActive && <CheckOutlined className="text-blue-500" />}
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="flex h-full w-[272px] flex-shrink-0 flex-col overflow-y-auto border-r border-gray-200 bg-white">
      {/* Sort Section */}
      <section className="border-b border-gray-100 px-4 py-4">
        <Popover
          trigger="click"
          placement="bottomLeft"
          content={sortMenu}
          overlayInnerStyle={{ padding: 0, borderRadius: 6 }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-3.5 py-2.5 text-left font-ibm-sans text-sm font-medium text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm"
          >
            <span className="flex items-center text-[13px] text-gray-400">
              <ArrowDownOutlined />
              <ArrowUpOutlined className="-ml-1" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="text-gray-500">Sort:</span>{" "}
              <span className="font-semibold text-gray-700">{selectedSortLabel}</span>
            </span>
            <DownOutlined className="text-[9px] text-gray-400" />
          </button>
        </Popover>

        {/* Score Histogram */}
        <div className="mt-3 -mx-4">
          <ScoreHistogramPanel
            enrichedPlotPoints={enrichedPlotPoints}
            filtered={filtered}
            allowedProperties={P3_ALLOWED_PROPERTIES}
            visibilityMode={P3_VISIBILITY_MODE}
            alFilters={alFilters}
            sliderMode={P3_SLIDER_STYLE}
            compact
            onVisibilityKeyChange={(key) =>
              dispatch(setVisibilityFilter({ propertyKey: key, range: [0, 1] }))
            }
            onVisibilityRangeChange={(range) =>
              dispatch(setVisibilityFilter({ range }))
            }
            onMultiVisibilityChange={(keys) =>
              dispatch(setVisibilityKeys(keys))
            }
            onMultiVisibilityRangeChange={(key, range) =>
              dispatch(setVisibilityRangeFor({ key, range }))
            }
            onReset={() => dispatch(resetVisibilityFilter())}
          />
        </div>
      </section>

      <section className="border-b border-gray-100 px-3 py-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400 font-ibm-sans">
          Similarity
        </p>
        <button
          type="button"
          onClick={() => setMode("similarity")}
          className={[
            "flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left font-ibm-sans transition-all",
            mode === "similarity"
              ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800",
          ].join(" ")}
        >
          <AudioOutlined className={mode === "similarity" ? "text-blue-500" : "text-gray-400"} />
          <span className="truncate text-[12px] font-medium">
            Find similar snippets
          </span>
        </button>
      </section>

      <section className="border-b border-gray-100 px-3 py-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400 font-ibm-sans">
            <FilterOutlined />
            Filters
          </p>
          {hasActiveFilters && (
            <div className="flex items-center gap-2">
              <Badge count={activeFilterCount} size="small" color="#3b82f6" />
              <Tooltip title="Reset filters">
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={onResetFilters}
                  className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                  aria-label="Reset filters"
                />
              </Tooltip>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <div>
            <p className="mb-1 text-[11px] font-medium text-gray-500 font-ibm-sans">
              Annotation Status
            </p>
            <Select
              value={filterAnnotationStatus}
              onChange={onFilterAnnotationStatusChange}
              style={{ width: "100%" }}
              size="small"
              options={[
                { value: "any", label: "Any" },
                { value: "unannotated", label: "Unannotated" },
                { value: "annotated", label: "Annotated" },
              ]}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-gray-500 font-ibm-sans">
              Location
            </p>
            <Select
              mode="multiple"
              allowClear
              showSearch
              size="small"
              placeholder="Any location"
              loading={locationsLoading}
              value={filterLocations}
              onChange={onFilterLocationsChange}
              style={{ width: "100%" }}
              options={recordingLocations.map((loc) => ({ value: loc, label: loc }))}
              maxTagCount={1}
              notFoundContent={locationsLoading ? "Loading…" : "No locations"}
            />
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-gray-500 font-ibm-sans">
              Focus on Species
            </p>
            <Select
              mode="multiple"
              allowClear
              size="small"
              placeholder={labelScopeLoading ? "Loading…" : "All species"}
              loading={labelScopeLoading}
              value={localLabelScope}
              onChange={setLocalLabelScope}
              style={{ width: "100%" }}
              options={labelScopeOptions.map((opt) => ({
                value: opt.value,
                label: (
                  <span className={opt.disabled ? "text-gray-400" : undefined}>
                    {opt.label}
                    {opt.tooltip && (
                      <Tooltip title={opt.tooltip}>
                        <InfoCircleOutlined className="ml-1 text-gray-400" />
                      </Tooltip>
                    )}
                  </span>
                ),
                disabled: opt.disabled,
              }))}
              maxTagCount={1}
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-gray-500 font-ibm-sans">
                Min Confidence
              </p>
              {localMinConfidence !== null && (
                <button
                  type="button"
                  onClick={() => setLocalMinConfidence(null)}
                  className="text-[10px] text-gray-400 hover:text-gray-700"
                >
                  Clear
                </button>
              )}
            </div>
            <InputNumber
              min={0}
              max={1}
              step={0.05}
              size="small"
              value={localMinConfidence ?? undefined}
              onChange={(v) =>
                setLocalMinConfidence(v == null || Number.isNaN(v) ? null : v)
              }
              style={{ width: "100%" }}
              placeholder="e.g. 0.7"
            />
          </div>

          {filterAnnotationStatus === "any" && filterLocations.length === 0 && localLabelScope.length === 0 && localMinConfidence === null && (
            <p className="text-[11px] italic text-gray-400 font-ibm-sans">
              No filters active
            </p>
          )}
        </div>
      </section>

    </aside>
  );
};

V2AnnotationHubSidebar.displayName = "V2AnnotationHubSidebar";
