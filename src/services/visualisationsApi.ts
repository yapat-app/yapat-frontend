/**
 * Visualisations API Service
 * Base path: /api/visualisations
 */

import api from "../axios/axiosInstance";
import type { FPVRequest, FPVResponse } from "../types/visualisation";

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
};

