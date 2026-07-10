import type { AppDispatch } from "../redux/store";
import type { Annotation } from "../types";
import { annotationApi } from "../services/api";
import { alApi } from "../services/alApi";
import { createAnnotation, deleteAnnotation } from "../redux/features/annotationSlice";
import { buildAnnotationCreatePayload } from "./annotationCreatePayload";

function annotationDisplayLabel(annotation: Annotation): string {
  const fromSnapshot = annotation.resolved_name_snapshot?.trim();
  if (fromSnapshot) return fromSnapshot;

  const taxonId = annotation.taxon_id?.trim() ?? "";
  if (taxonId.startsWith("local:")) {
    return taxonId
      .slice("local:".length)
      .replace(/[_-]+/g, " ")
      .trim();
  }
  return taxonId;
}

/**
 * Persist label selection for a classic-feed snippet: DELETE removed annotations,
 * POST new ones, return fresh rows from the API.
 */
export async function syncClassicSnippetLabels(
  dispatch: AppDispatch,
  snippetId: number,
  nextLabels: string[],
  existing: Annotation[],
  opts: {
    datasetId?: number | null;
    serverLabels?: string[];
  } = {},
): Promise<Annotation[]> {
  const nextNorm = nextLabels.map((l) => l.trim()).filter(Boolean);
  const nextLower = new Set(nextNorm.map((l) => l.toLowerCase()));

  for (const ann of existing) {
    const display = annotationDisplayLabel(ann);
    if (display && !nextLower.has(display.toLowerCase())) {
      await dispatch(deleteAnnotation(ann.id)).unwrap();
    }
  }

  if (opts.datasetId != null) {
    const seenServerLabels = new Set<string>();
    for (const rawLabel of opts.serverLabels ?? []) {
      const label = rawLabel.trim();
      const key = label.toLowerCase();
      if (!label || seenServerLabels.has(key) || nextLower.has(key)) continue;
      seenServerLabels.add(key);
      await alApi.deleteSnippetLabel({
        dataset_id: opts.datasetId,
        snippet_id: snippetId,
        label,
        source: "user",
      });
    }
  }

  const existingLower = new Set(
    existing
      .map((a) => annotationDisplayLabel(a).toLowerCase())
      .filter(Boolean),
  );

  for (const label of nextNorm) {
    if (existingLower.has(label.toLowerCase())) continue;
    await dispatch(
      createAnnotation(buildAnnotationCreatePayload(snippetId, label)),
    ).unwrap();
  }

  return annotationApi.getAll({ snippet_id: snippetId });
}
