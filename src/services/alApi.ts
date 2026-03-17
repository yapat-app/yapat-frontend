/**
 * PAM Active Learning API Service
 * Base path: /api/pam-al
 */

import api from "../axios/axiosInstance";
import type {
  PAMRunInferenceRequest,
  PAMInferenceResult,
  FeedbackPayload,
  FeedbackResponse,
  PAMRetrainRequest,
  PAMRetrainJobResponse,
  PAMCheckpoint,
} from "../types/al";

const BASE = "/api/pam-al";

export const alApi = {
  /** POST /api/pam-al/inference — run classifier, get ranked predictions */
  runInference: async (body: PAMRunInferenceRequest): Promise<PAMInferenceResult> => {
    const response = await api.post(`${BASE}/inference`, body);
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

  /** POST /api/pam-al/retrain */
  triggerRetrain: async (body: PAMRetrainRequest): Promise<PAMRetrainJobResponse> => {
    const response = await api.post(`${BASE}/retrain`, body);
    return response.data;
  },
};

