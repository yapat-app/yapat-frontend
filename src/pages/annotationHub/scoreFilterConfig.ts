/**
 * Model derived scores are always shown in "multi" mode across every phase
 * that enables them (see phases.ts) — this doesn't vary by phase, so it's a
 * plain shared constant rather than something threaded through PhaseConfig.
 * Both the sidebar (rendering the sliders) and PredictionFeed (filtering the
 * feed by the same ranges) import this so they can never drift apart.
 */
import type { AllowedProperty } from "../../studyPhases";

export const SCORE_VISIBILITY_MODE = "multi" as const;
export const SCORE_SLIDER_STYLE = "range" as const;
/**
 * Render order for the score rows — and, because phaseContent derives the
 * guided tour from this list, the order the explainer cards appear in too.
 * Confidence and uncertainty sit together as the two "what does the model
 * think" scores, then the two "where does this clip sit" ones.
 */
export const SCORE_ALLOWED_PROPERTIES: AllowedProperty[] = [
  "confidence",
  "uncertainty",
  "diversity",
  "density",
  "composite",
];
