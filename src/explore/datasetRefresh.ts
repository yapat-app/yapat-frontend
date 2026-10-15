import { useSyncExternalStore } from "react";

/**
 * "This dataset's snippets/recordings changed" signal, e.g. after an
 * add-recordings job completes. The backend has already republished the
 * explore layers, so a normal refetch is enough (no force_inference).
 *
 * `notifyDatasetDataChanged` runs the invalidators that client caches
 * outliving a page registered here (projection points, recording metadata
 * scan), bumps a per-dataset epoch that `useExploreScope` folds into
 * `revision` (so an open hub refetches feed, summary, facets and projection in
 * place), and tells other tabs, so a hub open in another tab refreshes too.
 *
 * Leaf module on purpose: caches import it to register, it imports none of them.
 */

const CHANNEL_NAME = "yapat:dataset-data-changed";

const epochs = new Map<number, number>();
const listeners = new Set<() => void>();
const invalidators = new Set<(datasetId: number) => void>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;

function applyChange(datasetId: number) {
  for (const invalidate of invalidators) invalidate(datasetId);
  epochs.set(datasetId, (epochs.get(datasetId) ?? 0) + 1);
  for (const l of listeners) l();
}

channel?.addEventListener("message", (e: MessageEvent) => {
  const datasetId = Number((e.data as { datasetId?: unknown })?.datasetId);
  if (Number.isFinite(datasetId)) applyChange(datasetId);
});

export function notifyDatasetDataChanged(datasetId: number): void {
  applyChange(datasetId);
  channel?.postMessage({ datasetId });
}

/** Register a module-level cache to be cleared when a dataset's data changes. */
export function onDatasetDataChanged(invalidate: (datasetId: number) => void): void {
  invalidators.add(invalidate);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 0 until the dataset's data changes in this session; then increments. */
export function useDatasetDataEpoch(datasetId: number | null): number {
  return useSyncExternalStore(subscribe, () =>
    datasetId == null ? 0 : (epochs.get(datasetId) ?? 0),
  );
}
