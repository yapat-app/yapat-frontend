/**
 * PhaseTour — runs the incremental guided tour over the live UI.
 *
 * Steps come pre-filtered (only what's new this phase) from the flow. Each step
 * anchors to a `data-tour="<key>"` element; if that element isn't mounted the
 * step renders centred rather than breaking the tour.
 
 */

import React, { useCallback, useEffect, useRef } from "react";
import { Tour, type TourProps } from "antd";
import { useStudyFlow } from "../useStudyFlow";
import { useAppSelector } from "../../hooks";
import { ScoreExplainer, type ExplainerKey } from "../../components/scoreExplainer";
import { useStudyLogger } from "../../studyLogging";
import type { TourStepSpec } from "../types";

/**
 * Render a step description that may contain multiple lines.
 */
function renderDescription(text: string): React.ReactNode {
  const lines = text.split("\n");
  return (
    <div className="flex flex-col gap-1">
      {lines.map((line, i) => {
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        const isBullet = line.trimStart().startsWith("• ");
        return (
          <div key={i} className={isBullet ? "pl-3" : undefined}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A step's body: the animated score explainer (when the step declares one)
 * above its authored text. Steps whose animation says it all carry an empty
 * description, so the text block is dropped rather than rendered blank.
 */
function renderStepBody(step: TourStepSpec): React.ReactNode {
  const text = step.description.trim() ? renderDescription(step.description) : null;
  if (!step.visual) return text;
  return (
    <div className="flex flex-col gap-2">
      <ScoreExplainer scoreKey={step.visual} variant="tour" />
      {text}
    </div>
  );
}

export const PhaseTour: React.FC = () => {
  const { enabled, stage, pendingTourSteps, finishTour } = useStudyFlow();
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const { log } = useStudyLogger();

  const isTour = enabled && stage === "tour";
  const hasSteps = pendingTourSteps.length > 0;

  // Dwell tracking for the animated score cards. `viewRef` holds the explainer
  // currently on screen; it is flushed when the participant advances or closes,
  // so `durationMs` is how long they actually watched it.
  const viewRef = useRef<{ key: ExplainerKey; at: number } | null>(null);

  const flushView = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    viewRef.current = null;
    log(
      "score_explainer_view",
      { property: view.key, surface: "tour" },
      { durationMs: Math.round(performance.now() - view.at) },
    );
  }, [log]);

  const enterStep = useCallback(
    (index: number) => {
      const visual = pendingTourSteps[index]?.visual;
      viewRef.current = visual ? { key: visual, at: performance.now() } : null;
    },
    [pendingTourSteps],
  );

  // antd Tour opens on step 0 without firing onChange, so arm the first step here.
  useEffect(() => {
    if (isTour && hasSteps) enterStep(0);
    return () => {
      viewRef.current = null;
    };
  }, [isTour, hasSteps, enterStep]);

  // Defensive: if we somehow entered the tour stage with nothing to show, don't
  // trap the participant — start the timer. (Normal path skips tour upfront.)
  useEffect(() => {
    if (isTour && !hasSteps) finishTour();
  }, [isTour, hasSteps, finishTour]);

  // antd Tour measures the highlighted element once when it opens and only
  // re-measures on window resize/scroll. Feed content (spectrogram + audio
  // player) loads asynchronously, so a target can grow taller AFTER the
  // spotlight was drawn — leaving the player below the highlight. Observe every
  // `[data-tour]` target while the tour runs and nudge Tour to re-measure
  // (via a synthetic resize) whenever one changes size or a new one mounts.
  useEffect(() => {
    if (!isTour) return;
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event("resize"));
    });
    const observed = new WeakSet<Element>();
    const attach = () => {
      document.querySelectorAll("[data-tour]").forEach((el) => {
        if (!observed.has(el)) {
          observed.add(el);
          ro.observe(el);
        }
      });
    };
    attach();
    // Catch targets that mount after the tour opens (e.g. feed still loading).
    const mo = new MutationObserver(attach);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [isTour]);

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
    description: renderStepBody(s),
    placement: s.placement,
    // antd renders the step centred when the element isn't found; the cast
    // satisfies its non-null target signature while we tolerate a missing node.
    target: () =>
      document.querySelector(`[data-tour="${s.target}"]`) as HTMLElement,
  }));

  const handleChange = (index: number) => {
    flushView();
    enterStep(index);
  };

  const handleClose = () => {
    flushView();
    finishTour();
  };

  return <Tour open steps={steps} onChange={handleChange} onClose={handleClose} />;
};
