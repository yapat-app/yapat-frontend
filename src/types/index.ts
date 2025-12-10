/**
 * TypeScript type definitions for YAPAT application
 * Corresponds to backend API models
 */

// ============================================================================
// Annotation Types
// ============================================================================

export interface Annotation {
  id: number;
  snippet_id: number;
  user_id: number;
  taxon_id: string;
  resolved_name_snapshot: string;
  confidence: number;
  notes?: string;
  extra_metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface AnnotationCreate {
  snippet_id: number;
  species_name?: string;  // User can type species name
  taxon_id?: string;      // Or provide taxon_id directly
  confidence?: number;
  notes?: string;
  extra_metadata?: Record<string, any>;
}

export interface AnnotationBatchCreate {
  snippet_id: number;
  annotations: Omit<AnnotationCreate, 'snippet_id'>[];
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
// Snippet Types
// ============================================================================

export interface Snippet {
  id: number;
  recording_id: number;
  start_time: number;
  end_time: number;
  duration: number;
  file_path?: string;
  embedding?: any;
  is_annotated: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SnippetCreate {
  recording_id: number;
  start_time: number;
  end_time: number;
  duration: number;
  file_path?: string;
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
// Dataset Types
// ============================================================================

export interface Dataset {
  id: number;
  name: string;
  description?: string;
  source_uri?: string;
  team_id?: number;
  created_at: string;
  updated_at?: string;
}

export interface DatasetCreate {
  name: string;
  description?: string;
  source_uri?: string;
  team_id?: number;
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'admin';
  created_at: string;
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
  dataset_id?: number;
  recording_id?: number;
  skip?: number;
  limit?: number;
}

// ============================================================================
// Task Types (for Celery tasks)
// ============================================================================

export interface TaskStatus {
  task_id: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILURE';
  ready: boolean;
  successful?: boolean;
  failed?: boolean;
  result?: any;
  error?: string;
  meta?: any;
}

