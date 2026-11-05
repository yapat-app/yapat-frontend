import type { AppDispatch } from "../redux/store";
import type { Annotation } from "../types";
import { annotationApi } from "../services/api";
import { createAnnotation, deleteAnnotation } from "../redux/features/annotationSlice";
import { buildAnnotationCreatePayload } from "./annotationCreatePayload";
import { annotationDisplayLabel } from "./classicFeedSync";

/** The backend's 409 for a label the snippet already has. */
export function isDuplicateAnnotationError(err: unknown): boolean {
  return typeof err === "string" && err.includes("already has an annotation");
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
  embeddingModelId: number | null,
): Promise<Annotation[]> {
  const nextNorm = nextLabels.map((l) => l.trim()).filter(Boolean);
  const nextLower = new Set(nextNorm.map((l) => l.toLowerCase()));

  for (const ann of existing) {
    const display = annotationDisplayLabel(ann);
    if (display && !nextLower.has(display.toLowerCase())) {
      await dispatch(deleteAnnotation(ann.id)).unwrap();
    }
  }

  const existingLower = new Set(
    existing
      .map((a) => annotationDisplayLabel(a).toLowerCase())
      .filter(Boolean),
  );

  for (const label of nextNorm) {
    if (existingLower.has(label.toLowerCase())) continue;
    try {
      await dispatch(
        createAnnotation(buildAnnotationCreatePayload(snippetId, label, embeddingModelId)),
      ).unwrap();
    } catch (err) {
      // 409: someone labelled it first (e.g. under another model sharing this
      // set). It is what was asked for; the refetch below shows it.
      if (!isDuplicateAnnotationError(err)) throw err;
    }
  }

  return annotationApi.getAll({ snippet_id: snippetId });
}
