import { useMemo } from "react";
import { useAppSelector } from "../hooks";
import type { ExploreScope } from "../types/explore";
import { useDatasetDataEpoch } from "./datasetRefresh";

export interface ExploreScopeState {
  /** Null until an AL session (dataset + snippet set + inference) exists. */
  scope: ExploreScope | null;
  scopeKey: string;
  /**
   * Changes whenever an inference request resolves. A forced re-inference on
   * the same checkpoint rewrites its scores without changing the scope, so
   * consumers include this in their request keys to refetch. It also changes
   * when the dataset's snippets change (recordings added; see datasetRefresh.ts).
   */
  revision: string;
}

/**
 * The (dataset, snippet set, embedding model, checkpoint) the hub is showing.
 *
 * Enabled once an inference request has resolved for the session, which is
 * what guarantees predictions exist for `usedCheckpointId`. A null checkpoint
 * (dataset without a trained model) is a valid, score-less scope.
 */
export function useExploreScope(): ExploreScopeState {
  const selectedDatasetId = useAppSelector((s) => s.al.selectedDatasetId);
  const snippetSetId = useAppSelector((s) => s.al.snippetSetId);
  const usedCheckpointId = useAppSelector((s) => s.al.usedCheckpointId);
  const embeddingModelId = useAppSelector((s) => s.al.embeddingModelId);
  const embeddingOptionsDatasetId = useAppSelector((s) => s.al.embeddingOptionsDatasetId);
  const feedSource = useAppSelector((s) => s.al.feedSource);
  const lastInferenceAt = useAppSelector((s) => s.al.lastInferenceAt);
  const dataEpoch = useDatasetDataEpoch(
    selectedDatasetId !== null ? Number(selectedDatasetId) : null,
  );

  return useMemo(() => {
    const ready =
      selectedDatasetId !== null &&
      snippetSetId !== null &&
      feedSource !== "classic" &&
      lastInferenceAt !== null &&
      // Wait for the selected model: it may not be the one saved with this session.
      embeddingOptionsDatasetId === Number(selectedDatasetId);
    if (!ready) return { scope: null, scopeKey: "none", revision: "" };
    const scope: ExploreScope = {
      dataset_id: Number(selectedDatasetId),
      snippet_set_id: Number(snippetSetId),
      checkpoint_id: usedCheckpointId ?? null,
      embedding_model_id: embeddingModelId,
    };
    // Unchanged from before while nothing was added (epoch 0).
    const revision = (lastInferenceAt ?? "") + (dataEpoch ? `|data${dataEpoch}` : "");
    return { scope, scopeKey: JSON.stringify(scope), revision };
  }, [
    selectedDatasetId,
    snippetSetId,
    usedCheckpointId,
    embeddingModelId,
    embeddingOptionsDatasetId,
    feedSource,
    lastInferenceAt,
    dataEpoch,
  ]);
}
