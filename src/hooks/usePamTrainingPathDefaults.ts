import { useEffect } from "react";
import { alApi } from "../services/alApi";

/**
 * When cold-start training is enabled, load dataset-specific metadata and
 * label-config paths from the backend (under DATA_ROOT / source_uri).
 */
export function usePamTrainingPathDefaults(
  datasetId: number | null,
  enabled: boolean,
  setMetadataPath: (path: string) => void,
  setLabelConfigPath: (path: string) => void,
): void {
  useEffect(() => {
    if (!enabled || datasetId === null) return;

    let cancelled = false;
    alApi
      .getTrainingPathDefaults(datasetId)
      .then((defaults) => {
        if (cancelled) return;
        setMetadataPath(defaults.metadata_path);
        setLabelConfigPath(defaults.label_config_path);
      })
      .catch(() => {
        /* User can enter paths manually if defaults are unavailable. */
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId, enabled, setMetadataPath, setLabelConfigPath]);
}
