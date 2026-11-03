import React, { useEffect } from "react";
import { useAppSelector } from "../../hooks";
import { FullRecordingCard } from "./FullRecordingCard";

interface Props {
  recordingId: number;
  /** The snippet the view was opened from. */
  snippetId: number;
  onClose: () => void;
}

/**
 * The listen-only view, framed exactly like the snippet card it takes the place
 * of. It lives in its own component so that everything it needs to watch (the
 * selected snippet, dataset and snippet set) is subscribed to HERE, while it is
 * open, and not in the hub's Workspace, which would then re-render the whole
 * hub (including the projection chart) on every scroll step.
 */
export const FullRecordingOverlay: React.FC<Props> = ({
  recordingId,
  snippetId,
  onClose,
}) => {
  const datasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const snippetSetId = useAppSelector((s) => s.al.snippetSetId);
  const selectedSnippetId = useAppSelector(
    (s) => s.al.selectedSnippetIds[0] ?? null,
  );

  // It belongs to the snippet it was opened from: selecting another one
  // (e.g. a click in the projection) closes it.
  useEffect(() => {
    if (selectedSnippetId !== snippetId) onClose();
  }, [selectedSnippetId, snippetId, onClose]);

  if (datasetId === null) return null;

  return (
    <div className="absolute inset-0 z-30 bg-white overflow-hidden px-3 pt-2 pb-2">
      <div className="w-full max-w-300 mx-auto h-full">
        <div className="h-full rounded-xl border border-yellow-400 ring-2 ring-yellow-200 shadow-md bg-white overflow-hidden px-2.5 pt-2 pb-2">
          <FullRecordingCard
            datasetId={Number(datasetId)}
            snippetSetId={snippetSetId}
            recordingId={recordingId}
            snippetId={snippetId}
          />
        </div>
      </div>
    </div>
  );
};
