/**
 * Scientific names for the selected dataset's quick labels, keyed by the
 * lower-cased button text (e.g. "hylmer" -> "Hyla meridionalis").
 *
 * A quick label stores a display name (often a short project code) and a
 * namespaced taxon ID. The name shown on hover comes from resolving that taxon
 * ID through the taxonomy API, so taxonomy stays the single source of truth
 * and no species list is hard-coded in the frontend. `local:` IDs have no
 * taxonomic meaning and are skipped.
 *
 * The feed mounts one label selector per snippet card, so both the dataset's
 * quick-label list and every resolved taxon ID are cached at module level and
 * shared between instances instead of being fetched per card.
 */

import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../hooks";
import { datasetApi, taxonomyApi } from "../services/api";

const namesByDataset = new Map<number, Promise<Map<string, string>>>();
const resolvedTaxa = new Map<string, string | null>();

async function resolveTaxonNames(taxonIds: string[]): Promise<void> {
  const missing = taxonIds.filter((id) => !resolvedTaxa.has(id));
  if (missing.length === 0) return;
  const results = await taxonomyApi.resolveBatch(missing);
  for (const id of missing) {
    const details = results[id];
    resolvedTaxa.set(id, details?.canonical_name || details?.scientific_name || null);
  }
}

async function loadScientificNames(datasetId: number): Promise<Map<string, string>> {
  const labels = await datasetApi.getQuickLabels(datasetId);
  const linked = labels.filter((l) => l.taxon_id && !l.taxon_id.startsWith("local:"));
  await resolveTaxonNames([...new Set(linked.map((l) => l.taxon_id))]);

  const names = new Map<string, string>();
  for (const label of linked) {
    const name = resolvedTaxa.get(label.taxon_id);
    // Skip labels whose button text already is the scientific name.
    if (name && name.toLowerCase() !== label.display_name.toLowerCase()) {
      names.set(label.display_name.toLowerCase(), name);
    }
  }
  return names;
}

const EMPTY: Map<string, string> = new Map();

export function useQuickLabelScientificNames(): Map<string, string> {
  const datasetId = useAppSelector((s) => s.al.selectedDatasetId);
  // Names are stored with the dataset they belong to, so switching datasets
  // never shows the previous dataset's names while the new ones load.
  const [loaded, setLoaded] = useState<{ datasetId: number; names: Map<string, string> } | null>(
    null,
  );

  useEffect(() => {
    if (datasetId == null) return;
    const id = Number(datasetId);
    let cancelled = false;

    let pending = namesByDataset.get(id);
    if (!pending) {
      pending = loadScientificNames(id);
      namesByDataset.set(id, pending);
      // A failed lookup must not stick: drop it so the next mount retries.
      pending.catch(() => namesByDataset.delete(id));
    }
    pending
      .then((names) => {
        if (!cancelled) setLoaded({ datasetId: id, names });
      })
      .catch(() => {
        // Tooltips are a convenience; labelling works without them.
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  return useMemo(
    () =>
      loaded && datasetId != null && loaded.datasetId === Number(datasetId)
        ? loaded.names
        : EMPTY,
    [loaded, datasetId],
  );
}

/** Forget cached names for a dataset, e.g. after its quick labels change. */
export function invalidateQuickLabelScientificNames(datasetId: number): void {
  namesByDataset.delete(datasetId);
}
