import { alApi } from "../services/alApi";

/**
 * Species labels derived from the dataset's *own* trained model (checkpoint).
 */
export async function fetchDatasetModelSpecies(
  usedCheckpointId: number | null,
  datasetId: number | null,
): Promise<string[]> {
  // Prefer the checkpoint the current feed was scored with.
  if (usedCheckpointId != null) {
    try {
      const list = await alApi.getCheckpointSpecies(usedCheckpointId);
      if (list.length > 0) return list;
    } catch {
      /* fall through to the dataset's latest checkpoint */
    }
  }

  if (datasetId == null) return [];

  try {
    const checkpoints = await alApi.getCheckpoints(datasetId);
    const sorted = [...checkpoints].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    for (const ck of sorted) {
      try {
        const list = await alApi.getCheckpointSpecies(ck.id);
        if (list.length > 0) return list;
      } catch {
        /* try the next checkpoint */
      }
    }
  } catch {
    /* no checkpoints for this dataset → no model species */
  }

  return [];
}
