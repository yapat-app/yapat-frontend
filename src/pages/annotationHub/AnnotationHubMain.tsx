import React from "react";
import { Alert, Button, Empty, Spin } from "antd";
import { DatabaseOutlined, DeleteOutlined, HistoryOutlined } from "@ant-design/icons";
import { PhaseLayout } from "../ActiveLearning";
import { ClassicWorkspace } from "../../components/layout/ClassicWorkspace";
import { clearSavedFeed } from "../../redux/features/alSlice";
import { useAppDispatch } from "../../hooks";
import type { AnnotateMode } from "./types";

export type AnnotationHubMainProps = {
  /** While restoring last dataset into the URL; hide empty states that would flash. */
  awaitingHubDatasetBootstrap?: boolean;
  mode: AnnotateMode;
  selectedDatasetId: number | null;
  isRestoredFeed: boolean;
  savedFeedLabel: string | null;
  isClassicMode: boolean;
  showClassicSpinner: boolean;
  showClassicEmpty: boolean;
  classicDatasetId: string | null;
  generateFeedLabel: string;
  onOpenClassicFeedConfig: () => void;
  onBrowseDatasets: () => void;
};

export const AnnotationHubMain: React.FC<AnnotationHubMainProps> = ({
  awaitingHubDatasetBootstrap = false,
  mode,
  selectedDatasetId,
  isRestoredFeed,
  savedFeedLabel,
  isClassicMode,
  showClassicSpinner,
  showClassicEmpty,
  classicDatasetId,
  generateFeedLabel,
  onOpenClassicFeedConfig,
  onBrowseDatasets,
}) => {
  const dispatch = useAppDispatch();

  if (awaitingHubDatasetBootstrap) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <Spin size="large" />
        <p className="text-sm text-gray-500 font-ibm-sans">Loading workspace…</p>
      </div>
    );
  }

  return (
    <>
      {mode === "al" && !selectedDatasetId && isRestoredFeed && (
        <Alert
          type="info"
          showIcon
          icon={<HistoryOutlined />}
          className="mx-6 mt-3 rounded-lg"
          message={
            <span className="text-sm font-ibm-sans">
              Showing saved feed from <strong>{savedFeedLabel}</strong> — select
              the original dataset to run new inference or give feedback.
            </span>
          }
          action={
            <Button
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => dispatch(clearSavedFeed())}
              danger
            >
              Clear
            </Button>
          }
        />
      )}

      {mode === "al" &&
        (!selectedDatasetId && !isRestoredFeed ? (
          <div className="flex flex-1 items-center justify-center flex-col gap-3 text-gray-400">
            <DatabaseOutlined style={{ fontSize: 48 }} />
            <p className="text-lg font-ibm-sans">
              Select a dataset to start Active Learning
            </p>
            <p className="text-sm font-ibm-sans">
              Then click &quot;Start Inference&quot; to load predictions.
            </p>
          </div>
        ) : (
          <PhaseLayout />
        ))}

      {isClassicMode && showClassicSpinner && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 min-h-0">
          <Spin size="large" />
          <p className="text-sm text-gray-500 font-ibm-sans">Restoring your feed…</p>
        </div>
      )}

      {isClassicMode && showClassicEmpty && !showClassicSpinner && (
        <div className="flex flex-1 items-center justify-center">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-center">
                <p className="text-lg font-semibold font-ibm-mono mb-1">
                  No feed for this {mode} mode
                </p>
                <p className="text-gray-500 text-sm font-ibm-sans mb-4">
                  {!classicDatasetId
                    ? "Select a dataset above, then generate a feed to start annotating."
                    : mode === "similarity"
                      ? "No saved similarity feed for this dataset yet. Generate one with a reference audio sample."
                      : "No saved random feed for this dataset yet. Generate one to start annotating."}
                </p>
                {classicDatasetId && (
                  <Button type="primary" onClick={onOpenClassicFeedConfig}>
                    {generateFeedLabel}
                  </Button>
                )}
                {!classicDatasetId && (
                  <Button onClick={onBrowseDatasets}>Browse Datasets</Button>
                )}
              </div>
            }
          />
        </div>
      )}

      {isClassicMode && !showClassicEmpty && !showClassicSpinner && (
        <ClassicWorkspace />
      )}
    </>
  );
};

AnnotationHubMain.displayName = "AnnotationHubMain";
