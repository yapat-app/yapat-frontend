/**
 * Remember last dataset used on /annotate (per user), so landing without dataset_id
 * can restore selection.
 */

const STORAGE_KEY = "yapat_annotate_last_dataset_v1";
const VERSION = 1;

type Root = { v: number; byUser: Record<string, number> };

function parseRoot(raw: string | null): Root {
  if (!raw) return { v: VERSION, byUser: {} };
  try {
    const p = JSON.parse(raw) as Root;
    if (p?.v !== VERSION || typeof p.byUser !== "object" || p.byUser === null) {
      return { v: VERSION, byUser: {} };
    }
    return p;
  } catch {
    return { v: VERSION, byUser: {} };
  }
}

export function loadLastAnnotateDatasetId(userId: number): number | null {
  if (!Number.isFinite(userId)) return null;
  const root = parseRoot(localStorage.getItem(STORAGE_KEY));
  const id = root.byUser[String(userId)];
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export function persistLastAnnotateDatasetId(
  userId: number,
  datasetId: number,
): void {
  if (!Number.isFinite(userId) || !Number.isFinite(datasetId)) return;
  try {
    const root = parseRoot(localStorage.getItem(STORAGE_KEY));
    root.v = VERSION;
    root.byUser[String(userId)] = datasetId;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
}
