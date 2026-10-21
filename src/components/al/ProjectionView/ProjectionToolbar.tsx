import React, { useRef } from "react";
import { Button, Select, Tooltip, Tag } from "antd";
import { SyncOutlined, ExperimentOutlined } from "@ant-design/icons";
import { resolveColor } from "../../../utils/alColors";
import type { PAMRetrainJobStatus, SamplingMethod } from "../../../types/al";
import type { VisMode } from "../../../studyPhases";
import { studyLogger } from "../../../studyLogging";

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
  lastRetrainJob: PAMRetrainJobStatus | null;
  isWaitingForRetrain: boolean;
  retrainLoading: boolean;
  showSamplingMethodSelector: boolean;
  samplingMethod: SamplingMethod;
  onSamplingMethodChange: (v: SamplingMethod) => void;
  onGenerateNow: () => void;
  /** Species currently chosen in "Find species" (highlighted in the legend). */
  focusSpecies?: string[];
  /** Legend labels the model can score; only these chips become clickable. */
  focusableSpecies?: ReadonlySet<string>;
  /** Toggles a legend species in "Find species". Omit to keep the legend static. */
  onLegendSpeciesToggle?: (label: string) => void;
  /** Anchor of the active "Find similar" search; explains the purple overlay. */
  similarTo?: number | null;
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
  lastRetrainJob,
  isWaitingForRetrain,
  retrainLoading,
  showSamplingMethodSelector,
  samplingMethod,
  onSamplingMethodChange,
  onGenerateNow,
  focusSpecies,
  focusableSpecies,
  onLegendSpeciesToggle,
  similarTo = null,
}) => {
  const legendScrollRef = useRef<HTMLDivElement | null>(null);

  // The legend row only scrolls horizontally, so a plain vertical mouse-wheel
  // gesture over it does nothing by default — redirect vertical wheel delta
  // to horizontal scroll while hovering it.
  const handleLegendWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = legendScrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-100 bg-white flex-wrap">
      {showSamplingMethodSelector && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400 font-ibm-sans">Sampling method</span>
          <Select
            size="small"
            value={samplingMethod}
            onChange={(v: SamplingMethod) => {
              studyLogger.log("sampling_method_change", { method: v });
              onSamplingMethodChange(v);
            }}
            style={{ width: 140 }}
          >
            <Option value="uncertainty">Uncertainty</Option>
            <Option value="diversity">Diversity</Option>
            <Option value="density">Density</Option>
            <Option value="random">Random</Option>
          </Select>
        </div>
      )}

      <div data-tour="projection-count" className="flex items-center gap-2 flex-wrap ml-auto">
        <span className="text-xs text-gray-400 font-ibm-sans">
          <strong>{visibleCount}</strong> / <strong>{totalCount}</strong> visible
        </span>

        {similarTo !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-fs-11 font-medium text-violet-700 font-ibm-sans whitespace-nowrap">
            <span className="h-2 w-2 rounded-full bg-violet-600" />
            Matches for #{similarTo}
          </span>
        )}

        {showLabeledPool && labeledCount > 0 && (
          <Tag color="default" className="text-xs">
            {labeledCount} labeled
          </Tag>
        )}

        {actualLabelLegend.total > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-fs-11 text-gray-400 font-ibm-sans whitespace-nowrap">
              Legend:
            </span>
            <div className="relative min-w-0 max-w-[min(52vw,720px)]">
              <div
                ref={legendScrollRef}
                onWheel={handleLegendWheel}
                className={[
                  "flex items-center gap-1.5 py-0.5 pr-5 pb-1.5",
                  "overflow-x-auto",
                  "[-webkit-overflow-scrolling:touch]",
                  "[scrollbar-width:thin]",
                  "[&::-webkit-scrollbar]:h-1.5",
                  "[&::-webkit-scrollbar-track]:bg-transparent",
                  "[&::-webkit-scrollbar-thumb]:bg-gray-300",
                  "[&::-webkit-scrollbar-thumb]:rounded-full",
                  "hover:[&::-webkit-scrollbar-thumb]:bg-gray-400",
                ].join(" ")}
              >
                {actualLabelLegend.shown.map((lbl) => {
                  // A legend chip doubles as a "Find this species" shortcut when
                  // the model can score that label. It never assigns labels, so
                  // a mis-click is harmless (unlike the quick-label buttons).
                  const clickable =
                    !!onLegendSpeciesToggle && !!focusableSpecies?.has(lbl);
                  const focused = !!focusSpecies?.includes(lbl);
                  const chipClass = [
                    "inline-flex items-center gap-1.5 shrink-0",
                    "px-2 py-0.5",
                    "rounded-full",
                    "border",
                    focused
                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200"
                      : "border-gray-200 bg-white/90",
                    "text-fs-11 text-gray-700",
                    "shadow-[0_1px_0_rgba(0,0,0,0.02)]",
                    "max-w-[160px]",
                    clickable
                      ? "cursor-pointer hover:border-blue-300 hover:bg-blue-50/60"
                      : "",
                  ].join(" ");
                  const content = (
                    <>
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                        style={{
                          backgroundColor: resolveColor(
                            { actual_label: lbl } as any,
                            "actual_label",
                            allActualLabels,
                          ),
                        }}
                      />
                      <span className="truncate">{lbl}</span>
                    </>
                  );
                  return clickable ? (
                    <button
                      key={lbl}
                      type="button"
                      className={chipClass}
                      aria-pressed={focused}
                      title={
                        focused
                          ? `Stop finding ${lbl}`
                          : `Find ${lbl}: rank snippets by the model's confidence for it`
                      }
                      onClick={() => onLegendSpeciesToggle?.(lbl)}
                    >
                      {content}
                    </button>
                  ) : (
                    <span key={lbl} className={chipClass} title={lbl}>
                      {content}
                    </span>
                  );
                })}
                {actualLabelLegend.remaining > 0 &&
                  actualLabelLegend.total > actualLabelLegend.shown.length && (
                    <span className="text-fs-11 text-gray-400 whitespace-nowrap shrink-0">
                      +{actualLabelLegend.remaining}
                    </span>
                  )}
              </div>
              {/* Fade hint that the pill row scrolls horizontally. */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent" />
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

        {visMode === "whole_dataset" && isMissingProjection && canGenerateNow && (
          <Tooltip title="Normally generated after embeddings finish. Use this to generate immediately (may take time).">
            <Button size="small" onClick={onGenerateNow} loading={fpvGenerateLoading}>
              Generate projection now
            </Button>
          </Tooltip>
        )}

        {/* Gate on COMPLETED: `lastRetrainJob` is reassigned on every poll
            tick, so a bare truthy check rendered this green "completed" tag
            (and its "Retrain completed at ?" tooltip) while the job was still
            RUNNING — directly contradicting the "Retraining…" tag below. */}
        {lastRetrainJob?.status === "COMPLETED" && (
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
