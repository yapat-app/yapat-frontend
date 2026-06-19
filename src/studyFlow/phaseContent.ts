/**
 * Authored study content — what each phase tells the participant and which
 * controls its guided tour highlights.
 *
 * Incremental tour: every step carries a `featureKey`. The flow only shows steps
 * whose key has NOT already been shown in an earlier phase, so each phase's tour
 * covers only what is new. Edit the copy freely; keep `target` values in sync
 * with the `data-tour="…"` attributes in the components.
 */

import type { PhaseContent } from "./types";

export const PHASE_CONTENT: Record<string, PhaseContent> = {
  // ── Phase 1.1 — Feed only ───────────────────────────────────────────────
  "P1.1": {
    title: "Phase 1.1 — Annotating from the feed",
    body: [
      "In this first phase you will label audio snippets one at a time using only the annotation feed.",
      "Listen to each snippet, then add one or more species labels. Work through as many as you can.",
      "When the timer runs out, the study will allow you to move to the next phase.",
    ],
    tour: [
      {
        featureKey: "feed",
        target: "feed",
        title: "Annotation feed",
        description:
          "Snippets appear here. Scroll through them, play the audio, and inspect each one before labelling.",
        placement: "left",
      },
      {
        featureKey: "labeling",
        target: "labeling",
        title: "Add species labels",
        description:
          "Pick one or more species labels here. You can add several labels to a single snippet — this area is just a preview during the tour.",
        placement: "left",
      },
    ],
  },

  // ── Phase 1.2 — Feed + projection ───────────────────────────────────────
  "P1.2": {
    title: "Phase 1.2 — Adding the feature projection",
    body: [
      "You now have the same feed plus a feature projection on the left: a 2-D map where each point is one snippet, and nearby points sound similar.",
      "Use the projection to get an overview of the dataset while you keep labelling in the feed on the right.",
      "When the timer runs out, the study will allow you to move to the next phase.",
    ],
    tour: [
      {
        featureKey: "projection",
        target: "projection",
        title: "Feature projection",
        description:
          "Each point is a snippet; similar sounds sit close together. It gives you a map of the whole dataset. Scroll-wheel or pinch to zoom in; drag to pan.",
        placement: "right",
      },
      {
        featureKey: "zoom-pan",
        target: "projection",
        title: "Zoom & pan the map",
        description:
          "Scroll-wheel (or pinch on trackpad) to zoom in on a cluster. Click and drag to pan. The map stays zoomed when you click a point.",
        placement: "right",
      },
      {
        featureKey: "projection-method",
        target: "projection-method",
        title: "Projection method",
        description:
          "Switch how the map is computed (e.g. UMAP / t-SNE). The layout changes but each point is still the same snippet.",
        placement: "bottom",
      },
    ],
  },

  // ── Phase 2.1 — Click to inspect + colour ───────────────────────────────
  "P2.1": {
    title: "Phase 2.1 — Exploring by clicking the map",
    body: [
      "The projection is now the main view. Click any point to open that snippet on the right, listen to it, and label it.",
      "You can also colour the points by a property to reveal the distribution of scores across the dataset.",
      "When the timer runs out, the study will allow you to move to the next phase.",
    ],
    tour: [
      {
        featureKey: "vis-click",
        target: "projection",
        title: "Click a point to inspect",
        description:
          "Click any point and its snippet opens in the panel on the right for listening and labelling. Shift+click selects multiple points.",
        placement: "right",
      },
      {
        featureKey: "selection-panel",
        target: "selection-panel",
        title: "Selected snippet panel",
        description:
          "After clicking a point, the snippet details and labelling controls appear here. Shift+click to add more points to the selection.",
        placement: "left",
      },
      {
        featureKey: "color-filter",
        target: "filter-panel",
        title: "Colour the points",
        description:
          "Choose a property from the 'Color by' dropdown to colour the map — for example, colour by 'Composite score' to see which areas the model considers most informative, or by 'Actual label' to see how sound types cluster.",
        placement: "right",
      },
    ],
  },

  // ── Phase 2.2 — Adjustable visibility filter ────────────────────────────
  "P2.2": {
    title: "Phase 2.2 — Filtering what you see",
    body: [
      "Everything from the previous phase still applies. New here: an adjustable filter slider.",
      "Drag the threshold slider to hide points below a chosen score and focus on the snippets that matter most.",
      "When the timer runs out, the study will allow you to move to the next phase.",
    ],
    tour: [
      {
        featureKey: "visibility-filter",
        target: "filter-panel",
        title: "Visibility threshold slider",
        description:
          "Drag the slider to the right to raise the threshold — points whose score falls below it disappear from the map, narrowing your focus to the most relevant snippets.",
        placement: "right",
      },
    ],
  },

  // ── Phase 3.1 — Sampler suite + histogram ───────────────────────────────
  "P3.1": {
    title: "Phase 3.1 — Sampling strategies",
    body: [
      "You now have a suite of sampling properties — uncertainty, diversity and density — to filter the map by, one at a time.",
      "A score histogram above the map shows how snippets are distributed for the selected property, helping you choose where to set the filter.",
      "When the timer runs out, the study will allow you to move to the next phase.",
    ],
    tour: [
      {
        featureKey: "score-histogram",
        target: "score-histogram",
        title: "Score histogram",
        description:
          "This shows how snippet scores are distributed for the selected property. Blue bars are visible points; grey bars have been filtered out. Use it to choose a sensible threshold.",
        placement: "bottom",
      },
      {
        featureKey: "sampler-filters",
        target: "filter-panel",
        title: "Sampling properties",
        description:
          "Switch between Uncertainty, Diversity, Density and Confidence to prioritise different kinds of informative snippets. Confidence reflects how certain the model is about its prediction. Drag the threshold to focus on the top-scoring ones.",
        placement: "right",
      },
    ],
  },

  // ── Phase 3.2 — Combined filters ────────────────────────────────────────
  "P3.2": {
    title: "Phase 3.2 — Combining filters",
    body: [
      "Final phase. You can now combine several sampling properties at once instead of using just one.",
      "Enable multiple properties together to narrow the map to snippets that satisfy all of your chosen criteria simultaneously.",
      "When the timer runs out, the study is complete.",
    ],
    tour: [
      {
        featureKey: "multi-filter",
        target: "filter-panel",
        title: "Combine multiple filters",
        description:
          "Toggle several properties on at once — Uncertainty, Diversity, Density and Confidence — the map keeps only snippets that pass all of them combined. Each property has its own threshold slider.",
        placement: "right",
      },
    ],
  },
};

/** Fallback content for any phase id without authored copy. */
export function getPhaseContent(phaseId: string): PhaseContent {
  return (
    PHASE_CONTENT[phaseId] ?? {
      title: `Phase ${phaseId}`,
      body: ["Continue annotating snippets until the timer runs out."],
      tour: [],
    }
  );
}
