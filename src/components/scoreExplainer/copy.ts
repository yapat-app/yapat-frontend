/**
 * Plain-language copy for the animated score explainers.
 *
 * Deliberately separate from the `description` strings in alProperties.ts:
 * those are precise definitions for the sidebar, these are the annotator-facing
 * framing. Each explainer leads with a QUESTION in the annotator's own terms and
 * closes with what the score means for their next action — the technical word is
 * only the card's label, never the explanation.
 */

import type { AllowedProperty } from "../../studyPhases";

export type ExplainerKey = Extract<
  AllowedProperty,
  "uncertainty" | "confidence" | "diversity" | "density" | "composite"
>;

export interface ExplainerCopy {
  /** Card heading — the technical name, kept as a label only. */
  title: string;
  /** The question the score actually answers, in annotator language. */
  question: string;
  /** What it means for what they should do next. */
  takeaway: string;
}

export const EXPLAINER_COPY: Record<ExplainerKey, ExplainerCopy> = {
  uncertainty: {
    title: "Uncertainty — the model is torn",
    question: "Is the model confident about what it hears?",
    takeaway:
      "Your label is worth most where the model is guessing. High uncertainty means the model has no idea — teach it.",
  },
  confidence: {
    title: "Confidence — the model has committed",
    question: "How sure is the model that a target species is in the clip?",
    takeaway:
      "High confidence clips are the model's best guesses. Useful for finding positives quickly, but the model learns least from them.",
  },
  diversity: {
    title: "Diversity — unlike anything labelled yet",
    question: "Have you already labelled clips that sound like this one?",
    takeaway:
      "Measured as the distance to your nearest labelled clip on the map. High diversity means new ground, not more of the same.",
  },
  density: {
    title: "Density — how typical the clip is",
    question: "How many other clips in the dataset sound like this one?",
    takeaway:
      "One label in a crowded region helps the model on all its neighbours. Low density means a rare event — or just noise.",
  },
  composite: {
    title: "Composite — the three combined",
    question: "How are the scores blended into one ranking?",
    takeaway:
      "The feed you saw in the earlier phases was ordered by this blend. Filtering on the individual scores lets you steer it yourself.",
  },
};

export function isExplainerKey(key: string): key is ExplainerKey {
  return key in EXPLAINER_COPY;
}
