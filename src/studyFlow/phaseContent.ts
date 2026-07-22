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
  // ── Phase 1 — Feed only ─────────────────────────────────────────────────
  P1: {
    title: "Phase 1 — Annotating from the feed",
    body: [
      "In this first phase you will label audio snippets one at a time using only the annotation feed.",
      "Listen to each snippet, then add one or more species labels. Work through as many as you can.",
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
          "Pick one or more species labels for a snippet here. You can add several labels to a single snippet.",
        placement: "left",
      },
    ],
  },

  // ── Phase 2 — Feed + feature projection ─────────────────────────────────
  P2: {
    title: "Phase 2 — Adding the feature projection",
    body: [
      "You now have the same feed plus a feature projection on the left: a 2-D map where each point is one snippet, and nearby points sound similar.",
      "Use the projection to get an overview of the dataset while you keep labelling in the feed on the right.",
    ],
    tour: [
      {
        featureKey: "projection",
        target: "projection",
        title: "Feature projection",
        description:
          "Each point is a snippet; similar sounds sit close together, giving you a map of the whole dataset.",
        placement: "right",
      },
      {
        featureKey: "projection-methods",
        target: "projection-methods",
        title: "Projection method",
        description:
          "Switch how the map is laid out — t-SNE, UMAP or PCA. Each method arranges the same snippets differently, so try a few to find the view that separates the clusters most clearly for you.",
        placement: "bottom",
      },
      {
        featureKey: "zoom-pan",
        target: "projection",
        title: "Zoom & pan the map",
        description:
          "Scroll-wheel (or pinch on trackpad) to zoom in on a cluster. Click and drag to pan around the map.",
        placement: "right",
      },
      {
        featureKey: "projection-count",
        target: "projection-count",
        title: "Point counts",
        description:
          "These numbers summarise the map: 'X / Y visible' is how many of the total snippets are currently shown, and the 'labeled' tag counts how many you have already annotated.",
        placement: "bottom",
      },
    ],
  },

  // ── Phase 3 — Sidebar sample properties (location + date/time) ──────────
  P3: {
    title: "Phase 3 — Filtering by sample properties",
    body: [
      "Everything from the previous phase still applies. A Filters sidebar is now available on the left.",
      "Use the Sample Properties there to narrow the dataset by recording location, date range and time of day, so you can focus on the snippets that interest you.",
    ],
    tour: [
      {
        featureKey: "status-filter",
        target: "status-filter",
        title: "Filter by label status",
        description:
          "Switch between All, Unlabeled and Labeled to control which snippets you see — for example, choose Unlabeled to focus only on snippets you still need to annotate.",
        placement: "right",
      },
      {
        featureKey: "sample-properties",
        target: "sample-properties",
        title: "Sample Properties",
        description:
          "Filter the feed and the map by recording location, date range and time of day. Only snippets matching your selection stay visible.",
        placement: "right",
      },
    ],
  },

  // ── Phase 4 — Model-derived scores + threshold filtering ────────────────
  P4: {
    title: "Phase 4 — Filtering by model scores",
    body: [
      "You now have a suite of model-derived scores — uncertainty, diversity, density and confidence — in the sidebar.",
      "A score histogram shows how snippets are distributed for each property. Drag its threshold slider to hide low-scoring points and focus on the most informative snippets.",
      "You can also sort the feed by these scores to bring the most relevant snippets to the top.",
    ],
    tour: [
      {
        featureKey: "model-scores",
        target: "model-scores",
        title: "Model derived scores",
        description:
          "Pick a property — Uncertainty, Diversity, Density or Confidence — to see its score histogram, then drag the threshold slider to keep only the top-scoring snippets on the map and in the feed. You can enable several properties at once to combine them.",
        placement: "right",
      },
      {
        featureKey: "sort-panel",
        target: "sort-panel",
        title: "Sort the feed",
        description:
          "Tap a chip to sort the feed by that property; tap again to flip the direction, and a third time to remove it. Activate several chips to sort by multiple criteria — the number badge shows each one's priority.",
        placement: "left",
      },
    ],
  },

  // ── Phase 5 — Click the map to inspect ──────────────────────────────────
  P5: {
    title: "Phase 5 — Exploring by clicking the map",
    body: [
      "Final phase. Everything from before still applies, and the projection points are now clickable.",
      "Click any point to open that snippet on the right, listen to it, and label it — combine this with the sidebar filters to zero in on the snippets that matter most.",
    ],
    tour: [
      {
        featureKey: "vis-click",
        target: "projection",
        title: "Click a point to inspect",
        description:
          "Click any point and its snippet opens in the panel on the right for listening and labelling. Shift+click to add more points to the selection.",
        placement: "right",
      },
      {
        featureKey: "selection-panel",
        target: "selection-panel",
        title: "Selected snippet",
        description:
          "The snippet you click appears here at the top of the feed, ready to play and label.",
        placement: "left",
      },
    ],
  },
};

/** Fallback content for any phase id without authored copy. */
export function getPhaseContent(phaseId: string): PhaseContent {
  return (
    PHASE_CONTENT[phaseId] ?? {
      title: `Phase ${phaseId}`,
      body: ["Continue annotating snippets."],
      tour: [],
    }
  );
}
