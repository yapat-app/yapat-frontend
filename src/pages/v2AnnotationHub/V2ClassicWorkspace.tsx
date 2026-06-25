import React, { useState, useCallback } from "react";
import { ResizableSplit } from "../../components/layout/ResizableSplit";
import { ProjectionView } from "../../components/al/ProjectionView";
import type { ProjectionThumbnailData } from "../../components/al/ProjectionView";
import { MiniProjection } from "../../components/al/ProjectionView/MiniProjection";
import { PredictionFeed } from "../../components/al/PredictionFeed";
import { BlindAnnotationHeader } from "../ActiveLearning";
import { studyLogger } from "../../studyLogging";
import type { ProjectionMethod } from "../../components/al/ProjectionView/fpvHelpers";

type V2ClassicWorkspaceProps = {
  feedActionLabel: string;
  onOpenFeedConfig: () => void;
  feedActionLoading: boolean;
  onFindSimilar?: (snippetId: number) => void;
};

const PROJECTION_METHODS: { key: ProjectionMethod; label: string }[] = [
  { key: "tsne", label: "t-SNE" },
  { key: "umap", label: "UMAP" },
  { key: "pca", label: "PCA" },
  { key: "isomap", label: "Isomap" },
];

export const V2ClassicWorkspace: React.FC<V2ClassicWorkspaceProps> = ({
  feedActionLabel,
  onOpenFeedConfig,
  feedActionLoading,
  onFindSimilar,
}) => {
  const [projMethod, setProjMethod] = useState<ProjectionMethod>("pca");
  const [thumbData, setThumbData] = useState<ProjectionThumbnailData | null>(null);

  const handleThumbnailData = useCallback((data: ProjectionThumbnailData) => {
    setThumbData(data);
  }, []);

  const handleMethodChange = useCallback(
    (m: ProjectionMethod) => {
      if (m !== projMethod) studyLogger.log("projection_method_change", { from: projMethod, to: m });
      setProjMethod(m);
    },
    [projMethod],
  );

  return (
    <ResizableSplit
      mode="ratio"
      initialRatio={0.45}
      minLeftPx={320}
      minRightPx={380}
      left={
        <div className="flex flex-col h-full border-r border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 leading-none">
              Feature Projection
            </h2>
            <p className="text-[11px] text-gray-400 font-ibm-sans mt-0.5">
              Click a point to jump to its card
            </p>
          </div>

          {/* Horizontal projection method thumbnails */}
          <div className="flex-shrink-0 flex items-end gap-2 px-3 py-2 bg-white border-b border-gray-100 overflow-x-auto">
            {PROJECTION_METHODS.map((m) => {
              const active = projMethod === m.key;
              const hasProj = Boolean(thumbData?.fpvCoordsBySnippetForMethod?.[m.key]);
              const isLoading = (thumbData?.loadingMethods.has(m.key) ?? false) && !hasProj;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleMethodChange(m.key)}
                  disabled={thumbData?.fpvLoading && active}
                  className={[
                    "flex-shrink-0 flex flex-col items-center rounded-xl border px-2 py-1.5 transition-all",
                    active
                      ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200"
                      : "border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300",
                    !hasProj && !isLoading ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <div className="w-[90px] h-[56px] rounded-md bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 overflow-hidden relative">
                    <MiniProjection
                      points={thumbData?.thumbnailPoints ?? []}
                      coordsBySnippet={thumbData?.fpvCoordsBySnippetForMethod?.[m.key] ?? null}
                      selectedSnippetId={thumbData?.selectedSnippetId ?? null}
                      selectedCoord={thumbData?.selectedCoordByMethod?.[m.key] ?? null}
                      allActualLabels={thumbData?.allActualLabels ?? []}
                      loading={isLoading}
                    />
                  </div>
                  <span className="mt-1 text-[10px] font-ibm-sans text-gray-600">{m.label}</span>
                </button>
              );
            })}
          </div>

          {/* Scatter plot */}
          <div className="flex-1 overflow-hidden">
            <ProjectionView
              projectionMethod={projMethod}
              onProjectionMethodChange={setProjMethod}
              onThumbnailData={handleThumbnailData}
            />
          </div>
        </div>
      }
      right={
        <div className="flex flex-col h-full overflow-hidden">
          <BlindAnnotationHeader
            actionButton={{
              label: feedActionLabel,
              onClick: onOpenFeedConfig,
              loading: feedActionLoading,
            }}
          />
          <div className="flex-1 overflow-hidden">
            <PredictionFeed onFindSimilar={onFindSimilar} />
          </div>
        </div>
      }
    />
  );
};

V2ClassicWorkspace.displayName = "V2ClassicWorkspace";
