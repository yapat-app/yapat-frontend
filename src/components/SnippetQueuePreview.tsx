/**
 * Snippet Queue Preview Component
 *
 * Displays a preview of the snippet queue with visual indicators
 * for annotated vs unannotated snippets
 */

import React, { useState } from "react";
import { Card } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import type { Snippet } from "../types";
import { setCurrentSnippet } from "../redux/features/snippetSlice";
import { useAppDispatch } from "../hooks";

interface SnippetQueuePreviewProps {
  snippets: Snippet[];
  currentSnippetId: number | null;
  maxVisible?: number;
}

export const SnippetQueuePreview: React.FC<SnippetQueuePreviewProps> = ({
  snippets,
  currentSnippetId,
}) => {
  const dispatch = useAppDispatch();

  const [maxVisible, setMaxVisible] = useState(12);
  const [expanded, setExpanded] = useState(false);
  const visibleSnippets = snippets.slice(0, maxVisible);
  const remainingCount = snippets.length - maxVisible;

  return (
    <Card
      title="Snippet Queue"
      size="small"
      className="shadow-sm auto"
      bodyStyle={{ padding: 8 }}
    >
      <div
        className={`
      flex gap-2 pl-1
      ${expanded ? "overflow-x-visible flex-wrap" : "overflow-x-auto"}
    `}
      >
        {visibleSnippets.map((snippet) => (
          <div
            key={snippet.id}
            className={`
              shrink-0 px-2 py-1.5 border-2 rounded-md min-w-16 text-center cursor-pointer
              transition-all duration-200
              ${
                snippet.id === currentSnippetId
                  ? "bg-blue-100 border-blue-500 shadow-md scale-105"
                  : snippet.is_annotated
                    ? "bg-green-50 border-green-300 hover:border-green-400"
                    : "bg-gray-50 border-gray-200 hover:border-gray-400 hover:bg-gray-100"
              }
            `}
            onClick={() => {
              /* Choose snippet from the snippet queue */
              dispatch(setCurrentSnippet(snippet));
            }}
          >
            <div className="text-xs text-gray-500 leading-4">#{snippet.id}</div>
            {snippet.is_annotated && (
              <CheckCircleOutlined className="text-green-600" />
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div
            onClick={() => {
              setMaxVisible(snippets.length);
              setExpanded(true);
            }}
            className="shrink-0 px-2 py-1.5 text-gray-400 flex items-center hover:cursor-pointer"
          >
            +{remainingCount} more
          </div>
        )}
        {remainingCount === 0 && (
          <div
            onClick={() => {
              setMaxVisible(12);
              setExpanded(false);
            }}
            className="shrink-0 px-2 py-1.5 text-gray-400 flex items-center hover:cursor-pointer"
          >
            show less
          </div>
        )}
      </div>
    </Card>
  );
};
