/**
 * Transport for study-event batches.
 *   - postBatch: normal path via the shared axios instance (auth header auto).
 *   - sendBeaconBatch: unload path via navigator.sendBeacon, which cannot set an
 *     Authorization header, so the JWT is embedded in the request body and the
 *     backend accepts it as a fallback.
 */

import api from "../axios/axiosInstance";
import store from "../redux/store";
import type { StudyEventEnvelope } from "./types";

const BATCH_PATH = "/api/study-events/batch";

function getBaseURL(): string {
  if (
    typeof window !== "undefined" &&
    (window as any).__ENV__?.VITE_YAPAT_BACKEND_URL
  ) {
    return (window as any).__ENV__.VITE_YAPAT_BACKEND_URL;
  }
  return import.meta.env.VITE_YAPAT_BACKEND_URL || "http://localhost:8000";
}

/** POST a batch; resolves on success, rejects on failure (caller retries). */
export async function postBatch(events: StudyEventEnvelope[]): Promise<void> {
  await api.post(BATCH_PATH, { events });
}

/**
 * Best-effort send during page unload. Returns true if the beacon was queued.
 * Drops silently (returns false) when no auth token is available — we never
 * send unauthenticated PII.
 */
export function sendBeaconBatch(events: StudyEventEnvelope[]): boolean {
  if (events.length === 0) return false;
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") {
    return false;
  }
  const token = store.getState().auth.accessToken;
  if (!token) return false;

  try {
    const url = `${getBaseURL()}${BATCH_PATH}`;
    const blob = new Blob([JSON.stringify({ events, token })], {
      type: "application/json",
    });
    return navigator.sendBeacon(url, blob);
  } catch {
    return false;
  }
}
