import React, { useMemo, useState } from "react";
import { Empty, Input, Popover, Select, Spin, Tooltip, Segmented } from "antd";
import {
  CheckOutlined,
  CloseCircleOutlined,
  DownOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  TagsOutlined,
  AudioOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import type { AnnotateMode } from "./types";
import type { LabelScopeOption } from "./useHubALSession";
import { ScoreHistogramPanel } from "../../components/al/ScoreHistogramPanel";
import { useAppDispatch } from "../../hooks";
import {
  setVisibilityFilter,
  setVisibilityKeys,
  setVisibilityRangeFor,
  resetVisibilityFilter,
} from "../../redux/features/alSlice";
import { useScoreHistogramData } from "./useScoreHistogramData";
import {
  useDateTimeFilterData,
  TIME_OF_DAY_DOMAIN,
} from "./useDateTimeFilterData";
import {
  formatDateAxisLabel,
  formatTimeAxisLabel,
} from "./dateTimeFilterHelpers";
import { DateTimeRangeFilter } from "./DateTimeRangeFilter";
import { DateRangeCalendarPicker } from "./DateRangeCalendarPicker";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  SCORE_VISIBILITY_MODE,
  SCORE_SLIDER_STYLE,
  SCORE_ALLOWED_PROPERTIES,
} from "./scoreFilterConfig";

export type AnnotationHubSidebarProps = {
  mode: AnnotateMode;
  setMode: (m: AnnotateMode) => void;
  filterAnnotationStatus: "any" | "annotated" | "unannotated";
  onFilterAnnotationStatusChange: (
    v: "any" | "annotated" | "unannotated",
  ) => void;
  filterLocations: string[];
  onFilterLocationsChange: (v: string[]) => void;
  recordingLocations: string[];
  locationsLoading: boolean;
  filterDateRange: [number, number] | null;
  onFilterDateRangeChange: (v: [number, number] | null) => void;
  /** Fixed calendar-set display window for the date histogram (null = show the full domain). */
  dateZoomDomain: [number, number] | null;
  /** Used by the calendar picker only — also updates dateZoomDomain, unlike the slider's onFilterDateRangeChange. */
  onCalendarDateRangeChange: (v: [number, number] | null) => void;
  filterTimeRange: [number, number] | null;
  onFilterTimeRangeChange: (v: [number, number] | null) => void;
  localLabelScope: string[];
  setLocalLabelScope: (v: string[]) => void;
  localMinConfidence: number | null;
  setLocalMinConfidence: (v: number | null) => void;
  labelScopeOptions: LabelScopeOption[];
  labelScopeLoading: boolean;
  onResetFilters: () => void;
  showSampleProperties: boolean;
  showModelScores: boolean;
  showFindSimilar: boolean;
  showLabelScope: boolean;
};

/** Deterministic varied bar heights (%) so the skeleton reads as a histogram, not a grey block. */
const SKELETON_BAR_HEIGHTS = [
  35, 55, 40, 70, 50, 30, 65, 45, 80, 55, 40, 60, 35, 50, 70, 45, 60, 40, 55,
  30, 65, 50, 40, 75, 45, 60, 35, 50,
];

const HistogramSkeleton: React.FC<{ binCount: number }> = ({ binCount }) => (
  <div className="flex flex-col gap-1.5 animate-pulse">
    <div className="flex items-center gap-1.5">
      <div className="h-3 w-3 rounded-full bg-gray-100" />
      <div className="h-2.5 w-20 rounded bg-gray-100" />
    </div>
    <div className="flex items-end gap-0.5 h-6.5">
      {SKELETON_BAR_HEIGHTS.slice(0, binCount).map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-gray-100"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
    <div className="flex justify-between">
      <div className="h-2 w-10 rounded bg-gray-100" />
      <div className="h-2 w-10 rounded bg-gray-100" />
    </div>
  </div>
);

const DateTimeFilterSkeleton: React.FC = () => (
  <div className="flex flex-col gap-2.5">
    <div className="flex flex-col gap-1">
      <div className="h-6 w-full rounded-md bg-gray-100 animate-pulse" />
      <HistogramSkeleton binCount={28} />
    </div>
    <HistogramSkeleton binCount={24} />
  </div>
);

/**
 * Collapsible sub-group within a top-level sidebar section (e.g. "Sample
 * Properties", "Model derived scores" inside "Filters") — lets users fold
 * away a category they're not using so the panel fits without scrolling,
 * instead of always showing every control at once.
 */
const SidebarSubsection: React.FC<{
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="mb-1.5 flex w-full cursor-pointer items-center justify-between gap-2 text-left group"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 font-ibm-sans transition-colors group-hover:text-gray-600">
          {title}
        </span>
        <DownOutlined
          className={[
            "text-[8px] text-gray-300 transition-transform duration-200 group-hover:text-gray-500",
            open ? "" : "-rotate-90",
          ].join(" ")}
        />
      </div>
      <div
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2.5">{children}</div>
        </div>
      </div>
    </div>
  );
};

