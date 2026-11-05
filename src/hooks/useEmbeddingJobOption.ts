import type { EmbeddingOption } from "../types";
import { useEmbeddingOptions } from "./useEmbeddingOptions";

/** The model an embedding job runs, or null until the dataset's options load. */
export function useEmbeddingJobOption(
  datasetId: number | undefined,
  jobId: number | undefined,
): EmbeddingOption | null {
  const options = useEmbeddingOptions(jobId == null ? undefined : datasetId, jobId);
  return options.find((o) => o.embedding_job_id === jobId) ?? null;
}
