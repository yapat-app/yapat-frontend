import { useEffect, useState } from "react";
import { snippetApi } from "../../services/api";

const PAGE_SIZE = 1000;
// Safety valve against a misbehaving backend — mirrors useRecordingLocations.
const MAX_PAGES = 200;

type Scope = { datasetId: number | null; snippetSetId: number | null };

/**
 * Maps snippet_id -> recording_id for every snippet in a snippet set, fetched
 * once per (dataset, snippet set) pair. Needed because the whole-dataset FPV
 * projection only returns snippet_id + scores (no recording_id), so location
 * filtering can't rely on the small overlay-predictions set alone — that only
 * covers the current feed, not the thousands of background points.
 */
export interface SnippetRecordingIds {
  recordingIdBySnippetId: Map<number, number>;
  /**
   * True while the map is being (re)built for the current (dataset, snippet
   * set) pair. Callers that hide items with an unresolved location should
   * treat "loading" as "don't hide yet" — otherwise everything looks like it
   * vanished for the moment between selecting a filter and the fetch
   * completing, snapping back only once the data arrives.
   */
  loading: boolean;
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.datasetId === b.datasetId && a.snippetSetId === b.snippetSetId;
}

export function useSnippetRecordingIds(
  datasetId: number | null,
  snippetSetId: number | null,
): SnippetRecordingIds {
  const [recordingIdBySnippetId, setRecordingIdBySnippetId] = useState<Map<number, number>>(
    () => new Map(),
  );
  // The (dataset, snippet set) pair the map above was last resolved for.
  // Deriving `loading` from this comparison (instead of a dedicated state
  // flag) avoids any synchronous setState call in the effect body below.
  const [resolvedScope, setResolvedScope] = useState<Scope>({ datasetId, snippetSetId });
  const requestedScope: Scope = { datasetId, snippetSetId };
  const loading =
    datasetId !== null && snippetSetId !== null && !sameScope(requestedScope, resolvedScope);

  useEffect(() => {
    if (datasetId === null || snippetSetId === null) return;

    let cancelled = false;

    async function fetchAll() {
      const map = new Map<number, number>();
      let skip = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = await snippetApi.getAll({
          dataset_id: datasetId as number,
          snippet_set_id: snippetSetId as number,
          skip,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        for (const snippet of batch) {
          map.set(snippet.id, snippet.recording_id);
        }
        if (batch.length < PAGE_SIZE) break;
        skip += PAGE_SIZE;
      }
      if (!cancelled) {
        setRecordingIdBySnippetId(map);
        setResolvedScope({ datasetId, snippetSetId });
      }
    }

    void fetchAll().catch(() => {
      if (!cancelled) {
        setRecordingIdBySnippetId(new Map());
        setResolvedScope({ datasetId, snippetSetId });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [datasetId, snippetSetId]);

  return { recordingIdBySnippetId, loading };
}
