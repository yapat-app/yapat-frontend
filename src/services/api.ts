/**
 * API Service Layer
 *
 * Centralized API client that abstracts all backend communication.
 * This layer makes it easy to:
 * - Switch between mock and real implementations
 * - Add caching, retry logic, etc.
 * - Mock for testing
 * - Track and handle errors consistently
 */

import api from "../axios/axiosInstance";
import type {
  Snippet,
  SnippetCreate,
  Annotation,
  AnnotationCreate,
  AnnotationBatchCreate,
  TaxonSuggestion,
  TaxonDetails,
  Recording,
  RecordingCreate,
  Dataset,
  FeedParams,
  TaskStatus,
  Embedding,
  EmbeddingJob,
  CreateEmbedding,
  EmbeddingMethod,
  Feed,
  FeedCreate,
  FeedSimilarityCreate,
  DatasetAnnotationStats,
  MessageResponse,
  Conversation,
  AllLabelSpace,
  DatasetResponse,
  FreezeLabelSpaceResponse,
  AvailableTaxonomies,
  SnippetSet,
  Invitation,
  ActiveLearningResponse,
  ActiveLearningLabel,
  getActiveLearningSuggestionsParams,
  retrainActiveLearningBody,
  PredictionHistogram,
} from "../types";

type AddToLabelSpaceResponse = {
  conversation: Conversation;
  added_items: unknown[];
  skipped_count: number;
};

// ============================================================================
// Snippet API
// ============================================================================

export const snippetApi = {
  /**
   * Get feed of unannotated snippets for annotation workflow
   * Prioritizes unannotated snippets
   */
  getFeed: async (params: FeedParams): Promise<Snippet[]> => {
    const response = await api.get("/api/feed/", { params });
    return response.data;
  },

  /**
   * Get all snippets with optional filtering
   */
  getAll: async (params: {
    recording_id?: number;
    skip?: number;
    limit?: number;
  }): Promise<Snippet[]> => {
    const response = await api.get("/api/snippets/", { params });
    return response.data;
  },

  /**
   * Get single snippet by ID
   */
  getById: async (snippetId: number): Promise<Snippet> => {
    const response = await api.get(`/api/snippets/${snippetId}`);
    return response.data;
  },

  /**
   * Create a new snippet
   */
  create: async (data: SnippetCreate): Promise<Snippet> => {
    const response = await api.post("/api/snippets/", data);
    return response.data;
  },

  /**
   * Get audio URL for snippet playback
   * Handles mock vs real audio based on environment
   */
  getAudioUrl: (snippetId: number): string => {
    const useMock = import.meta.env.VITE_USE_MOCK_AUDIO === "true";

    if (useMock) {
      // Return placeholder/silent audio for mock
      return `/mock-audio/snippet-${snippetId}.wav`;
    }

    // Real audio URL from backend - use api instance baseURL
    const baseURL = api.defaults.baseURL || "http://localhost:8000";
    return `${baseURL}/api/snippets/${snippetId}/audio`;
  },

  /**
   * Get snippet audio for snippet playback
   */
  getSnippetAudio: async (
    snippetId: number,
    signal?: AbortSignal,
  ): Promise<string> => {
    const response = await api.get(`/api/snippets/${snippetId}/audio`, {
      responseType: "blob",
      signal,
    });
    const url = URL.createObjectURL(response.data);
    // return seriazable audio url
    return url;
  },
};

// ============================================================================
// Annotation API
// ============================================================================

