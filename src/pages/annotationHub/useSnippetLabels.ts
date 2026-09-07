import { useEffect, useMemo, useState } from "react";
import { alApi } from "../../services/alApi";

export type LabelsBySnippet = Record<number, string[]>;

/**
 * Shared, cached access to per-snippet ground-truth / user labels
 * (GET /api/pam-al/snippet-labels — backed by al_snippet_annotation).
 *
 * Whole-dataset payload, so it is cached per (dataset, snippet set, refreshKey)
 * and shared by every caller instead of each one fetching its own copy.
 * `refreshKey` is how callers opt into freshness: pass a value derived from the
 * user's annotations and the map refetches when they label something.
 *
 * NOTE: PredictionFeed and useLabeledPool deliberately still own their own
 * fetches — both blend in classic-feed annotations with their own lifecycles,
 * so folding them in here would change behaviour rather than just dedupe it.
 */

const EMPTY_LABELS: LabelsBySnippet = {};

type CacheEntry = { key: string; promise: Promise<LabelsBySnippet> };
/** One entry per (dataset, snippet set) — a new refreshKey replaces it. */
const cache = new Map<string, CacheEntry>();

function scopeKey(datasetId: number, snippetSetId: number | null): string {
  return `${datasetId}:${snippetSetId ?? "any"}`;
}

export function invalidateSnippetLabels(): void {
  cache.clear();
}

function fetchSnippetLabels(
  datasetId: number,
  snippetSetId: number | null,
  refreshKey: string,
): Promise<LabelsBySnippet> {
  const scope = scopeKey(datasetId, snippetSetId);
  const existing = cache.get(scope);
  if (existing && existing.key === refreshKey) return existing.promise;

  const promise = alApi
    .getSnippetLabels(datasetId, snippetSetId ?? undefined)
    .then((res) => {
      const map: LabelsBySnippet = {};
      for (const item of res.items ?? []) {
        if (item.labels?.length) map[item.snippet_id] = item.labels;
      }
      return map;
    });

  cache.set(scope, { key: refreshKey, promise });
  // Drop a failed entry so the next caller genuinely retries instead of
  // inheriting the same rejection forever.
  promise.catch(() => {
    const current = cache.get(scope);
    if (current && current.key === refreshKey) cache.delete(scope);
  });
  return promise;
}

export function useSnippetLabels(
  datasetId: number | null,
  snippetSetId: number | null,
  /** Skip the fetch entirely when the caller doesn't need labels yet. */
  enabled: boolean,
  /** Changing this refetches — pass something derived from the annotations. */
  refreshKey = "",
): { labelsBySnippet: LabelsBySnippet; loading: boolean } {
  const [labelsBySnippet, setLabelsBySnippet] =
    useState<LabelsBySnippet>(EMPTY_LABELS);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);

  const wantKey =
    enabled && datasetId !== null
      ? `${scopeKey(datasetId, snippetSetId)}|${refreshKey}`
      : null;
  const loading = wantKey !== null && wantKey !== resolvedKey;

  useEffect(() => {
    if (!enabled || datasetId === null) return;
    let cancelled = false;
    fetchSnippetLabels(datasetId, snippetSetId, refreshKey)
      .then((map) => {
        if (cancelled) return;
        setLabelsBySnippet(map);
        setResolvedKey(`${scopeKey(datasetId, snippetSetId)}|${refreshKey}`);
      })
      .catch(() => {
        if (!cancelled) setLabelsBySnippet(EMPTY_LABELS);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, datasetId, snippetSetId, refreshKey]);

  return useMemo(
    () => ({ labelsBySnippet, loading }),
    [labelsBySnippet, loading],
  );
}
