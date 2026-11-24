/**
 * /api/label-sharing: the optional review of labels shared between the
 * snippet sets of a dataset (see types/labelSharing.ts).
 */
import api from "../axios/axiosInstance";
import type {
  LabelShareCandidateList,
  LabelShareReason,
  LabelShareReviewResult,
  LabelShareStatus,
  LabelShareSummary,
  SnippetBreakdown,
} from "../types/labelSharing";

const BASE = "/api/label-sharing";

export interface CandidateQuery {
  status?: LabelShareStatus;
  embedding_model_id?: number;
  snippet_set_id?: number;
  reason?: LabelShareReason;
  taxon_id?: string;
  skip?: number;
  /** Backend cap: 500. */
  limit?: number;
}

export const labelSharingApi = {
  getSummary: async (datasetId: number): Promise<LabelShareSummary> => {
    const response = await api.get(`${BASE}/datasets/${datasetId}/summary`);
    return response.data;
  },

  getSnippetBreakdown: async (datasetId: number): Promise<SnippetBreakdown> => {
    const response = await api.get(
      `${BASE}/datasets/${datasetId}/snippet-breakdown`,
    );
    return response.data;
  },

  listCandidates: async (
    datasetId: number,
    query: CandidateQuery = {},
    signal?: AbortSignal,
  ): Promise<LabelShareCandidateList> => {
    const response = await api.get(`${BASE}/datasets/${datasetId}/candidates`, {
      params: query,
      signal,
    });
    return response.data;
  },

  accept: async (
    candidateId: number,
    embeddingModelId: number | null,
  ): Promise<LabelShareReviewResult> => {
    const response = await api.post(
      `${BASE}/candidates/${candidateId}/accept`,
      {
        ...(embeddingModelId !== null
          ? { embedding_model_id: embeddingModelId }
          : {}),
      },
    );
    return response.data;
  },

  reject: async (candidateId: number): Promise<LabelShareReviewResult> => {
    const response = await api.post(`${BASE}/candidates/${candidateId}/reject`);
    return response.data;
  },

  relabel: async (
    candidateId: number,
    body: { taxon_id: string; display_name?: string },
    embeddingModelId: number | null,
  ): Promise<LabelShareReviewResult> => {
    const response = await api.post(
      `${BASE}/candidates/${candidateId}/relabel`,
      {
        ...body,
        ...(embeddingModelId !== null
          ? { embedding_model_id: embeddingModelId }
          : {}),
      },
    );
    return response.data;
  },

  /**
   * Admins and team owners only. Starts sharing in the background (202) and
   * returns the Celery task id. With `transfer`, only the labels on one
   * model's clips go onto the other model's clips; without, every way.
   */
  shareDataset: async (
    datasetId: number,
    transfer?: { fromEmbeddingModelId: number; toEmbeddingModelId: number },
  ): Promise<{ task_id: string | null }> => {
    const res = await api.post(
      `${BASE}/datasets/${datasetId}/share`,
      transfer
        ? {
            from_embedding_model_id: transfer.fromEmbeddingModelId,
            to_embedding_model_id: transfer.toEmbeddingModelId,
          }
        : undefined,
    );
    return res.data;
  },
};
