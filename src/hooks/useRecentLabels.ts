/**
 * Labels the current user applied most recently on the selected dataset, for
 * the "Recent" row above the quick-label chips.
 *
 * The server derives the list from the user's latest annotations (see
 * RECENT_LABELS_WINDOW in the backend config). Between loads, `touch` keeps
 * the row current locally: the annotation save already records the label, so
 * there is nothing extra to send.
 *
 * Same module-level store pattern as usePersonalQuickLabels: PredictionFeed
 * mounts one LabelSelector per card, and they must share one fetch and see
 * each other's clicks.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAppSelector } from "../hooks";
import { datasetApi } from "../services/api";

// Upper bound for the locally maintained list. Matches the backend's default
// window: N annotations can never yield more than N distinct labels.
const MAX_RECENT_LABELS = 10;

interface StoreState {
  datasetId: number | null;
  labels: string[];
}

let state: StoreState = { datasetId: null, labels: [] };
const listeners = new Set<() => void>();

// Bumped on every dataset switch so a slow response for the previous dataset
// cannot land on top of the current one.
let loadToken = 0;

function setState(next: StoreState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

/** Move `label` to the front, case-insensitively deduped and capped. */
export function withRecentLabel(labels: string[], label: string): string[] {
  const key = label.toLowerCase();
  return [label, ...labels.filter((l) => l.toLowerCase() !== key)].slice(
    0,
    MAX_RECENT_LABELS,
  );
}

function ensureLoaded(datasetId: number | null) {
  if (state.datasetId === datasetId) return;

  const token = ++loadToken;
  setState({ datasetId, labels: [] });
  if (datasetId == null) return;

  void datasetApi
    .getRecentLabels(datasetId)
    .then((rows) => {
      if (token !== loadToken) return;
      // Clicks made while the request was in flight are newer than anything
      // the server returned, so they stay in front.
      let labels = rows.map((r) => r.label);
      for (const label of [...state.labels].reverse()) {
        labels = withRecentLabel(labels, label);
      }
      setState({ datasetId, labels });
    })
    .catch(() => {
      /* leave the row empty; annotation is unaffected */
    });
}

export function useRecentLabels(): {
  labels: string[];
  touch: (label: string) => void;
} {
  const { selectedDatasetId } = useAppSelector((s) => s.al);
  const datasetId = selectedDatasetId != null ? Number(selectedDatasetId) : null;

  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    ensureLoaded(datasetId);
  }, [datasetId]);

  const touch = useCallback(
    (label: string) => {
      if (datasetId == null || state.datasetId !== datasetId) return;
      setState({ datasetId, labels: withRecentLabel(state.labels, label) });
    },
    [datasetId],
  );

  return { labels: snapshot.labels, touch };
}
