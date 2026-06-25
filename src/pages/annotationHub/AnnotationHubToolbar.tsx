import React, { useState } from "react";
import {
  Select,
  Spin,
  Tag,
  Tooltip,
  Badge,
  Button,
  Popover,
  InputNumber,
} from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  FilterOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import type { Dataset } from "../../types";
import type { PhaseConfig } from "../../studyPhases/types";
import { clearSavedFeed } from "../../redux/features/alSlice";
import { useAppDispatch } from "../../hooks";
import type { AnnotateMode } from "./types";
import { PhaseTimer } from "../../studyFlow";
import type { LabelScopeOption } from "./useHubALSession";
import type { PAMCheckpoint } from "../../types/al";

const { Option } = Select;

export type AnnotationHubToolbarProps = {
  mode: AnnotateMode;
  phase: PhaseConfig;
  allDatasets: Dataset[];
  classicDatasetId: string | null;
  onClassicDatasetChange: (datasetId: number) => void;
  alSelectedDatasetId: number | null;
  onAlDatasetChange: (datasetId: number) => void;
  inferenceLoading: boolean;
  predictionsLength: number;
  feedbackCountDisplay: { shown: number; pending: boolean };
  retrainThreshold: number;
  lastRetrainJob: { status: string } | null;
  isRestoredFeed: boolean;
  savedFeedLabel: string | null;
  // Filter state — classic modes (optional; V2 hub uses sidebar instead)
  filterAnnotationStatus?: "any" | "annotated" | "unannotated";
  onFilterAnnotationStatusChange?: (v: "any" | "annotated" | "unannotated") => void;
  filterLocations?: string[];
  onFilterLocationsChange?: (v: string[]) => void;
  recordingLocations?: string[];
  locationsLoading?: boolean;
  // Filter state — AI modes (optional)
  localLabelScope?: string[];
  setLocalLabelScope?: (v: string[]) => void;
  localMinConfidence?: number | null;
  setLocalMinConfidence?: (v: number | null) => void;
  labelScopeOptions?: LabelScopeOption[];
  labelScopeLoading?: boolean;
  // Checkpoint info (to gate AI sort options)
  checkpoints?: PAMCheckpoint[];
};

