import React, { useEffect, useState } from "react";
import { Tooltip, Button } from "antd";
import { SoundOutlined, AudioOutlined } from "@ant-design/icons";
import { useAppSelector } from "../../hooks";
import { recordingApi } from "../../services/api";

interface SnippetHeaderProps {
  onFindSimilar?: (snippetId: number) => void;
}

export const SnippetHeader: React.FC<SnippetHeaderProps> = ({ onFindSimilar }) => {
  const selectedSnippetIds = useAppSelector((s) => s.al.selectedSnippetIds);
  const predictions = useAppSelector((s) => s.al.predictions);
  const feedbacks = useAppSelector((s) => s.al.feedbacks);

  const snippetId = selectedSnippetIds[0] ?? null;
  const prediction = predictions.find((p) => p.snippet_id === snippetId);
  const recordingId = typeof prediction?.recording_id === "number" ? prediction.recording_id : null;

  // Fetched independently per selection rather than reusing PredictionFeed's
  // windowed recordingNameById cache — one lightweight GET-by-id is cheap and
  // keeps this component self-contained.
  const [recordingName, setRecordingName] = useState<string | undefined>(undefined);
  // Reset immediately when the recording changes, following the same
  // "adjust state during render" pattern used by useRecordingLocations etc.,
  // rather than a synchronous setState call at the top of the effect below.
  const [namedRecordingId, setNamedRecordingId] = useState(recordingId);
  if (recordingId !== namedRecordingId) {
    setNamedRecordingId(recordingId);
    setRecordingName(undefined);
  }

  useEffect(() => {
    if (recordingId === null) return;
    let cancelled = false;
    void recordingApi
      .getById(recordingId)
      .then((rec) => {
        if (cancelled) return;
        setRecordingName(rec.file_name || rec.name || undefined);
      })
      .catch(() => {
        if (!cancelled) setRecordingName(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [recordingId]);

  if (snippetId === null) return null;
  // No matching prediction (e.g. no feed generated yet) — the feed body
  // below will show its own empty state, so stay in sync and render nothing.
  if (!prediction) return null;
  const hasFeedback = !!feedbacks[snippetId];

  return (
    <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <SoundOutlined className="text-gray-400" />
        <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 truncate">
          Labelling Snippet #{snippetId}
        </h2>
        {recordingName && (
          <span className="text-xs text-gray-400 font-ibm-sans truncate">
            · {recordingName}
          </span>
        )}
        {selectedSnippetIds.length > 1 && (
          <span className="text-xs text-gray-400 font-ibm-sans flex-shrink-0">
            (+{selectedSnippetIds.length - 1} more)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {prediction?.confidence != null && (
          <span
            className={[
              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold font-ibm-mono",
              prediction.confidence >= 0.8
                ? "bg-green-50 text-green-700 border border-green-200"
                : prediction.confidence >= 0.5
                ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
                : "bg-red-50 text-red-600 border border-red-200",
            ].join(" ")}
          >
            {Math.round(prediction.confidence * 100)}%
          </span>
        )}
        {hasFeedback && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
            Labeled
          </span>
        )}
        {onFindSimilar && (
          <Tooltip title="Find similar snippets">
            <Button
              type="text"
              size="small"
              icon={<AudioOutlined />}
              className="text-gray-400 hover:text-blue-500 px-1"
              onClick={() => onFindSimilar(snippetId)}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
};

SnippetHeader.displayName = "SnippetHeader";
