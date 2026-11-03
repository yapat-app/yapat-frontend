import React, { useEffect, useRef, useState } from "react";
import { Tooltip, Button, ConfigProvider } from "antd";
import {
  SoundOutlined,
  AudioOutlined,
  ExpandAltOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { useAppSelector } from "../../hooks";
import { recordingApi, snippetApi } from "../../services/api";
import {
  getRecordingName,
  getSnippetRecording,
  rememberRecordingName,
} from "../../utils/recordingNameCache";
import { SpectrogramSettingsPopover } from "../../components/fullRecording/SpectrogramSettingsPopover";

interface SnippetHeaderProps {
  onFindSimilar?: (snippetId: number) => void;
  /** Makes the file name a control that opens the snippet's full recording. */
  onOpenFullRecording?: (recordingId: number, snippetId: number) => void;
  onCloseFullRecording?: () => void;
  fullRecordingOpen?: boolean;
}

export const SnippetHeader: React.FC<SnippetHeaderProps> = ({
  onFindSimilar,
  onOpenFullRecording,
  onCloseFullRecording,
  fullRecordingOpen = false,
}) => {
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const selectedSnippetIds = useAppSelector((s) => s.al.selectedSnippetIds);
  const predictions = useAppSelector((s) => s.al.predictions);
  const feedbacks = useAppSelector((s) => s.al.feedbacks);

  const snippetId = selectedSnippetIds[0] ?? null;
  const prediction = predictions.find((p) => p.snippet_id === snippetId);

  // The hover text of the file-name control shows only while the mouse is on it:
  // a click hides it at once and it stays hidden until the mouse has left.
  const [nameTipOpen, setNameTipOpen] = useState(false);
  const nameTipMutedRef = useRef(false);
  const nameTipUnmuteRef = useRef<((e: PointerEvent) => void) | null>(null);
  useEffect(
    () => () => {
      if (nameTipUnmuteRef.current) {
        window.removeEventListener("pointermove", nameTipUnmuteRef.current);
      }
    },
    [],
  );
  // The control is re-created when it opens/closes, so "has the mouse left?" is
  // judged by what is under the pointer, not by events on one particular element.
  const hideNameTipUntilMouseLeaves = () => {
    nameTipMutedRef.current = true;
    setNameTipOpen(false);
    if (nameTipUnmuteRef.current) {
      window.removeEventListener("pointermove", nameTipUnmuteRef.current);
    }
    const onMove = (e: PointerEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest("[data-full-recording-toggle]")
      ) {
        return;
      }
      nameTipMutedRef.current = false;
      window.removeEventListener("pointermove", onMove);
      nameTipUnmuteRef.current = null;
    };
    nameTipUnmuteRef.current = onMove;
    window.addEventListener("pointermove", onMove);
  };

  // The in-memory predictions are only a small top-K now (the feed is paged
  // from /api/explore), so a selection outside them resolves its recording
  // from the snippet itself.
  const [fetchedSnippet, setFetchedSnippet] = useState<{
    snippetId: number;
    recordingId: number | null;
  } | null>(null);
  useEffect(() => {
    if (snippetId === null || prediction) return;
    // The feed already told us which recording this snippet is in.
    if (getSnippetRecording(snippetId) !== undefined) return;
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
      : (fetchedForSelection?.recordingId ??
        (snippetId === null ? undefined : getSnippetRecording(snippetId)) ??
        null);

  // Fetched independently per selection rather than reusing PredictionFeed's
  // windowed recordingNameById cache — one lightweight GET-by-id is cheap and
  // keeps this component self-contained.
  const [recordingName, setRecordingName] = useState<string | undefined>(
    recordingId === null ? undefined : getRecordingName(recordingId),
  );
  // Reset immediately when the recording changes, following the same
  // "adjust state during render" pattern used by useRecordingLocations etc.,
  // rather than a synchronous setState call at the top of the effect below.
  const [namedRecordingId, setNamedRecordingId] = useState(recordingId);
  if (recordingId !== namedRecordingId) {
    setNamedRecordingId(recordingId);
    setRecordingName(
      recordingId === null ? undefined : getRecordingName(recordingId),
    );
  }

  useEffect(() => {
    if (recordingId === null) return;
    let cancelled = false;
    void recordingApi
      .getById(recordingId)
      .then((rec) => {
        if (cancelled) return;
        const name = rec.file_name || rec.name || undefined;
        if (name) rememberRecordingName(recordingId, name);
        setRecordingName(name);
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
        {recordingName && onOpenFullRecording && recordingId !== null ? (
          <>
            <span className="text-xs text-gray-400 font-ibm-sans shrink-0">
              ·
            </span>
            {/* No click ripple, no colour transition: the name just changes. The
                ConfigProvider must wrap the Tooltip, not sit inside it: a tooltip
                needs a real element as its child to attach its hover to. */}
            <ConfigProvider wave={{ disabled: true }}>
              <Tooltip
                title={
                  fullRecordingOpen
                    ? "Close full recording"
                    : "View full recording"
                }
                trigger="hover"
                open={nameTipOpen}
                onOpenChange={(next) =>
                  setNameTipOpen(next && !nameTipMutedRef.current)
                }
              >
                <Button
                  size="small"
                  type={fullRecordingOpen ? "primary" : "text"}
                  iconPlacement="end"
                  icon={
                    fullRecordingOpen ? (
                      <CloseOutlined />
                    ) : (
                      <ExpandAltOutlined />
                    )
                  }
                  aria-pressed={fullRecordingOpen}
                  aria-label={`${fullRecordingOpen ? "Close" : "View"} full recording ${recordingName}`}
                  data-full-recording-toggle
                  onClick={() => {
                    hideNameTipUntilMouseLeaves();
                    if (fullRecordingOpen) onCloseFullRecording?.();
                    else onOpenFullRecording(recordingId, snippetId);
                  }}
                  className={[
                    "min-w-0 max-w-[190px] -ml-1 h-5! px-1.5! text-fs-11! font-ibm-sans transition-none!",
                    fullRecordingOpen
                      ? ""
                      : "text-gray-500! hover:text-blue-600! hover:bg-blue-50!",
                  ].join(" ")}
                >
                  <span className="truncate">{recordingName}</span>
                </Button>
              </Tooltip>
            </ConfigProvider>
          </>
        ) : (
          recordingName && (
            <span className="text-xs text-gray-400 font-ibm-sans truncate">
              · {recordingName}
            </span>
          )
        )}
        {selectedSnippetIds.length > 1 && (
          <span className="text-xs text-gray-400 font-ibm-sans shrink-0">
            (+{selectedSnippetIds.length - 1} more)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!fullRecordingOpen && (
          <Tooltip title="Keyboard shortcuts: previous / next snippet">
            <span className="inline-flex items-center gap-1 text-fs-10 text-gray-400 font-ibm-sans cursor-default select-none">
              <kbd className="min-w-5 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center font-ibm-mono text-fs-10 leading-none text-gray-500 shadow-sm">
                ↑
              </kbd>
              <kbd className="min-w-5 rounded border border-gray-200 bg-gray-50 px-1 py-0.5 text-center font-ibm-mono text-fs-10 leading-none text-gray-500 shadow-sm">
                ↓
              </kbd>
              Previous / next
            </span>
          </Tooltip>
        )}
        {hasFeedback && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-fs-10 font-medium bg-green-50 text-green-700 border border-green-200">
            Labeled
          </span>
        )}
        {onFindSimilar && !fullRecordingOpen && (
          <Tooltip title="Show the snippets that sound most like this one (Shift+F)">
            <Button
              size="small"
              icon={<AudioOutlined />}
              className="font-ibm-sans text-xs"
              onClick={() => onFindSimilar(snippetId)}
            >
              Find similar
            </Button>
          </Tooltip>
        )}
        <SpectrogramSettingsPopover datasetId={selectedDatasetId} />
      </div>
    </div>
  );
};

SnippetHeader.displayName = "SnippetHeader";
