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
    description: "How torn the model is between competing labels for this sample — higher means the model is less sure which label is correct.",
  },
  {
    key: "diversity",
    label: "Diversity",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description: "How different this sample is from ones already labeled — higher means it covers new ground rather than repeating what the model has already seen.",
  },
  {
    key: "density",
    label: "Density",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description: "How representative this sample is of a larger, similar group — higher means many other samples in the dataset look like it.",
  },
  {
    key: "composite",
    label: "Composite",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description: "A single blended score combining uncertainty, diversity, and density into one overall ranking value.",
  },
  {
    key: "confidence",
    label: "Confidence",
    category: "sampler",
    filterMode: "continuous",
    range: [0, 1],
    supportsVisibility: true,
    supportsColor: true,
    description: "The model's own confidence in its top predicted label for this sample — higher means the model is more certain.",
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

/**
 * Accent colour per sampler property — shared by the Model scores sidebar
 * (histogram rows) and the sort chips so the same property always reads
 * as the same colour.
 */
const PROPERTY_COLORS: Record<string, string> = {
  confidence:  "#06171C", // rgb(6, 23, 28)
  diversity:   "#1D3A8F", // rgb(29, 58, 143)
  density:     "#EC619F", // rgb(236, 97, 159)
  uncertainty: "#6ABFA3", // rgb(106, 191, 163)
  composite:   "#F7A712", // rgb(247, 167, 18)
};

export function propertyColor(key: string): string {
  return PROPERTY_COLORS[key] ?? "#3b82f6";
}

export const visibilityProperties = (): PropertyDefinition[] =>
  AL_PROPERTIES.filter((p) => p.supportsVisibility);

export const colorProperties = (): PropertyDefinition[] =>
  AL_PROPERTIES.filter((p) => p.supportsColor);
