import { useMemo } from "react";
import { useAppSelector } from "../hooks";
import type { ExploreScope } from "../types/explore";

export interface ExploreScopeState {
  /** Null until an AL session (dataset + snippet set + inference) exists. */
  scope: ExploreScope | null;
  scopeKey: string;
  /**
   * Changes whenever an inference request resolves. A forced re-inference on
   * the same checkpoint rewrites its scores without changing the scope, so
   * consumers include this in their request keys to refetch.
   */
  revision: string;
}

/**
 * The (dataset, snippet set, checkpoint) the hub is currently showing.
 *
 * Enabled once an inference request has resolved for the session, which is
 * what guarantees predictions exist for `usedCheckpointId`. A null checkpoint
 * (dataset without a trained model) is a valid, score-less scope.
 */
export function useExploreScope(): ExploreScopeState {
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const snippetSetId = useAppSelector((s) => s.al.snippetSetId);
  const usedCheckpointId = useAppSelector((s) => s.al.usedCheckpointId);
  const feedSource = useAppSelector((s) => s.al.feedSource);
  const lastInferenceAt = useAppSelector((s) => s.al.lastInferenceAt);

  return useMemo(() => {
    const ready =
      selectedDatasetId !== null &&
      snippetSetId !== null &&
      feedSource !== "classic" &&
      lastInferenceAt !== null;
    if (!ready) return { scope: null, scopeKey: "none", revision: "" };
    const scope: ExploreScope = {
      dataset_id: Number(selectedDatasetId),
      snippet_set_id: Number(snippetSetId),
      checkpoint_id: usedCheckpointId ?? null,
      // The backend resolves the embedding model from the snippet set.
      embedding_model_id: null,
    };
    return { scope, scopeKey: JSON.stringify(scope), revision: lastInferenceAt ?? "" };
  }, [selectedDatasetId, snippetSetId, usedCheckpointId, feedSource, lastInferenceAt]);
}
