/**
 * ClassicWorkspace — same layout as Active Learning phase P1.2 (blind scroll feed).
 *
 * Snippets are synced into alSlice by AnnotationHub; this panel reuses
 * ProjectionView + PredictionFeed for an identical annotation experience.
 */

import React from "react";
import { Button, Tooltip } from "antd";
import { CloseOutlined, SearchOutlined } from "@ant-design/icons";
import { ResizableSplit } from "./ResizableSplit";
import { ProjectionView } from "../al/ProjectionView";
import { PredictionFeed } from "../al/PredictionFeed";
import { BlindAnnotationHeader } from "../../pages/ActiveLearning";

type ClassicWorkspaceProps = {
  feedActionLabel: string;
  onOpenFeedConfig: () => void;
  feedActionLoading: boolean;
  onOpenSearch?: () => void;
  /** True while the feed is showing snippet-search results. */
  searchActive?: boolean;
  /** Number of snippets currently shown from the search. */
  searchCount?: number;
  /** Exit search view and restore the previous feed. */
  onExitSearch?: () => void;
};

export const ClassicWorkspace: React.FC<ClassicWorkspaceProps> = ({
  feedActionLabel,
  onOpenFeedConfig,
  feedActionLoading,
  onOpenSearch,
  searchActive = false,
  searchCount = 0,
  onExitSearch,
}) => {
  const searchControl = !onOpenSearch ? null : searchActive ? (
    // Viewing search results: an indicator with a count + an × to restore.
    <div className="flex items-center gap-1">
      <Tooltip title="Modify search">
        <Button
          size="middle"
          icon={<SearchOutlined />}
          onClick={onOpenSearch}
          style={{
            borderColor: "#1e40af",
            color: "#1e40af",
            fontWeight: 500,
          }}
        >
          Viewing {searchCount} searched
        </Button>
      </Tooltip>
      <Tooltip title="Exit search — restore the previous feed">
        <Button
          size="middle"
          icon={<CloseOutlined />}
          onClick={onExitSearch}
          aria-label="Exit search"
        />
      </Tooltip>
    </div>
  ) : (
    <Button size="middle" icon={<SearchOutlined />} onClick={onOpenSearch}>
      Search
    </Button>
  );
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
          <BlindAnnotationHeader
            actionButton={{
              label: feedActionLabel,
              onClick: onOpenFeedConfig,
              loading: feedActionLoading,
            }}
            secondaryContent={searchControl}
          />
          <div className="flex-1 overflow-hidden">
            <PredictionFeed />
          </div>
        </div>
      }
    />
  );
};
