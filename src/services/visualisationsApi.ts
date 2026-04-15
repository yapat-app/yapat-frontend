/**
 * Visualisations API Service
 * Base path: /api/visualisations
 */

import api from "../axios/axiosInstance";
import type { FPVRequest, FPVResponse, FPVDatasetRequest } from "../types/visualisation";

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

  /** POST /api/visualisations/fpv-dataset — compute and store dataset-level projections */
  generateFPVDataset: async (body: FPVDatasetRequest): Promise<FPVResponse> => {
    const response = await api.post(`${BASE}/fpv-dataset`, body);
    return response.data;
  },

  /** GET /api/visualisations/fpv-dataset — fetch dataset-level projections */
  getFPVDataset: async (params: FPVDatasetRequest): Promise<FPVResponse> => {
    const response = await api.get(`${BASE}/fpv-dataset`, { params });
    return response.data;
  },
};

