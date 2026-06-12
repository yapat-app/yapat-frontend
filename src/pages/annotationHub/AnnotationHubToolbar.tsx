import React from "react";
import {
  Select,
  Spin,
  Tag,
  Tooltip,
} from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import type { Dataset } from "../../types";
import type { PhaseConfig } from "../../studyPhases/types";
import { clearSavedFeed } from "../../redux/features/alSlice";
import { useAppDispatch } from "../../hooks";
import type { AnnotateMode } from "./types";
import { PhaseTimer } from "../../studyFlow";

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
}) => {
  const dispatch = useAppDispatch();
  const isAlLikeMode = mode === "al" || mode === "validate";

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

  return (
    <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
      <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

      {isAlLikeMode && (
        <div className="flex items-center gap-2">
          <DatabaseOutlined className="text-gray-400" />
          <Select
            placeholder="Select dataset"
            value={alSelectedDatasetId ?? undefined}
            onChange={onAlDatasetChange}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="children"
          >
            {allDatasets.map((d) => (
              <Option key={d.id} value={d.id}>
                {d.name}
              </Option>
            ))}
          </Select>
        </div>
      )}

      {!isAlLikeMode && (
        <div className="flex items-center gap-2">
          <DatabaseOutlined className="text-gray-400" />
          <Select
            placeholder="Select dataset"
            value={classicDatasetId ? Number(classicDatasetId) : undefined}
            onChange={onClassicDatasetChange}
            style={{ width: 200 }}
            showSearch
            optionFilterProp="children"
          >
            {allDatasets.map((d) => (
              <Option key={d.id} value={d.id}>
                {d.name}
              </Option>
            ))}
          </Select>
        </div>
      )}

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
                <Tag color="gold" className="ml-1">
                  Training…
                </Tag>
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
