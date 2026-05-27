/**
 * PAM Active Learning Types — aligned with /api/pam-al/* backend schemas.
 */

import type { Annotation } from "./index";

export type FeedbackAction = "ACCEPT" | "REJECT" | "MODIFY";
export type ALColorBy = "prediction" | "uncertainty" | "taxon";
export type SamplingMethod = "uncertainty" | "diversity" | "density" | "random";
export type PAMRetrainStatusValue = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type PAMModelStatusValue = "AVAILABLE" | "LOADING" | "ERROR";
export type PAMSuggestionMode = "predictions" | "suggestions";
export type PAMSuggestionStrategy =
  | "random"
  | "uncertainty"
  | "diversity"
  | "density"
  | "composite";

// ── Property & Filter System ──────────────────────────────────────────────────

/** All numeric/categorical scores attached to a prediction */
export interface SampleScores {
  uncertainty?: number;
  diversity?: number;
  density?: number;
  composite?: number;
  year_cycle?: number;   
  day_cycle?: number;    // 0–23  (hour)
  sound_type?: string;   // "Bio" | "Anthro" | "Geo"
  birdnet_label?: string;
  yamnet_label?: string;
  /**
   * Ground-truth / user label, joined client-side from
   * /api/pam-al/snippet-labels. Used by the `actual_label` color filter.
   * When a snippet has multiple labels, we pick the first sorted one so the
   * categorical palette stays stable.
   */
  actual_label?: string;
}

export type FilterMode = "continuous" | "stepped" | "categorical";
export type PropertyCategory = "sampler" | "metadata";

export interface PropertyDefinition {
  key: string;
  label: string;
  category: PropertyCategory;
  filterMode: FilterMode;
  /** Actual domain [min, max] for continuous/stepped */
  range?: [number, number];
  /** Number of discrete steps */
  steps?: number;
  /** Readable label per step (length === steps) */
  stepLabels?: string[];
  supportsVisibility: boolean;
  supportsColor: boolean;
}

export interface VisibilityFilterState {
  /** Single-property mode (legacy / phase 2.2). */
  propertyKey: string | null;
  /** Normalised to [0, 1] — converted to domain units when applied. */
  range: [number, number];
  /**
   * Multi-property mode (phase 3.2). When non-empty, the visualisation will
   * AND-combine each property's [0,1] range against the live data.
   * Single-property mode keeps using `propertyKey` + `range`; consumers should
   * prefer `propertyKeys` when its length > 0.
   */
  propertyKeys?: string[];
  ranges?: Record<string, [number, number]>;
}

export interface ColorFilterState {
  propertyKey: string | null;
}

export interface ALFilterState {
  visibility: VisibilityFilterState;
  color: ColorFilterState;
}

export interface PAMRunInferenceRequest {
  /** Backend requires family name + dataset context (not checkpoint id) */
  model_family_name: string;
  dataset_id: number;
  snippet_set_id: number;
  device?: string; // "cpu" | "cuda"
  force_refresh?: boolean;

  /** Suggestion mode */
  sample_suggestion?: boolean;
  suggestion_strategy?: PAMSuggestionStrategy;
  k?: number; // used when sample_suggestion=true
}

export interface PAMPrediction {
  id: number | null;
  model_checkpoint_id: number | null;
  snippet_id: number;
  recording_id?: number | null;
  /**
   * Backend is multi-label.
   * UI still expects a primary label + confidence, so we also keep
   * `predicted_label` + `confidence` as derived display helpers.
   */
  predicted_labels: string[] | null;
  predicted_probabilities?: Record<string, number> | null;
  uncertainty?: number | null;
  diversity?: number | null;
  density?: number | null;
  composite_score?: number | null;

  /** Derived for display / grouping */
  predicted_label: string | null;
  confidence: number | null;
  ranking_score: number | null; // typically composite_score
  created_at: string | null;
  embedding_2d?: [number, number];
  /** Sampler + metadata scores attached by the backend */
  scores?: SampleScores;
}

export interface PAMInferenceResult {
  mode: PAMSuggestionMode;
  model_family_name: string;
  used_checkpoint_id: number | null;
  total_predictions: number;
  returned_count: number;
  suggestion_strategy: PAMSuggestionStrategy;
  k: number | null;
  rows: PAMPrediction[];
}

export interface FeedbackPayload {
  dataset_id: number;
  model_family_name: string;
  snippet_id: number;
  action: FeedbackAction;
  /** For MODIFY, send replacement labels; for ACCEPT you may omit to use predicted labels */
  labels?: string[];
  notes?: string;
  /** If false, backend skips taxonomy resolution + canonical `annotations` writes (faster for study code labels). */
  persist_annotations?: boolean;
}

