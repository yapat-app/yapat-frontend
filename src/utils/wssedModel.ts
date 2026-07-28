/**
 * Whether a WSSED training-job status points at an actual trained model file.
 *
 * The `/api/wssed/training-jobs/latest` response carries `model_path` (and a
 * `model_paths` map, e.g. `{ model_segment, preferred }`). A non-empty path
 * means a usable trained model exists for the dataset — regardless of the job
 * `status` string — so it can be used for the Active Learning step. If no path
 * is present, the user still needs to train a model first.
 */
export function hasWssedModelPath(status: {
  model_path?: string | null;
  model_paths?: Record<string, string> | null;
}): boolean {
  if (typeof status.model_path === "string" && status.model_path.trim()) {
    return true;
  }
  const paths = status.model_paths;
  if (
    paths &&
    Object.values(paths).some((v) => typeof v === "string" && v.trim())
  ) {
    return true;
  }
  return false;
}
