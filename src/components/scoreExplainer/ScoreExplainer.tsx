/**
 * ScoreExplainer — the animated "what does this score actually mean" card.
 *
 * Mounted in two places from one definition:
 *   • the Phase 4 guided tour (variant "tour"), shown once as each score is
 *     introduced;
 *   • the ⓘ popover on each score row in ScoreHistogramPanel (variant
 *     "popover"), so it stays reachable for the rest of the study.
 *
 * One definition line, then the animation. Nothing below it: the cards describe
 * what a score measures and never tell a participant what to annotate.
 *
 * `active` gates the animation clock: the sidebar mounts five of these, and only
 * the open popover should be running a frame loop.
 */

import React from "react";
import { EXPLAINER_COPY, type ExplainerKey } from "./copy";
import { BlendScene } from "./scenes/BlendScene";
import { ConfidenceScene } from "./scenes/ConfidenceScene";
import { DistributionScene } from "./scenes/DistributionScene";
import { MapScene } from "./scenes/MapScene";

interface ScoreExplainerProps {
  scoreKey: ExplainerKey;
  variant: "tour" | "popover";
  /** False pauses the animation (closed popovers cost nothing). */
  active?: boolean;
}

function renderScene(scoreKey: ExplainerKey, active: boolean): React.ReactNode {
  switch (scoreKey) {
    case "uncertainty":
      return <DistributionScene active={active} />;
    case "confidence":
      return <ConfidenceScene active={active} />;
    case "diversity":
    case "density":
      return <MapScene mode={scoreKey} active={active} />;
    case "composite":
      return <BlendScene active={active} />;
  }
}

export const ScoreExplainer: React.FC<ScoreExplainerProps> = ({
  scoreKey,
  variant,
  active = true,
}) => {
  const copy = EXPLAINER_COPY[scoreKey];
  const isPopover = variant === "popover";

  return (
    // Fixed widths on both variants: antd's Tour panel and Popover both size to
    // their content, so this is what makes the animated card wide enough to
    // read without touching antd's own CSS.
    <div className={isPopover ? "w-[320px] font-ibm-sans" : "w-[360px] font-ibm-sans"}>
      {isPopover && (
        <p className="mb-0.5 text-[13px] font-semibold text-gray-800">{copy.title}</p>
      )}
      <p className="mb-2 text-[12.5px] leading-relaxed text-gray-600">{copy.definition}</p>
      {renderScene(scoreKey, active)}
    </div>
  );
};
