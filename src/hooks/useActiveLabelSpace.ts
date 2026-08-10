/**
 * Fetches a team's active label-space version and exposes its labels in the
 * quick-label shape. This is the single source of truth for "the labels usable
 * for annotation right now" for a team — replacing the flat dataset.quick_labels.
 *
 * State is keyed by teamId (so switching teams re-resolves and `loading` is
 * derived) — no synchronous setState inside the effect.
 */
import { useEffect, useMemo, useState } from "react";
import { teamApi } from "../services/api";
import type { CustomTaxonomyVersion, QuickLabel } from "../types";

export function useActiveLabelSpace(teamId?: number | null): {
  version: CustomTaxonomyVersion | null;
  labels: QuickLabel[];
  loading: boolean;
} {
  const [state, setState] = useState<{
    teamId: number;
    version: CustomTaxonomyVersion | null;
  } | null>(null);

  const resolved = teamId != null && state?.teamId === teamId;
  const version = resolved ? (state as { version: CustomTaxonomyVersion | null }).version : null;
  const loading = teamId != null && !resolved;

  useEffect(() => {
    if (teamId == null) return;
    let cancelled = false;
    teamApi
      .getActiveLabelSpace(teamId)
      .then((v) => {
        if (!cancelled) setState({ teamId, version: v });
      })
      .catch(() => {
        if (!cancelled) setState({ teamId, version: null });
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const labels = useMemo<QuickLabel[]>(
    () =>
      (version?.taxonomy_data?.nodes ?? []).map((n) => ({
        taxon_id: (n.taxon_id ?? n.id ?? "").toString(),
        display_name: n.canonical_name || n.scientific_name || n.name || "",
      })),
    [version],
  );

  return { version, labels, loading };
}
