/**
 * Persist the un-sent study-event buffer to localStorage so a mid-session reload
 * doesn't lose buffered/failed events. Mirrors the versioned, per-user, try/catch
 * pattern of src/utils/classicFeedPersistence.ts.
 *
 * Events are stored with their full original envelope (including their own
 * sessionId), so on reload they are simply re-sent as-is — never re-stamped.
 */

import type { StudyEventEnvelope } from "./types";

const STORAGE_KEY = "yapat_study_log_buffer_v1";
const VERSION = 1;

/** Buffered events older than this (ms) are discarded on load. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PersistedUserBuffer {
  savedAt: number;
  events: StudyEventEnvelope[];
}

interface PersistedRoot {
  v: number;
  byUser: Record<string, PersistedUserBuffer>;
}

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

function userKey(userId: number | null): string {
  return userId == null ? "anon" : String(userId);
}

/** Write the buffer for one user (overwrites that user's slot). */
export function persistBuffer(userId: number | null, events: StudyEventEnvelope[]): void {
  try {
    const root = parseRoot(localStorage.getItem(STORAGE_KEY));
    root.v = VERSION;
    if (events.length === 0) {
      delete root.byUser[userKey(userId)];
    } else {
      root.byUser[userKey(userId)] = { savedAt: Date.now(), events };
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // Quota / disabled storage — degrade silently.
  }
}

/** Load + clear the buffer for one user. Returns recent events only. */
export function takeBuffer(userId: number | null): StudyEventEnvelope[] {
  try {
    const root = parseRoot(localStorage.getItem(STORAGE_KEY));
    const slot = root.byUser[userKey(userId)];
    if (!slot) return [];
    // Clear immediately so events aren't replayed twice across tabs.
    delete root.byUser[userKey(userId)];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
    if (Date.now() - slot.savedAt > MAX_AGE_MS) return [];
    return Array.isArray(slot.events) ? slot.events : [];
  } catch {
    return [];
  }
}
