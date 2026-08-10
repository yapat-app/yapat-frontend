/**
 * Shared quick-label list for blind annotation (classic + AL).
 */
import { useEffect, useMemo, useState } from "react";
import { useAppSelector } from "../hooks";
import { useActiveLabelSpace } from "./useActiveLabelSpace";
import { mergeQuickLabelNames } from "../utils/quickLabelList";
import { fetchDatasetModelSpecies } from "../utils/fetchDatasetModelSpecies";
import { datasetApi } from "../services/api";

/**
 * Quick-label list shown in the annotation feed. Three independent sources,
 * merged and de-duplicated by name:
 *   1. Model-checkpoint species (annotation targets).
 *   2. The team's ACTIVE label-space version (LLM pre-annotation, versioned).
 *   3. Card-added quick labels (GBIF / ENVO / Local in dataset.quick_labels).
 *
 * Teamless (admin-owned) datasets have no active version, so their custom part
 * is just the stored quick_labels.
 */
export function useQuickLabelList(): { labels: string[]; loading: boolean } {
  const { selectedDatasetId, usedCheckpointId } = useAppSelector((s) => s.al);
  const { allDatasets } = useAppSelector((s) => s.dataset);

  const datasetTeamId = useMemo<number | null>(() => {
    const d = (allDatasets as { id: number | string; team_id?: number }[])?.find(
      (x) => Number(x.id) === Number(selectedDatasetId),
    );
    return d?.team_id ?? null;
  }, [allDatasets, selectedDatasetId]);

  // Version-controlled custom labels (team datasets).
  const { labels: activeLabels, loading: activeLoading } =
    useActiveLabelSpace(datasetTeamId);

  // Model-checkpoint species + card-added quick labels (always fetched).
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [storedNames, setStoredNames] = useState<string[]>([]);
  const [baseLoading, setBaseLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let mNames: string[] = [];
      try {
        mNames = await fetchDatasetModelSpecies(
          usedCheckpointId,
          selectedDatasetId,
        );
      } catch {
        /* ignore — no model species */
      }
      let sNames: string[] = [];
      if (selectedDatasetId != null) {
        try {
          const stored = await datasetApi.getQuickLabels(
            Number(selectedDatasetId),
          );
          sNames = stored.map((l) => l.display_name);
        } catch {
          /* ignore — no stored quick labels */
        }
      }
      if (!cancelled) {
        setModelNames(mNames);
        setStoredNames(sNames);
        setBaseLoading(false);
      }
    };
    setBaseLoading(true);
    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedDatasetId, usedCheckpointId]);

  const activeNames = useMemo(
    () =>
      activeLabels.map((l) => l.display_name).filter((n): n is string => !!n),
    [activeLabels],
  );

  const labels = useMemo(
    () =>
      mergeQuickLabelNames(
        modelNames,
        mergeQuickLabelNames(activeNames, storedNames),
      ),
    [modelNames, activeNames, storedNames],
  );

  return {
    labels,
    loading: baseLoading || (datasetTeamId != null && activeLoading),
  };
}
