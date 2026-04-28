/**
 * Registry of all AL sample properties with their display / filter metadata.
 * Adding a new property here automatically propagates it to all filter UI.
 */

import type { PropertyDefinition } from "../types/al";

export const AL_PROPERTIES: PropertyDefinition[] = [
  // ── Sampler Suite ──────────────────────────────────────────────────────────
  {
    key: "uncertainty",
    label: "Uncertainty",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
  },
  {
    key: "diversity",
    label: "Diversity",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
  },
  {
    key: "density",
    label: "Density",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
  },
  {
    key: "composite",
    label: "Composite",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
  },

  // ── Metadata ───────────────────────────────────────────────────────────────
  {
    key: "year_cycle",
    label: "Year Cycle",
    category: "metadata",
    filterMode: "stepped",
    range: [1, 12],
    steps: 12,
    stepLabels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    supportsVisibility: true,
    supportsColor: true,
  },
  {
    key: "day_cycle",
    label: "Day Cycle",
    category: "metadata",
    filterMode: "stepped",
    range: [0, 23],
    steps: 24,
    stepLabels: Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`),
    supportsVisibility: true,
    supportsColor: true,
  },
  {
    key: "sound_type",
    label: "Sound Type",
    category: "metadata",
    filterMode: "categorical",
    // categorical → cannot be range-filtered, color only
    supportsVisibility: false,
    supportsColor: true,
  },
  {
    key: "birdnet_label",
    label: "BirdNET Label",
    category: "metadata",
    filterMode: "categorical",
    supportsVisibility: false,
    supportsColor: true,
  },
  {
    key: "yamnet_label",
    label: "YAMNet Label",
    category: "metadata",
    filterMode: "categorical",
    supportsVisibility: false,
    supportsColor: true,
  },

  // ── Ground-truth / user labels (study-mode helper) ─────────────────────────
  // Resolved client-side by joining /api/pam-al/snippet-labels into the
  // prediction set; used only as a color filter.
  {
    key: "actual_label",
    label: "Actual label",
    category: "metadata",
    filterMode: "categorical",
    supportsVisibility: false,
    supportsColor: true,
  },
];

export const getPropertyByKey = (key: string): PropertyDefinition | undefined =>
  AL_PROPERTIES.find((p) => p.key === key);

export const visibilityProperties = (): PropertyDefinition[] =>
  AL_PROPERTIES.filter((p) => p.supportsVisibility);

export const colorProperties = (): PropertyDefinition[] =>
  AL_PROPERTIES.filter((p) => p.supportsColor);
