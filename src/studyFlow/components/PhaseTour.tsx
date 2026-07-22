/**
 * PhaseTour — runs the incremental guided tour over the live UI.
 *
 * Steps come pre-filtered (only what's new this phase) from the flow. Each step
 * anchors to a `data-tour="<key>"` element; if that element isn't mounted the
 * step renders centred rather than breaking the tour.
 
 */

import React, { useEffect } from "react";
import { Tour, type TourProps } from "antd";
import { useStudyFlow } from "../useStudyFlow";
import { useAppSelector } from "../../hooks";

export const PhaseTour: React.FC = () => {
  const { enabled, stage, pendingTourSteps, finishTour } = useStudyFlow();
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);

  const isTour = enabled && stage === "tour";
  const hasSteps = pendingTourSteps.length > 0;

  // Defensive: if we somehow entered the tour stage with nothing to show, don't
  // trap the participant — start the timer. (Normal path skips tour upfront.)
  useEffect(() => {
    if (isTour && !hasSteps) finishTour();
  }, [isTour, hasSteps, finishTour]);

  if (!isTour || !hasSteps) return null;

  if (selectedDatasetId == null) {
    const gateStep: NonNullable<TourProps["steps"]>[number] = {
      title: "Select a dataset first",
      description:
        "Pick a dataset from this dropdown to load the audio snippets. The guided tour will continue automatically once a dataset is selected.",
      placement: "bottomLeft",
      // Hide "Next" — there is nothing to advance to until a dataset is chosen.
      nextButtonProps: { style: { display: "none" } },
      target: () =>
        document.querySelector('[data-tour="dataset-selector"]') as HTMLElement,
    };
    return <Tour open mask={false} steps={[gateStep]} onClose={finishTour} />;
  }

  const steps: TourProps["steps"] = pendingTourSteps.map((s) => ({
    title: s.title,
    description: s.description,
    placement: s.placement,
    // antd renders the step centred when the element isn't found; the cast
    // satisfies its non-null target signature while we tolerate a missing node.
    target: () =>
      document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement,
  }));

  return <Tour open steps={steps} onClose={finishTour} />;
};
