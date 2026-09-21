import { useCallback } from "react";
import { exploreApi } from "../services/exploreApi";
import type { ExploreFacets, ExploreFilters, ExploreScope, ExploreSummary } from "../types/explore";
import { useExploreQuery, type ExploreQueryState } from "./useExploreQuery";

/** Histogram bar count — must match HistogramSlider's default. */
export const EXPLORE_HISTOGRAM_BINS = 28;

/**
 * Counts, score domains and histogram bins for the current filters.
 * `refreshKey` forces a refetch (e.g. after the user labels a snippet).
 */
export function useExploreSummary(
  scope: ExploreScope | null,
  filters: ExploreFilters,
  refreshKey = "",
  enabled = true,
): ExploreQueryState<ExploreSummary> {
  const key =
    scope && enabled
      ? JSON.stringify({ scope, filters, bins: EXPLORE_HISTOGRAM_BINS, refreshKey })
      : null;
  const fetcher = useCallback(
    (signal: AbortSignal, onBuilding: () => void) =>
      exploreApi.summary(scope as ExploreScope, filters, EXPLORE_HISTOGRAM_BINS, {
        signal,
        onBuilding,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useExploreQuery(key, fetcher, 120);
}

/** Filter options (locations, annotated species, date/time histograms). */
export function useExploreFacets(
  scope: ExploreScope | null,
  refreshKey = "",
  enabled = true,
): ExploreQueryState<ExploreFacets> {
  const key = scope && enabled ? JSON.stringify({ scope, refreshKey }) : null;
  const fetcher = useCallback(
    (signal: AbortSignal, onBuilding: () => void) =>
      exploreApi.facets(scope as ExploreScope, { signal, onBuilding }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useExploreQuery(key, fetcher, 0);
}
