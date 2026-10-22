/**
 * Quick labels per dataset, kept for the session. The Datasets page loads the
 * selected dataset's labels before it first appears, and the detail panel
 * starts from this copy, so the Quick labels tile is complete from the first
 * frame and nothing fills in afterwards. The panel still refreshes it quietly
 * when it opens, and saving in the Manage dialog updates it.
 */

import { datasetApi } from "../../services/api";
import type { QuickLabel } from "../../types";

const cache = new Map<number, QuickLabel[]>();

export const getCachedQuickLabels = (datasetId: number) =>
  cache.get(datasetId);

export const setCachedQuickLabels = (
  datasetId: number,
  labels: QuickLabel[],
) => {
  cache.set(datasetId, labels);
};

export const loadQuickLabels = (datasetId: number): Promise<QuickLabel[]> =>
  datasetApi
    .getQuickLabels(datasetId)
    .catch(() => [] as QuickLabel[])
    .then((labels) => {
      cache.set(datasetId, labels);
      return labels;
    });
