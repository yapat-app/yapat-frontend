import type { Dataset } from "../types";

export const FOCAL_RECORDINGS_DATASET_TYPE = "FOCAL_RECORDINGS" as const;

export function hasFocalRecordingsAccess(
  datasets: Dataset[] | null | undefined,
): boolean {
  return (datasets ?? []).some(
    (dataset) => dataset.dataset_type === FOCAL_RECORDINGS_DATASET_TYPE,
  );
}

export function canAccessWssed(
  user: { role?: string } | null | undefined,
  datasets: Dataset[] | null | undefined,
): boolean {
  if (user?.role === "admin") {
    return true;
  }
  return hasFocalRecordingsAccess(datasets);
}

export function filterFocalRecordingsDatasets(
  datasets: Dataset[] | null | undefined,
): Dataset[] {
  return (datasets ?? []).filter(
    (dataset) => dataset.dataset_type === FOCAL_RECORDINGS_DATASET_TYPE,
  );
}
