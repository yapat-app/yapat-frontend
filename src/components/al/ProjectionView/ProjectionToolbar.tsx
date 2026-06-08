import React from "react";
import { Button, Select, Tooltip, Tag } from "antd";
import { SyncOutlined, ExperimentOutlined } from "@ant-design/icons";
import { resolveColor } from "../../../utils/alColors";
import type { PAMRetrainJobStatus, SamplingMethod } from "../../../types/al";
import type { VisMode } from "../../../studyPhases";
import type { ProjectionMethod } from "./fpvHelpers";

const { Option } = Select;

export interface ProjectionToolbarProps {
  visibleCount: number;
  totalCount: number;
  labeledCount: number;
  showLabeledPool: boolean;
  actualLabelLegend: { shown: string[]; remaining: number; total: number };
  allActualLabels: string[];
  visMode: VisMode;
  fpvLoading: boolean;
  fpvError: string | null;
  isMissingProjection: boolean;
  canGenerateNow: boolean;
  fpvGenerateLoading: boolean;
  method: ProjectionMethod;
  lastRetrainJob: PAMRetrainJobStatus | null;
  isWaitingForRetrain: boolean;
  retrainLoading: boolean;
  showSamplingMethodSelector: boolean;
  samplingMethod: SamplingMethod;
  onSamplingMethodChange: (v: SamplingMethod) => void;
  onGenerateNow: () => void;
}

export const ProjectionToolbar: React.FC<ProjectionToolbarProps> = ({
  visibleCount,
  totalCount,
  labeledCount,
  showLabeledPool,
  actualLabelLegend,
  allActualLabels,
  visMode,
  fpvLoading,
  fpvError,
  isMissingProjection,
  canGenerateNow,
  fpvGenerateLoading,
  method,
  lastRetrainJob,
  isWaitingForRetrain,
  retrainLoading,
  showSamplingMethodSelector,
  samplingMethod,
  onSamplingMethodChange,
  onGenerateNow,
}) => {
  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 bg-white flex-wrap">
      {showSamplingMethodSelector && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 font-ibm-sans">Sampling method</span>
          <Select
            size="small"
            value={samplingMethod}
            onChange={(v: SamplingMethod) => onSamplingMethodChange(v)}
            style={{ width: 140 }}
          >
            <Option value="uncertainty">Uncertainty</Option>
            <Option value="diversity">Diversity</Option>
            <Option value="density">Density</Option>
            <Option value="random">Random</Option>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap ml-auto">
        <span className="text-xs text-gray-400 font-ibm-sans">
          <strong>{visibleCount}</strong> / <strong>{totalCount}</strong> visible
        </span>

        {showLabeledPool && labeledCount > 0 && (
          <Tag color="default" className="text-xs">
            {labeledCount} labeled
          </Tag>
        )}

        {actualLabelLegend.total > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-gray-400 font-ibm-sans whitespace-nowrap">
              Legend:
            </span>
            <div
              className={[
                "min-w-0 max-w-[min(52vw,720px)]",
                "overflow-x-auto",
                "[scrollbar-width:thin]",
                "[-webkit-overflow-scrolling:touch]",
              ].join(" ")}
            >
              <div className="flex items-center gap-1.5 py-0.5 pr-1">
                {actualLabelLegend.shown.map((lbl) => (
                  <span
                    key={lbl}
                    className={[
                      "inline-flex items-center gap-1.5",
                      "px-2 py-0.5",
                      "rounded-full",
                      "border border-gray-200",
                      "bg-white/90",
                      "text-[11px] text-gray-700",
                      "shadow-[0_1px_0_rgba(0,0,0,0.02)]",
                      "max-w-[160px]",
                    ].join(" ")}
                    title={lbl}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-black/10 flex-shrink-0"
                      style={{
                        backgroundColor: resolveColor(
                          { actual_label: lbl } as any,
                          "actual_label",
                          allActualLabels,
                        ),
                      }}
                    />
                    <span className="truncate">{lbl}</span>
                  </span>
                ))}
                {actualLabelLegend.remaining > 0 &&
                  actualLabelLegend.total > actualLabelLegend.shown.length && (
                    <span className="text-[11px] text-gray-400 whitespace-nowrap">
                      +{actualLabelLegend.remaining}
                    </span>
                  )}
              </div>
            </div>
          </div>
        )}

        {visMode === "whole_dataset" && fpvLoading && (
          <Tag icon={<SyncOutlined spin />} color="processing" className="text-xs">
            Loading projection…
          </Tag>
        )}
        {visMode === "whole_dataset" && fpvError && (
          <Tooltip title={fpvError}>
            <Tag color="red" className="text-xs">
              Projection unavailable
            </Tag>
          </Tooltip>
        )}
        {visMode === "whole_dataset" && !fpvLoading && !fpvError && (
          <Tag color="blue" className="text-xs">
            {method === "tsne" ? "t‑SNE" : method.toUpperCase()}
          </Tag>
        )}

        {visMode === "whole_dataset" && isMissingProjection && canGenerateNow && (
          <Tooltip title="Normally generated after embeddings finish. Use this to generate immediately (may take time).">
            <Button size="small" onClick={onGenerateNow} loading={fpvGenerateLoading}>
              Generate projection now
            </Button>
          </Tooltip>
        )}

        {lastRetrainJob && (
          <Tooltip title={`Retrain completed at ${lastRetrainJob.completed_at ?? "?"}`}>
            <Tag icon={<ExperimentOutlined />} color="green" className="text-xs">
              Post-retrain view
            </Tag>
          </Tooltip>
        )}
        {isWaitingForRetrain && !retrainLoading && (
          <Tooltip title="Run inference after retrain to update the projection">
            <Tag icon={<SyncOutlined />} color="blue" className="text-xs">
              Updates after retrain
            </Tag>
          </Tooltip>
        )}
        {retrainLoading && (
          <Tag icon={<SyncOutlined spin />} color="processing" className="text-xs">
            Retraining…
          </Tag>
        )}
      </div>
    </div>
  );
};
