/**
 * TypeScript type definitions for YAPAT application
 * Corresponds to backend API models
 */

// ============================================================================
// Embedding Types
// ============================================================================

export interface Embedding {
  embedding_job_id: number;
  snippet_set_id: number;
  model_id: number;
  celery_task_id: string;
  status: string;
}

export interface CreateEmbedding {
  embedding_model_id: number;
  window_size: number;
  step_size: number;
  overlap: number;
}

export interface EmbeddingJob {
  embedding_model_id: number;
  snippet_set_id: number;
  status: string;
  celery_task_id: string;
  started_at: string;
  error_message: null;
  dataset_id: number;
  id: number;
  created_at: string;
  completed_at: string;
}

export interface EmbeddingMethod {
  id: number;
  name: string;
  version: string;
  description: string;
  window_size: number;
  step_size: number;
  overlap: number;
  requires_fixed_window: boolean;
  requires_fixed_step: boolean;
  requires_fixed_overlap: boolean;
}

// ============================================================================
// Annotation Types
// ============================================================================

export interface Annotation {
  id: number;
  snippet_id: number;
  user_id: number;
  taxon_id: string;
  resolved_name_snapshot: string;
  extra_metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface DatasetAnnotationStats {
  dataset_name: string;
  dataset_id: number;
  total_snippets: number;
  annotated_snippets: number;
  not_annotated_snippets: number;
  annotation_percentage: number;
  total_annotations: number;
}

export interface ExportAnnotation {
  dataset_id: number | null | string;
  format: string;
  taxon_id?: string;
  user_id?: number | null;
  created_after?: string;
  created_before?: string;
}

export interface AnnotationCreate {
  snippet_id: number;
  species_name?: string; // User can type species name
  taxon_id?: string; // Or provide taxon_id directly
  display_name?: string; // Human-readable name for wiki/envo/ols (e.g. from Taxonomy Assistant)
  extra_metadata?: Record<string, any>;
}

export interface AnnotationBatchCreate {
  snippet_id: number;
  annotations: Omit<AnnotationCreate, "snippet_id">[];
}

// ============================================================================
// Taxonomy Types
// ============================================================================

export interface TaxonSuggestion {
  taxon_id: string;
  canonical_name?: string;
  scientific_name?: string;
  rank?: string;
  kingdom?: string;
  status?: string;
}

export interface CommonName {
  name: string;
  language: string;
}

export interface AvailableTaxonomies {
  total: number;
  taxonomies: Taxonomy[];
}

export interface Taxonomy {
  taxonomy_id: string;
  name: string;
  type: string;
  description: string;
  team_id: number;
  is_global: boolean;
  status?: string;
}

export interface TaxonDetails extends TaxonSuggestion {
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  common_names: CommonName[];
  habitats: string[];
  taxonomic_status?: string;
  match_type?: string;
  confidence?: number;
}

// ============================================================================
// Custom Taxonomy Types
// ============================================================================

export interface Metadata {
  iri: string;
  tool: string;
  score: number | null;
  source: string;
  description: string | null;
  rank?: string;
  family?: string | null;
  kingdom?: string | null;
}

export interface Node {
  id: string;
  name: string;
  rank: string;
  metadata: Metadata;
  scientific_name: string;
}

export interface GenerationMetadata {
  model: string;
  prompt: string;
  server: string;
}

export interface AllLabelSpace {
  conversation_id: number;
  is_frozen: boolean;
  items: LabelSpaceItem[];
  total: number;
}

export interface TaxonomyData {
  nodes: Node[];
  generation_metadata: GenerationMetadata;
}

export interface MessageMetadata {
  taxonomy_data?: TaxonomyData;
  action?: string;
  item_ids?: string[];
}

export interface LabelSpaceItem {
  id: string;
  name: string;
  scientific_name: string;
  canonical_name: string;
  taxon_id: string;
  metadata: {
    iri: string;
    rank: string;
    tool: string;
    score: null | number;
    family: null | string;
    source: string;
    kingdom: null | string;
    description: null | string;
  };
  added_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  role: "user" | "assistant" | "system";
  content: string;
  message_metadata: MessageMetadata | null;
}

export interface MessageResponse {
  message: Message;
  conversation: Conversation;
}

// Conversation type
export interface Conversation {
  id: number;
  team_id: number;
  user_id: number;
  custom_taxonomy_id: number | null;
  status: "in_progress" | string; // Add other status values as needed
  label_space: LabelSpaceItem[] | []; // Specify the actual type if known
  is_frozen: boolean;
  created_at: string; // Use Date if you'll parse it
  updated_at: string; // Use Date if you'll parse it
  messages: Message[] | [];
}

/** Response from POST /chat/{id}/freeze */
export interface FreezeLabelSpaceResponse {
  conversation: Conversation;
  taxonomy: unknown;
}

/** Response from POST /chat/{id}/add (add to label space) */
export interface AddToLabelSpaceResponse {
  conversation: Conversation;
  added_items: LabelSpaceItem[];
  skipped_count: number;
}

export interface MessageResponse {
  message: Message;
  conversation: Conversation;
}

// ============================================================================
// Feed Types
// ============================================================================

export interface Feed {
  start_time: number;
  duration: number;
  snippet_set_id: number;
  id: number;
  recording_id: number;
  end_time: number;
  created_at: string;
}

export interface FeedCreate {
  method?: string;
  dataset_id?: number | null;
  recording_id?: number;
  skip?: number;
  limit?: number;
  status?: string;
  embedding_model_id?: number;
  query_snippet_id?: number;
  crop_start_sec?: number;
  crop_end_sec?: number;
}

export interface FeedSimilarityCreate {
  audio_file: File;
  dataset_id: number | null;
  end_time: number;
  start_time: number;
  limit?: number;
  status?: string;
  embedding_model_id?: number | null;
  snippet_set_id?: number;
}

/** Snapshot from GET /api/feed/history — last stored feeds per user (see backend UserFeed). */
export interface UserFeedSnapshot {
  id: number;
  method: string;
  created_at: string;
  response: Snippet[];
  request_params?: Record<string, unknown> | null;
}

/** Blob URL + sample rate from GET /api/snippets/:id/audio response headers. */
export interface SnippetAudioResult {
  url: string;
  sampleRate: number;
}

export interface Snippet {
  id: number;
  recording_id: number;
  start_time: number;
  end_time: number;
  duration: number;
  file_path?: string;
  embedding?: any;
  is_annotated?: boolean;
  created_at: string;
  updated_at?: string;
  method?: string;
  response?: string | undefined;
}

export interface SnippetCreate {
  recording_id: number;
  start_time: number;
  end_time: number;
  duration: number;
  file_path?: string;
}

export interface SnippetSet {
  id: number;
  dataset_id: number;
  embedding_model_id: number;
  window_size: number;
  step_size: number;
  overlap: number;
  status: string;
  created_at: string;
}

// ============================================================================
// Recording Types
// ============================================================================

export interface Recording {
  id: number;
  dataset_id: number;
  name: string;
  file_path: string;
  duration_sec?: number;
  sample_rate?: number;
  channels?: number;
  created_at: string;
  updated_at?: string;
}

export interface RecordingCreate {
  dataset_id: number;
  name: string;
  file_path: string;
  duration_sec?: number;
  sample_rate?: number;
  channels?: number;
}

// ============================================================================
// Team Types
// ============================================================================

export interface Team {
  id: string;
  name: string;
  description?: string;
  is_ready: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TeamMember {
  membership_id: number;
  user_id: number;
  username: string;
  full_name?: string;
  role: "owner" | "user";
  joined_at: string;
}

// ============================================================================
// Dataset Types
// ============================================================================

export type DatasetType = "PAM" | "FOCAL_RECORDINGS";

export interface Dataset {
  id: number | string;
  name: string;
  description?: string;
  source_uri?: string;
  team_id?: number;
  dataset_type?: DatasetType;
  default_snippet_set_id?: number | null;
  created_at?: string;
  updated_at?: string;
  is_ready_for_feed?: boolean;
  recording_count?: number;
}

export interface DatasetCreate {
  name: string;
  description?: string;
  source_uri?: string;
  team_id?: number;
  dataset_type?: DatasetType;
}

export interface AvailableDatasetPath {
  path: string;
  name: string;
  has_children?: boolean;
}

export interface AvailableDatasetPathsResponse {
  data_root: string;
  current_path: string;
  parent_path?: string | null;
  paths: AvailableDatasetPath[];
}

export interface DatasetCreationResponse {
  dataset: Dataset;
  process_task_id?: string | null;
  snippet_config_id?: number | null;
  embedding_job_id?: number | null;
}

export interface DatasetFile {
  filename: string;
  file_path: string;
  size: number;
}

export interface DatasetSpecies {
  name: string;
  file_count: number;
  files: DatasetFile[];
}

export interface DatasetResponse {
  dataset_id: number;
  dataset_name: string;
  source_uri: string;
  species: DatasetSpecies[];
}

// ============================================================================
// Invitations Types
// ============================================================================

export interface Invitation {
  id: number;
  team_id: number;
  invited_by: number;
  token: string;
  target_role: string;
  expires_at: string;
  is_active: boolean;
  max_uses: number;
  used_count: number;
  created_at: string;
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: number;
  username: string;
  email: string;
  role: "user" | "admin" | "team_owner";
  created_at: string;
  full_name?: string;
  is_active?: boolean;
  accessToken?: string;
  team_ids?: number[];
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiError {
  detail: string;
  status_code?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

// ============================================================================
// Feed Types
// ============================================================================

export interface FeedParams {
  dataset_id?: number | null;
  recording_id?: number;
  method?: string;
  skip?: number;
  limit?: number;
}

// ============================================================================
// Task Types (for Celery tasks)
// ============================================================================

export interface TaskStatus {
  task_id: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILURE";
  ready: boolean;
  successful?: boolean;
  failed?: boolean;
  result?: any;
  error?: string;
  meta?: any;
}

// ============================================================================
// WSSED Types
// ============================================================================

export interface ActiveLearningModelInfo {
  species_model_id: number;
}

export interface ActiveLearningSuggestion {
  snippet_id: number;
  confidence: number;
}

export interface ActiveLearningResponse {
  model_info: ActiveLearningModelInfo;
  suggestions: ActiveLearningSuggestion[];
}

export interface getActiveLearningSuggestionsParams {
  dataset_id: number;
  snippet_set_id: number;
  species_name: string;
  threshold?: number;
  limit?: number;
}

export interface ActiveLearningLabel {
  snippet_set_id: number;
  dataset_id: number;
  species_name: string;
  snippet_id: number;
  label: 0 | 1;
}

export interface retrainActiveLearningBody {
  snippet_set_id: number;
  dataset_id: number;
  species_name: string;
  device?: "cpu" | "cuda";
  epochs?: number;
  lr?: number;
}

export interface PredictionHistogram {
  bin_edges: number[];
  counts: number[];
}
