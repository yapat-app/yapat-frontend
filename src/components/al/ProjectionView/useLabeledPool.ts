import { useEffect, useState } from "react";
import { alApi } from "../../../services/alApi";
import type { FeedbackResponse } from "../../../types/al";

export function useLabeledPool(opts: {
  selectedDatasetId: number | null;
  snippetSetId: number | null;
  showLabeledPool: boolean;
  isClassicFeed: boolean;
  feedbacks: Record<number, FeedbackResponse>;
  lastRetrainJob: unknown;
  feedbackCount: number;
}): { labeledSnippetIds: Set<number>; labelsBySnippet: Record<number, string[]> } {
  const {
    selectedDatasetId,
    snippetSetId,
    showLabeledPool,
    isClassicFeed,
    feedbacks,
    lastRetrainJob,
    feedbackCount,
  } = opts;

  const [labeledSnippetIds, setLabeledSnippetIds] = useState<Set<number>>(new Set());
  const [labelsBySnippet, setLabelsBySnippet] = useState<Record<number, string[]>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadLabeledPool() {
      if (!selectedDatasetId || !showLabeledPool) {
        if (!cancelled) setLabeledSnippetIds(new Set());
        return;
      }
      try {
        const r = await alApi.getLabeledSnippets(
          selectedDatasetId,
          snippetSetId ?? undefined,
          "any",
        );
        if (!cancelled) setLabeledSnippetIds(new Set(r.snippet_ids));
      } catch {
        if (!cancelled) setLabeledSnippetIds(new Set());
      }
    }
    loadLabeledPool();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDatasetId, snippetSetId, showLabeledPool, lastRetrainJob, feedbackCount]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabels() {
      if (isClassicFeed) {
        const map: Record<number, string[]> = {};
        for (const [snippetId, fb] of Object.entries(feedbacks)) {
          const labels = fb.final_labels ?? [];
          if (labels.length > 0) map[Number(snippetId)] = labels;
        }
        if (!cancelled) setLabelsBySnippet(map);
        return;
      }
      if (!selectedDatasetId) {
        if (!cancelled) setLabelsBySnippet({});
        return;
      }
      try {
        const r = await alApi.getSnippetLabels(selectedDatasetId, snippetSetId ?? undefined);
        if (!cancelled) {
          const map: Record<number, string[]> = {};
          for (const it of r.items) map[it.snippet_id] = it.labels;
          setLabelsBySnippet(map);
        }
      } catch {
        if (!cancelled) setLabelsBySnippet({});
      }
    }
    loadLabels();
    return () => {
      cancelled = true;
    };
  }, [isClassicFeed, feedbacks, selectedDatasetId, snippetSetId]);

  return { labeledSnippetIds, labelsBySnippet };
}
