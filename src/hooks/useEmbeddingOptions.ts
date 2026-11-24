import { useEffect, useState } from "react";
import { embeddingApi } from "../services/api";
import type { EmbeddingOption } from "../types";

/**
 * The dataset's embedding jobs, one row per job; empty until they load. Loads
 * again when `refreshKey` changes, e.g. when a job starts or finishes.
 */
export function useEmbeddingOptions(
  datasetId: number | undefined,
  refreshKey?: unknown,
): EmbeddingOption[] {
  const [options, setOptions] = useState<EmbeddingOption[]>([]);

  useEffect(() => {
    if (datasetId == null || !Number.isFinite(datasetId)) return;
    let cancelled = false;
    embeddingApi
      .options(datasetId)
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, refreshKey]);

  return options;
}