export interface FeedbackResponse {
  id: number;
  model_family_name: string;
  model_checkpoint_id: number;
  active_checkpoint_id?: number | null;
  snippet_id: number;
  action: FeedbackAction;
  final_labels?: string[] | null;
  notes: string | null;
  created_at: string;
  feedback_count_since_retrain: number;
  retrain_triggered: boolean;
  /** True when the most recent child retrain failed — auto-retrain is blocked, use manual retrain */
  last_retrain_failed?: boolean;
  /** Present when backend auto-retrain was dispatched from /feedback */
  auto_retrain_checkpoint_id?: number | null;
  auto_retrain_job_id?: number | null;
}

export interface PAMFeedbackCountResponse {
  dataset_id: number;
  model_family_name: string;
  active_checkpoint_id?: number | null;
  feedback_count_since_retrain: number;
  retrain_after: number;
  /** True when the backend has already enqueued a child retrain for the active checkpoint. */
  retrain_pending?: boolean;
}

export interface PAMRetrainRequest {
  dataset_id: number;
  model_family_name: string;
  epochs?: number;
  learning_rate?: number;
  batch_size?: number;
  hidden_dim?: number;
  dropout?: number;
  device?: string;
  run_inference?: boolean;
}

export interface PAMTrainFromScratchRequest {
  dataset_id: number;
  snippet_set_id?: number | null;
  embedding_model_id: number;
  metadata_path: string;
  label_config_path: string;
  min_samples_per_class?: number;
  max_samples_per_class?: number | null;
  model_family_name: string;
  version?: string;
  model_type?: string;
  epochs?: number;
  learning_rate?: number;
  batch_size?: number;
  hidden_dim?: number;
  dropout?: number;
  device?: string;
  run_inference?: boolean;
}

/** Returned immediately when retrain is dispatched; poll job_id for status. */
export interface PAMRetrainJobDispatch {
  job_id: number;
  checkpoint_id: number;
  status: PAMRetrainStatusValue;
  message: string;
}

/** POST /inference/get-or-create may return this when sync inference fails and a Celery job is enqueued. */
export type PAMInferenceResponse = PAMInferenceResult | PAMRetrainJobDispatch;

export function isInferenceJobDispatch(
  payload: PAMInferenceResponse,
): payload is PAMRetrainJobDispatch {
  return typeof (payload as PAMRetrainJobDispatch).job_id === "number";
}

/** Full status of a retrain job — use for polling. */
export interface PAMRetrainJobStatus {
  id: number;
  dataset_id: number;
  model_checkpoint_id: number;
  trigger: string;
  feedback_count: number;
  status: PAMRetrainStatusValue;
  result_metrics?: Record<string, unknown> | null;
  error_message?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface ALLabeledSnippetsResponse {
  dataset_id: number;
  snippet_set_id?: number | null;
  snippet_ids: number[];
}

export interface ALSnippetLabel {
  snippet_id: number;
  labels: string[];
}

export interface ALSnippetLabelsResponse {
  dataset_id: number;
  snippet_set_id?: number | null;
  items: ALSnippetLabel[];
}

export interface PAMCheckpoint {
  id: number;
  dataset_id: number;
  model_family_name: string;
  version: string;
  checkpoint_path: string | null;
  model_type: string;
  is_base: number;
  status: PAMModelStatusValue | string;
  created_at: string;
  updated_at?: string | null;
  parent_checkpoint_id?: number | null;
}

export type ALFeedSource = "pam" | "classic";

export interface ALState {
  /** Distinguishes PAM inference feed vs random/similarity classic feed. */
  feedSource: ALFeedSource | null;
  /** Classic mode: annotation rows per snippet (for add/remove sync with API). */
  classicAnnotationsBySnippet: Record<number, Annotation[]>;
  /** Model selection */
  modelCheckpointId: number | null; // UI selection only (maps -> model_family_name)
  modelFamilyName: string | null;   // required by backend PAM-AL endpoints
  usedCheckpointId: number | null;  // last checkpoint actually used by backend

  snippetSetId: number | null;
  embeddingModelId: number | null;  // embedding space used for dataset-level projections
  inferenceK: number;
  predictions: PAMPrediction[];
  projectionPredictions: PAMPrediction[];  // snapshot updated only after retrain
  modelInfo: Record<string, unknown>;
  totalScored: number;
  feedbacks: Record<number, FeedbackResponse>; // keyed by snippet_id
  feedbackCount: number;
  /** True when the backend indicates a retrain job is already pending/running for the current checkpoint. */
  retrainPending: boolean;
  retrainThreshold: number;
  selectedSnippetId: number | null;
  selectedPredictionId: number | null;
  selectedDatasetId: number | null;
  colorBy: ALColorBy;
  samplingMethod: SamplingMethod;
  alFilters: ALFilterState;
  lastRetrainDispatch: PAMRetrainJobDispatch | null;
  lastRetrainJob: PAMRetrainJobStatus | null;
  lastRetrainFailed: boolean;
  inferenceLoading: boolean;
  feedbackLoading: boolean;
  retrainLoading: boolean;
  error: string | null;
  lastInferenceAt: string | null;      // ISO timestamp of last successful inference
}
