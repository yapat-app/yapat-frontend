/**
 * Shared quick-label list for blind annotation (classic + AL).
 * Sources: PAM labels.json / checkpoint label_config, plus any extra labels
 * manually added via the dataset's stored quick_labels — merged, not
 * either/or, so adding a custom label (e.g. "No biophony") doesn't hide the
 * checkpoint's own species list.
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
      const [checkpointList, storedLabels] = await Promise.all([
        fetchPamQuickLabelNames(usedCheckpointId, selectedDatasetId).catch(
          () => [] as string[],
        ),
        selectedDatasetId != null
          ? datasetApi
              .getQuickLabels(Number(selectedDatasetId))
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      if (cancelled) return;
      setPamSpecies(
        mergeQuickLabelNames(
          checkpointList,
          storedLabels.map((l) => l.display_name),
        ),
      );
      setPamLoading(false);
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
