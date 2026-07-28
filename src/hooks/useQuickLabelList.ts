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
      // The dataset's stored quick_labels *extend* the label space — they must
      // not shadow the model/checkpoint species.
      // Fetched both sources and merge them (checkpoint species first, then
      // any curated/extra stored labels), deduped.
      let storedNames: string[] = [];
      if (selectedDatasetId != null) {
        try {
          const stored = await datasetApi.getQuickLabels(
            Number(selectedDatasetId),
          );
          storedNames = stored.map((l) => l.display_name);
        } catch {
          /* ignore — fall back to checkpoint species only */
        }
      }

      let checkpointNames: string[] = [];
      try {
        checkpointNames = await fetchPamQuickLabelNames(
          usedCheckpointId,
          selectedDatasetId,
        );
      } catch {
        /* ignore — fall back to stored labels only */
      }

      if (!cancelled) {
        setPamSpecies(mergeQuickLabelNames(checkpointNames, storedNames));
        setPamLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [usedCheckpointId, selectedDatasetId]);

  const taxonomyNames = useMemo(() => {
    const fromNodes = labelNamesFromTaxonomyNodes(
      (
        allTaxonomies?.[0] as
          | { taxonomy_data?: { nodes?: unknown } }
          | undefined
      )?.taxonomy_data?.nodes,
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
    loading:
      pamLoading || (taxonomiesStatus === "loading" && labels.length === 0),
  };
}
