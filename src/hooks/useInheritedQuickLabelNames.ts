import { useEffect, useState } from "react";
import { fetchDatasetModelSpecies } from "../utils/fetchDatasetModelSpecies";

/**
 * Model-derived quick-label names for a dataset — the species from the
 * dataset's own trained model (checkpoint). Empty when the dataset has no
 * model, so a model-less dataset shows no default labels (only custom ones).
 */
export function useInheritedQuickLabelNames(
  datasetId: number | string | null | undefined,
  enabled: boolean = true,
): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || datasetId == null) {
      setNames([]);
      return;
    }
    let cancelled = false;
    fetchDatasetModelSpecies(null, Number(datasetId))
      .then((list) => {
        if (!cancelled) setNames(list);
      })
      .catch(() => {
        if (!cancelled) setNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, enabled]);

  return names;
}
