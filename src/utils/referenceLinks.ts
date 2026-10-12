import { referenceLinkApi } from "../services/api";
import type { ReferenceLink } from "../types";

export interface LinkSyncResult {
  /** Reference dataset ids whose link could not be created or removed. */
  failed: number[];
}

/**
 * Make a dataset's direct reference links match `wantedReferenceIds`.
 *
 * Only dataset-scoped links are touched; team-scoped links belong to the team
 * and are managed separately. Each change is sent on its own, so one failure
 * does not undo the others — the caller reports `failed` and refetches.
 */
export async function syncDatasetReferenceLinks(
  datasetId: number,
  wantedReferenceIds: number[],
  existingLinks: ReferenceLink[],
): Promise<LinkSyncResult> {
  const direct = existingLinks.filter((l) => l.dataset_id === datasetId);
  const current = new Set(direct.map((l) => l.reference_dataset_id));
  const wanted = new Set(wantedReferenceIds);

  const toCreate = [...wanted].filter((id) => !current.has(id));
  const toRemove = direct.filter((l) => !wanted.has(l.reference_dataset_id));

  const results = await Promise.allSettled([
    ...toCreate.map((id) =>
      referenceLinkApi
        .create({ reference_dataset_id: id, dataset_id: datasetId })
        .then(() => id),
    ),
    ...toRemove.map((l) =>
      referenceLinkApi.remove(l.id).then(() => l.reference_dataset_id),
    ),
  ]);

  const changedIds = [...toCreate, ...toRemove.map((l) => l.reference_dataset_id)];
  const failed = results.flatMap((r, i) => (r.status === "rejected" ? [changedIds[i]] : []));
  return { failed };
}
