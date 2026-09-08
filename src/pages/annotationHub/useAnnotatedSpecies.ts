import { useMemo } from "react";
import { useSnippetLabels } from "./useSnippetLabels";

/**
 * Distinct list of species that have actually been annotated in a dataset's
 * snippet set — the union of the ground-truth / user labels from
 * /api/pam-al/snippet-labels.
 *
 * Reads through the shared useSnippetLabels cache, so it costs nothing extra
 * when another consumer (e.g. the score histograms) already needs the map.
 */
export function useAnnotatedSpecies(
  datasetId: number | null,
  snippetSetId: number | null,
  enabled: boolean,
  refreshKey = "",
): { options: string[]; loading: boolean } {
  const { labelsBySnippet, loading } = useSnippetLabels(
    datasetId,
    snippetSetId,
    enabled,
    refreshKey,
  );

  const options = useMemo(() => {
    const seen = new Set<string>();
    for (const labels of Object.values(labelsBySnippet)) {
      for (const label of labels) {
        const name = (label ?? "").trim();
        if (name) seen.add(name);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [labelsBySnippet]);

  return { options, loading };
}
