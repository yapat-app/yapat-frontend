/**
 * ClassicWorkspace — two-panel layout for random and similarity annotation modes.
 *
 * Left panel : Feature Projection (ProjectionView) — clicking a dot jumps to that
 *              snippet if it's in the current feed.
 * Right panel: Annotation feed (CurrentSnippetCard + compact progress header).
 *
 * Data is passed in from the parent (AnnotationHub) via props so that the
 * feed-loading hook runs even before this component mounts.
 */

import React, { useEffect } from "react";
import { Tag, Progress } from "antd";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { ProjectionView } from "../al/ProjectionView";
import { ResizableSplit } from "./ResizableSplit";
import { CurrentSnippetCard } from "../CurrentSnippetCard";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { jumpToSnippetById } from "../../redux/features/snippetSlice";
import type { Snippet, Annotation } from "../../types";

export interface ClassicWorkspaceProps {
  snippets: Snippet[];
  currentSnippet: Snippet | null;
  currentIndex: number;
  annotations: Annotation[];
  annotatedCount: number;
  handlePrevious: () => void;
  handleNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export const ClassicWorkspace: React.FC<ClassicWorkspaceProps> = ({
  snippets,
  currentSnippet,
  currentIndex,
  annotations,
  annotatedCount,
  handlePrevious,
  handleNext,
  canGoPrevious,
  canGoNext,
}) => {
  const dispatch = useAppDispatch();
  const { selectedSnippetId } = useAppSelector((state) => state.al);

  // Keep projection dot in sync with current snippet.
  useEffect(() => {
    if (currentSnippet) {
      dispatch(setSelectedSnippet(currentSnippet.id));
    }
  }, [currentSnippet?.id, dispatch]);

  // Navigate classic feed when a dot is clicked in the projection.
  useEffect(() => {
    if (
      selectedSnippetId !== null &&
      selectedSnippetId !== currentSnippet?.id
    ) {
      dispatch(jumpToSnippetById(selectedSnippetId));
    }
  }, [selectedSnippetId, dispatch]);

  const progressPercent =
    snippets.length > 0
      ? Math.round((annotatedCount / snippets.length) * 100)
      : 0;

  return (
    <ResizableSplit
      mode="ratio"
      initialRatio={0.45}
      minLeftPx={320}
      minRightPx={420}
      left={
        <div className="flex flex-col h-full border-r border-gray-200 overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">
              Feature Projection
            </h2>
            <p className="text-xs text-gray-400 font-ibm-sans">
              Click a point to jump to that snippet
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ProjectionView />
          </div>
        </div>
      }
      right={
        <div className="flex flex-col h-full overflow-hidden">
          {/* Feed header with compact progress */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">
                  Annotation Feed
                </h2>
                <p className="text-xs text-gray-400 font-ibm-sans">
                  Snippet {currentIndex + 1} of {snippets.length}
                </p>
              </div>
              <div className="flex items-center gap-3 min-w-0">
                <Tag
                  color={annotatedCount === snippets.length && snippets.length > 0 ? "success" : "default"}
                  className="text-xs whitespace-nowrap"
                >
                  {annotatedCount} / {snippets.length} annotated
                </Tag>
                <div className="w-24">
                  <Progress
                    percent={progressPercent}
                    size="small"
                    showInfo={false}
                    strokeColor="#10b981"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Scrollable snippet area */}
          <div className="flex-1 overflow-y-auto p-4">
            {currentSnippet && (
              <CurrentSnippetCard
                snippet={currentSnippet}
                annotations={annotations}
                onPrevious={handlePrevious}
                onNext={handleNext}
                canGoPrevious={canGoPrevious}
                canGoNext={canGoNext}
              />
            )}
          </div>
        </div>
      }
    />
  );
};
