/**
 * Current Snippet Card Component
 *
 * Displays the current snippet being annotated with:
 * - Snippet information
 * - Audio player
 * - Existing annotations
 * - Navigation and action buttons
 */

import React from "react";
import { Card, Tag, Space, Button } from "antd";
import { ArrowRightOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { AudioPlayerPlaceholder } from "./AudioPlayerPlaceholder";
import type { Snippet, Annotation } from "../types";
import { LabelSpaceActive } from "./al/LabelSpaceActive";

interface CurrentSnippetCardProps {
  snippet: Snippet;
  annotations: Annotation[];
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export const CurrentSnippetCard: React.FC<CurrentSnippetCardProps> = ({
  snippet,
  annotations,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
}) => {
  return (
    <Card className="flex flex-col gap-1 shadow-md h-fit">
      {/* Existing Annotations - at top */}
      {annotations.length > 0 && (
        <div className="mb-3 p-2 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-semibold mb-2 text-green-900 text-sm">
            Existing Annotations ({annotations.length})
          </h4>
          <Space wrap size={[6, 6]}>
            {annotations.map((ann) => (
              <Tag key={ann.id} color="green" className="text-sm py-0.5 px-2">
                {ann.resolved_name_snapshot}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      {/* Main content: snippet/audio (left) and scrollable label list (right) */}
      <div className="flex gap-4 items-start">
        {/* Snippet / Audio – natural height based on content */}
        <div className="w-[65%] flex flex-col">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-lg font-semibold mb-1 font-ibm-sans">
                Snippet #{snippet.id}
              </h3>
              <p className="text-gray-600">
                <strong>Time:</strong> {snippet.start_time.toFixed(2)}s -{" "}
                {snippet.end_time.toFixed(2)}s ({snippet.duration.toFixed(1)}s
                duration)
              </p>
              <p className="text-gray-500 text-sm">
                <strong>Recording ID:</strong> {snippet.recording_id}
              </p>
            </div>
            <div>
              <Tag
                color={annotations.length > 0 ? "green" : "orange"}
                className="text-sm"
              >
                {annotations.length > 0 ? "✓ Annotated" : "Not Annotated"}
              </Tag>
            </div>
          </div>

          {/* Audio Player */}
          <AudioPlayerPlaceholder />
        </div>
        {/* Label List */}
        <div className="w-[35%] max-h-[52vh] overflow-auto">
          <LabelSpaceActive />
        </div>
      </div>
      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-3">
        <div className="flex gap-2">
          <Button
            size="large"
            onClick={onPrevious}
            disabled={!canGoPrevious}
            icon={<ArrowLeftOutlined />}
          >
            Previous
          </Button>
          <Button size="large" onClick={onNext} disabled={!canGoNext}>
            Next <ArrowRightOutlined />
          </Button>
        </div>
      </div>
    </Card>
  );
};
