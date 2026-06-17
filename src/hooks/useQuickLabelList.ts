/**
 * Shared quick-label list for blind annotation (classic + AL).
 * Priority: dataset's stored quick_labels → PAM labels.json / checkpoint label_config.
 */
import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../hooks";
import { useEnsureTeamTaxonomies } from "./useEnsureTeamTaxonomies";
import { fetchPamQuickLabelNames } from "../utils/fetchPamQuickLabelNames";
import {
  labelNamesFromLabelSpace,
  labelNamesFromTaxonomyNodes,
  mergeQuickLabelNames,
} from "../utils/quickLabelList";
import { datasetApi } from "../services/api";

export function useQuickLabelList(): { labels: string[]; loading: boolean } {
  const { user } = useAppSelector((s) => s.auth);
  const { usedCheckpointId, selectedDatasetId } = useAppSelector((s) => s.al);
  const { allTaxonomies, labelSpace, taxonomiesStatus } = useAppSelector(
    (s) => s.customTaxonomy,
  );

  const [pamSpecies, setPamSpecies] = useState<string[]>([]);
  const [pamLoading, setPamLoading] = useState(true);

  const teamId = user?.team_ids?.[0] ?? null;
  useEnsureTeamTaxonomies(teamId, !!user);

  useEffect(() => {
    let cancelled = false;
    setPamLoading(true);

    const load = async () => {
      // Priority 1: dataset's stored quick_labels
      if (selectedDatasetId != null) {
        try {
          const stored = await datasetApi.getQuickLabels(Number(selectedDatasetId));
          if (!cancelled && stored.length > 0) {
            setPamSpecies(stored.map((l) => l.display_name));
            setPamLoading(false);
            return;
          }
        } catch { /* fall through to checkpoint fallback */ }
      }

      // Priority 2: checkpoint species list (existing behaviour)
      try {
        const list = await fetchPamQuickLabelNames(usedCheckpointId, selectedDatasetId);
        if (!cancelled) setPamSpecies(list);
      } catch {
        if (!cancelled) setPamSpecies([]);
      } finally {
        if (!cancelled) setPamLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [usedCheckpointId, selectedDatasetId]);

  const taxonomyNames = useMemo(() => {
    const fromNodes = labelNamesFromTaxonomyNodes(
      (allTaxonomies?.[0] as { taxonomy_data?: { nodes?: unknown } } | undefined)
        ?.taxonomy_data?.nodes,
    );
    const fromSpace = labelNamesFromLabelSpace(labelSpace ?? []);
    return mergeQuickLabelNames(fromNodes, fromSpace);
  }, [allTaxonomies, labelSpace]);

  const labels = useMemo(
    () => mergeQuickLabelNames(pamSpecies, taxonomyNames),
    [pamSpecies, taxonomyNames],
  );

  return {
    labels,
    loading: pamLoading || (taxonomiesStatus === "loading" && labels.length === 0),
  };
}
