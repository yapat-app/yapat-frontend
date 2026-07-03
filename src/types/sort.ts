import type { AllowedProperty } from "../studyPhases";

/** Properties the sort builder can sort by. "time" is a placeholder with no backing data yet. */
export type SortableProperty = AllowedProperty | "time";

export type SortDirection = "asc" | "desc";

export interface SortField {
  /** Stable id for React keys / add-remove operations — not persisted. */
  id: string;
  property: SortableProperty;
  direction: SortDirection;
  /** True for fields with no backing data yet (e.g. "time") — rendered disabled. */
  disabled?: boolean;
}

export const SORTABLE_PROPERTY_LABELS: Record<SortableProperty, string> = {
  confidence: "Confidence",
  composite: "Composite",
  uncertainty: "Uncertainty",
  diversity: "Diversity",
  density: "Density",
  actual_label: "Actual label",
  year_cycle: "Year cycle",
  day_cycle: "Day cycle",
  sound_type: "Sound type",
  birdnet_label: "BirdNET label",
  yamnet_label: "YAMNet label",
  time: "Time",
};
