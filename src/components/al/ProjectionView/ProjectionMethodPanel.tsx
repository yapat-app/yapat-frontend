import React from "react";
import { MiniProjection } from "./MiniProjection";
import type { PlotPoint, ProjectionMethod } from "./fpvHelpers";
import { studyLogger } from "../../../studyLogging";

export interface ProjectionMethodPanelProps {
  method: ProjectionMethod;
  dimRedMethods: Array<{ key: ProjectionMethod; label: string }>;
  fpvLoading: boolean;
  loadingMethods: Set<ProjectionMethod>;
  fpvCoordsBySnippetForMethod: Partial<
    Record<ProjectionMethod, Record<number, [number, number]>>
  > | null;
  selectedSnippetId: number | null;
  selectedCoordByMethod: Partial<Record<ProjectionMethod, [number, number]>> | null;
  thumbnailPoints: Array<{ p: PlotPoint; coord: [number, number]; visible: boolean }>;
  allActualLabels: string[];
  onMethodChange: (m: ProjectionMethod) => void;
}

export const ProjectionMethodPanel: React.FC<ProjectionMethodPanelProps> = ({
  method,
  dimRedMethods,
  fpvLoading,
  loadingMethods,
  fpvCoordsBySnippetForMethod,
  selectedSnippetId,
  selectedCoordByMethod,
  thumbnailPoints,
  allActualLabels,
  onMethodChange,
}) => {
  return (
    <div className="w-[168px] flex-shrink-0 border-r border-gray-100 bg-white">
      <div className="px-3 py-2 border-b border-gray-100">
        <div className="text-xs font-ibm-mono font-semibold text-gray-700">Projection</div>
        <div className="text-[11px] text-gray-400">Pick a method</div>
      </div>
      <div className="p-3 flex flex-col gap-2 overflow-auto" style={{ maxHeight: "100%" }}>
        {dimRedMethods.map((m) => {
          const active = method === m.key;
          const hasProj = Boolean(fpvCoordsBySnippetForMethod?.[m.key]);
          const isLoadingThumb = loadingMethods.has(m.key) && !hasProj;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => {
                if (m.key !== method) {
                  studyLogger.log("projection_method_change", { from: method, to: m.key });
                }
                onMethodChange(m.key);
              }}
              disabled={fpvLoading && active}
              className={[
                "text-left rounded-xl border px-2.5 py-2 transition-all",
                active
                  ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                  : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300",
                !hasProj && !isLoadingThumb ? "opacity-50 cursor-not-allowed" : "",
              ].join(" ")}
            >
              <div className="w-full h-[74px] rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 overflow-hidden relative">
                <MiniProjection
                  points={thumbnailPoints}
                  coordsBySnippet={fpvCoordsBySnippetForMethod?.[m.key] ?? null}
                  selectedSnippetId={selectedSnippetId}
                  selectedCoord={selectedCoordByMethod?.[m.key] ?? null}
                  allActualLabels={allActualLabels}
                  loading={isLoadingThumb}
                />
              </div>
              <div className="mt-1 text-[11px] text-gray-600 font-ibm-sans">{m.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
