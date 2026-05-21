import { useMemo } from "react";
import { useAppSelector } from "../hooks";
import type { DatasetSpectrogramRange } from "../utils/spectrogramConfig";

/** Dataset-level mel spectrogram display band for the active dataset. */
export function useDatasetSpectrogramConfig(
  datasetId: number | string | null | undefined,
): DatasetSpectrogramRange | null {
  const allDatasets = useAppSelector((s) => s.dataset.allDatasets);

  return useMemo(() => {
    if (datasetId == null || datasetId === "") return null;
    const id = Number(datasetId);
    if (!Number.isFinite(id)) return null;
    const ds = allDatasets.find((d) => Number(d.id) === id);
    if (!ds) return null;
    return {
      spectrogram_f_min_hz: ds.spectrogram_f_min_hz ?? null,
      spectrogram_f_max_hz: ds.spectrogram_f_max_hz ?? null,
    };
  }, [allDatasets, datasetId]);
}
