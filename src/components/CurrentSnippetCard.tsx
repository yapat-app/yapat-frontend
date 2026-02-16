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
import { Card, Tag, Space, Button, Tooltip } from "antd";
import {
  ArrowRightOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { AudioPlayerPlaceholder } from "./AudioPlayerPlaceholder";
import type { Snippet, Annotation } from "../types";
import { AnnotationForm } from "./AnnotationForm";
import { LabelSpace } from "./LabelSpace";

interface CurrentSnippetCardProps {
  snippet: Snippet;
  annotations: Annotation[];
  onPrevious: () => void;
  onNext: () => void;
  onAddAnnotation: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
}

export const CurrentSnippetCard: React.FC<CurrentSnippetCardProps> = ({
  snippet,
  annotations,
  onPrevious,
  onNext,
  onAddAnnotation,
  canGoPrevious,
  canGoNext,
}) => {
  return (
    <Card className="flex flex-col mb-4 gap-1 shadow-md h-fit">
      {/* Existing Annotations - at top */}
      {annotations.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
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
      <div className="flex gap-4">
        {/* Snippet / Audio – natural height based on content */}
        <div className="w-[65%] flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold mb-1 font-ibm-sans">
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
          {/* Audio Player & Navigation Buttons */}
          <div className="flex w-full items-center justify-between gap-2">
            <Tooltip title="Previous Snippet">
              <Button
                className="w-12! h-12"
                onClick={onPrevious}
                disabled={!canGoPrevious}
                icon={<ArrowLeftOutlined />}
              ></Button>
            </Tooltip>
            <AudioPlayerPlaceholder />
            <Tooltip title="Next Snippet">
              <Button
                className="w-12 h-12"
                onClick={onNext}
                disabled={!canGoNext}
              >
                <ArrowRightOutlined />
              </Button>
            </Tooltip>
          </div>
        </div>
        {/* Label Space – fixed max height with scrollable list */}
        <div className="w-[35%] flex flex-col min-w-0" style={{ maxHeight: '65vh' }}>
          <LabelSpace />
        </div>
      </div>
    </Card>
  );
};
