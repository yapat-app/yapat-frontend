/**
 * PredictionFeed — scrollable list of PredictionCards (right half).
 */

import React, { useRef, useCallback } from "react";
import { Spin, Empty, Alert } from "antd";
import { useAppSelector } from "../../hooks";
import { PredictionCard } from "./PredictionCard";
import { RetrainControl } from "./RetrainControl";
import { useALSync } from "../../hooks/useALSync";

export const PredictionFeed: React.FC = () => {
  const { predictions, inferenceLoading, error } = useAppSelector(
    (state) => state.al,
  );

  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useALSync(cardRefs);

  const setCardRef = useCallback(
    (snippetId: number) => (el: HTMLDivElement | null) => {
      if (el) cardRefs.current.set(snippetId, el);
      else cardRefs.current.delete(snippetId);
    },
    [],
  );

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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Label Space ── sits above the scrollable card list */}
      {/* <ALLabelSpacePanel /> */}

      {/* ── Scrollable card list ── */}
      <div className="flex-1 overflow-y-auto px-3 py-3 gap-3 flex flex-col">
        <p className="text-xs text-gray-400 font-ibm-sans  top-0 bg-[#f7fafc] py-1 z-10">
          {predictions.length} predictions
        </p>

        {predictions.map((p) => (
          <PredictionCard
            key={p.id}
            prediction={p}
            cardRef={setCardRef(p.snippet_id)}
          />
        ))}

        {inferenceLoading && (
          <div className="flex justify-center py-4">
            <Spin size="small" />
          </div>
        )}

        <div className="sticky bottom-0 bg-[#f7fafc] pt-2 pb-0">
          <RetrainControl />
        </div>
      </div>
    </div>
  );
};
