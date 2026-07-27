import { useEffect, useMemo, useState } from "react";
import { alApi } from "../../../services/alApi";
import type { Annotation } from "../../../types";
import type { FeedbackResponse } from "../../../types/al";
import { annotationDisplayLabel } from "../../../utils/classicFeedSync";

export function useLabeledPool(opts: {
  selectedDatasetId: number | null;
  snippetSetId: number | null;
  showLabeledPool: boolean;
  isClassicFeed: boolean;
  feedbacks: Record<number, FeedbackResponse>;
  classicAnnotationsBySnippet: Record<number, Annotation[]>;
  lastRetrainJob: unknown;
  feedbackCount: number;
}): {
  labeledSnippetIds: Set<number>;
  labelsBySnippet: Record<number, string[]>;
} {
  const {
    selectedDatasetId,
    snippetSetId,
    showLabeledPool,
    isClassicFeed,
    feedbacks,
    classicAnnotationsBySnippet,
    lastRetrainJob,
    feedbackCount,
  } = opts;

  const [labeledSnippetIds, setLabeledSnippetIds] = useState<Set<number>>(
    new Set(),
  );
  const [labelsBySnippet, setLabelsBySnippet] = useState<
    Record<number, string[]>
  >({});

  // Content signature of the classic annotations, but ONLY for classic feeds.
  // For AL-like feeds (e.g. Phase 5) the whole-dataset labeled-snippets /
  // snippet-labels endpoints don't depend on classic annotations at all — yet
  // the effects below used to list the raw `classicAnnotationsBySnippet` object
  // in their deps. That object gets a fresh identity every time the feed
  // hydrates a snippet's contributors on scroll/click, which re-fired both
  // large whole-dataset fetches on every snippet. Gating on `isClassicFeed`
  // means non-classic feeds see a constant "" here and never refetch on scroll;
  // classic feeds still refetch when the annotation *content* actually changes.
  const classicSignature = useMemo(() => {
    if (!isClassicFeed) return "";
    const parts: string[] = [];
    for (const [snippetId, annotations] of Object.entries(
      classicAnnotationsBySnippet,
    )) {
      if (annotations.length > 0)
        parts.push(`${snippetId}:${annotations.length}`);
    }
    return parts.sort().join("|");
  }, [isClassicFeed, classicAnnotationsBySnippet]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabeledPool() {
      if (!selectedDatasetId || !showLabeledPool) {
        if (!cancelled) setLabeledSnippetIds(new Set());
        return;
      }
      try {
        if (isClassicFeed) {
          const ids = Object.entries(classicAnnotationsBySnippet)
            .filter(([, annotations]) => annotations.length > 0)
            .map(([snippetId]) => Number(snippetId));
          if (!cancelled) setLabeledSnippetIds(new Set(ids));
          return;
        }
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
    // classicAnnotationsBySnippet is read via `classicSignature` on purpose —
    // depending on the raw object refetched on every scroll-driven hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedDatasetId,
    snippetSetId,
    showLabeledPool,
    isClassicFeed,
    classicSignature,
    lastRetrainJob,
    feedbackCount,
  ]);

  useEffect(() => {
    let cancelled = false;
    async function loadLabels() {
      if (isClassicFeed) {
        const map: Record<number, string[]> = {};
        for (const [snippetId, annotations] of Object.entries(
          classicAnnotationsBySnippet,
        )) {
          const labels = annotations
            .map(annotationDisplayLabel)
            .filter((label): label is string => Boolean(label));
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
        const r = await alApi.getSnippetLabels(
          selectedDatasetId,
          snippetSetId ?? undefined,
        );
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
    // Only classicAnnotationsBySnippet is dropped from the deps (read via
    // `classicSignature`) — it's the object that churns on every scroll-driven
    // hydration and caused the whole-dataset snippet-labels refetch storm.
    // `feedbacks` is kept: for non-classic feeds it changes only when the user
    // labels (never on scroll), so the label map still refreshes on a label —
    // exactly as before — without refetching on scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isClassicFeed,
    feedbacks,
    classicSignature,
    selectedDatasetId,
    snippetSetId,
  ]);

  return { labeledSnippetIds, labelsBySnippet };
}
