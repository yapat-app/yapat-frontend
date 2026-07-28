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
    description:
      "How unsure the model is, on average, about whether each label is present or absent for this sample; higher means many labels sit near a 50/50 guess.",
  },
  {
    key: "diversity",
    label: "Diversity",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description:
      "How different this sample is from others already labelled; higher means it adds new variety.",
  },
  {
    key: "density",
    label: "Density",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description:
      "How representative this sample is of commonly occurring patterns in the data. Higher means it sits in a well-populated region.",
  },
  {
    key: "composite",
    label: "Composite",
    category: "sampler",
    filterMode: "continuous",
    // z-scored weighted blend: mean 0, std <= 1 by construction (weighted
    // sum of unit-variance zero-mean terms whose weights sum to 1), so
    // [-2, 2] covers the practical range without per-dataset scaling.
    range: [-2, 2],
    supportsVisibility: true,
    supportsColor: true,
    description:
      "A score combining multiple criteria (e.g. uncertainty and diversity) into a single value. This score was used in phase 1 and 2 for automatic feed generation.",
  },
  {
    key: "confidence",
    label: "Confidence",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description:
      "Probability that at least one label from the label scope is present.",
  },

  // ── Metadata ───────────────────────────────────────────────────────────────
  {
    key: "year_cycle",
    label: "Year Cycle",
    category: "metadata",
    filterMode: "stepped",
    range: [1, 12],
    steps: 12,
    stepLabels: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
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
    stepLabels: Array.from(
      { length: 24 },
      (_, i) => `${i.toString().padStart(2, "0")}:00`,
    ),
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

/**
 * Accent colour per sampler property — shared by the Model scores sidebar
 * (histogram rows) and the sort chips so the same property always reads
 * as the same colour.
 */
const PROPERTY_COLORS: Record<string, string> = {
  confidence: "#06171C", // rgb(6, 23, 28)
  diversity: "#1D3A8F", // rgb(29, 58, 143)
  density: "#EC619F", // rgb(236, 97, 159)
  uncertainty: "#6ABFA3", // rgb(106, 191, 163)
  composite: "#F7A712", // rgb(247, 167, 18)
};

export function propertyColor(key: string): string {
  return PROPERTY_COLORS[key] ?? "#3b82f6";
}

export const visibilityProperties = (): PropertyDefinition[] =>
  AL_PROPERTIES.filter((p) => p.supportsVisibility);

export const colorProperties = (): PropertyDefinition[] =>
  AL_PROPERTIES.filter((p) => p.supportsColor);
