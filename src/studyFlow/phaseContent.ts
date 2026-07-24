/**
 * Authored study content — what each phase tells the participant (the "Welcome"
 * instructions modal) and which controls its guided tour highlights.
 *
 * Each tour step carries a `featureKey`. Steps whose key was already shown in an
 * earlier phase are skipped (see StudyFlowProvider `seenTourKeys`). Each phase
 * therefore lists ONLY the cards it introduces: P1 covers the clip / label /
 * scroll / tip basics, and each later phase adds just its new capability
 * (projection, metadata filters, model scores, clickable points). Moving
 * forward through the phases, a participant never sees the same card twice.

 */

import type { PhaseContent, TourStepSpec } from "./types";

// ── Shared copy ────────────────────────────────────────────────────────────

const CLIP_DESC =
  "Each sample is a 3-second audio snippet, shown as a spectrogram. Press ▶ to play it; the red line tracks playback position.";

const LABEL_DESC = [
  "Below the player you'll see Quick Labels — one button per species. Click the species you hear (and see) in the clip to apply that label.",
  "",
  "• Rhinella icterica (common species) = RHIICT",
  "• Dendropsophus minutus (complex and different call) = DENMIN",
  "• Dendropsophus nahdereri (rare species) = DENNAH",
  "• Scinax alter (not stereotype call) = SCIALT",
  "• Leptodactylus fuscus (stereotype call) = LEPFUS",
  "• Ameerega picta (extra species) = AMEPIC",
].join("\n");

const TIP_DESC =
  "If you're not confident about a snippet, skip it. Only select None when you're confident there are no target-species vocalizations in the clip.";

const SCROLL_DESC_P1 =
  "Once you've labeled a snippet, scroll down to load the next snippet. A machine learning model picks and sorts samples it thinks are most useful for it to learn from.";

const PROJECTION_DESC =
  "Each dot is one sample in the dataset; the yellow-highlighted dot is the snippet you're currently listening to. You can't click dots to pick a sample — but you can switch between projection views (t-SNE, UMAP, PCA) using the thumbnails above the map to see different layouts. Dots are positioned by how similar a machine learning model thinks the sounds are.";

const PROJECTION_DESC_CLICKABLE =
  "Each dot is one sample in the dataset; the yellow-highlighted dot is the snippet you're currently listening to. Click any dot to load that sample into the feed, with its audio and spectrogram. You can also switch between projection views (t-SNE, UMAP, PCA) using the thumbnails above the map. Dots are positioned by how similar a machine learning model thinks the sounds are.";

const METADATA_DESC = [
  "On the left, filter which samples appear in the feed and the projection:",
  "",
  "• Status — show All, Unlabeled, or already-Labeled samples",
  "• Location — restrict to a specific recording site",
  "• Date range / Time of day — restrict to when the recording was made",
  "",
  "Filters only change what's shown — they don't remove any data.",
].join("\n");

const MODEL_SCORES_DESC = [
  "Further down the sidebar, filter by scores the model assigns to each sample. These reflect how useful a sample is expected to be for improving the model — samples with higher scores are considered more beneficial to annotate.",
  "",
  "Hover the ⓘ next to any score for a definition.",
].join("\n");

// ── Reusable cards ──────────────────────────────────────────────────────────
// Each phase lists only the cards it INTRODUCES; keys are shared so the flow's
// `seenTourKeys` dedup guarantees a card is never shown twice as the
// participant moves forward through the phases.

const clipStep = (): TourStepSpec => ({
  featureKey: "clip",
  target: "spectrogram",
  title: "The clip",
  description: CLIP_DESC,
  placement: "left",
});

const labelStep = (): TourStepSpec => ({
  featureKey: "label",
  target: "labeling",
  title: "Choosing a label",
  description: LABEL_DESC,
  placement: "left",
});

const scrollStep = (description: string): TourStepSpec => ({
  featureKey: "scroll",
  target: "feed",
  title: "Moving to the next sample",
  description,
  placement: "left",
});

