import type { Annotation } from "../types";
import { annotationApi } from "../services/api";

/** Matches server URL length / filter cap tradeoffs in annotate hub. */
export const SNIPPET_IDS_PER_ANNOTATION_BATCH = 200;

/**
 * Load annotations for many snippets using GET /annotations/?snippet_ids=…
 * (chunked), instead of one request per snippet.
 */
export async function fetchAnnotationsBySnippetIds(
  snippetIds: number[],
): Promise<Annotation[]> {
  const all: Annotation[] = [];
  for (let i = 0; i < snippetIds.length; i += SNIPPET_IDS_PER_ANNOTATION_BATCH) {
    const slice = snippetIds.slice(i, i + SNIPPET_IDS_PER_ANNOTATION_BATCH);
    const rows = await annotationApi.getAll({
      snippet_ids: slice.join(","),
      limit: 2000,
    });
    all.push(...rows);
  }
  return all;
}
