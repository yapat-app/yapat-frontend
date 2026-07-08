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
export const SCORE_ALLOWED_PROPERTIES: AllowedProperty[] = [
  "confidence",
  "diversity",
  "density",
  "uncertainty",
  "composite",
];
