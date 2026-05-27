/**
 * Persist classic (random / similarity) feed slots per user in localStorage so they
 * survive page reload. Structure matches snippetSlice.classicFeedCache.
 */

import type { Snippet } from "../types";

const STORAGE_KEY = "yapat_classic_feed_slots_v2";
const VERSION = 2;

export interface PersistedClassicFeedSlot {
  snippets: Snippet[];
  selectedFeedId: number | null;
  currentSnippet: Snippet | null;
  currentIndex: number;
  snippetsFetched: boolean;
  snippetsLoaded: boolean;
}

export type PersistedClassicFeedCache = Record<
  number,
  { random: PersistedClassicFeedSlot | null; similarity: PersistedClassicFeedSlot | null; filter: PersistedClassicFeedSlot | null }
>;

type PersistedRoot = {
  v: number;
  byUser: Record<string, PersistedClassicFeedCache>;
};

function parseRoot(raw: string | null): PersistedRoot {
  if (!raw) return { v: VERSION, byUser: {} };
  try {
    const parsed = JSON.parse(raw) as PersistedRoot;
    if (parsed?.v !== VERSION || typeof parsed.byUser !== "object" || parsed.byUser === null) {
      return { v: VERSION, byUser: {} };
    }
    return parsed;
  } catch {
    return { v: VERSION, byUser: {} };
  }
}

/** Load saved random/similarity slots for a user (numeric id from /api/auth/me). */
export function loadClassicFeedCacheForUser(userId: number): PersistedClassicFeedCache {
  if (!Number.isFinite(userId)) return {};
  const root = parseRoot(localStorage.getItem(STORAGE_KEY));
  const row = root.byUser[String(userId)];
  if (!row || typeof row !== "object") return {};
  return row;
}

/** Write the full classic feed cache tree for one user (merge into storage). */
export function persistClassicFeedSlotsForUser(
  userId: number,
  cache: PersistedClassicFeedCache,
): void {
  if (!Number.isFinite(userId)) return;
  try {
    const root = parseRoot(localStorage.getItem(STORAGE_KEY));
    root.v = VERSION;
    root.byUser[String(userId)] = cache;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch (e) {
    console.warn("Could not persist classic feed slots:", e);
  }
}
