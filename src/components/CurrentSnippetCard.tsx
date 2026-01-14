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
import { Card, Tag, Space, Button, Dropdown } from "antd";
import { DownOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import {
  ArrowRightOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { AudioPlayerPlaceholder } from "./AudioPlayerPlaceholder";
import type { Snippet, Annotation, ExportAnnotation } from "../types";
import { exportAllAnnotations } from "../redux/features/datasetSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import { useSearchParams } from "react-router-dom";

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
  const dispatch = useAppDispatch();
  const [searchParams] = useSearchParams();
  const datasetId = searchParams.get("dataset_id");
  const handleCSVDownload = (format: string) => {
    const payload: ExportAnnotation = {
      dataset_id: datasetId,
      format: format,
    };
    console.log(payload);
    dispatch(exportAllAnnotations(payload));
  };

  const items: MenuProps["items"] = [
    {
      label: (
        <Button onClick={() => handleCSVDownload("csv")}>Export as CSV</Button>
      ),
      key: "0",
    },
    {
      label: (
        <Button onClick={() => handleCSVDownload("json")}>
          Export as JSON
        </Button>
      ),
      key: "1",
    },
    {
      type: "divider",
    },
  ];

  return (
    <Card className="mb-4 shadow-md">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-semibold mb-1">Snippet #{snippet.id}</h3>
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
            {snippet.is_annotated ? "✓ Annotated" : "Pending"}
          </Tag>
        </div>
      </div>

      {/* Audio Player */}
      <AudioPlayerPlaceholder />

      {/* Existing Annotations */}
      {annotations.length > 0 && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
          <h4 className="font-semibold mb-2 text-green-900">
            Existing Annotations ({annotations.length}):
          </h4>
          <Space wrap>
            {annotations.map((ann) => (
              <Tag key={ann.id} color="green" className="text-sm py-1 px-3">
                <strong>{ann.resolved_name_snapshot}</strong>
                <span className="ml-2 text-xs">
                  ({(ann.confidence * 100).toFixed(0)}%)
                </span>
              </Tag>
            ))}
          </Space>
        </div>
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
        <div className="flex justify-center items-center gap-4">
          <Dropdown menu={{ items }}>
            <a onClick={(e) => e.preventDefault()}>
              <Space>
                Export
                <DownOutlined />
              </Space>
            </a>
          </Dropdown>
          <Button
            type="primary"
            size="large"
            onClick={onAddAnnotation}
            icon={<CheckCircleOutlined />}
          >
            Add Annotation
          </Button>
        </div>
      </div>
    </Card>
  );
};
