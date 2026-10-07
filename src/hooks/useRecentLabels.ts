/**
 * Recently applied labels, shared by every LabelSelector on the page (one store,
 * so labelling snippet A updates the "Recent" row on snippet B immediately) and
 * remembered per browser via localStorage. Purely a convenience: if storage is
 * unavailable it silently degrades to an in-memory list.
 */

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "yapat:recent-labels";
const MAX_RECENT = 8;

function readStorage(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

let recent: string[] = readStorage();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return recent;
}

function push(label: string) {
  const key = label.toLowerCase();
  recent = [label, ...recent.filter((x) => x.toLowerCase() !== key)].slice(0, MAX_RECENT);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
  } catch {
    /* storage blocked: keep the in-memory list */
  }
  listeners.forEach((l) => l());
}

export function useRecentLabels(): { recent: string[]; markUsed: (label: string) => void } {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const markUsed = useCallback((label: string) => push(label), []);
  return { recent: snapshot, markUsed };
}
