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
import { SPECIES_LABELS } from "../constants/speciesLabels";
import {
  EXPLAINER_COPY,
  isExplainerKey,
  type ExplainerKey,
} from "../components/scoreExplainer";
import { SCORE_ALLOWED_PROPERTIES } from "../pages/annotationHub/scoreFilterConfig";

// ── Shared copy ────────────────────────────────────────────────────────────

const CLIP_DESC =
  "Each sample is a 3-second audio snippet, shown as a spectrogram. Press ▶ to play it; the red line tracks playback position.";

const LABEL_DESC =
  "Below the player you'll see Quick Labels — one button per species. Click the species you hear (and see) in the clip to apply that label. You can add multiple species for one audio sample.";

const TIP_DESC =
  "If you're not confident about a snippet, skip it.";

const SCROLL_DESC_P1 =
  "Once you've labeled a snippet, scroll down to load the next snippet. A machine learning model picks and sorts samples it thinks are most useful for it to learn from.";

const PROJECTION_DESC =
  "Each dot is one sample in the dataset; the yellow-highlighted dot is the snippet you're currently listening to. You can't click dots to pick a sample — but you can switch between projection views (t-SNE, UMAP, PCA) using the thumbnails above the map to see different layouts. Dots are positioned by how similar a machine learning model thinks the sounds are.";

const PROJECTION_DESC_CLICKABLE =
  "Each dot is one sample in the dataset; the yellow-highlighted dot is the snippet you're currently listening to. Click any dot to load that sample into the feed, with its audio and spectrogram. You can also switch between projection views (t-SNE, UMAP, PCA) using the thumbnails above the map. Dots are positioned by how similar a machine learning model thinks the sounds are.";

const ZOOM_DESC =
  "Use the − / + buttons in the top-right corner of the projection to zoom out and in. You can also drag a box on the plot to zoom into that area. Double-click the plot to reset the zoom.";

const METADATA_DESC = [
  "On the left, filter which samples appear in the feed and the projection:",
  "",
  "• Status — show All, Unlabeled, or already-Labeled samples",
  "• Location — restrict to a specific recording site",
  "• Date range / Time of day — restrict to when the recording was made",
  "",
  "Filters only change what's shown — they don't remove any data.",
].join("\n");

// Each model-score card carries an animated ScoreExplainer and its own
// one-line definition, so the step text is empty — the card says it all. Only
// the first adds a sentence, pointing at the ⓘ that reopens any of these later.
const MODEL_SCORES_INTRO =
  "Click the ⓘ beside any score to see these explanations again while you annotate.";

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

const zoomStep = (): TourStepSpec => ({
  featureKey: "zoom",
  target: "projection-zoom",
  title: "Zooming the projection",
  description: ZOOM_DESC,
  placement: "left",
});

const metadataStep = (): TourStepSpec => ({
  featureKey: "meta",
  target: "metadata-filters",
  title: "Metadata filters",
  description: METADATA_DESC,
  placement: "right",
});

// Each card spotlights only its own score's row (`score-row-<key>` in
// ScoreHistogramPanel) rather than the whole model-scores section, so the
// highlight always matches what the card is describing.
//
// The ORDER is derived from the sidebar's own render order rather than written
// out a second time here. Listing it twice is what let the tour open on
// uncertainty while the panel showed confidence first; deriving it means
// reordering scoreFilterConfig reorders the cards with it, and the cards walk
// the panel top to bottom by construction. Composite is deliberately excluded —
// it's a blend of the others and stays popover-only rather than spending a card
// in a timed phase.
const TOUR_SCORE_KEYS = SCORE_ALLOWED_PROPERTIES.filter(
  (key): key is ExplainerKey => isExplainerKey(key) && key !== "composite",
);

const modelScoreSteps = (): TourStepSpec[] =>
  TOUR_SCORE_KEYS.map((key, i) => ({
    featureKey: `score-${key}`,
    target: `score-row-${key}`,
    title: EXPLAINER_COPY[key].title,
    description: i === 0 ? MODEL_SCORES_INTRO : "",
    placement: "right" as const,
    visual: key,
  }));

const sortStep = (): TourStepSpec => ({
  featureKey: "sort",
  target: "sort-panel",
  title: "Sort the feed",
  description:
    "Tap a chip to sort the feed by that property; tap again to flip the direction, and a third time to remove it. Activate several chips to sort by multiple criteria — the number badge shows each one's priority.",
  placement: "left",
});

const TASK_DESC = [
  "Your task will be to annotate as many POSITIVE samples as possible in the given time for the following species:",
  "",
  ...Object.entries(SPECIES_LABELS).map(([code, scientificName]) => `• ${scientificName} = ${code}`),
  "",
  "If you come across other species, you can annotate those too.",
].join("\n");

// Shown as the final card of every phase's tour. Each phase uses its own
// featureKey (task-p1..task-p5) so the tour's cross-phase dedup doesn't
// suppress it after the first phase — unlike the other cards, this reminder
// is meant to repeat every time.
const taskStep = (featureKey: string): TourStepSpec => ({
  featureKey,
  target: "task-reminder",
  title: "Task",
  description: TASK_DESC,
  placement: "center",
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
  "You'll have 40 minutes to annotate in this phase. The guide cards will walk you through each part of the screen.";

export const PHASE_CONTENT: Record<string, PhaseContent> = {
  // ── Phase 1 — Feed only ─────────────────────────────────────────────────
  P1: {
    title: "Welcome to Phase 1",
    body: [INTRO_FEED_ONLY, INTRO_GUIDE_LINE],
    tour: [clipStep(), labelStep(), scrollStep(SCROLL_DESC_P1), tipStep(), taskStep("task-p1")],
  },

  // ── Phase 2 — NEW: feature projection ───────────────────────────────────
  P2: {
    title: "Welcome to Phase 2",
    body: [INTRO_P2_PROJECTION, INTRO_GUIDE_LINE],
    tour: [projectionStep(PROJECTION_DESC), zoomStep(), taskStep("task-p2")],
  },

  // ── Phase 3 — NEW: metadata filters ─────────────────────────────────────
  P3: {
    title: "Welcome to Phase 3",
    body: [INTRO_P3_FILTERS, INTRO_GUIDE_LINE],
    tour: [metadataStep(), taskStep("task-p3")],
  },

  // ── Phase 4 — NEW: model-derived score filters + feed sorting ───────────
  P4: {
    title: "Welcome to Phase 4",
    body: [INTRO_P4_MODEL_TOOLS, INTRO_GUIDE_LINE],
    tour: [...modelScoreSteps(), sortStep(), taskStep("task-p4")],
  },

  // ── Phase 5 — NEW: clickable projection points ──────────────────────────
  P5: {
    title: "Welcome to Phase 5",
    body: [INTRO_P5_CLICK_CALLOUT, INTRO_GUIDE_LINE_P5],
    tour: [projectionStep(PROJECTION_DESC_CLICKABLE, "projection-click"), taskStep("task-p5")],
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
