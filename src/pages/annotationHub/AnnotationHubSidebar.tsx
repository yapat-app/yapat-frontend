import React from "react";
import { Select, Tooltip, Segmented } from "antd";
import {
  InfoCircleOutlined,
  ReloadOutlined,
  EnvironmentOutlined,
  TagsOutlined,
  AudioOutlined,
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
  showSampleProperties: boolean;
  showModelScores: boolean;
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
  localLabelScope,
  setLocalLabelScope,
  labelScopeOptions,
  labelScopeLoading,
  onResetFilters,
  showSampleProperties,
  showModelScores,
}) => {
  const dispatch = useAppDispatch();

  const { enrichedPlotPoints, filtered, alFilters } = useScoreHistogramData(
    SCORE_VISIBILITY_MODE,
    SCORE_SLIDER_STYLE,
  );

  const activeFilterCount = [
    filterAnnotationStatus !== "any" ? 1 : 0,
    filterLocations.length > 0 ? 1 : 0,
    localLabelScope.length > 0 ? 1 : 0,
  ].reduce((a, b) => a + b, 0);
  const hasActiveFilters = activeFilterCount > 0;

  return (
    <aside className="flex h-full w-[272px] flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
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
        <div className="flex flex-col gap-3.5">
          <Segmented
            block
            size="small"
            value={filterAnnotationStatus}
            onChange={(v) =>
              onFilterAnnotationStatusChange(v as "any" | "annotated" | "unannotated")
            }
            options={[
              { value: "any", label: "All" },
              { value: "unannotated", label: "Unlabeled" },
              { value: "annotated", label: "Labeled" },
            ]}
            className={[
              "!rounded-lg !bg-gray-100 !p-[3px]",
              "[&_.ant-segmented-item]:!rounded-md [&_.ant-segmented-item]:font-ibm-sans",
              "[&_.ant-segmented-item-selected]:!bg-gray-900 [&_.ant-segmented-item-selected]:!text-white [&_.ant-segmented-item-selected]:!shadow-none",
              "[&_.ant-segmented-thumb]:!rounded-md [&_.ant-segmented-thumb]:!bg-gray-900",
            ].join(" ")}
          />

          {showSampleProperties && (
            <>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 font-ibm-sans">
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
                  options={recordingLocations.map((loc) => ({ value: loc, label: loc }))}
                  maxTagCount={1}
                  notFoundContent={locationsLoading ? "Loading…" : "No locations"}
                  className={[
                    "[&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-none [&_.ant-select-selector]:!bg-gray-50",
                    "[&_.ant-select-selector]:!shadow-[inset_0_0_0_1px_#e5e7eb] hover:[&_.ant-select-selector]:!shadow-[inset_0_0_0_1px_#d1d5db]",
                    "[&_.ant-select-selection-item]:!rounded-full [&_.ant-select-selection-item]:!border-none [&_.ant-select-selection-item]:!bg-white [&_.ant-select-selection-item]:!text-gray-700",
                  ].join(" ")}
                />
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-gray-500 font-ibm-sans">
                  <TagsOutlined className="text-gray-400" /> Species
                </p>
                <Select
                  mode="multiple"
                  allowClear
                  size="small"
                  variant="borderless"
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
                  className={[
                    "[&_.ant-select-selector]:!rounded-lg [&_.ant-select-selector]:!border-none [&_.ant-select-selector]:!bg-gray-50",
                    "[&_.ant-select-selector]:!shadow-[inset_0_0_0_1px_#e5e7eb] hover:[&_.ant-select-selector]:!shadow-[inset_0_0_0_1px_#d1d5db]",
                    "[&_.ant-select-selection-item]:!rounded-full [&_.ant-select-selection-item]:!border-none [&_.ant-select-selection-item]:!bg-white [&_.ant-select-selection-item]:!text-gray-700",
                  ].join(" ")}
                />
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {showModelScores && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CollapsibleSection title="Model scores">
            <ScoreHistogramPanel
              enrichedPlotPoints={enrichedPlotPoints}
              filtered={filtered}
              allowedProperties={SCORE_ALLOWED_PROPERTIES}
              visibilityMode={SCORE_VISIBILITY_MODE}
              alFilters={alFilters}
              sliderMode={SCORE_SLIDER_STYLE}
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
          </CollapsibleSection>
        </div>
      )}

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
            className={mode === "similarity" ? "text-blue-500" : "text-gray-400"}
          />
          <span className="text-[11px] font-medium">Search by recording</span>
        </button>
      </CollapsibleSection>
    </aside>
  );
};

AnnotationHubSidebar.displayName = "AnnotationHubSidebar";
