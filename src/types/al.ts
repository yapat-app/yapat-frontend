/**
 * PAM Active Learning Types — aligned with /api/pam-al/* backend schemas.
 */

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
  propertyKey: string | null;
  /** Normalised to [0, 1] — converted to domain units when applied */
  range: [number, number];
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
  id: number;
  model_checkpoint_id: number | null;
  snippet_id: number;
  /**
   * Backend is multi-label.
   * UI still expects a primary label + confidence, so we also keep
   * `predicted_label` + `confidence` as derived display helpers.
   */
  predicted_labels: string[];
  predicted_probabilities?: Record<string, number> | null;
  uncertainty?: number | null;
  diversity?: number | null;
  density?: number | null;
  composite_score?: number | null;

  /** Derived for display / grouping */
  predicted_label: string;
  confidence: number;
  ranking_score: number | null; // typically composite_score
  created_at: string;
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

/** Returned immediately when retrain is dispatched; poll job_id for status. */
export interface PAMRetrainJobDispatch {
  job_id: number;
  checkpoint_id: number;
  status: PAMRetrainStatusValue;
  message: string;
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

export interface ALState {
  /** Model selection */
  modelCheckpointId: number | null; // UI selection only (maps -> model_family_name)
  modelFamilyName: string | null;   // required by backend PAM-AL endpoints
  usedCheckpointId: number | null;  // last checkpoint actually used by backend

  snippetSetId: number | null;
  inferenceK: number;
  predictions: PAMPrediction[];
  projectionPredictions: PAMPrediction[];  // snapshot updated only after retrain
  modelInfo: Record<string, unknown>;
  totalScored: number;
  feedbacks: Record<number, FeedbackResponse>; // keyed by snippet_id
  feedbackCount: number;
  retrainThreshold: number;
  selectedSnippetId: number | null;
  selectedPredictionId: number | null;
  selectedDatasetId: number | null;
  colorBy: ALColorBy;
  samplingMethod: SamplingMethod;
  alFilters: ALFilterState;
  lastRetrainDispatch: PAMRetrainJobDispatch | null;
  lastRetrainJob: PAMRetrainJobStatus | null;
  inferenceLoading: boolean;
  feedbackLoading: boolean;
  retrainLoading: boolean;
  error: string | null;
  lastInferenceAt: string | null;      // ISO timestamp of last successful inference
}
