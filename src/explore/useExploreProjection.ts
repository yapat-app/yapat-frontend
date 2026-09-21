/**
 * Projection data from the explore API.
 *
 * Points (coordinates) are static per projection version, so they are cached
 * per method for the page's lifetime and only refetched when the server
 * reports a new projection version. Visibility/labels are filter-dependent
 * and fetched separately as a compact bitmask aligned with those points.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { exploreApi, isAbortError } from "../services/exploreApi";
import type {
  ExploreFilters,
  ExploreProjectionMethod,
  ExploreProjectionPoints,
  ExploreProjectionState,
  ExploreScope,
  ExploreViewport,
} from "../types/explore";
import { useExploreQuery, type ExploreQueryState } from "./useExploreQuery";

interface PointsEntry {
  promise: Promise<ExploreProjectionPoints>;
  data?: ExploreProjectionPoints;
}

const pointsCache = new Map<string, PointsEntry>();
const MAX_POINTS_ENTRIES = 12;

function pointsKey(scope: ExploreScope, method: ExploreProjectionMethod): string {
  return `${scope.dataset_id}:${scope.snippet_set_id}:${method}`;
}

function loadPoints(
  scope: ExploreScope,
  method: ExploreProjectionMethod,
  onBuilding?: () => void,
): Promise<ExploreProjectionPoints> {
  const key = pointsKey(scope, method);
  const existing = pointsCache.get(key);
  if (existing) return existing.promise;
  const entry: PointsEntry = {
    promise: exploreApi
      .projection(
        // Points don't depend on the checkpoint — share them across retrains.
        { ...scope, checkpoint_id: null },
        method,
        { onBuilding },
      )
      .then((data) => {
        entry.data = data;
        return data;
      }),
  };
  entry.promise.catch(() => {
    if (pointsCache.get(key) === entry) pointsCache.delete(key);
  });
  pointsCache.set(key, entry);
  while (pointsCache.size > MAX_POINTS_ENTRIES) {
    pointsCache.delete(pointsCache.keys().next().value as string);
  }
  return entry.promise;
}

/** Drop cached points (e.g. after the user regenerates projections). */
export function invalidateExplorePoints(scope?: ExploreScope | null): void {
  if (!scope) {
    pointsCache.clear();
    return;
  }
  for (const key of [...pointsCache.keys()]) {
    if (key.startsWith(`${scope.dataset_id}:${scope.snippet_set_id}:`)) pointsCache.delete(key);
  }
}

export interface ProjectionPointsState {
  points: ExploreProjectionPoints | null;
  loading: boolean;
  building: boolean;
  error: Error | null;
  reload: () => void;
}

export function useExploreProjectionPoints(
  scope: ExploreScope | null,
  method: ExploreProjectionMethod,
  enabled: boolean,
): ProjectionPointsState {
  const key = scope && enabled ? pointsKey(scope, method) : null;
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{
    key: string | null;
    points: ExploreProjectionPoints | null;
    building: boolean;
    error: Error | null;
  }>({ key: null, points: null, building: false, error: null });

  useEffect(() => {
    if (!key || !scope) return;
    let cancelled = false;
    const cached = pointsCache.get(key)?.data;
    if (cached) {
      setState({ key, points: cached, building: false, error: null });
      return;
    }
    loadPoints(scope, method, () => {
      if (!cancelled) setState((prev) => ({ ...prev, key, building: true }));
    })
      .then((points) => {
        if (!cancelled) setState({ key, points, building: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled || isAbortError(error)) return;
        setState({
          key,
          points: null,
          building: false,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });
    return () => {
      cancelled = true;
    };
    // scope is captured through `key`; nonce forces a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, method, nonce]);

  const reload = useCallback(() => {
    if (scope) invalidateExplorePoints(scope);
    setNonce((n) => n + 1);
  }, [scope]);

  const current = state.key === key ? state : null;
  const points = current?.points ?? null;
  const loading = key !== null && !current?.points && !current?.error;
  const building = current?.building ?? false;
  const error = current?.error ?? null;
  // Stable identity: consumers put this object in effect/memo dependencies.
  return useMemo(
    () => ({ points, loading, building, error, reload }),
    [points, loading, building, error, reload],
  );
}

export function useExploreProjectionState(opts: {
  scope: ExploreScope | null;
  filters: ExploreFilters;
  method: ExploreProjectionMethod;
  pinnedIds: number[];
  enabled: boolean;
  refreshKey: string;
}): ExploreQueryState<ExploreProjectionState> {
  const { scope, filters, method, pinnedIds, enabled, refreshKey } = opts;
  const key =
    scope && enabled
      ? JSON.stringify({ scope, filters, method, pinnedIds, refreshKey })
      : null;
  const fetcher = useCallback(
    (signal: AbortSignal, onBuilding: () => void) =>
      exploreApi.projectionState(
        {
          scope: scope as ExploreScope,
          filters,
          method,
          pinned_ids: pinnedIds.slice(0, 2000),
          include_density: true,
        },
        { signal, onBuilding },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useExploreQuery(key, fetcher, 150);
}

export const VIEWPORT_MAX_POINTS = 60_000;

export function useExploreViewport(opts: {
  scope: ExploreScope | null;
  filters: ExploreFilters;
  method: ExploreProjectionMethod;
  bbox: [number, number, number, number] | null;
  enabled: boolean;
  refreshKey: string;
}): ExploreQueryState<ExploreViewport> {
  const { scope, filters, method, bbox, enabled, refreshKey } = opts;
  const roundedBox = useMemo(
    () => (bbox ? (bbox.map((v) => Number(v.toPrecision(6))) as [number, number, number, number]) : null),
    [bbox],
  );
  const key =
    scope && enabled && roundedBox
      ? JSON.stringify({ scope, filters, method, roundedBox, refreshKey })
      : null;
  const fetcher = useCallback(
    (signal: AbortSignal, onBuilding: () => void) =>
      exploreApi.viewport(
        {
          scope: scope as ExploreScope,
          filters,
          method,
          bbox: roundedBox as [number, number, number, number],
          max_points: VIEWPORT_MAX_POINTS,
        },
        { signal, onBuilding },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  return useExploreQuery(key, fetcher, 250);
}