export const annotationApi = {
  /**
   * Create a new annotation
   * Supports both species_name and taxon_id
   */
  create: async (data: AnnotationCreate): Promise<Annotation> => {
    const response = await api.post("/api/annotations/", data);
    return response.data;
  },

  //Create multiple annotations for a snippet

  createBatch: async (data: AnnotationBatchCreate): Promise<Annotation[]> => {
    const response = await api.post("/api/annotations/batch", data);
    return response.data;
  },

  //Get annotations with optional filtering

  getAll: async (params: {
    snippet_id?: number;
    taxon_id?: string;
    user_id?: number;
    skip?: number;
    limit?: number;
  }): Promise<Annotation[]> => {
    const response = await api.get("/api/annotations/", { params });
    return response.data;
  },

  //Get single annotation by ID

  getById: async (annotationId: number): Promise<Annotation> => {
    const response = await api.get(`/api/annotations/${annotationId}`);
    return response.data;
  },

  // Get annotation stats for a dataset
  getAnnotationsForDataset: async (): Promise<DatasetAnnotationStats[]> => {
    const response = await api.get(`/api/annotations/datasets/stats`);
    return response.data;
  },

  //Delete an annotation

  delete: async (annotationId: number): Promise<void> => {
    await api.delete(`/api/annotations/${annotationId}`);
  },
};

// ============================================================================
// Embeddings API
// ============================================================================

export const embeddingApi = {
  /**
   * Create a new embedding
   */
  create: async (
    datasetId: number | null,
    data: CreateEmbedding,
  ): Promise<Embedding> => {
    const response = await api.post(
      `api/datasets/${datasetId}/embeddings`,
      data,
    );
    return response.data;
  },

  /**
   * Get all embedding methods
   */
  allEmbeddingList: async (): Promise<EmbeddingMethod[]> => {
    const response = await api.get(`api/embedding-models`);
    return response.data;
  },

  /**
   * Get all embedding jobs for dataset
   */
  allDatasetEmbeddingList: async (
    datasetId: number | null,
  ): Promise<EmbeddingJob[]> => {
    const response = await api.get(`api/datasets/${datasetId}/embeddings`);
    return response.data;
  },

  allSnippetSets: async (datasetId: number | null): Promise<SnippetSet[]> => {
    const response = await api.get(`api/datasets/${datasetId}/snippet-sets`);
    return response.data;
  },
};

// ============================================================================
// Feed API
// ============================================================================

