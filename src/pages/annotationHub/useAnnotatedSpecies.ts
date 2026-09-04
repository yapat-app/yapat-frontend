import { useEffect, useMemo, useState } from "react";
import { alApi } from "../../services/alApi";

/**
 * Distinct list of species that have actually been annotated in a dataset's
 * snippet set. Sourced from GET /api/pam-al/snippet-labels (per-snippet
 * ground-truth / user labels) — the same endpoint the projection view already
 * uses for the labeled pool — deduped into a sorted species list.
 *
 * `enabled` gates the whole-dataset fetch so it only runs when the caller
 * actually needs the list (the Status = Labeled filter), keeping it off the
 * hot path for every other mode and status.
 */
export function useAnnotatedSpecies(
  datasetId: number | null,
  snippetSetId: number | null,
  enabled: boolean,
): { options: string[]; loading: boolean } {
  const [labels, setLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || datasetId === null) {
      setLabels([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void alApi
      .getSnippetLabels(datasetId, snippetSetId ?? undefined)
      .then((res) => {
        if (cancelled) return;
        const seen = new Set<string>();
        for (const item of res.items ?? []) {
          for (const label of item.labels ?? []) {
            const name = (label ?? "").trim();
            if (name) seen.add(name);
          }
        }
        setLabels([...seen].sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => {
        if (!cancelled) setLabels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, datasetId, snippetSetId]);

  const options = useMemo(() => labels, [labels]);
  return { options, loading };
}
