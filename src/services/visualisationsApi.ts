/**
 * Visualisations API Service
 * Base path: /api/visualisations
 */

import api from "../axios/axiosInstance";
import type { FPVRequest, FPVResponse, FPVDatasetRequest, FPVGenerateAck, FPVVisibilityRangeResponse } from "../types/visualisation";

const BASE = "/api/visualisations";

export const visualisationsApi = {
  /** POST /api/visualisations/fpv — compute and store projections */
  generateFPV: async (body: FPVRequest): Promise<FPVResponse> => {
    const response = await api.post(`${BASE}/fpv`, body);
    return response.data;
  },

  /** GET /api/visualisations/fpv — fetch stored projections */
  getFPV: async (params: FPVRequest): Promise<FPVResponse> => {
    const response = await api.get(`${BASE}/fpv`, { params });
    return response.data;
  },

  /** POST /api/visualisations/fpv-dataset — enqueue dataset-level projection
   * generation on a Celery worker. Returns as soon as the job is queued, not
   * when it's done; poll getFPVDataset() until it succeeds. */
  generateFPVDataset: async (body: FPVDatasetRequest): Promise<FPVGenerateAck> => {
    const response = await api.post(`${BASE}/fpv-dataset`, body);
    return response.data;
  },

  /** GET /api/visualisations/fpv-dataset — fetch dataset-level projections */
  getFPVDataset: async (params: FPVDatasetRequest): Promise<FPVResponse> => {
    const response = await api.get(`${BASE}/fpv-dataset`, { params });
    return response.data;
  },

  /** GET /api/visualisations/fpv_vis_range — fetch min/max/step for a visibility filter field */
  getVisRange: async (visibilityFilterValue: string): Promise<FPVVisibilityRangeResponse> => {
    const response = await api.get(`${BASE}/fpv_vis_range`, {
      params: { visibility_filter_value: visibilityFilterValue },
    });
    return response.data;
  },
};

