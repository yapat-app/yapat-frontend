/**
 * Plain-language copy for the animated score explainers.
 *
 * Deliberately separate from the `description` strings in alProperties.ts:
 * those are precise definitions for the sidebar, these are the annotator-facing
 * one-liners that sit above the animation.
 *
 * Two rules hold across every entry: one short line only — the animation
 * carries the rest — and no instructions. These cards describe what a score
 * measures; they never tell a participant which samples to annotate.
 */

import type { AllowedProperty } from "../../studyPhases";

export type ExplainerKey = Extract<
  AllowedProperty,
  "uncertainty" | "confidence" | "diversity" | "density" | "composite"
>;

export interface ExplainerCopy {
  /** Card heading. The score's name, nothing appended. */
  title: string;
  /** Single-line definition shown above the animation. */
  definition: string;
}

export const EXPLAINER_COPY: Record<ExplainerKey, ExplainerCopy> = {
  uncertainty: {
    title: "Uncertainty",
    definition: "How unsure the model is that a sound is actually present.",
  },
  confidence: {
    title: "Confidence",
    definition:
      "How strongly the model believes the sound it predicted is really there.",
  },
  diversity: {
    title: "Diversity",
    definition:
      "Highly diverse samples are different to the ones you already labelled.",
  },
  density: {
    title: "Density",
    definition: "How many similar clips already exist in the dataset.",
  },
  composite: {
    title: "Composite",
    definition: "The scores blended into the single value the feed is ranked by.",
  },
};

export function isExplainerKey(key: string): key is ExplainerKey {
  return key in EXPLAINER_COPY;
}
