import React, { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "../../hooks";
import { setSelectedSnippet } from "../../redux/features/alSlice";
import { FullRecordingCard } from "./FullRecordingCard";

interface Props {
  recordingId: number;
  /** The snippet the view was opened from. */
  snippetId: number;
  onClose: () => void;
  /** Wide feed layout: same width and spacing as the wide snippet card. */
  wide?: boolean;
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
  wide = false,
}) => {
  const dispatch = useAppDispatch();
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
    <div
      className={[
        "absolute inset-0 z-30 overflow-hidden",
        wide ? "bg-[#f7fafc] px-6 py-5" : "bg-white px-3 pt-2 pb-2",
      ].join(" ")}
    >
      <div
        className={wide ? "w-full h-full" : "w-full max-w-300 mx-auto h-full"}
      >
        <div
          className={[
            "h-full rounded-xl border border-yellow-400 ring-2 ring-yellow-200 shadow-md bg-white overflow-hidden",
            wide ? "p-4" : "px-2.5 pt-2 pb-2",
          ].join(" ")}
        >
          <FullRecordingCard
            fillAvailable={wide}
            datasetId={Number(datasetId)}
            snippetSetId={snippetSetId}
            recordingId={recordingId}
            snippetId={snippetId}
            onBack={onClose}
            // Selecting it is what a click on the projection does; the effect
            // above then closes this view and the feed shows that snippet.
            onSelectSnippet={(id) => dispatch(setSelectedSnippet(id))}
          />
        </div>
      </div>
    </div>
  );
};
