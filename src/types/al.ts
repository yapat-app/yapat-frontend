/**
 * PAM Active Learning Types — aligned with /api/pam-al/* backend schemas.
 */

export type FeedbackAction = "ACCEPT" | "REJECT" | "MODIFY";
export type ALColorBy = "prediction" | "uncertainty" | "taxon";
export type SamplingMethod = "uncertainty" | "diversity" | "density" | "random";
export type PAMRetrainStatusValue = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

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
  model_checkpoint_id: number;
  snippet_set_id: number;
  k?: number;
  device?: string;
}

export interface PAMPrediction {
  id: number;
  model_checkpoint_id: number;
  snippet_id: number;
  predicted_label: string;
  confidence: number;
  ranking_score: number | null;
  created_at: string;
  embedding_2d?: [number, number];
  /** Sampler + metadata scores attached by the backend */
  scores?: SampleScores;
}

export interface PAMInferenceResult {
  predictions: PAMPrediction[];
  total_scored: number;
  model_info: Record<string, unknown>;
}

export interface FeedbackPayload {
  prediction_id: number;
  action: FeedbackAction;
  modified_label?: string;
  notes?: string;
}

export interface FeedbackResponse {
  id: number;
  prediction_id: number;
  action: FeedbackAction;
  modified_label: string | null;
  notes: string | null;
  created_at: string;
  feedback_count_since_retrain: number;
  retrain_triggered: boolean;
}

export interface PAMRetrainRequest {
  model_checkpoint_id: number;
  epochs?: number;
  learning_rate?: number;
  device?: string;
}

export interface PAMRetrainJobResponse {
  id: number;
  model_checkpoint_id: number;
  trigger: string;
  feedback_count: number;
  status: PAMRetrainStatusValue;
  result_metrics: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  new_checkpoint_id: number | null;
  new_checkpoint_path: string | null;
}

export interface PAMCheckpoint {
  id: number;
  dataset_id: number;
  name: string;
  version: string;
  checkpoint_path: string | null;
  model_type: string;
  is_base: number;
  status: string;
  created_at: string;
}

export interface ALState {
  modelCheckpointId: number | null;
  snippetSetId: number | null;
  inferenceK: number;
  predictions: PAMPrediction[];
  projectionPredictions: PAMPrediction[];  // snapshot updated only after retrain
  modelInfo: Record<string, unknown>;
  totalScored: number;
  feedbacks: Record<number, FeedbackResponse>;
  feedbackCount: number;
  retrainThreshold: number;
  selectedSnippetId: number | null;
  selectedPredictionId: number | null;
  selectedDatasetId: number | null;
  colorBy: ALColorBy;
  samplingMethod: SamplingMethod;
  alFilters: ALFilterState;
  lastRetrainJob: PAMRetrainJobResponse | null;
  inferenceLoading: boolean;
  feedbackLoading: boolean;
  retrainLoading: boolean;
  error: string | null;
  lastInferenceAt: string | null;      // ISO timestamp of last successful inference
}
