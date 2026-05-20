/**
 * Shared quick-label list for blind annotation (classic + AL).
 * PAM labels.json / checkpoint label_config first; custom taxonomy fills gaps.
 */
import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "../hooks";
import { getAllTaxonomies } from "../redux/features/customTaxonomySlice";
import { fetchPamQuickLabelNames } from "../utils/fetchPamQuickLabelNames";
import {
  labelNamesFromLabelSpace,
  labelNamesFromTaxonomyNodes,
  mergeQuickLabelNames,
} from "../utils/quickLabelList";

export function useQuickLabelList(): { labels: string[]; loading: boolean } {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((s) => s.auth);
  const { usedCheckpointId, selectedDatasetId } = useAppSelector((s) => s.al);
  const { allTaxonomies, labelSpace, loading: taxonomyLoading } = useAppSelector(
    (s) => s.customTaxonomy,
  );

  const [pamSpecies, setPamSpecies] = useState<string[]>([]);
  const [pamLoading, setPamLoading] = useState(true);

  const teamId = user?.team_ids?.[0] ?? 1;

  useEffect(() => {
    if (!user) return;
    void dispatch(getAllTaxonomies(teamId));
  }, [user, teamId, dispatch]);

  useEffect(() => {
    let cancelled = false;
    setPamLoading(true);
    void fetchPamQuickLabelNames(usedCheckpointId, selectedDatasetId)
      .then((list) => {
        if (!cancelled) setPamSpecies(list);
      })
      .catch(() => {
        if (!cancelled) setPamSpecies([]);
      })
      .finally(() => {
        if (!cancelled) setPamLoading(false);
      });

    return () => {
      cancelled = true;
    };
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
    loading: pamLoading || (taxonomyLoading && labels.length === 0),
  };
}
