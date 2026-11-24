import { useCallback, useRef, useState } from "react";
import { labelSharingApi } from "../../services/labelSharingApi";
import type { SnippetBreakdown } from "../../types/labelSharing";

/**
 * The dataset card's per-model snippet counts. Loaded when the hover opens, so
 * the card costs nothing extra; each opening refreshes them behind the last
 * numbers shown.
 */
export function useSnippetBreakdown(datasetId: number) {
  const [data, setData] = useState<SnippetBreakdown | null>(null);
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    setFailed(false);
    labelSharingApi
      .getSnippetBreakdown(datasetId)
      .then((next) => {
        if (request === latestRequest.current) setData(next);
      })
      .catch(() => {
        if (request === latestRequest.current) setFailed(true);
      });
  }, [datasetId]);

  return { data, failed, load };
}
