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
  PAMRetrainJobDispatch,
  PAMRetrainJobStatus,
  PAMCheckpoint,
} from "../types/al";

const BASE = "/api/pam-al";

export const alApi = {
  /** POST /api/pam-al/inference/get-or-create — run classifier or return cached predictions */
  runInference: async (body: PAMRunInferenceRequest): Promise<PAMInferenceResult> => {
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

  /** POST /api/pam-al/retrain/manual — dispatch manual retrain job */
  triggerRetrain: async (body: PAMRetrainRequest): Promise<PAMRetrainJobDispatch> => {
    const response = await api.post(`${BASE}/retrain/manual`, body);
    return response.data;
  },

  /** GET /api/pam-al/retrain/jobs/{job_id} — poll job status */
  getRetrainJob: async (jobId: number): Promise<PAMRetrainJobStatus> => {
    const response = await api.get(`${BASE}/retrain/jobs/${jobId}`);
    return response.data;
  },
};

