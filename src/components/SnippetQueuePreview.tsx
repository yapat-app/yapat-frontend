/**
 * Snippet Queue Preview Component
 * 
 * Displays a preview of the snippet queue with visual indicators
 * for annotated vs unannotated snippets
 */

import React from "react";
import { Card } from "antd";
import { CheckCircleOutlined } from "@ant-design/icons";
import type { Snippet } from "../types";

interface SnippetQueuePreviewProps {
  snippets: Snippet[];
  currentSnippetId: number | null;
  maxVisible?: number;
}

export const SnippetQueuePreview: React.FC<SnippetQueuePreviewProps> = ({
  snippets,
  currentSnippetId,
  maxVisible = 15,
}) => {
  const visibleSnippets = snippets.slice(0, maxVisible);
  const remainingCount = snippets.length - maxVisible;

  return (
    <Card title="Snippet Queue" size="small" className="shadow-sm">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {visibleSnippets.map((snippet) => (
          <div
            key={snippet.id}
            className={`
              flex-shrink-0 p-3 border-2 rounded-lg min-w-[80px] text-center cursor-pointer
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
              /* Could add click to jump to snippet */
            }}
          >
            <div className="text-xs text-gray-500 mb-1">#{snippet.id}</div>
            {snippet.is_annotated && (
              <CheckCircleOutlined className="text-green-600" />
            )}
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="flex-shrink-0 p-3 text-gray-400 flex items-center">
            +{remainingCount} more
          </div>
        )}
      </div>
    </Card>
  );
};

