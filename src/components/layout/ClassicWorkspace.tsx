/**
 * ClassicWorkspace — same layout as Active Learning phase P1.2 (blind scroll feed).
 *
 * Snippets are synced into alSlice by AnnotationHub; this panel reuses
 * ProjectionView + PredictionFeed for an identical annotation experience.
 */

import React from "react";
import { ResizableSplit } from "./ResizableSplit";
import { ProjectionView } from "../al/ProjectionView";
import { PredictionFeed } from "../al/PredictionFeed";
import { BlindAnnotationHeader } from "../../pages/ActiveLearning";

export const ClassicWorkspace: React.FC = () => {
  return (
    <ResizableSplit
      mode="ratio"
      initialRatio={0.5}
      minLeftPx={360}
      minRightPx={420}
      left={
        <div className="flex flex-col h-full border-r border-gray-200 overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100 bg-white">
            <h2 className="text-sm font-semibold font-ibm-mono text-gray-700">
              Feature Projection
            </h2>
            <p className="text-xs text-gray-400 font-ibm-sans">
              Click a point to jump to its card
            </p>
          </div>
          <div className="flex-1 overflow-hidden">
            <ProjectionView />
          </div>
        </div>
      }
      right={
        <div className="flex flex-col h-full overflow-hidden">
          <BlindAnnotationHeader />
          <div className="flex-1 overflow-hidden">
            <PredictionFeed />
          </div>
        </div>
      }
    />
  );
};
