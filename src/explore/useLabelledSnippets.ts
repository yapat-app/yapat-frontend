import { useEffect, useState } from "react";
import { exploreApi, isAbortError } from "../services/exploreApi";
import type { ExploreScope } from "../types/explore";
import { NO_FILTERS, labelledIds } from "../utils/labelledSnippets";

/**
 * Which of the given snippets already carry a label, read from the same
 * /api/explore/rows call the feed uses.
 *
 * Returns null until it is known, and stays null when it cannot be loaded, so
 * a caller shows nothing extra instead of an error.
 */
export function useLabelledSnippets(
  scope: ExploreScope | null,
  snippetIds: number[] | null,
): Set<number> | null {
  const [result, setResult] = useState<{ key: string; set: Set<number> } | null>(
    null,
  );
  const key =
    scope && snippetIds && snippetIds.length > 0
      ? JSON.stringify([scope, snippetIds])
      : null;

  useEffect(() => {
    if (!key || !scope || !snippetIds) return;
    const controller = new AbortController();
    (async () => {
      try {
        const found = new Set<number>();
        for (let i = 0; i < snippetIds.length; i += 500) {
          const resp = await exploreApi.rows(
            scope,
            NO_FILTERS,
            snippetIds.slice(i, i + 500),
            { signal: controller.signal },
          );
          for (const id of labelledIds(resp.rows)) found.add(id);
        }
        setResult({ key, set: found });
      } catch (error) {
        if (!isAbortError(error)) {
          console.error("Failed to load labelled snippets", error);
        }
      }
    })();
    return () => controller.abort();
    // `key` stands for scope + snippetIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result && result.key === key ? result.set : null;
}
