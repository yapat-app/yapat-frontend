import { useEffect, useState } from "react";
import { fetchPamQuickLabelNames } from "../utils/fetchPamQuickLabelNames";

/**
 * Model/checkpoint-derived quick-label names for a dataset — the "inherited"
 * base that the dataset's stored quick_labels *extend* rather than replace.
 * Same source as the annotation quick-label list (labels.json / checkpoint
 * label_config), so the management views stay consistent with what annotators
 * actually see.
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
    fetchPamQuickLabelNames(null, Number(datasetId))
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