const tipStep = (): TourStepSpec => ({
  featureKey: "tip",
  target: "labeling",
  title: "💡 Tip: when you're unsure",
  description: TIP_DESC,
  placement: "left",
});

const projectionStep = (
  description: string,
  featureKey = "projection",
): TourStepSpec => ({
  featureKey,
  target: "projection-panel",
  title: "Feature Projection view",
  description,
  placement: "right",
});

const metadataStep = (): TourStepSpec => ({
  featureKey: "meta",
  target: "metadata-filters",
  title: "Metadata filters",
  description: METADATA_DESC,
  placement: "right",
});

const modelScoresStep = (): TourStepSpec => ({
  featureKey: "model",
  target: "model-scores",
  title: "Model-derived filters",
  description: MODEL_SCORES_DESC,
  placement: "right",
});

const sortStep = (): TourStepSpec => ({
  featureKey: "sort",
  target: "sort-panel",
  title: "Sort the feed",
  description:
    "Tap a chip to sort the feed by that property; tap again to flip the direction, and a third time to remove it. Activate several chips to sort by multiple criteria — the number badge shows each one's priority.",
  placement: "left",
});

// ── Per-phase intro copy ───────────────────────────────────────────────────

const INTRO_FEED_ONLY =
  "You're about to enter the annotation workspace. Audio samples will appear in a scrolling feed — each one comes with its spectrogram and playback controls.";

const INTRO_P2_PROJECTION =
  "**New in this phase: a 2D feature projection** appears on the left of the workspace, showing where all samples sit relative to each other. Keep annotating samples from the scrolling feed on the right.";

const INTRO_P3_FILTERS =
  "**New in this phase: metadata filters.** Use the panel on the left to filter the samples shown in the feed and feature projection by status, location, date, or time of day.";

const INTRO_P4_MODEL_TOOLS =
  "**New in this phase: model-derived filters and feed sorting.** Filter samples by how useful the model expects them to be, or sort the feed by one or more properties.";

const INTRO_P5_CLICK_CALLOUT =
  "**New in this phase: click any point in the feature projection to open that sample in the feed and label it** — exploring the map by clicking is the main focus of Phase 5.";

const INTRO_GUIDE_LINE =
  "You'll have 15 minutes to annotate in this phase. The guide cards will walk you through each part of the screen.";

const INTRO_GUIDE_LINE_P5 =
  "You'll have 25 minutes to annotate in this phase. The guide cards will walk you through each part of the screen.";

export const PHASE_CONTENT: Record<string, PhaseContent> = {
  // ── Phase 1 — Feed only ─────────────────────────────────────────────────
  P1: {
    title: "Welcome to Phase 1",
    body: [INTRO_FEED_ONLY, INTRO_GUIDE_LINE],
    tour: [clipStep(), labelStep(), scrollStep(SCROLL_DESC_P1), tipStep()],
  },

  // ── Phase 2 — NEW: feature projection ───────────────────────────────────
  P2: {
    title: "Welcome to Phase 2",
    body: [INTRO_P2_PROJECTION, INTRO_GUIDE_LINE],
    tour: [projectionStep(PROJECTION_DESC)],
  },

  // ── Phase 3 — NEW: metadata filters ─────────────────────────────────────
  P3: {
    title: "Welcome to Phase 3",
    body: [INTRO_P3_FILTERS, INTRO_GUIDE_LINE],
    tour: [metadataStep()],
  },

  // ── Phase 4 — NEW: model-derived score filters + feed sorting ───────────
  P4: {
    title: "Welcome to Phase 4",
    body: [INTRO_P4_MODEL_TOOLS, INTRO_GUIDE_LINE],
    tour: [modelScoresStep(), sortStep()],
  },

  // ── Phase 5 — NEW: clickable projection points ──────────────────────────
  P5: {
    title: "Welcome to Phase 5",
    body: [INTRO_P5_CLICK_CALLOUT, INTRO_GUIDE_LINE_P5],
    tour: [projectionStep(PROJECTION_DESC_CLICKABLE, "projection-click")],
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
