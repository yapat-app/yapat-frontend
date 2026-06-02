import type { UserFeedSnapshot } from "../types";

/**
 * Pick the newest feed snapshot from GET /api/feed/history for this dataset and classic mode.
 * History is ordered newest-first on the backend; we return the first matching row.
 */
export function pickLatestServerClassicFeed(
  snapshots: UserFeedSnapshot[] | null | undefined,
  datasetId: number,
  kind: "random" | "similarity" | "filter",
): UserFeedSnapshot | null {
  if (!snapshots?.length) return null;
  for (const snap of snapshots) {
    if (snap.method !== kind) continue;
    const p = snap.request_params;
    if (!p || typeof p !== "object") continue;
    const raw = (p as Record<string, unknown>).dataset_id;
    if (raw === undefined || raw === null) continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n === datasetId) return snap;
  }
  return null;
}
