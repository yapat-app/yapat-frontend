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
import { Card, Tag, Space, Button, Divider } from "antd";
import { ArrowRightOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { AudioPlayerPlaceholder } from "./AudioPlayerPlaceholder";
import type { Snippet, Annotation } from "../types";
import { LabelSpace } from "./LabelSpace";

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
    <Card className="flex flex-col mb-4 gap-1 shadow-md h-fit">
      <div className="flex flex-1 gap-4  ">
        <div className="w-[65%]  ">
          <div className="flex justify-between items-start mb-4 h-fit ">
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
                color={snippet.is_annotated ? "green" : "orange"}
                className="text-sm"
              >
                {snippet.is_annotated ? "✓ Annotated" : "Not Annotated"}
              </Tag>
            </div>
          </div>

          {/* Audio Player */}
          <AudioPlayerPlaceholder />
        </div>
        {/* Label List */}
        <div className="w-[35%] h-[65vh]  ">
          <LabelSpace />
        </div>
      </div>
      {/* Existing Annotations */}
      {annotations.length > 0 && (
        <>
          <Divider />
          <div className="flex  gap-4   w-full">
            <div className="mb-4 p-4 bg-green-50 rounded-lg  border-green-200">
              <h4 className="font-semibold mb-2 text-green-900">
                Existing Annotations ({annotations.length}):
              </h4>

              <Space wrap>
                {annotations.map((ann) => (
                  <Tag key={ann.id} color="green" className="text-sm py-1 px-3">
                    <strong>{ann.resolved_name_snapshot}</strong>
                  </Tag>
                ))}
              </Space>
            </div>
          </div>
        </>
      )}
      {/* Action Buttons */}
      <div className="flex justify-between items-center">
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
