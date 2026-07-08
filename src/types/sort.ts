import type { AllowedProperty } from "../studyPhases";

/**
 * Properties the sort builder can sort by. "time" (seconds since midnight)
 * and "date" (calendar date) are backed by Recording.extra_metadata
 * (recorded_time / recorded_date), resolved via recording_id per prediction —
 * see useRecordingDateTimes.
 */
export type SortableProperty = AllowedProperty | "time" | "date";

export type SortDirection = "asc" | "desc";

export interface SortField {
  /** Stable id for React keys / add-remove operations — not persisted. */
  id: string;
  property: SortableProperty;
  direction: SortDirection;
  /** True for fields with no backing data — rendered disabled. */
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
  date: "Date",
};