export const feedApi = {
  /**
   * Get Feed
   */
  create: async (data: FeedCreate): Promise<Feed[]> => {
    const response = await api.get("api/feed/", { data });
    return response.data;
  },

  /**
   * Get Feed History
   */
  history: async (): Promise<[]> => {
    const response = await api.get("api/feed/history");
    return response.data;
  },

  similarity: async (data: FeedSimilarityCreate): Promise<Feed[]> => {
    const formData = new FormData();
    formData.append("audio_file", data.audio_file); // file field
    formData.append("dataset_id", String(data.dataset_id));
    formData.append("end_time", String(data.end_time));
    formData.append("start_time", String(data.start_time));
    formData.append("embedding_model_id", String(data.embedding_model_id));
    formData.append("limit", String(data.limit));
    const response = await api.post(`api/feed/similarity-search`, data, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  },
};

// ============================================================================
// Taxonomy API
// ============================================================================

export const taxonomyApi = {
  /**
   * Get fast autocomplete suggestions for species names
   * Optimized for real-time typing
   */
  suggest: async (
    query: string,
    limit: number = 10,
  ): Promise<TaxonSuggestion[]> => {
    const response = await api.get("/api/taxonomy/suggest", {
      params: { q: query, limit },
    });
    return response.data;
  },

  //Full-text search over species with filtering

  search: async (params: {
    q: string;
    limit?: number;
    rank?: string;
    status?: string;
  }): Promise<TaxonDetails[]> => {
    const response = await api.get("/api/taxonomy/search", { params });
    return response.data;
  },

  //Resolve a taxon ID to detailed information

  resolve: async (taxonId: string): Promise<TaxonDetails> => {
    const response = await api.get("/api/taxonomy/resolve", {
      params: { id: taxonId },
    });
    return response.data;
  },

  /**
   * Fuzzy match a species name to find best matching taxon
   * Returns null if no match found
   */
  match: async (name: string): Promise<TaxonDetails | null> => {
    try {
      const response = await api.get("/api/taxonomy/match", {
        params: { name },
      });
      return response.data;
    } catch (error: any) {
      // 404 means no match found - this is expected, return null
      if (error.response?.status === 404) {
        return null;
      }
      // Re-throw other errors (network issues, etc.)
      throw error;
    }
  },

  /**
   * Validate if a taxon ID exists
   */
  validate: async (
    taxonId: string,
  ): Promise<{ taxon_id: string; valid: boolean }> => {
    const response = await api.get("/api/taxonomy/validate", {
      params: { id: taxonId },
    });
    return response.data;
  },

  available: async (): Promise<AvailableTaxonomies> => {
    const response = await api.get("/api/taxonomy/available");
    return response.data;
  },
};

// ============================================================================
// Custom Taxonomy API
// ============================================================================

export const customtaxonomyApi = {
  /**
   * Ask AI agent to suggest taxonomies for annotating
   */

  startConversation: async (teamId: any): Promise<Conversation> => {
    const response = await api.post("/api/taxonomy/chat/start", {
      team_id: teamId,
    });
    return response.data;
  },

  cancelConversation: async (conversationId: number): Promise<Conversation> => {
    const response = await api.post(
      `/api/taxonomy/chat/${conversationId}/cancel`,
    );
    return response.data;
  },

  freeze: async (params: {
    name: string;
    description: string;
    conversationId: number;
  }): Promise<FreezeLabelSpaceResponse> => {
    const { name, description, conversationId } = params;
    const response = await api.post(
      `/api/taxonomy/chat/${conversationId}/freeze`,
      {
        name,
        description,
      },
    );
    return response.data;
  },

  getConversation: async (conversationId: number): Promise<Conversation> => {
    const response = await api.get(`/api/taxonomy/chat/${conversationId}`);
    return response.data;
  },

  removeItem: async (params: {
    itemId: number | string;
    conversationId: number;
  }): Promise<Conversation> => {
    const { itemId, conversationId } = params;
    const response = await api.delete(
      `/api/taxonomy/chat/${conversationId}/item/${itemId}`,
    );
    return response.data;
  },

  getLabelSpace: async (conversationId: number): Promise<AllLabelSpace> => {
    const response = await api.get(
      `/api/taxonomy/chat/${conversationId}/label-space`,
    );
    return response.data;
  },

  sendNewMessage: async (params: {
    conversationId: number;
    prompt: string;
  }): Promise<MessageResponse> => {
    const response = await api.post(
      `/api/taxonomy/chat/${params.conversationId}/message`,
      {
        prompt: params.prompt,
      },
    );
    return response.data;
  },

  addToLabelSpace: async (params: {
    conversationId: number;
    messageId: number;
    indices: number[];
  }): Promise<AddToLabelSpaceResponse> => {
    const { conversationId, messageId, indices } = params;
    const response = await api.post(
      `/api/taxonomy/chat/${conversationId}/add`,
      {
        message_id: messageId,
        indices: indices,
      },
    );
    return response.data;
  },

  allTaxonomies: async (
    teamId: number,
  ): Promise<{ taxonomies: unknown[]; total: number }> => {
    const response = await api.get("/api/taxonomy/custom", {
      params: { team_id: teamId },
    });
    return response.data;
  },
};

// ============================================================================
// Recording API
// ============================================================================

export const recordingApi = {
  /**
   * Get all recordings with optional filtering
   */
  getAll: async (params: {
    dataset_id?: number;
    skip?: number;
    limit?: number;
  }): Promise<Recording[]> => {
    const response = await api.get("/api/recordings/", { params });
    return response.data;
  },

  /**
   * Get single recording by ID
   */
  getById: async (recordingId: number): Promise<Recording> => {
    const response = await api.get(`/api/recordings/${recordingId}`);
    return response.data;
  },

  //Create a new recording

  create: async (data: RecordingCreate): Promise<Recording> => {
    const response = await api.post("/api/recordings/", data);
    return response.data;
  },
};

// ============================================================================
// Dataset API
// ============================================================================

export const datasetApi = {
  //Get all datasets

  getAll: async (params?: {
    skip?: number;
    limit?: number;
  }): Promise<Dataset[]> => {
    const response = await api.get("/api/datasets/", { params });
    return response.data;
  },

  //Get single dataset by ID

  getById: async (datasetId: number): Promise<Dataset> => {
    const response = await api.get(`/api/datasets/${datasetId}`);
    return response.data;
  },

  explorer: async (datasetId: number): Promise<DatasetResponse> => {
    const response = await api.get(`/api/datasets/${datasetId}/explorer`);
    return response.data;
  },
};

// ============================================================================
// Team API
// ============================================================================

export const teamApi = {
  getAllTeamDatasets: async (): Promise<Dataset[]> => {
    const response = await api.get(`/api/teams//available-datasets`);
    return response.data;
  },

  getTeamById: async (
    teamId: string | number,
  ): Promise<import("../types").Team> => {
    const response = await api.get(`/api/teams//${teamId}`);
    return response.data;
  },

  updateTeam: async (
    teamId: string | number,
    body: { name?: string; description?: string },
  ): Promise<import("../types").Team> => {
    const response = await api.patch(`/api/teams//${teamId}`, body);
    return response.data;
  },

  deleteTeam: async (teamId: string | number): Promise<void> => {
    await api.delete(`/api/teams//${teamId}`);
  },

  getTeamMembers: async (
    teamId: string | number,
  ): Promise<import("../types").TeamMember[]> => {
    const response = await api.get(`/api/teams//${teamId}/members`);
    return response.data;
  },

  removeMember: async (
    teamId: string | number,
    userId: number,
  ): Promise<void> => {
    await api.delete(`/api/teams//${teamId}/members/${userId}`);
  },

  createInvitation: async (body: any): Promise<Invitation> => {
    const response = await api.post(
      `/api/teams//${body.teamId}/invitations`,
      body,
    );
    return response.data;
  },
};

// ============================================================================
// Task API (Celery tasks)
// ============================================================================

export const taskApi = {
  //Get status of a Celery task

  getStatus: async (taskId: string): Promise<TaskStatus> => {
    const response = await api.get(`/api/tasks/status/${taskId}`);
    return response.data;
  },

  //Trigger recording processing

  processRecording: async (
    recordingId: number,
  ): Promise<{ task_id: string }> => {
    const response = await api.post(
      `/api/tasks/recordings/${recordingId}/process`,
    );
    return response.data;
  },

  //Trigger snippet generation for a recording

  generateSnippets: async (
    recordingId: number,
    params?: { window_duration_sec?: number; hop_duration_sec?: number },
  ): Promise<{ task_id: string }> => {
    const response = await api.post(
      `/api/tasks/recordings/${recordingId}/generate-snippets`,
      null,
      { params },
    );
    return response.data;
  },

  //Trigger dataset scan

  scanDataset: async (datasetId: number): Promise<{ task_id: string }> => {
    const response = await api.post(`/api/tasks/datasets/${datasetId}/scan`);
    return response.data;
  },

  //Cancel a running task

  cancel: async (taskId: string): Promise<void> => {
    await api.delete(`/api/tasks/cancel/${taskId}`);
  },
};

// ============================================================================
// WSSED API
// ============================================================================

export const wssedApi = {
  getAccess: async (): Promise<{
    enabled: boolean;
    focal_dataset_count: number;
  }> => {
    const response = await api.get("/api/wssed/access");
    return response.data;
  },

  suggestions: async (
    params: getActiveLearningSuggestionsParams,
  ): Promise<ActiveLearningResponse> => {
    const response = await api.get("/api/wssed/suggestions", { params });
    return response.data;
  },

  submitLabel: async (body: ActiveLearningLabel): Promise<void> => {
    await api.post("/api/wssed/label", body);
  },

  retrain: async (body: retrainActiveLearningBody): Promise<void> => {
    await api.post("/api/wssed/retrain", body);
  },

  histogram: async (params: {
    model_id: number;
    snippet_set_id: number;
  }): Promise<PredictionHistogram> => {
    const response = await api.get("/api/wssed/histogram", { params });
    return response.data;
  },

  createTrainingJob: async (body: {
    dataset_id: number;
    model_name: string;
    hyperparameters: Record<string, unknown>;
  }): Promise<{ job_id: number; status: string; message: string }> => {
    const response = await api.post("/api/wssed/training-jobs", body);
    return response.data;
  },

  getTrainingJobStatus: async (
    jobId: number,
  ): Promise<{
    job_id: number;
    status: string;
    model_path: string | null;
    model_paths?: Record<string, string> | null;
    metrics: Record<string, unknown> | null;
    error: string | null;
    progress: Record<string, unknown> | null;
  }> => {
    const response = await api.get(`/api/wssed/training-jobs/${jobId}/status`);
    return response.data;
  },

  getDatasetArtifacts: async (
    datasetId: number,
  ): Promise<{
    dataset_path: string;
    embeddings_path: string;
    embeddings_complete: boolean;
    embeddings_status: string;
    checkpoint_exists: boolean;
    checkpoint_path: string | null;
    output_dir: string;
    audio_count: number;
    npz_count: number;
  }> => {
    const response = await api.get(`/api/wssed/datasets/${datasetId}/artifacts`);
    return response.data;
  },

  registerTrainingJobForAL: async (
    jobId: number,
  ): Promise<{
    job_id: number;
    al_checkpoint_id: number;
    model_family_name: string;
    checkpoint_path: string;
    snippet_set_id: number | null;
    inference_job_id: number | null;
    message: string;
  }> => {
    const response = await api.post(`/api/wssed/training-jobs/${jobId}/register-al`);
    return response.data;
  },

  getLatestTrainingJobStatus: async (
    datasetId: number,
  ): Promise<{
    job_id: number;
    status: string;
    model_path: string | null;
    model_paths?: Record<string, string> | null;
    metrics: Record<string, unknown> | null;
    error: string | null;
    progress: Record<string, unknown> | null;
  }> => {
    const response = await api.get("/api/wssed/training-jobs/latest", {
      params: { dataset_id: datasetId },
    });
    return response.data;
  },
};

// ============================================================================
// Error Handling Utilities
// ============================================================================

//Extract error message from API error response

export const getErrorMessage = (error: any): string => {
  const detail = error.response?.data?.detail;
  if (detail) {
    // FastAPI validation errors (422) often look like:
    // { detail: [{ loc: ["body","prompt"], msg: "...", type: "..." }, ...] }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((d: any) => {
          const loc = Array.isArray(d?.loc) ? d.loc.join(".") : undefined;
          let msg = typeof d?.msg === "string" ? d.msg : undefined;

          // Pydantic sometimes prefixes custom ValueError messages with "Value error, "
          if (msg?.startsWith("Value error, ")) {
            msg = msg.slice("Value error, ".length).trim();
          }

          // For body field validation errors, prefer showing just the message
          // (e.g. "Password must be at least 8 characters long")
          if (msg && loc?.startsWith("body.")) return msg;

          if (loc && msg) return `${loc}: ${msg}`;
          return msg || loc;
        })
        .filter(Boolean);
      if (parts.length > 0) return parts.join("\n");
    }
    if (typeof detail === "string") return detail;
  }
  if (error.message) {
    return error.message;
  }
  return "An unexpected error occurred";
};

//Check if error is a network error

export const isNetworkError = (error: any): boolean => {
  return !error.response && error.request;
};

//Check if error is an authentication error

export const isAuthError = (error: any): boolean => {
  return error.response?.status === 401 || error.response?.status === 403;
};
