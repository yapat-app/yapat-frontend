import React, { useEffect, useState } from "react";
import { Tooltip, Button } from "antd";
import { SoundOutlined, AudioOutlined } from "@ant-design/icons";
import { useAppSelector } from "../../hooks";
import { recordingApi, snippetApi } from "../../services/api";

interface SnippetHeaderProps {
  onFindSimilar?: (snippetId: number) => void;
}

export const SnippetHeader: React.FC<SnippetHeaderProps> = ({
  onFindSimilar,
}) => {
  const selectedSnippetIds = useAppSelector((s) => s.al.selectedSnippetIds);
  const predictions = useAppSelector((s) => s.al.predictions);
  const feedbacks = useAppSelector((s) => s.al.feedbacks);

  const snippetId = selectedSnippetIds[0] ?? null;
  const prediction = predictions.find((p) => p.snippet_id === snippetId);

  // The in-memory predictions are only a small top-K now (the feed is paged
  // from /api/explore), so a selection outside them resolves its recording
  // from the snippet itself.
  const [fetchedSnippet, setFetchedSnippet] = useState<{
    snippetId: number;
    recordingId: number | null;
  } | null>(null);
  useEffect(() => {
    if (snippetId === null || prediction) return;
    let cancelled = false;
    void snippetApi
      .getById(snippetId)
      .then((snippet) => {
        if (cancelled) return;
        setFetchedSnippet({
          snippetId,
          recordingId:
            typeof snippet.recording_id === "number" ? snippet.recording_id : null,
        });
      })
      .catch(() => {
        if (!cancelled) setFetchedSnippet({ snippetId, recordingId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [snippetId, prediction]);
  const fetchedForSelection =
    fetchedSnippet && fetchedSnippet.snippetId === snippetId ? fetchedSnippet : null;

  const recordingId =
    typeof prediction?.recording_id === "number"
      ? prediction.recording_id
      : (fetchedForSelection?.recordingId ?? null);

  // Fetched independently per selection rather than reusing PredictionFeed's
  // windowed recordingNameById cache — one lightweight GET-by-id is cheap and
  // keeps this component self-contained.
  const [recordingName, setRecordingName] = useState<string | undefined>(
    undefined,
  );
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
  // No feed generated yet (nothing in memory for this dataset) — the feed body
  // below shows its own empty state, so stay in sync and render nothing.
  if (!prediction && predictions.length === 0) return null;
  const hasFeedback = !!feedbacks[snippetId];

  return (
    <div
      data-tour="selection-panel"
      className="shrink-0 flex items-center justify-between gap-2 px-4 py-2.5 border-b border-gray-100 bg-white sticky top-0 z-10"
    >
      <div className="flex items-center gap-2 min-w-0">
        <SoundOutlined className="text-gray-400" />
        <h2 className="text-sm font-semibold font-ibm-mono text-gray-700 truncate">
          Snippet #{snippetId}
        </h2>
        {recordingName && (
          <span className="text-xs text-gray-400 font-ibm-sans truncate">
            · {recordingName}
          </span>
        )}
        {selectedSnippetIds.length > 1 && (
          <span className="text-xs text-gray-400 font-ibm-sans shrink-0">
            (+{selectedSnippetIds.length - 1} more)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Tooltip title="Keyboard shortcuts: previous / next snippet">
          <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-ibm-sans cursor-default select-none">
            <kbd className="min-w-5 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center font-ibm-mono text-[10px] leading-none text-gray-500 shadow-sm">
              ↑
            </kbd>
            <kbd className="min-w-5 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center font-ibm-mono text-[10px] leading-none text-gray-500 shadow-sm">
              ↓
            </kbd>
            Previous / next
          </span>
        </Tooltip>
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
