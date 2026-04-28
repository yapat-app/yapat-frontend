/**
 * Registry of all study-phase configurations.
 *
 * To add a new scenario: add a new entry here. No component edits required.
 */

import type { PhaseConfig } from "./types";

const FEED_TOPK = 20;

export const DEFAULT_PHASE_ID = "P1.1";

export const STUDY_PHASES: Record<string, PhaseConfig> = {
  // ── Phase 1 ─ Scrollable feed only ──────────────────────────────────────
  "P1.1": {
    id: "P1.1",
    label: "Phase 1 · Part 1 — Feed only",
    feed: {
      mode: "scrollable_topk",
      topK: FEED_TOPK,
      samplingStrategy: "composite",
    },
    visualization: {
      mode: "hidden",
      showLabeledPool: false,
      allowPointClick: false,
      visibilityFilter: { mode: "disabled", allowedProperties: [] },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: true,
    },
  },

  "P1.2": {
    id: "P1.2",
    label: "Phase 1 · Part 2 — Feed + limited vis",
    feed: {
      mode: "scrollable_topk",
      topK: FEED_TOPK,
      samplingStrategy: "composite",
    },
    visualization: {
      mode: "predictions_only",
      showLabeledPool: false,
      allowPointClick: false,
      visibilityFilter: { mode: "disabled", allowedProperties: [] },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: true,
    },
  },

  // ── Phase 2 ─ Whole-dataset vis, single-card-on-click ───────────────────
  "P2.1": {
    id: "P2.1",
    label: "Phase 2 · Part 1 — Vis with color, no filters",
    feed: { mode: "single_card_on_select" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: true,
      visibilityFilter: { mode: "disabled", allowedProperties: [] },
      colorFilter: {
        mode: "single",
        allowedProperties: ["composite", "actual_label"],
      },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: true,
    },
  },

  "P2.2": {
    id: "P2.2",
    label: "Phase 2 · Part 2 — Vis with composite filter",
    feed: { mode: "single_card_on_select" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: true,
      visibilityFilter: { mode: "single", allowedProperties: ["composite"] },
      colorFilter: {
        mode: "single",
        allowedProperties: ["composite", "actual_label"],
      },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: true,
    },
  },

  // ── Phase 3 ─ Sampler-suite filters ─────────────────────────────────────
  "P3.1": {
    id: "P3.1",
    label: "Phase 3 · Part 1 — Single sampler filter",
    feed: { mode: "single_card_on_select" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: true,
      visibilityFilter: {
        mode: "single",
        allowedProperties: ["uncertainty", "diversity", "density"],
      },
      colorFilter: {
        mode: "single",
        allowedProperties: ["uncertainty", "diversity", "density", "actual_label"],
      },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: true,
    },
  },

  "P3.2": {
    id: "P3.2",
    label: "Phase 3 · Part 2 — Combined sampler filters",
    feed: { mode: "single_card_on_select" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: true,
      visibilityFilter: {
        mode: "multi",
        allowedProperties: ["uncertainty", "diversity", "density"],
      },
      colorFilter: {
        mode: "single",
        allowedProperties: ["uncertainty", "diversity", "density", "actual_label"],
      },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: true,
    },
  },
};

export const ALL_PHASE_IDS: string[] = Object.keys(STUDY_PHASES);

export function getPhaseConfig(id: string | null | undefined): PhaseConfig {
  if (id && STUDY_PHASES[id]) return STUDY_PHASES[id];
  return STUDY_PHASES[DEFAULT_PHASE_ID];
}
