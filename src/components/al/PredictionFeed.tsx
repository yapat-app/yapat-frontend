/**
 * PredictionFeed — phase-aware snippet feed.
 *
 * Behaviour is driven entirely by `phase.feed.mode`:
 *   • "scrollable_topk"        → classic scrollable list of all predictions
 *   • "single_card_on_select"  → only the snippet matching `selectedSnippetId`
 *   • "hidden"                 → renders nothing
 */

import React, { useRef, useCallback } from "react";
import { Spin, Empty, Alert } from "antd";
import { useAppSelector } from "../../hooks";
import { PredictionCard } from "./PredictionCard";
import { RetrainControl } from "./RetrainControl";
import { useALSync } from "../../hooks/useALSync";
import { usePhaseConfig } from "../../studyPhases";

export const PredictionFeed: React.FC = () => {
  const { predictions, inferenceLoading, error, selectedSnippetId } = useAppSelector(
    (state) => state.al,
  );
  const phase = usePhaseConfig();

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // Scroll-into-view is only relevant for the scrollable variant.
  useALSync(cardRefs);

  const setCardRef = useCallback(
    (snippetId: number) => (el: HTMLDivElement | null) => {
      if (el) cardRefs.current.set(snippetId, el);
      else cardRefs.current.delete(snippetId);
    },
    [],
  );

  if (phase.feed.mode === "hidden") return null;

  if (error) {
    return (
      <Alert
        type="error"
        message="Failed to load predictions"
        description={error}
        className="m-4"
      />
    );
  }

  if (inferenceLoading && predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spin size="large" tip="Running inference…" />
      </div>
    );
  }

  if (!inferenceLoading && predictions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Empty description="No predictions yet. Configure the model and run inference." />
      </div>
    );
  }

  // ── Single-card mode (Phase 2.x / 3.x) ───────────────────────────────────
  if (phase.feed.mode === "single_card_on_select") {
    const selected = selectedSnippetId !== null
      ? predictions.find((p) => p.snippet_id === selectedSnippetId)
      : undefined;

    if (!selected) {
      return (
        <div className="flex items-center justify-center h-full px-6 text-center">
          <Empty description="Click a point on the projection to inspect that snippet." />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          <PredictionCard
            key={selected.id ?? selected.snippet_id}
            prediction={selected}
            cardRef={setCardRef(selected.snippet_id)}
          />
          {phase.ui.showRetrainControls && (
            <div className="sticky bottom-0 bg-[#f7fafc] pt-2 pb-0">
              <RetrainControl />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Scrollable top-K mode (Phase 1.x) ────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 py-3 gap-3 flex flex-col items-center">
        <div className="w-full max-w-[980px] flex flex-col gap-3">
        <p className="text-xs text-gray-400 font-ibm-sans  top-0 bg-[#f7fafc] py-1 z-10">
          {predictions.length} predictions
        </p>

        {predictions.map((p) => (
          <PredictionCard
            key={p.id ?? p.snippet_id}
            prediction={p}
            cardRef={setCardRef(p.snippet_id)}
          />
        ))}

        {inferenceLoading && (
          <div className="flex justify-center py-4">
            <Spin size="small" />
          </div>
        )}

        {phase.ui.showRetrainControls && (
          <div className="sticky bottom-0 bg-[#f7fafc] pt-2 pb-0">
            <RetrainControl />
          </div>
        )}
        </div>
      </div>
    </div>
  );
};
