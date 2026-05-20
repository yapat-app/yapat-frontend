import { alApi } from "../services/alApi";

/**
 * PAM quick-label names (labels.json / checkpoint label_config), same sources as AL.
 * Order: active checkpoint → default labels.json → latest dataset checkpoints → [].
 */
export async function fetchPamQuickLabelNames(
  usedCheckpointId: number | null,
  selectedDatasetId: number | null,
): Promise<string[]> {
  if (usedCheckpointId != null) {
    try {
      const list = await alApi.getCheckpointSpecies(usedCheckpointId);
      if (list.length > 0) return list;
    } catch {
      /* try fallbacks */
    }
  }

  try {
    const defaults = await alApi.getDefaultSpecies();
    if (defaults.length > 0) return defaults;
  } catch {
    /* try dataset checkpoints */
  }

  if (selectedDatasetId == null) return [];

  try {
    const checkpoints = await alApi.getCheckpoints(selectedDatasetId);
    const sorted = [...checkpoints].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    for (const ck of sorted) {
      try {
        const list = await alApi.getCheckpointSpecies(ck.id);
        if (list.length > 0) return list;
      } catch {
        /* next checkpoint */
      }
    }
  } catch {
    /* no checkpoints */
  }

  return [];
}