export const AnnotationHubToolbar: React.FC<AnnotationHubToolbarProps> = ({
  mode,
  phase,
  allDatasets,
  classicDatasetId,
  onClassicDatasetChange,
  alSelectedDatasetId,
  onAlDatasetChange,
  inferenceLoading,
  predictionsLength,
  feedbackCountDisplay,
  retrainThreshold,
  lastRetrainJob,
  isRestoredFeed,
  savedFeedLabel,
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
  // checkpoints is accepted for API compatibility but not used in toolbar (V2 sidebar handles gating)
  checkpoints: _checkpoints,
}) => {
  const dispatch = useAppDispatch();
  const isAlLikeMode = mode === "al" || mode === "validate";

  const [filterOpen, setFilterOpen] = useState(false);

  // Count active filters for badge
  const activeFilterCount = [
    !isAlLikeMode && (filterAnnotationStatus ?? "any") !== "any" ? 1 : 0,
    !isAlLikeMode && (filterLocations ?? []).length > 0 ? 1 : 0,
    isAlLikeMode && (localLabelScope ?? []).length > 0 ? 1 : 0,
    isAlLikeMode && (localMinConfidence ?? null) !== null ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const retrainTag = lastRetrainJob ? (
    <Tag
      color={
        {
          PENDING: "default",
          RUNNING: "processing",
          COMPLETED: "success",
          FAILED: "error",
        }[lastRetrainJob.status as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"] ??
        "default"
      }
      className="text-xs"
    >
      Model: {lastRetrainJob.status}
    </Tag>
  ) : null;

  const filterPopoverContent = (
    <div className="w-72 flex flex-col gap-4 py-1">
      {/* Classic mode filters */}
      {!isAlLikeMode && (
        <>
          <div>
            <p className="text-xs font-semibold text-gray-500 font-ibm-sans uppercase tracking-wide mb-1.5">
              Annotation Status
            </p>
            <Select
              value={filterAnnotationStatus ?? "any"}
              onChange={onFilterAnnotationStatusChange}
              style={{ width: "100%" }}
              size="small"
              options={[
                { value: "any", label: "Any (annotated + unannotated)" },
                { value: "unannotated", label: "Unannotated only" },
                { value: "annotated", label: "Annotated only" },
              ]}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 font-ibm-sans uppercase tracking-wide mb-1.5">
              Location
            </p>
            <Select
              mode="multiple"
              allowClear
              showSearch
              size="small"
              placeholder="Any location"
              loading={locationsLoading}
              value={filterLocations ?? []}
              onChange={onFilterLocationsChange}
              style={{ width: "100%" }}
              options={(recordingLocations ?? []).map((loc) => ({ value: loc, label: loc }))}
              notFoundContent={locationsLoading ? "Loading…" : "No locations found"}
            />
          </div>
        </>
      )}

      {/* AI mode filters */}
      {isAlLikeMode && (
        <>
          <div>
            <p className="text-xs font-semibold text-gray-500 font-ibm-sans uppercase tracking-wide mb-1.5">
              Focus on Species
            </p>
            <Select
              mode="multiple"
              allowClear
              size="small"
              placeholder={labelScopeLoading ? "Loading labels…" : "All species"}
              loading={labelScopeLoading}
              value={localLabelScope ?? []}
              onChange={setLocalLabelScope}
              style={{ width: "100%" }}
              options={(labelScopeOptions ?? []).map((opt) => ({
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
              maxTagCount="responsive"
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 font-ibm-sans uppercase tracking-wide mb-1.5">
              Min Confidence
            </p>
            <InputNumber
              min={0}
              max={1}
              step={0.05}
              size="small"
              value={localMinConfidence ?? undefined}
              onChange={(v) => setLocalMinConfidence?.(v == null || Number.isNaN(v) ? null : v)}
              style={{ width: "100%" }}
              placeholder="e.g. 0.7"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave empty to show all confidence levels.
            </p>
          </div>
        </>
      )}

      {activeFilterCount > 0 && (
        <Button
          size="small"
          type="text"
          className="text-xs text-gray-400 self-start px-0"
          onClick={() => {
            onFilterAnnotationStatusChange?.("any");
            onFilterLocationsChange?.([]);
            setLocalLabelScope?.([]);
            setLocalMinConfidence?.(null);
          }}
        >
          Reset filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
      <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

      {/* Dataset selector */}
      <div className="flex items-center gap-2">
        <DatabaseOutlined className="text-gray-400" />
        {isAlLikeMode ? (
          <Select
            placeholder="Select dataset"
            value={alSelectedDatasetId ?? undefined}
            onChange={onAlDatasetChange}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="children"
          >
            {allDatasets.map((d) => (
              <Option key={d.id} value={d.id}>{d.name}</Option>
            ))}
          </Select>
        ) : (
          <Select
            placeholder="Select dataset"
            value={classicDatasetId ? Number(classicDatasetId) : undefined}
            onChange={onClassicDatasetChange}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="children"
          >
            {allDatasets.map((d) => (
              <Option key={d.id} value={d.id}>{d.name}</Option>
            ))}
          </Select>
        )}
      </div>

      {/* Filter button */}
      <Popover
        open={filterOpen}
        onOpenChange={setFilterOpen}
        content={filterPopoverContent}
        title={<span className="font-ibm-sans text-sm font-semibold">Filters</span>}
        trigger="click"
        placement="bottomLeft"
      >
        <Badge count={activeFilterCount} size="small" offset={[-2, 2]}>
          <Button
            icon={<FilterOutlined />}
            size="middle"
            className={`font-ibm-sans text-xs ${activeFilterCount > 0 ? "border-blue-400 text-blue-600" : ""}`}
          >
            Filter
          </Button>
        </Badge>
      </Popover>

      {/* AL status area */}
      {isAlLikeMode && (
        <Tooltip title={`Active study phase: ${phase.label}`}>
          <Tag color="purple" className="text-xs">
            {phase.id}
          </Tag>
        </Tooltip>
      )}

      {isAlLikeMode && <PhaseTimer />}

      {isAlLikeMode && predictionsLength > 0 && (
        <div className="flex items-center gap-3 text-xs font-ibm-sans text-gray-500">
          <Tooltip title="Total predictions">
            <span className="flex items-center gap-1">
              <BulbOutlined className="text-blue-400" />
              {predictionsLength} predictions
            </span>
          </Tooltip>
          <Tooltip title="Feedbacks since last retrain">
            <span className="flex items-center gap-1">
              <CheckCircleOutlined className="text-green-500" />
              {feedbackCountDisplay.shown}/{retrainThreshold}
              {feedbackCountDisplay.pending && (
                <Tag color="gold" className="ml-1">Training…</Tag>
              )}
            </span>
          </Tooltip>
          {retrainTag}
          {isRestoredFeed && (
            <Tooltip title="Showing saved feed from a previous session. Click to clear.">
              <Tag
                icon={<HistoryOutlined />}
                color="blue"
                closable
                onClose={() => dispatch(clearSavedFeed())}
                className="cursor-pointer"
              >
                Saved · {savedFeedLabel}
              </Tag>
            </Tooltip>
          )}
        </div>
      )}

      {isAlLikeMode && inferenceLoading && <Spin size="small" />}
    </div>
  );
};

AnnotationHubToolbar.displayName = "AnnotationHubToolbar";
