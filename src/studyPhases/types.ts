/**
 * Study Phase types — single source of truth for every UI capability that
 * varies across user-study phases.
 *
 * Components consume *capabilities* (from `PhaseConfig`), never phase IDs.
 * Adding a new study scenario = adding a new entry to `phases.ts`.
 */

export type FeedMode =
  /** Scrollable list of fixed-K predictions (top-K by sampling strategy). */
  | "scrollable_topk"
  /** Feed is hidden until a point is clicked; only that single card is shown. */
  | "single_card_on_select"
  /** No feed at all. */
  | "hidden";

export type VisMode =
  /** Projection panel is hidden. */
  | "hidden"
  /** Show only the K predictions returned by inference (no FPV background). */
  | "predictions_only"
  /** Show the full dataset projection (FPV) plus inference overlay. */
  | "whole_dataset";

export type FilterMode =
  /** No filter UI. */
  | "disabled"
  /** Single-property filter (one slider / one color key). */
  | "single"
  /** Multi-property filter (combination of properties, AND-combined). */
  | "multi";

/**
 * Properties that may be exposed in visibility / color filters during the
 * study. Stays a string so future custom properties just plug in.
 */
export type AllowedProperty =
  | "composite"
  | "uncertainty"
  | "diversity"
  | "density"
  | "actual_label"
  | "year_cycle"
  | "day_cycle"
  | "sound_type"
  | "birdnet_label"
  | "yamnet_label";

export type SamplingStrategy =
  | "composite"
  | "uncertainty"
  | "diversity"
  | "density"
  | "random";

export interface FeedPhaseConfig {
  mode: FeedMode;
  /** Number of predictions to load when mode = "scrollable_topk". */
  topK?: number;
  /** Strategy used by the backend to pick the top-K. */
  samplingStrategy?: SamplingStrategy;
}

export interface FilterPhaseConfig {
  mode: FilterMode;
  /** Properties allowed in this filter dropdown for this phase. */
  allowedProperties: AllowedProperty[];
}

export interface VisualizationPhaseConfig {
  mode: VisMode;
  /** Highlight (border) snippets that are already in the labeled pool. */
  showLabeledPool: boolean;
  /** Whether clicking points selects a snippet / affects the feed. */
  allowPointClick: boolean;
  visibilityFilter: FilterPhaseConfig;
  colorFilter: FilterPhaseConfig;
}

export interface UIPhaseConfig {
  showSamplingMethodSelector: boolean;
  showProjectionMethodSelector: boolean;
  showRetrainControls: boolean;
}

export interface PhaseConfig {
  id: string;
  label: string;
  feed: FeedPhaseConfig;
  visualization: VisualizationPhaseConfig;
  ui: UIPhaseConfig;
}
