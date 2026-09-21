import { useEffect, useState } from "react";
import { isAbortError } from "../services/exploreApi";

export interface ExploreQueryState<T> {
  /** Latest successful result — kept while a newer request is in flight. */
  data: T | null;
  /** Key of the request that produced `data`. */
  dataKey: string | null;
  loading: boolean;
  /** True while the server reports it is still building a layer. */
  building: boolean;
  error: Error | null;
}

const IDLE: ExploreQueryState<never> = {
  data: null,
  dataKey: null,
  loading: false,
  building: false,
  error: null,
};

interface InternalState<T> extends ExploreQueryState<T> {
  /** Key whose request last reported progress (loading/building/error). */
  activeKey: string | null;
}

/**
 * Debounced, abortable request keyed by a string. Changing the key cancels the
 * previous request; results for stale keys are never applied. `fetcher` must
 * be memoised on the same key.
 */
export function useExploreQuery<T>(
  key: string | null,
  fetcher: (signal: AbortSignal, onBuilding: () => void) => Promise<T>,
  debounceMs = 0,
): ExploreQueryState<T> {
  const [state, setState] = useState<InternalState<T>>({ ...IDLE, activeKey: null });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState((prev) => ({ ...prev, activeKey: key, loading: true, error: null }));
      fetcher(controller.signal, () => {
        if (controller.signal.aborted) return;
        setState((prev) =>
          prev.building && prev.activeKey === key ? prev : { ...prev, activeKey: key, building: true },
        );
      })
        .then((data) => {
          if (controller.signal.aborted) return;
          setState({
            data,
            dataKey: key,
            activeKey: key,
            loading: false,
            building: false,
            error: null,
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setState((prev) => ({
            ...prev,
            activeKey: key,
            loading: false,
            building: false,
            error: error instanceof Error ? error : new Error(String(error)),
          }));
        });
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, fetcher, debounceMs]);

  if (key === null) return IDLE;
  const pendingNewKey = state.activeKey !== key && state.dataKey !== key;
  return {
    data: state.data,
    dataKey: state.dataKey,
    // Between a key change and the debounced request starting, report loading.
    loading: pendingNewKey || (state.activeKey === key && state.loading),
    building: state.activeKey === key && state.building,
    error: state.activeKey === key ? state.error : null,
  };
}
