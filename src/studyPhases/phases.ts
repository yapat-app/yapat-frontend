/**
 * Registry of all Annotation Hub phase configurations.
 *
 * To add a new scenario: add a new entry here. No component edits required.
 */

import type { PhaseConfig } from "./types";

// Default phase when URL/localStorage/env don't specify one.
// Note: Deployments may still override this via VITE_STUDY_PHASE.
export const DEFAULT_PHASE_ID = "P1";

const SCORE_ALLOWED_PROPERTIES: PhaseConfig["visualization"]["visibilityFilter"]["allowedProperties"] =
  ["uncertainty", "diversity", "density", "confidence", "composite"];

export const STUDY_PHASES: Record<string, PhaseConfig> = {
  P1: {
    id: "P1",
    label: "Phase 1",
    feed: { mode: "scrollable_topk" },
    visualization: {
      mode: "hidden",
      showLabeledPool: true,
      allowPointClick: false,
      visibilityFilter: { mode: "disabled", allowedProperties: [] },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: false,
      labelingMode: "blind",
      histogramStyle: "none",
      showFindSimilarButton: false,
    },
    sidebar: {
      showPane: false,
      sampleProperties: false,
      modelScores: false,
      findSimilar: false,
      labelScope: false,
    },
    sort: { nonModel: false, model: false },
  },

  P2: {
    id: "P2",
    label: "Phase 2",
    feed: { mode: "scrollable_topk" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: false,
      visibilityFilter: { mode: "disabled", allowedProperties: [] },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: false,
      labelingMode: "blind",
      histogramStyle: "none",
      showFindSimilarButton: false,
    },
    sidebar: {
      showPane: false,
      sampleProperties: false,
      modelScores: false,
      findSimilar: false,
      labelScope: false,
    },
    sort: { nonModel: false, model: false },
  },

  P3: {
    id: "P3",
    label: "Phase 3",
    feed: { mode: "scrollable_topk" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: false,
      visibilityFilter: { mode: "disabled", allowedProperties: [] },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: false,
      labelingMode: "blind",
      histogramStyle: "none",
      showFindSimilarButton: false,
    },
    // Date/time filters are enabled (dateTimeDisabled: false), but the Date/Time
    // sort chips stay read-only (sort.disabled: true) — filter, don't sort.
    sidebar: {
      showPane: true,
      sampleProperties: true,
      dateTimeDisabled: false,
      modelScores: false,
      findSimilar: false,
      labelScope: false,
    },
    sort: { nonModel: true, model: false, disabled: true },
  },

  P4: {
    id: "P4",
    label: "Phase 4",
    feed: { mode: "scrollable_topk" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: false,
      visibilityFilter: {
        mode: "multi",
        allowedProperties: SCORE_ALLOWED_PROPERTIES,
        sliderStyle: "threshold",
      },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: false,
      labelingMode: "blind",
      histogramStyle: "none",
      showFindSimilarButton: false,
    },
    sidebar: {
      showPane: true,
      sampleProperties: true,
      modelScores: true,
      findSimilar: false,
      labelScope: false,
    },
    sort: { nonModel: true, model: true },
  },

  P5: {
    id: "P5",
    label: "Phase 5",
    feed: { mode: "scrollable_topk" },
    visualization: {
      mode: "whole_dataset",
      showLabeledPool: true,
      allowPointClick: true,
      visibilityFilter: {
        mode: "multi",
        allowedProperties: SCORE_ALLOWED_PROPERTIES,
        sliderStyle: "threshold",
      },
      colorFilter: { mode: "disabled", allowedProperties: [] },
    },
    ui: {
      showSamplingMethodSelector: false,
      showProjectionMethodSelector: false,
      showRetrainControls: false,
      labelingMode: "blind",
      histogramStyle: "none",
      showFindSimilarButton: false,
    },
    sidebar: {
      showPane: true,
      sampleProperties: true,
      modelScores: true,
      findSimilar: false,
      labelScope: false,
    },
    sort: { nonModel: true, model: true },
  },
};

export const ALL_PHASE_IDS: string[] = Object.keys(STUDY_PHASES);

export function getPhaseConfig(id: string | null | undefined): PhaseConfig {
  if (id && STUDY_PHASES[id]) return STUDY_PHASES[id];
  return STUDY_PHASES[DEFAULT_PHASE_ID];
}
