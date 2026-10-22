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
  DatasetUpdate,
  FeedParams,
  TaskStatus,
  Embedding,
  EmbeddingJob,
  EmbeddingJobProgress,
  ScanProgress,
  CreateEmbedding,
  EmbeddingMethod,
  Feed,
  FeedCreate,
  FeedSimilarityCreate,
  UserFeedSnapshot,
  AllDatasetsAnnotationStats,
  MessageResponse,
  Conversation,
  AllLabelSpace,
  DatasetResponse,
  FreezeLabelSpaceResponse,
  AvailableTaxonomies,
  SnippetSet,
  SnippetAudioResult,
  Invitation,
  ActiveLearningResponse,
  ActiveLearningLabel,
  getActiveLearningSuggestionsParams,
  retrainActiveLearningBody,
  PredictionHistogram,
} from "../types";
import {
  parseWavSampleRate,
  resolveSnippetSampleRate,
} from "../utils/spectrogramConfig";

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
    const response = await api.get("/api/feed/", {
      params,
      timeout: 120_000,
    });
    return response.data;
  },

  /**
   * Get all snippets with optional filtering.
   * Note: the backend requires dataset_id + snippet_set_id together
   * (it validates the snippet set belongs to the dataset and is READY).
   */
  getAll: async (params: {
    dataset_id?: number;
    snippet_set_id?: number;
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
  ): Promise<SnippetAudioResult> => {
    const response = await api.get(`/api/snippets/${snippetId}/audio`, {
      responseType: "blob",
      signal,
    });
    const blob = response.data as Blob;
    const url = URL.createObjectURL(blob);
    const wavRate = await parseWavSampleRate(blob);
    const sampleRate = resolveSnippetSampleRate(
      wavRate,
      response.headers["x-sample-rate"],
    );
    return { url, sampleRate };
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
    /** Comma-separated snippet IDs for batched reads (annotate hub). */
    snippet_ids?: string;
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
  getAnnotationsForDataset: async (): Promise<AllDatasetsAnnotationStats> => {
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

  /**
   * Live progress of an embedding job (cheap: two Redis reads server-side).
   */
  getJobProgress: async (jobId: number): Promise<EmbeddingJobProgress> => {
    const response = await api.get(`api/embeddings/${jobId}/progress`);
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
   * Get Feed History (up to 5 per random + 5 per similarity; optional filters).
   */
  history: async (params?: {
    method?: string;
    dataset_id?: number;
  }): Promise<UserFeedSnapshot[]> => {
    const search: Record<string, string | number> = {};
    if (params?.method) search.method = params.method;
    if (params?.dataset_id != null && Number.isFinite(params.dataset_id)) {
      search.dataset_id = params.dataset_id;
    }
    const response = await api.get("api/feed/history", {
      params: Object.keys(search).length ? search : undefined,
    });
    return response.data;
  },

  similarityBySnippetId: async (data: {
    reference_snippet_id: number;
    dataset_id: number;
    limit?: number;
    snippet_set_id?: number;
  }): Promise<Snippet[]> => {
    const response = await api.get("api/feed/similarity-snippet", {
      params: {
        reference_snippet_id: data.reference_snippet_id,
        dataset_id: data.dataset_id,
        ...(data.limit != null ? { limit: data.limit } : {}),
        ...(data.snippet_set_id != null ? { snippet_set_id: data.snippet_set_id } : {}),
      },
    });
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

  envoSuggest: async (
    query: string,
    limit: number = 10,
  ): Promise<import("../types").QuickLabel[]> => {
    const response = await api.get("/api/taxonomy/envo/suggest", {
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

  /** Resolve several taxon IDs in one request; unresolvable IDs map to null. */
  resolveBatch: async (
    taxonIds: string[],
  ): Promise<Record<string, TaxonDetails | null>> => {
    const response = await api.post("/api/taxonomy/resolve", { taxon_ids: taxonIds });
    return response.data.results ?? {};
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
    ids?: string;
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
  /** Live progress of the dataset's latest scan (one Redis read server-side). */
  getScanProgress: async (datasetId: number): Promise<ScanProgress> => {
    const response = await api.get(`api/datasets/${datasetId}/scan-progress`);
    return response.data;
  },

  //Get all datasets

  getAll: async (params?: {
    skip?: number;
    limit?: number;
    /** Admin only: also return reference datasets (hidden by default). */
    include_reference?: boolean;
  }): Promise<Dataset[]> => {
    const response = await api.get("/api/datasets/", { params });
    return response.data;
  },

  //Get single dataset by ID

  getById: async (datasetId: number): Promise<Dataset> => {
    const response = await api.get(`/api/datasets/${datasetId}`);
    return response.data;
  },

  listAvailablePaths: async (
    prefix?: string,
  ): Promise<import("../types").AvailableDatasetPathsResponse> => {
    const response = await api.get("/api/datasets/available-paths", {
      params: prefix ? { prefix } : undefined,
    });
    return response.data;
  },

  create: async (
    body: import("../types").DatasetCreate,
  ): Promise<import("../types").DatasetCreationResponse> => {
    const response = await api.post("/api/datasets/", body);
    return response.data;
  },

  update: async (datasetId: number, body: DatasetUpdate): Promise<Dataset> => {
    const response = await api.patch(`/api/datasets/${datasetId}`, body);
    return response.data;
  },

  explorer: async (datasetId: number): Promise<DatasetResponse> => {
    const response = await api.get(`/api/datasets/${datasetId}/explorer`);
    return response.data;
  },

  getRecordingLocations: async (
    datasetId: number,
  ): Promise<import("../types").RecordingLocationsResponse> => {
    const response = await api.get(
      `/api/datasets/${datasetId}/recording-locations`,
    );
    return response.data;
  },

  getQuickLabels: async (datasetId: number): Promise<import("../types").QuickLabel[]> => {
    const response = await api.get(`/api/datasets/${datasetId}/quick-labels`);
    return response.data;
  },

  putQuickLabels: async (
    datasetId: number,
    labels: import("../types").QuickLabel[],
  ): Promise<import("../types").QuickLabel[]> => {
    const response = await api.put(`/api/datasets/${datasetId}/quick-labels`, labels);
    return response.data;
  },

  /** Quick labels added while annotating: the caller's own picks plus any
   *  dataset-wide entries. All three calls return the full visible list. */
  getMyQuickLabels: async (
    datasetId: number,
  ): Promise<import("../types").QuickLabelEntry[]> => {
    const response = await api.get(`/api/datasets/${datasetId}/quick-labels/mine`);
    return response.data;
  },

  addMyQuickLabels: async (
    datasetId: number,
    labels: import("../types").QuickLabelEntryCreate[],
  ): Promise<import("../types").QuickLabelEntry[]> => {
    const response = await api.post(`/api/datasets/${datasetId}/quick-labels/mine`, {
      labels,
    });
    return response.data;
  },

  getRecentLabels: async (
    datasetId: number,
  ): Promise<import("../types").RecentLabel[]> => {
    const response = await api.get(`/api/datasets/${datasetId}/quick-labels/recent`);
    return response.data;
  },

  deleteMyQuickLabel: async (
    datasetId: number,
    taxonId: string,
  ): Promise<void> => {
    await api.delete(`/api/datasets/${datasetId}/quick-labels/mine`, {
      params: { taxon_id: taxonId },
    });
  },

  /**
   * Dry-run a metadata CSV upload: the backend parses the file, matches rows to
   * recordings by `file_name`, and returns a preview (match counts, unmatched
   * filenames, distinct locations) WITHOUT writing anything. The user reviews
   * this before committing.
   */
  previewRecordingMetadata: async (
    datasetId: number,
    file: File,
  ): Promise<import("../types").RecordingMetadataPreview> => {
    const form = new FormData();
    form.append("file", file);
    const response = await api.post(
      `/api/datasets/${datasetId}/recordings/metadata/preview`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  },

  /**
   * Commit a metadata CSV upload: matches rows to recordings by `file_name` and
   * merges the other columns into each recording's `extra_metadata`.
   * `locationOverrides` maps an original CSV location string to the value to
   * store instead (entries absent = keep the original). Parsing/normalization/
   * merge all happen server-side.
   */
  uploadRecordingMetadata: async (
    datasetId: number,
    file: File,
    locationOverrides?: Record<string, string>,
  ): Promise<import("../types").RecordingMetadataImportResult> => {
    const form = new FormData();
    form.append("file", file);
    if (locationOverrides && Object.keys(locationOverrides).length > 0) {
      form.append("location_overrides", JSON.stringify(locationOverrides));
    }
    const response = await api.post(
      `/api/datasets/${datasetId}/recordings/metadata/import`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } },
    );
    return response.data;
  },

  /**
   * Start the "add recordings" pipeline (scan → segment → embed → finalize →
   * score) for files copied into the dataset's folder. `sourceUri` (relative
   * to DATA_ROOT) widens the dataset to a parent of its current folder; omit
   * it to rescan the current folder.
   *
   * If a job is already running for this dataset (409 `ingest_job_running`),
   * this attaches to that job instead of failing: `attached` is then true.
   * Other errors are rethrown; show them with `addRecordingsErrorMessage`.
   */
  startAddRecordings: async (
    datasetId: number,
    sourceUri?: string,
  ): Promise<{ job: import("../types").IngestJob; attached: boolean }> =>
    datasetApi._startIngest(datasetId, sourceUri ? { source_uri: sourceUri } : {}),

  /**
   * Re-embed only the recordings left with unembedded snippets (dismissed ones
   * included); no folder scan. Same job/progress/409 handling as
   * startAddRecordings, with `mode: "retry_failed"`.
   */
  retryFailedRecordings: async (
    datasetId: number,
  ): Promise<{ job: import("../types").IngestJob; attached: boolean }> =>
    datasetApi._startIngest(datasetId, { retry_failed_only: true }),

  _startIngest: async (
    datasetId: number,
    body: { source_uri?: string; retry_failed_only?: boolean },
  ): Promise<{ job: import("../types").IngestJob; attached: boolean }> => {
    try {
      const response = await api.post(`/api/datasets/${datasetId}/add-recordings`, body);
      return { job: response.data, attached: false };
    } catch (err: any) {
      const data = err?.response?.data;
      if (
        err?.response?.status === 409 &&
        data?.detail === "ingest_job_running" &&
        typeof data?.job_id === "number"
      ) {
        const job = await datasetApi.getAddRecordingsJob(datasetId, data.job_id);
        return { job, attached: true };
      }
      throw err;
    }
  },

  /** Live state of an "add recordings" job (Redis counters; cheap to poll). */
  getAddRecordingsJob: async (
    datasetId: number,
    jobId: number,
  ): Promise<import("../types").IngestJob> => {
    const response = await api.get(
      `/api/datasets/${datasetId}/add-recordings/${jobId}`,
    );
    return response.data;
  },

  /** Recordings left with unembedded snippets, current ones first (limit ≤ 500). */
  getEmbeddingFailures: async (
    datasetId: number,
    params?: { skip?: number; limit?: number; include_dismissed?: boolean },
  ): Promise<import("../types").EmbeddingFailuresPage> => {
    const response = await api.get(`/api/datasets/${datasetId}/embedding-failures`, {
      params,
    });
    return response.data;
  },

  /** "Continue without them": stop counting (and auto-retrying) current failures. */
  dismissEmbeddingFailures: async (datasetId: number): Promise<{ dismissed: number }> => {
    const response = await api.post(`/api/datasets/${datasetId}/embedding-failures/dismiss`);
    return response.data;
  },
};

const ADD_RECORDINGS_ERRORS: Record<string, string> = {
  invalid_source_uri:
    "That folder can't be used: it must exist under the data root and contain the dataset's current folder.",
  source_uri_overlaps_other_dataset:
    "That folder also contains another dataset's folder. Pick a folder closer to this dataset.",
  no_embeddings_yet:
    "This dataset has no embeddings yet. Use Generate Embeddings instead.",
  embeddings_not_ready:
    "Embeddings for this dataset didn't finish. Run Generate Embeddings again before adding recordings.",
  reference_metadata_missing:
    "The reference pool's label file (pam_metadata.csv) wasn't found in that folder.",
  no_failed_recordings: "There are no failed recordings to retry.",
  source_uri_not_allowed_with_retry:
    "A retry re-embeds the failed recordings in place; it can't change the folder.",
  ingest_job_running: "Recordings are already being added to this dataset.",
  embedding_job_running:
    "Embeddings are being generated for this dataset. Try again when that finishes.",
  retrain_job_running:
    "The model is retraining on this dataset. Try again when that finishes.",
};

/** User-facing message for a failed POST /datasets/{id}/add-recordings. */
export const addRecordingsErrorMessage = (error: any): string => {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && ADD_RECORDINGS_ERRORS[detail]) {
    return ADD_RECORDINGS_ERRORS[detail];
  }
  if (status === 403) {
    return "Only admins and the dataset's team owner can add recordings.";
  }
  if (status === 404) return "Dataset not found.";
  return getErrorMessage(error);
};

// ============================================================================
// Reference link API (admin only)
// ============================================================================

export const referenceLinkApi = {
  /** All links when called without filters. */
  list: async (params?: {
    dataset_id?: number;
    team_id?: number;
    reference_dataset_id?: number;
  }): Promise<import("../types").ReferenceLink[]> => {
    const response = await api.get("/api/reference-links/", { params });
    return response.data;
  },

  /** Idempotent: returns the existing link if the same one already exists. */
  create: async (body: {
    reference_dataset_id: number;
    dataset_id?: number;
    team_id?: number;
  }): Promise<import("../types").ReferenceLink> => {
    const response = await api.post("/api/reference-links/", body);
    return response.data;
  },

  remove: async (linkId: number): Promise<void> => {
    await api.delete(`/api/reference-links/${linkId}`);
  },
};

// ============================================================================
// Team API
// ============================================================================

export const teamApi = {
  getAllTeamDatasets: async (): Promise<Dataset[]> => {
    const response = await api.get(`/api/teams/available-datasets`);
    return response.data;
  },

  getTeamById: async (
    teamId: string | number,
  ): Promise<import("../types").Team> => {
    const response = await api.get(`/api/teams/${teamId}`);
    return response.data;
  },

  updateTeam: async (
    teamId: string | number,
    body: { name?: string; description?: string },
  ): Promise<import("../types").Team> => {
    const response = await api.patch(`/api/teams/${teamId}`, body);
    return response.data;
  },

  deleteTeam: async (teamId: string | number): Promise<void> => {
    await api.delete(`/api/teams/${teamId}`);
  },

  getTeamMembers: async (
    teamId: string | number,
  ): Promise<import("../types").TeamMember[]> => {
    const response = await api.get(`/api/teams/${teamId}/members`);
    return response.data;
  },

  removeMember: async (
    teamId: string | number,
    userId: number,
  ): Promise<void> => {
    await api.delete(`/api/teams/${teamId}/members/${userId}`);
  },

  createInvitation: async (body: any): Promise<Invitation> => {
    const response = await api.post(
      `/api/teams/${body.teamId}/invitations`,
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

// ============================================================================
// Study Logs Admin API
// ============================================================================

import type {
  StudyLogUser,
  StudyLogSession,
  StudyLogEventsPage,
} from "../types/studyLogs";

export const studyLogsApi = {
  /** All users who have study events. */
  listUsers: async (): Promise<StudyLogUser[]> => {
    const res = await api.get("/api/study-events/admin/users");
    return res.data;
  },

  /** Sessions for a given user. */
  listSessions: async (userId: number): Promise<StudyLogSession[]> => {
    const res = await api.get(`/api/study-events/admin/users/${userId}/sessions`);
    return res.data;
  },

  /** Paginated + filtered events for a session. */
  getSessionEvents: async (
    sessionId: string,
    params: { event_type?: string; phase_id?: string; limit?: number; offset?: number }
  ): Promise<StudyLogEventsPage> => {
    const res = await api.get(`/api/study-events/admin/sessions/${sessionId}/events`, {
      params,
    });
    return res.data;
  },

  /** Trigger a CSV download for all events in a session. */
  exportSessionCsv: (sessionId: string): void => {
    // Build a URL that triggers the browser's native download via an <a> click.
    // The axios instance carries the auth header — we can't use it for a file
    // download, so we read the token from localStorage and append it as a bearer
    // header via a temporary fetch + blob URL instead.
    const token = localStorage.getItem("accessToken") ?? "";
    fetch(`/api/study-events/admin/sessions/${sessionId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `study_events_${sessionId.slice(0, 8)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  },
};