export const AnnotationHubSidebar: React.FC<AnnotationHubSidebarProps> = ({
  mode,
  setMode,
  filterAnnotationStatus,
  onFilterAnnotationStatusChange,
  filterLocations,
  onFilterLocationsChange,
  recordingLocations,
  locationsLoading,
  filterDateRange,
  onFilterDateRangeChange,
  dateZoomDomain,
  onCalendarDateRangeChange,
  filterTimeRange,
  onFilterTimeRangeChange,
  localLabelScope,
  setLocalLabelScope,
  labelScopeOptions,
  labelScopeLoading,
  onResetFilters,
  showSampleProperties,
  showModelScores,
  showFindSimilar,
  showLabelScope,
}) => {
  const dispatch = useAppDispatch();
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelSearch, setLabelSearch] = useState("");

  const { enrichedPlotPoints, filtered, alFilters } = useScoreHistogramData(
    SCORE_VISIBILITY_MODE,
    SCORE_SLIDER_STYLE,
  );
  const dateTimeData = useDateTimeFilterData();

  const activeFilterCount = [
    filterAnnotationStatus !== "any" ? 1 : 0,
    filterLocations.length > 0 ? 1 : 0,
    filterDateRange !== null ? 1 : 0,
    filterTimeRange !== null ? 1 : 0,
    localLabelScope.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const hasActiveFilters = activeFilterCount > 0;
  const selectedLabelSet = useMemo(
    () => new Set(localLabelScope),
    [localLabelScope],
  );
  const filteredLabelOptions = useMemo(() => {
    const q = labelSearch.trim().toLowerCase();
    if (!q) return labelScopeOptions;
    return labelScopeOptions.filter((opt) =>
      opt.label.toLowerCase().includes(q),
    );
  }, [labelScopeOptions, labelSearch]);
  const labelSummary =
    localLabelScope.length === 0
      ? "All labels"
      : `${localLabelScope.length} label${localLabelScope.length === 1 ? "" : "s"} selected`;

  const toggleLabelScope = (label: string) => {
    if (selectedLabelSet.has(label)) {
      setLocalLabelScope(localLabelScope.filter((v) => v !== label));
      return;
    }
    setLocalLabelScope([...localLabelScope, label]);
  };

  const labelPickerContent = (
    <div className="w-60 overflow-hidden rounded-lg bg-white">
      <div className="border-b border-gray-100 p-2">
        <Input
          size="small"
          allowClear
          autoFocus
          placeholder="Search labels"
          prefix={<SearchOutlined className="text-gray-400" />}
          value={labelSearch}
          onChange={(e) => setLabelSearch(e.target.value)}
          className="font-ibm-sans"
        />
      </div>
      <div className="max-h-65 overflow-y-auto p-1.5">
        {labelScopeLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
            <Spin size="small" /> Loading labels
          </div>
        ) : filteredLabelOptions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-xs text-gray-400">No labels</span>
            }
          />
        ) : (
          filteredLabelOptions.map((opt) => {
            const selected = selectedLabelSet.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                onClick={() => toggleLabelScope(opt.value)}
                className={[
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold font-ibm-sans transition-colors",
                  selected
                    ? "bg-blue-50 text-blue-800"
                    : "text-gray-700 hover:bg-gray-50",
                  opt.disabled
                    ? "cursor-not-allowed opacity-50"
                    : "cursor-pointer",
                ].join(" ")}
              >
                <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                {opt.tooltip && (
                  <Tooltip title={opt.tooltip}>
                    <InfoCircleOutlined
                      className="shrink-0 text-gray-400"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Tooltip>
                )}
                <span
                  className={[
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    selected
                      ? "border-blue-500 bg-blue-500 text-white"
                      : "border-gray-300 bg-white text-transparent",
                  ].join(" ")}
                >
                  <CheckOutlined className="text-[9px]" />
                </span>
              </button>
            );
          })
        )}
      </div>
      {localLabelScope.length > 0 && (
        <div className="border-t border-gray-100 p-2">
          <button
            type="button"
            onClick={() => setLocalLabelScope([])}
            className="w-full rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            Clear selected labels
          </button>
        </div>
      )}
    </div>
  );

  return (
    <aside className="flex h-full w-full min-w-0 shrink-0 flex-col overflow-hidden bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CollapsibleSection
          title="Filters"
          headerExtra={
            <div className="flex items-center gap-1.5">
              {hasActiveFilters && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
              {hasActiveFilters && (
                <Tooltip title="Reset filters">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResetFilters();
                    }}
                    aria-label="Reset filters"
                    className="flex h-4 w-4 items-center justify-center text-gray-400 transition-colors hover:text-red-500"
                  >
                    <ReloadOutlined className="text-[10px]" />
                  </button>
                </Tooltip>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-2.5">
            {/* ── Status ── */}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 font-ibm-sans">
                Status
              </p>
              <Segmented
                block
                size="small"
                value={filterAnnotationStatus}
                onChange={(v) =>
                  onFilterAnnotationStatusChange(
                    v as "any" | "annotated" | "unannotated",
                  )
                }
                options={[
                  { value: "any", label: "All" },
                  { value: "unannotated", label: "Unlabeled" },
                  { value: "annotated", label: "Labeled" },
                ]}
                className={[
                  "rounded-lg! bg-gray-100! p-0.75!",
                  "[&_.ant-segmented-item]:rounded-md! [&_.ant-segmented-item]:font-ibm-sans",
                  "[&_.ant-segmented-item-selected]:bg-gray-900! [&_.ant-segmented-item-selected]:text-white! [&_.ant-segmented-item-selected]:shadow-none!",
                  "[&_.ant-segmented-thumb]:rounded-md! [&_.ant-segmented-thumb]:bg-gray-900!",
                ].join(" ")}
              />
            </div>

            {showSampleProperties && (
              <div className="border-t border-gray-100 pt-2.5">
                <SidebarSubsection title="Sample Properties">
                  <div>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 font-ibm-sans">
                      <EnvironmentOutlined className="text-gray-400" /> Location
                    </p>
                    <Select
                      mode="multiple"
                      allowClear
                      showSearch
                      size="small"
                      variant="borderless"
                      placeholder="Any location"
                      loading={locationsLoading}
                      value={filterLocations}
                      onChange={onFilterLocationsChange}
                      style={{ width: "100%" }}
                      options={recordingLocations.map((loc) => ({
                        value: loc,
                        label: loc,
                      }))}
                      maxTagCount={1}
                      notFoundContent={
                        locationsLoading ? "Loading…" : "No locations"
                      }
                      className={[
                        "[&_.ant-select-selector]:rounded-lg! [&_.ant-select-selector]:border-none! [&_.ant-select-selector]:bg-gray-50!",
                        "[&_.ant-select-selector]:shadow-[inset_0_0_0_1px_#e5e7eb]! hover:[&_.ant-select-selector]:shadow-[inset_0_0_0_1px_#d1d5db]!",
                        "[&_.ant-select-selection-item]:rounded-full! [&_.ant-select-selection-item]:border-none! [&_.ant-select-selection-item]:bg-white! [&_.ant-select-selection-item]:text-gray-700!",
                      ].join(" ")}
                    />
                  </div>
                  {!dateTimeData.hasAnyDateTime &&
                    dateTimeData.dateTimeLoading && <DateTimeFilterSkeleton />}
                  {dateTimeData.hasAnyDateTime && (
                    <div className="flex flex-col gap-1">
                      <DateRangeCalendarPicker
                        domain={dateTimeData.dateDomain}
                        range={filterDateRange}
                        onChange={onCalendarDateRangeChange}
                      />
                      <DateTimeRangeFilter
                        icon={<CalendarOutlined className="text-gray-400" />}
                        title="Date range"
                        values={dateTimeData.dateValues}
                        domain={dateTimeData.dateDomain}
                        zoomDomain={dateZoomDomain}
                        range={filterDateRange}
                        onChange={onFilterDateRangeChange}
                        onReset={() => onCalendarDateRangeChange(null)}
                        formatValue={formatDateAxisLabel}
                      />
                    </div>
                  )}
                  {dateTimeData.hasAnyDateTime && (
                    <DateTimeRangeFilter
                      icon={<ClockCircleOutlined className="text-gray-400" />}
                      title="Time of day"
                      values={dateTimeData.timeValues}
                      domain={TIME_OF_DAY_DOMAIN}
                      binCount={24}
                      range={filterTimeRange}
                      onChange={onFilterTimeRangeChange}
                      formatValue={formatTimeAxisLabel}
                    />
                  )}
                  {showLabelScope && (
                    <div>
                      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 font-ibm-sans">
                        <TagsOutlined className="text-gray-400" /> Labels
                      </p>
                      <Popover
                        trigger="click"
                        placement="bottomLeft"
                        open={labelPickerOpen}
                        onOpenChange={(open) => {
                          setLabelPickerOpen(open);
                          if (!open) setLabelSearch("");
                        }}
                        content={labelPickerContent}
                        arrow={false}
                        styles={{ content: { padding: 0 } }}
                      >
                        <button
                          type="button"
                          className={[
                            "flex h-8 w-full items-center gap-2 rounded-lg bg-gray-50 px-2.5 text-left font-ibm-sans transition-all",
                            "shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-white hover:shadow-[inset_0_0_0_1px_#d1d5db]",
                            labelPickerOpen
                              ? "bg-white shadow-[inset_0_0_0_1px_#60a5fa]"
                              : "",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "min-w-0 flex-1 truncate text-xs",
                              localLabelScope.length > 0
                                ? "font-semibold text-gray-800"
                                : "text-gray-400",
                            ].join(" ")}
                          >
                            {labelSummary}
                          </span>
                          {localLabelScope.length > 0 && (
                            <Tooltip title="Clear labels">
                              <span
                                role="button"
                                tabIndex={0}
                                aria-label="Clear labels"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLocalLabelScope([]);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setLocalLabelScope([]);
                                  }
                                }}
                                className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-400 transition-colors hover:text-red-500"
                              >
                                <CloseCircleOutlined className="text-[12px]" />
                              </span>
                            </Tooltip>
                          )}
                          <DownOutlined
                            className={[
                              "shrink-0 text-[10px] text-gray-400 transition-transform",
                              labelPickerOpen ? "rotate-180" : "",
                            ].join(" ")}
                          />
                        </button>
                      </Popover>
                    </div>
                  )}
                </SidebarSubsection>
              </div>
            )}

            {showModelScores && (
              <div className="border-t border-gray-100 pt-2.5">
                <SidebarSubsection title="Model derived scores">
                  <ScoreHistogramPanel
                    enrichedPlotPoints={enrichedPlotPoints}
                    filtered={filtered}
                    allowedProperties={SCORE_ALLOWED_PROPERTIES}
                    visibilityMode={SCORE_VISIBILITY_MODE}
                    alFilters={alFilters}
                    sliderMode={SCORE_SLIDER_STYLE}
                    compact
                    onVisibilityKeyChange={(key) =>
                      dispatch(
                        setVisibilityFilter({ propertyKey: key, range: [0, 1] }),
                      )
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
                </SidebarSubsection>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {showFindSimilar && (
          <CollapsibleSection title="Find similar">
            <button
              type="button"
              onClick={() => setMode("similarity")}
              className={[
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left font-ibm-sans transition-all",
                mode === "similarity"
                  ? "border-blue-200 bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                  : "border-gray-200 bg-gray-50 text-gray-500 hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-600",
              ].join(" ")}
            >
              <AudioOutlined
                className={
                  mode === "similarity" ? "text-blue-500" : "text-gray-400"
                }
              />
              <span className="text-[11px] font-medium">
                Search by recording
              </span>
            </button>
          </CollapsibleSection>
        )}
      </div>
    </aside>
  );
};

AnnotationHubSidebar.displayName = "AnnotationHubSidebar";
