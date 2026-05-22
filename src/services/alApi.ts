/**
 * PAM Active Learning API Service
 * Base path: /api/pam-al
 */

import api from "../axios/axiosInstance";
import type {
  PAMRunInferenceRequest,
  PAMInferenceResult,
  PAMInferenceResponse,
  FeedbackPayload,
  FeedbackResponse,
  PAMRetrainRequest,
  PAMTrainFromScratchRequest,
  PAMRetrainJobDispatch,
  PAMRetrainJobStatus,
  PAMCheckpoint,
  ALLabeledSnippetsResponse,
  ALSnippetLabelsResponse,
  PAMFeedbackCountResponse,
} from "../types/al";

const BASE = "/api/pam-al";

// In-memory cache to avoid spamming `/species-default` across component remounts.
// Particularly important when the endpoint returns 404 in some deployments.
let defaultSpeciesCache:
  | {
      status: "pending";
      promise: Promise<string[]>;
    }
  | {
      status: "ready";
      value: string[];
    }
  | {
      status: "not_found";
      value: string[];
    }
  | null = null;

// Cache checkpoint species lists by checkpoint id.
const checkpointSpeciesCache = new Map<
  number,
  | { status: "pending"; promise: Promise<string[]> }
  | { status: "ready"; value: string[] }
  | { status: "not_found"; value: string[] }
>();

export const alApi = {
  /** POST /api/pam-al/inference/get-or-create — run classifier or return cached predictions */
  runInference: async (body: PAMRunInferenceRequest): Promise<PAMInferenceResponse> => {
    const response = await api.post(`${BASE}/inference/get-or-create`, body);
    return response.data;
  },

  /** GET /api/pam-al/checkpoints?dataset_id=N — list registered checkpoints */
  getCheckpoints: async (datasetId?: number): Promise<PAMCheckpoint[]> => {
    const response = await api.get(`${BASE}/checkpoints`, {
      params: datasetId !== undefined ? { dataset_id: datasetId } : undefined,
    });
    return response.data;
  },

  /** POST /api/pam-al/feedback */
  postFeedback: async (payload: FeedbackPayload): Promise<FeedbackResponse> => {
    const response = await api.post(`${BASE}/feedback`, payload);
    return response.data;
  },

  /** GET /api/pam-al/feedback-count — counter for auto-retrain gating */
  getFeedbackCount: async (datasetId: number, modelFamilyName: string): Promise<PAMFeedbackCountResponse> => {
    const response = await api.get(`${BASE}/feedback-count`, {
      params: { dataset_id: datasetId, model_family_name: modelFamilyName },
    });
    return response.data;
  },

  /** POST /api/pam-al/retrain/manual — dispatch manual retrain job */
  triggerRetrain: async (body: PAMRetrainRequest): Promise<PAMRetrainJobDispatch> => {
    const response = await api.post(`${BASE}/retrain/manual`, body);
    return response.data;
  },

  /** POST /api/pam-al/train-from-scratch — dispatch cold-start training job */
  trainFromScratch: async (body: PAMTrainFromScratchRequest): Promise<PAMRetrainJobDispatch> => {
    const response = await api.post(`${BASE}/train-from-scratch`, body);
    return response.data;
  },

  /** GET /api/pam-al/retrain/jobs/{job_id} — poll job status */
  getRetrainJob: async (jobId: number): Promise<PAMRetrainJobStatus> => {
    const response = await api.get(`${BASE}/retrain/jobs/${jobId}`);
    return response.data;
  },

  /** GET /api/pam-al/labeled-snippets — snippet IDs with at least one annotation */
  getLabeledSnippets: async (
    datasetId: number,
    snippetSetId?: number,
    scope: "any" | "user" = "any",
  ): Promise<ALLabeledSnippetsResponse> => {
    const response = await api.get(`${BASE}/labeled-snippets`, {
      params: {
        dataset_id: datasetId,
        scope,
        ...(snippetSetId !== undefined ? { snippet_set_id: snippetSetId } : {}),
      },
    });
    return response.data;
  },

  /** GET /api/pam-al/snippet-labels — per-snippet ground-truth / user labels */
  getSnippetLabels: async (
    datasetId: number,
    snippetSetId?: number,
  ): Promise<ALSnippetLabelsResponse> => {
    const response = await api.get(`${BASE}/snippet-labels`, {
      params: {
        dataset_id: datasetId,
        ...(snippetSetId !== undefined ? { snippet_set_id: snippetSetId } : {}),
      },
    });
    return response.data;
  },

  /** GET /api/pam-al/checkpoints/{checkpoint_id}/species — species list for a checkpoint */
  getCheckpointSpecies: async (checkpointId: number): Promise<string[]> => {
    const cached = checkpointSpeciesCache.get(checkpointId);
    if (cached?.status === "ready") return cached.value;
    if (cached?.status === "not_found") return cached.value;
    if (cached?.status === "pending") return cached.promise;

    const promise = api
      .get(`${BASE}/checkpoints/${checkpointId}/species`)
      .then((response) => {
        const value = Array.isArray(response.data) ? response.data : [];
        checkpointSpeciesCache.set(checkpointId, { status: "ready", value });
        return value;
      })
      .catch((error: any) => {
        const status = error?.response?.status;
        if (status === 404) {
          checkpointSpeciesCache.set(checkpointId, { status: "not_found", value: [] });
          return [];
        }
        checkpointSpeciesCache.delete(checkpointId);
        throw error;
      });

    checkpointSpeciesCache.set(checkpointId, { status: "pending", promise });
    return promise;
  },

  /** GET /api/pam-al/species-default — fallback species list from default PAM label config */
  getDefaultSpecies: async (): Promise<string[]> => {
    // If we already got a value (or confirmed 404), never hit the network again.
    if (defaultSpeciesCache?.status === "ready") return defaultSpeciesCache.value;
    if (defaultSpeciesCache?.status === "not_found") return defaultSpeciesCache.value;
    if (defaultSpeciesCache?.status === "pending") return defaultSpeciesCache.promise;

    const promise = api
      .get(`${BASE}/species-default`)
      .then((response) => {
        const value = Array.isArray(response.data) ? response.data : [];
        defaultSpeciesCache = { status: "ready", value };
        return value;
      })
      .catch((error: any) => {
        const status = error?.response?.status;
        // Deployment may not expose this route; treat 404 as "no PAM list" and stop retrying.
        if (status === 404) {
          defaultSpeciesCache = { status: "not_found", value: [] };
          return [];
        }
        // Allow other errors (network, auth, 5xx) to surface to callers.
        defaultSpeciesCache = null;
        throw error;
      });

    defaultSpeciesCache = { status: "pending", promise };
    return promise;
  },
};

